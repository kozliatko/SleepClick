import { createServer } from 'node:http';
import { openDb, hashToken } from './db.js';
import { handleAdmin, adminEnabled } from './admin-web.js';

const PORT = Number(process.env.PORT || 8080);
const DB_PATH = process.env.DB_PATH || '/data/sleepclick.db';
// Only used to carry a pre-multi-user deployment over on first start. New
// tokens are minted with admin.js and live in the database.
const BOOTSTRAP_TOKEN = process.env.SYNC_TOKEN || '';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_BATCH = 200;
// Sessions outside this range are almost certainly a clock or unit bug on the
// watch (e.g. milliseconds instead of seconds), not a real nap.
const MIN_TS = 1_400_000_000; // 2014-05
const MAX_DURATION = 24 * 3600;

const db = openDb(DB_PATH, BOOTSTRAP_TOKEN);

const findToken = db.prepare(
  `SELECT user_id FROM tokens WHERE token_hash = ? AND revoked_at IS NULL`
);
const insertSession = db.prepare(
  `INSERT INTO sessions (user_id, id, start_ts, end_ts, wake_ups, created_at)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(user_id, id) DO NOTHING`
);
const selectSince = db.prepare(
  `SELECT id, start_ts, end_ts, wake_ups
     FROM sessions
    WHERE user_id = ? AND start_ts >= ?
    ORDER BY start_ts ASC
    LIMIT 1000`
);

// Returns the owning user id, or null. The token is high-entropy random, so a
// hashed index lookup is safe here — there is no low-entropy secret to guess
// and nothing useful leaks from lookup timing.
function authenticate(req) {
  const header = req.headers.authorization || '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return null;
  const presented = header.slice(prefix.length).trim();
  if (presented.length === 0) return null;
  const row = findToken.get(hashToken(presented));
  return row ? row.user_id : null;
}

function send(res, status, payload) {
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
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Returns a normalised session, or null if the payload is not usable.
function validateSession(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const id = Number(raw.id);
  const start = Number(raw.start);
  const end = Number(raw.end);
  const wakeUps = Number(raw.wakeUps ?? 0);

  for (const n of [id, start, end, wakeUps]) {
    if (!Number.isSafeInteger(n)) return null;
  }
  // Upper bound catches milliseconds sent where seconds were expected — those
  // land ~1000x in the future — as well as a watch with a broken clock. One
  // day of slack absorbs genuine timezone/skew noise.
  const maxTs = Math.floor(Date.now() / 1000) + 86400;
  if (start < MIN_TS || start > maxTs) return null;
  if (end < MIN_TS || end > maxTs) return null;
  if (end <= start) return null;
  if (end - start > MAX_DURATION) return null;
  if (wakeUps < 0 || wakeUps > 1000) return null;

  return { id, start, end, wakeUps };
}

async function handlePost(req, res, userId) {
  let parsed;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, { error: 'invalid_json' });
  }

  const incoming = parsed?.sessions;
  if (!Array.isArray(incoming)) {
    return send(res, 400, { error: 'sessions_must_be_array' });
  }
  if (incoming.length > MAX_BATCH) {
    return send(res, 413, { error: 'batch_too_large', max: MAX_BATCH });
  }

  const now = Math.floor(Date.now() / 1000);
  const accepted = [];
  const rejected = [];

  for (const raw of incoming) {
    const s = validateSession(raw);
    if (s === null) {
      if (raw !== null && typeof raw === 'object' && raw.id !== undefined) {
        rejected.push(raw.id);
      }
      continue;
    }
    insertSession.run(userId, s.id, s.start, s.end, s.wakeUps, now);
    // Report the id as accepted even when it already existed, so a watch
    // retrying after a lost response can finally mark it synced.
    accepted.push(s.id);
  }

  return send(res, 200, { accepted, rejected });
}

function handleGet(res, url, userId) {
  const sinceRaw = Number(url.searchParams.get('since') ?? 0);
  const since = Number.isSafeInteger(sinceRaw) && sinceRaw > 0 ? sinceRaw : 0;

  const rows = selectSince.all(userId, since).map((r) => ({
    id: r.id,
    start: r.start_ts,
    end: r.end_ts,
    wakeUps: r.wake_ups,
  }));

  return send(res, 200, { sessions: rows });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    return send(res, 200, { ok: true });
  }

  // Basic-auth'd token management. Guarded inside the app rather than at the
  // proxy, because the container shares the caddy network with every other
  // service on this host — a proxy-only gate would leave it open from inside.
  try {
    if (await handleAdmin(req, res, url, db)) return;
  } catch (err) {
    console.error('admin request failed:', err.message);
    return send(res, 500, { error: 'internal_error' });
  }

  if (url.pathname !== '/sessions') {
    return send(res, 404, { error: 'not_found' });
  }

  const userId = authenticate(req);
  if (userId === null) {
    return send(res, 401, { error: 'unauthorized' });
  }

  try {
    if (req.method === 'POST') return await handlePost(req, res, userId);
    if (req.method === 'GET') return handleGet(res, url, userId);
    return send(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    console.error('request failed:', err.message);
    return send(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`sleepclick backend listening on 0.0.0.0:${PORT}`);
  console.log(
    adminEnabled
      ? 'admin UI enabled at /admin'
      : 'admin UI disabled — set ADMIN_USER and ADMIN_PASSWORD (12+ chars) to enable'
  );
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
