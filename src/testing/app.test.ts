import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSource } from '../db/sources.ts';
import type { Analyze } from '../services/analyzer.ts';
import { createTestApp, withTestApp, type TestApp, type TestAppOptions } from './app.ts';

const created: TestApp[] = [];

/** A test app that the `afterEach` closes, whatever the test did with it. */
function newTestApp(options?: TestAppOptions): TestApp {
  const testApp = createTestApp(options);
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

describe('the analyzer of a test app (006 AC1, AC19)', () => {
  it('is a stub that finds one task, a new object on every call', async () => {
    const { analyze } = newTestApp();

    const first = await analyze({ kind: 'text', text: 'anything' });
    const second = await analyze({ kind: 'text', text: 'anything' });

    expect(first.fallback).toBe(false);
    expect(first.tasks).toHaveLength(1);
    expect(first.tasks[0].title).toBe('Buy milk');
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.tasks).not.toBe(first.tasks);
    expect(second.tasks[0]).not.toBe(first.tasks[0]);
  });

  it('is the one handed in, and the app calls it for an upload', async () => {
    const analyze = vi.fn<Analyze>(() => Promise.resolve({ tasks: [], fallback: false }));
    const testApp = newTestApp({ analyze });

    expect(testApp.analyze).toBe(analyze);
    expect(analyze).not.toHaveBeenCalled();

    await request(testApp.app)
      .post('/add/photo')
      .attach('photo', Buffer.from('abc'), { filename: 'list.png', contentType: 'image/png' });

    expect(analyze).toHaveBeenCalledTimes(1);
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
