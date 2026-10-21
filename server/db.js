import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const databasePath = process.env.DATABASE_PATH ?? process.env.DB_PATH
  ?? fileURLToPath(new URL('../bedside.db', import.meta.url));
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });

export const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const version = db.pragma('user_version', { simple: true });
if (version > 1) throw new Error(`Unsupported database schema version: ${version}`);
if (version < 1) {
  db.transaction(() => {
    db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
    db.pragma('user_version = 1');
  })();
}
