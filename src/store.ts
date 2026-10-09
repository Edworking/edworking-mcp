import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

/** Single-replica durable store. Every read enforces expiry; transactions never await. */
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, expiry INTEGER NOT NULL, PRIMARY KEY(kind,id)); CREATE INDEX IF NOT EXISTS record_expiry ON records(expiry);');
    if (path !== ':memory:') chmodSync(path, 0o600);
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM records WHERE kind=? AND id=? AND expiry>?').get(kind, id, Date.now());
    return row ? JSON.parse(String(row.value)) as T : undefined;
  }
  set(kind: string, id: string, value: unknown, expiry: number) {
    this.db.prepare('INSERT INTO records(kind,id,value,expiry) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value,expiry=excluded.expiry').run(kind, id, JSON.stringify(value), expiry);
  }
  remove(kind: string, id: string) { this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id); }
  transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = run(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  sweep() { this.db.prepare('DELETE FROM records WHERE expiry<=?').run(Date.now()); }
  healthy() { return this.db.prepare('SELECT 1 AS ok').get()?.ok === 1; }
  close() { this.db.close(); }
}
