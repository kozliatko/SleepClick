// Token administration. Run inside the container:
//   docker compose exec backend node admin.js <command> [args]
import { openDb, hashToken, generateToken } from './db.js';

const DB_PATH = process.env.DB_PATH || '/data/sleepclick.db';
const db = openDb(DB_PATH, process.env.SYNC_TOKEN || '');
const now = () => Math.floor(Date.now() / 1000);

function usage() {
  console.log(`Usage: node admin.js <command>

  list                         users, their tokens and session counts
  add-user <name>              create a user
  add-token <name> [label]     mint a token for a user and print it once
  revoke <token-id>            revoke a token by its id (from "list")
`);
}

function requireUser(name) {
  const user = db.prepare('SELECT id, name FROM users WHERE name = ?').get(name);
  if (!user) {
    console.error(`No such user: ${name}`);
    process.exit(1);
  }
  return user;
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'list': {
    const users = db.prepare('SELECT id, name FROM users ORDER BY id').all();
    if (users.length === 0) {
      console.log('(no users yet)');
      break;
    }
    for (const u of users) {
      const count = db
        .prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?')
        .get(u.id).n;
      console.log(`\n#${u.id} ${u.name}  —  ${count} sessions`);
      const tokens = db
        .prepare('SELECT id, label, created_at, revoked_at FROM tokens WHERE user_id = ? ORDER BY id')
        .all(u.id);
      if (tokens.length === 0) {
        console.log('   (no tokens)');
      }
      for (const t of tokens) {
        const state = t.revoked_at ? 'REVOKED' : 'active';
        console.log(`   token #${t.id}  ${state}  ${t.label || '(no label)'}`);
      }
    }
    break;
  }

  case 'add-user': {
    const name = args[0];
    if (!name) { usage(); process.exit(1); }
    db.prepare('INSERT INTO users (name, created_at) VALUES (?, ?)').run(name, now());
    console.log(`Created user "${name}".`);
    break;
  }

  case 'add-token': {
    const [name, label] = args;
    if (!name) { usage(); process.exit(1); }
    const user = requireUser(name);
    const token = generateToken();
    db.prepare(
      'INSERT INTO tokens (user_id, token_hash, label, created_at) VALUES (?, ?, ?, ?)'
    ).run(user.id, hashToken(token), label || null, now());
    // Only the hash is stored, so this is the one and only time it is shown.
    console.log(`Token for "${user.name}"${label ? ` (${label})` : ''}:\n\n  ${token}\n`);
    console.log('Store it now — it cannot be recovered later.');
    break;
  }

  case 'revoke': {
    const id = Number(args[0]);
    if (!Number.isInteger(id)) { usage(); process.exit(1); }
    const result = db
      .prepare('UPDATE tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(now(), id);
    console.log(result.changes > 0 ? `Revoked token #${id}.` : `No active token #${id}.`);
    break;
  }

  default:
    usage();
    process.exit(command ? 1 : 0);
}

db.close();
