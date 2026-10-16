import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import { createApp } from '../app.ts';
import { openDatabase, type Database } from '../db/database.ts';
import type { Analysis, Analyze } from '../services/analyzer.ts';

/** An app for one test, with a database and an uploads folder of its own. */
export interface TestApp {
  app: Express;
  /** An in-memory database, open until `close()`. */
  db: Database;
  /** A new folder under the system's temporary folder. `close()` removes it. */
  dir: string;
  /** `<dir>/uploads`. It does not exist until a photo is stored. */
  uploadsDir: string;
  /** The analyzer the app was built with: the one handed in, or the default stub. */
  analyze: Analyze;
  /** Closes the database and removes `dir` with everything in it. Safe to call twice. */
  close(): void;
}

export interface TestAppOptions {
  /** The analyzer the app calls. Left out, every analysis resolves to `oneTaskAnalysis()`. */
  analyze?: Analyze;
  /** The VAPID public key the page subscribes with. Left out, the app has none. */
  vapidPublicKey?: string | null;
}

/** What the default analyzer of a test app finds in anything: one task. A new object each call. */
export function oneTaskAnalysis(): Analysis {
  return {
    tasks: [
      {
        title: 'Buy milk',
        description: '',
        category: 'shopping',
        estimated_minutes: 15,
        urgency: 'medium',
        confidence: 0.9,
      },
    ],
    fallback: false,
  };
}

/**
 * Builds an app that cannot reach `data/` or the network: its database is in memory, its
 * uploads folder is inside a new temporary folder, and its analyzer is a stub. The
 * caller calls `close()` when it is done.
 */
export function createTestApp(options: TestAppOptions = {}): TestApp {
  const dir = mkdtempSync(path.join(tmpdir(), 'mtask-test-'));
  const uploadsDir = path.join(dir, 'uploads');
  const db = openDatabase(':memory:');
  const analyze = options.analyze ?? (() => Promise.resolve(oneTaskAnalysis()));
  const app = createApp({ db, uploadsDir, analyze, vapidPublicKey: options.vapidPublicKey });

  return {
    app,
    db,
    dir,
    uploadsDir,
    analyze,
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
