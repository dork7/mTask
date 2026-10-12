import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from './database.ts';

/*
 * Foreign keys are a setting of each connection, and this driver happens to turn them
 * on by itself. Here the driver is made to open every database with them off, as
 * SQLite itself and other drivers do, so the tests see what `openDatabase` does.
 */
vi.mock('node:sqlite', async (importOriginal) => {
  const driver = await importOriginal<typeof import('node:sqlite')>();
  class DatabaseSync extends driver.DatabaseSync {
    constructor(file: string) {
      super(file, { enableForeignKeyConstraints: false });
    }
  }
  return { ...driver, DatabaseSync };
});

const T = '2026-03-04T05:06:07.089Z';

let db: Database | undefined;

afterEach(() => {
  db?.close();
  db = undefined;
});

describe('openDatabase with a driver that leaves foreign keys off (AC3)', () => {
  it('turns them on itself', () => {
    db = openDatabase(':memory:');

    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  });

  it.each(['source_id', 'parent_task_id'])('still rejects a task whose %s points at nothing', (column) => {
    db = openDatabase(':memory:');
    const insert = db.prepare(`INSERT INTO tasks (title, ${column}, created_at, updated_at) VALUES (?, ?, ?, ?)`);

    expect(() => insert.run('Buy milk', 999, T, T)).toThrow('FOREIGN KEY constraint failed');

    expect(db.prepare('SELECT COUNT(*) AS rows FROM tasks').get()).toEqual({ rows: 0 });
  });
});
