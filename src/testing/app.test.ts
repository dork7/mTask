import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSource } from '../db/sources.ts';
import { createTestApp, withTestApp, type TestApp } from './app.ts';

const created: TestApp[] = [];

/** A test app that the `afterEach` closes, whatever the test did with it. */
function newTestApp(): TestApp {
  const testApp = createTestApp();
  created.push(testApp);
  return testApp;
}

function countSources(testApp: TestApp): unknown {
  return testApp.db.prepare('SELECT COUNT(*) AS rows FROM sources').get()?.rows;
}

afterEach(() => {
  for (const testApp of created.splice(0)) testApp.close();
});

describe('createTestApp (AC12)', () => {
  it('has a folder of its own directly inside the temporary folder', () => {
    const testApp = newTestApp();

    expect(existsSync(testApp.dir)).toBe(true);
    expect(path.dirname(testApp.dir)).toBe(tmpdir());
  });

  it('has an uploads folder inside that folder, which does not exist yet', () => {
    const testApp = newTestApp();

    expect(testApp.uploadsDir).toBe(path.join(testApp.dir, 'uploads'));
    expect(existsSync(testApp.uploadsDir)).toBe(false);
  });

  it('has an open database with the schema and no source', () => {
    const testApp = newTestApp();

    expect(testApp.db.isOpen).toBe(true);
    expect(countSources(testApp)).toBe(0);
  });

  it('has an app', () => {
    expect(newTestApp().app).toBeTypeOf('function');
  });

  it('gives every test app its own folder and its own database', () => {
    const first = newTestApp();
    const second = newTestApp();

    createSource(first.db, { kind: 'photo', image_path: '/uploads/a.png' });

    expect(second.dir).not.toBe(first.dir);
    expect(countSources(first)).toBe(1);
    expect(countSources(second)).toBe(0);
  });
});

describe('close (AC12)', () => {
  it('removes the folder with what was stored in it, and closes the database', () => {
    const testApp = newTestApp();
    mkdirSync(testApp.uploadsDir);
    writeFileSync(path.join(testApp.uploadsDir, 'a.png'), 'abc');

    testApp.close();

    expect(existsSync(testApp.dir)).toBe(false);
    expect(testApp.db.isOpen).toBe(false);
  });

  it('does not throw when it is called a second time', () => {
    const testApp = newTestApp();

    testApp.close();

    expect(() => testApp.close()).not.toThrow();
  });
});

describe('withTestApp (AC12)', () => {
  it('resolves to what its callback returns, and closes the test app afterwards', async () => {
    const seen: TestApp[] = [];

    const result = await withTestApp(async (testApp) => {
      seen.push(testApp);
      // The test app is still there when the callback goes on after a wait.
      await new Promise((resolve) => setImmediate(resolve));
      expect(existsSync(testApp.dir)).toBe(true);
      expect(testApp.db.isOpen).toBe(true);
      return 'the result';
    });

    expect(result).toBe('the result');
    expect(seen).toHaveLength(1);
    expect(existsSync(seen[0].dir)).toBe(false);
    expect(seen[0].db.isOpen).toBe(false);
  });

  it('rejects with the error of its callback, and closes the test app all the same', async () => {
    const failure = new Error('the callback failed');
    const seen: TestApp[] = [];

    await expect(
      withTestApp((testApp) => {
        seen.push(testApp);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(seen).toHaveLength(1);
    expect(existsSync(seen[0].dir)).toBe(false);
    expect(seen[0].db.isOpen).toBe(false);
  });
});
