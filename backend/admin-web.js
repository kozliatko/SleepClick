import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashToken, generateToken } from './db.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(HERE, 'admin.html'), 'utf8');

const USER = process.env.ADMIN_USER || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
export const adminEnabled = USER.length > 0 && PASSWORD.length >= 12;

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function authorized(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const split = decoded.indexOf(':');
  if (split < 0) return false;
  // Evaluate both halves every time so a wrong username costs the same as a
  // wrong password.
  const userOk = safeEqual(decoded.slice(0, split), USER);
  const passOk = safeEqual(decoded.slice(split + 1), PASSWORD);
  return userOk && passOk;
}

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 16 * 1024) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Names are chosen by the admin, but they are echoed back into a page, so
// keep them to a set that cannot break out of HTML or JSON.
const NAME_RE = /^[A-Za-z0-9 ._-]{1,40}$/;

function overview(db) {
  const users = db.prepare('SELECT id, name, created_at FROM users ORDER BY id').all();
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    sessions: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(u.id).n,
    tokens: db
      .prepare(
        `SELECT id, label, created_at, revoked_at
           FROM tokens WHERE user_id = ? ORDER BY id`
      )
      .all(u.id)
      .map((t) => ({
        id: t.id,
        label: t.label,
        created_at: t.created_at,
        revoked: t.revoked_at !== null,
      })),
  }));
}

// Returns true when the request was handled here.
export async function handleAdmin(req, res, url, db) {
  if (!url.pathname.startsWith('/admin')) return false;

  if (!adminEnabled) {
    json(res, 503, { error: 'admin_disabled' });
    return true;
  }

  if (!authorized(req)) {
    res.writeHead(401, {
      'www-authenticate': 'Basic realm="SleepClick admin", charset="UTF-8"',
      'content-type': 'application/json; charset=utf-8',
    });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return true;
  }

  const now = Math.floor(Date.now() / 1000);

  if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      // connect-src is required, otherwise default-src 'none' blocks the
      // page's own fetch calls back to /admin/*.
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
    });
    res.end(PAGE);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/admin/data') {
    json(res, 200, { users: overview(db) });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/admin/users') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid_json' }), true; }
    const name = String(body?.name ?? '').trim();
    if (!NAME_RE.test(name)) return json(res, 400, { error: 'invalid_name' }), true;
    const exists = db.prepare('SELECT id FROM users WHERE name = ?').get(name);
    if (exists) return json(res, 409, { error: 'name_taken' }), true;
    db.prepare('INSERT INTO users (name, created_at) VALUES (?, ?)').run(name, now);
    return json(res, 200, { ok: true }), true;
  }

  if (req.method === 'POST' && url.pathname === '/admin/tokens') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid_json' }), true; }
    const userId = Number(body?.user_id);
    const label = String(body?.label ?? '').trim();
    if (!Number.isSafeInteger(userId)) return json(res, 400, { error: 'invalid_user' }), true;
    if (label.length > 0 && !NAME_RE.test(label)) return json(res, 400, { error: 'invalid_label' }), true;
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return json(res, 404, { error: 'no_such_user' }), true;

    const token = generateToken();
    db.prepare(
      'INSERT INTO tokens (user_id, token_hash, label, created_at) VALUES (?, ?, ?, ?)'
    ).run(userId, hashToken(token), label || null, now);
    // Only the hash is stored, so this response is the single chance to see it.
    return json(res, 200, { token }), true;
  }

  if (req.method === 'POST' && url.pathname === '/admin/revoke') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid_json' }), true; }
    const id = Number(body?.token_id);
    if (!Number.isSafeInteger(id)) return json(res, 400, { error: 'invalid_token_id' }), true;
    const result = db
      .prepare('UPDATE tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(now, id);
    return json(res, 200, { revoked: result.changes > 0 }), true;
  }

  json(res, 404, { error: 'not_found' });
  return true;
}
