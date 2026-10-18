import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { openDatabase, type Database } from '../db/database.ts';
import { createSource, getSource, type Source } from '../db/sources.ts';
import { createTask, taskStatuses } from '../db/tasks.ts';
import { oneTaskAnalysis } from '../testing/app.ts';
import { CLEANUP_EVERY_MS, runPhotoCleanup, startPhotoCleanup, type PhotoCleanup } from './photo-cleanup.ts';

/*
 * The photo cleanup (AC4) and its schedule (AC5). Each test has an in-memory database
 * and an uploads folder of its own under the system's temporary folder.
 */

const NOW = Date.parse('2026-10-12T09:36:00.000Z');
const HOUR = 60 * 60 * 1000;

let db: Database;
let dir: string;
let uploadsDir: string;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db = openDatabase(':memory:');
  dir = mkdtempSync(path.join(tmpdir(), 'mtask-cleanup-'));
  uploadsDir = path.join(dir, 'uploads');
  mkdirSync(uploadsDir);
});

afterEach(() => {
  vi.useRealTimers();
  if (db.isOpen) db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Writes a file into the uploads folder, last changed `ageMs` before `NOW`. */
function file(name: string, ageMs: number): string {
  const full = path.join(uploadsDir, name);
  writeFileSync(full, 'bytes');
  const at = new Date(NOW - ageMs);
  utimesSync(full, at, at);
  return full;
}

/** A photo source created `ageMs` before `NOW`, with its file, which is as old. */
function photo(name: string, ageMs: number): Source {
  vi.setSystemTime(NOW - ageMs);
  const source = createSource(db, { kind: 'photo', image_path: `/uploads/${name}` });
  vi.setSystemTime(NOW);
  file(name, ageMs);
  return source;
}

function cleanup(): ReturnType<PhotoCleanup> {
  return runPhotoCleanup(db, uploadsDir, new Date(NOW));
}

describe('runPhotoCleanup (AC4)', () => {
  it('removes an old photo source with no task, and its file', async () => {
    const source = photo('old.png', 25 * HOUR);

    const result = await cleanup();

    expect(result.sources).toEqual([source.id]);
    expect(getSource(db, source.id)).toBeUndefined();
    expect(existsSync(path.join(uploadsDir, 'old.png'))).toBe(false);
  });

  it.each(taskStatuses)('keeps an old photo source with a %s task, and its file', async (status) => {
    const source = photo('kept.png', 25 * HOUR);
    createTask(db, { title: 'A task', status, source_id: source.id });

    const result = await cleanup();

    expect(result).toEqual({ sources: [], orphans: [] });
    expect(getSource(db, source.id)).toEqual(source);
    expect(existsSync(path.join(uploadsDir, 'kept.png'))).toBe(true);
  });

  it('keeps a photo source with no task created 24 hours ago or less, and its file', async () => {
    const exactly = photo('exactly.png', 24 * HOUR);
    const recent = photo('recent.png', HOUR);

    const result = await cleanup();

    expect(result.sources).toEqual([]);
    expect(getSource(db, exactly.id)).toEqual(exactly);
    expect(getSource(db, recent.id)).toEqual(recent);
    expect(existsSync(path.join(uploadsDir, 'exactly.png'))).toBe(true);
    expect(existsSync(path.join(uploadsDir, 'recent.png'))).toBe(true);
  });

  it('keeps old voice and text sources with no task', async () => {
    vi.setSystemTime(NOW - 48 * HOUR);
    const voice = createSource(db, { kind: 'voice', transcript: 'call the bank' });
    const text = createSource(db, { kind: 'text', transcript: 'buy milk' });
    vi.setSystemTime(NOW);

    await cleanup();

    expect(getSource(db, voice.id)).toEqual(voice);
    expect(getSource(db, text.id)).toEqual(text);
  });

  it('removes an old file no row names, and keeps a fresh one, a named one and a folder', async () => {
    file('orphan-old.png', 25 * HOUR);
    file('orphan-fresh.png', HOUR);
    const kept = photo('named.png', 25 * HOUR);
    createTask(db, { title: 'A task', status: 'pending', source_id: kept.id });
    mkdirSync(path.join(uploadsDir, 'folder'));
    const folderTime = new Date(NOW - 48 * HOUR);
    utimesSync(path.join(uploadsDir, 'folder'), folderTime, folderTime);

    const result = await cleanup();

    expect(result).toEqual({ sources: [], orphans: ['orphan-old.png'] });
    expect(existsSync(path.join(uploadsDir, 'orphan-old.png'))).toBe(false);
    expect(existsSync(path.join(uploadsDir, 'orphan-fresh.png'))).toBe(true);
    expect(existsSync(path.join(uploadsDir, 'named.png'))).toBe(true);
    expect(existsSync(path.join(uploadsDir, 'folder'))).toBe(true);
  });

  it('is no error when a removed source has no file, or the uploads folder is missing', async () => {
    vi.setSystemTime(NOW - 25 * HOUR);
    const source = createSource(db, { kind: 'photo', image_path: '/uploads/missing.png' });
    vi.setSystemTime(NOW);
    rmSync(uploadsDir, { recursive: true });

    await expect(cleanup()).resolves.toEqual({ sources: [source.id], orphans: [] });
    expect(existsSync(uploadsDir)).toBe(false);
  });

  it('answers 404 for the review page of a removed source', async () => {
    const source = photo('old.png', 25 * HOUR);
    const app = createApp({ db, uploadsDir, analyze: () => Promise.resolve(oneTaskAnalysis()) });
    expect((await request(app).get(`/review/${source.id}`)).status).toBe(200);

    await cleanup();

    expect((await request(app).get(`/review/${source.id}`)).status).toBe(404);
  });
});

describe('startPhotoCleanup (AC5)', () => {
  it('runs at once, then every hour, until it is stopped', async () => {
    vi.useFakeTimers();
    const run = vi.fn<PhotoCleanup>(() => Promise.resolve({ sources: [], orphans: [] }));

    const stop = startPhotoCleanup(db, uploadsDir, run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toBe(db);
    expect(run.mock.calls[0][1]).toBe(uploadsDir);
    expect(run.mock.calls[0][2]).toBeInstanceOf(Date);

    vi.advanceTimersByTime(CLEANUP_EVERY_MS);
    expect(run).toHaveBeenCalledTimes(2);

    stop();
    vi.advanceTimersByTime(2 * CLEANUP_EVERY_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('logs a run that fails and keeps running', async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('disk gone');
    const run = vi.fn<PhotoCleanup>(() => Promise.reject(failure));

    const stop = startPhotoCleanup(db, uploadsDir, run);
    await vi.advanceTimersByTimeAsync(0);
    expect(consoleError).toHaveBeenCalledWith('The photo cleanup failed:', failure);

    await vi.advanceTimersByTimeAsync(CLEANUP_EVERY_MS);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
    consoleError.mockRestore();
  });

  it('is not started by createApp', async () => {
    const source = photo('old.png', 25 * HOUR);
    file('orphan.png', 25 * HOUR);
    vi.useRealTimers();

    createApp({ db, uploadsDir, analyze: () => Promise.resolve(oneTaskAnalysis()) });
    await new Promise((resolve) => setImmediate(resolve));

    expect(getSource(db, source.id)).toEqual(source);
    expect(existsSync(path.join(uploadsDir, 'old.png'))).toBe(true);
    expect(existsSync(path.join(uploadsDir, 'orphan.png'))).toBe(true);
  });
});
