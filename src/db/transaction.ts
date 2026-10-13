import type { Database } from './database.ts';

/**
 * Runs `run` in one transaction and returns what it returns. When `run` or the commit
 * throws, everything `run` wrote is undone and that error is thrown again.
 *
 * `run` is synchronous, as the driver is. Do not call this inside `run`: SQLite refuses
 * a transaction within a transaction.
 */
export function inTransaction<T>(db: Database, run: () => T): T {
  db.exec('BEGIN');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // SQLite has already ended the transaction itself after some errors; the first
      // error is the one worth reporting.
    }
    throw error;
  }
}
