import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const SCHEMA_VERSION = 2;

export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateToken() {
  return randomBytes(32).toString('hex');
}

// Schema v1 was single-user: one shared token in the environment and a bare
// sessions table. v2 introduces users and per-device tokens, and re-keys
// sessions on (user_id, id) — two watches can otherwise produce the same id,
// since the id is the epoch second the sleep started.
function migrate(db, bootstrapToken) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (version >= SCHEMA_VERSION) return;

  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tokens (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id),
        token_hash TEXT    NOT NULL UNIQUE,
        label      TEXT,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_tokens_hash ON tokens(token_hash);
    `);

    const hadSessions = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
      .get();

    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions_v2 (
        user_id    INTEGER NOT NULL REFERENCES users(id),
        id         INTEGER NOT NULL,
        start_ts   INTEGER NOT NULL,
        end_ts     INTEGER NOT NULL,
        wake_ups   INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
      );
    `);

    const now = Math.floor(Date.now() / 1000);

    // Carry the single-user deployment over so the already-configured watch
    // and PWA keep working with the token they have.
    if (hadSessions && bootstrapToken) {
      db.prepare('INSERT OR IGNORE INTO users (name, created_at) VALUES (?, ?)')
        .run('default', now);
      const owner = db.prepare('SELECT id FROM users WHERE name = ?').get('default');
      db.prepare(
        `INSERT OR IGNORE INTO tokens (user_id, token_hash, label, created_at)
         VALUES (?, ?, ?, ?)`
      ).run(owner.id, hashToken(bootstrapToken), 'migrated from SYNC_TOKEN', now);

      db.exec(
        `INSERT OR IGNORE INTO sessions_v2 (user_id, id, start_ts, end_ts, wake_ups, created_at)
         SELECT ${owner.id}, id, start_ts, end_ts, wake_ups, created_at FROM sessions`
      );
    }

    if (hadSessions) db.exec('DROP TABLE sessions');
    db.exec('ALTER TABLE sessions_v2 RENAME TO sessions');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_start ON sessions(user_id, start_ts)');
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function openDb(path, bootstrapToken) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db, bootstrapToken);
  return db;
}
