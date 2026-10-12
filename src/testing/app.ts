import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import { createApp } from '../app.ts';
import { openDatabase, type Database } from '../db/database.ts';

/** An app for one test, with a database and an uploads folder of its own. */
export interface TestApp {
  app: Express;
  /** An in-memory database, open until `close()`. */
  db: Database;
  /** A new folder under the system's temporary folder. `close()` removes it. */
  dir: string;
  /** `<dir>/uploads`. It does not exist until a photo is stored. */
  uploadsDir: string;
  /** Closes the database and removes `dir` with everything in it. Safe to call twice. */
  close(): void;
}

/**
 * Builds an app that cannot reach `data/`: its database is in memory and its uploads
 * folder is inside a new temporary folder. The caller calls `close()` when it is done.
 */
export function createTestApp(): TestApp {
  const dir = mkdtempSync(path.join(tmpdir(), 'mtask-test-'));
  const uploadsDir = path.join(dir, 'uploads');
  const db = openDatabase(':memory:');
  const app = createApp({ db, uploadsDir });

  return {
    app,
    db,
    dir,
    uploadsDir,
    close() {
      if (db.isOpen) db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Runs `run` with a test app of its own and closes it afterwards, also when `run` throws. */
export async function withTestApp<T>(run: (testApp: TestApp) => T | Promise<T>): Promise<T> {
  const testApp = createTestApp();
  try {
    return await run(testApp);
  } finally {
    testApp.close();
  }
}
