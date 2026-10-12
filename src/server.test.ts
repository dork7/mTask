import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * `server.ts` listens as soon as it is imported. These tests import it with
 * `createApp` replaced by a spy that returns an app whose `listen` is a spy, so no
 * port is opened, with `openDatabase` replaced by a spy that returns a stand-in, so
 * no database is opened, and with `loadEnv` replaced by a spy, so a developer's own
 * `.env` cannot change the result. `getPort`, `getDatabasePath` and `getUploadsDir`
 * stay the real ones.
 */

const listen = vi.fn();
const loadEnv = vi.fn();

/** Stands in for the open database. `server.ts` only hands it on. */
const database = { name: 'the database openDatabase returned' };
const openDatabase = vi.fn((_file: string) => database);
const createApp = vi.fn((_deps: { db: unknown; uploadsDir: string }) => ({ listen }));

async function startServer(): Promise<void> {
  await import('./server.ts');
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock('./app.ts', () => ({ createApp }));
  vi.doMock('./db/database.ts', () => ({ openDatabase }));
  vi.doMock('./config.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.ts')>();
    return { ...actual, loadEnv };
  });
});

afterEach(() => {
  vi.doUnmock('./app.ts');
  vi.doUnmock('./db/database.ts');
  vi.doUnmock('./config.ts');
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.resetAllMocks();
});

describe('server (AC4)', () => {
  it('listens on PORT', async () => {
    vi.stubEnv('PORT', '4567');

    await startServer();

    expect(listen).toHaveBeenCalledTimes(1);
    expect(listen.mock.calls[0][0]).toBe(4567);
  });

  it('listens on 3000 when PORT is not set', async () => {
    vi.stubEnv('PORT', undefined);

    await startServer();

    expect(listen).toHaveBeenCalledTimes(1);
    expect(listen.mock.calls[0][0]).toBe(3000);
  });

  it('loads .env before it listens', async () => {
    vi.stubEnv('PORT', undefined);

    await startServer();

    expect(loadEnv).toHaveBeenCalledTimes(1);
    expect(loadEnv.mock.invocationCallOrder[0]).toBeLessThan(listen.mock.invocationCallOrder[0]);
  });

  it('reads the port after it has loaded .env', async () => {
    vi.stubEnv('PORT', undefined);
    // Stands in for a .env file that holds PORT=4321.
    loadEnv.mockImplementation(() => {
      vi.stubEnv('PORT', '4321');
    });

    await startServer();

    expect(listen).toHaveBeenCalledTimes(1);
    expect(listen.mock.calls[0][0]).toBe(4321);
  });

  it('loads the default file, .env at the repo root', async () => {
    vi.stubEnv('PORT', undefined);

    await startServer();

    expect(loadEnv).toHaveBeenCalledTimes(1);
    expect(loadEnv.mock.calls[0]).toEqual([]);
  });

  it('announces the URL once it is listening', async () => {
    vi.stubEnv('PORT', '4567');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await startServer();
    const onListening: (error?: Error) => void = listen.mock.calls[0][1];
    onListening();

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('http://localhost:4567');
  });

  it('fails instead of announcing a URL when it cannot listen', async () => {
    vi.stubEnv('PORT', '4567');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const inUse = new Error('listen EADDRINUSE: address already in use :::4567');

    await startServer();
    const onListening: (error?: Error) => void = listen.mock.calls[0][1];

    expect(() => onListening(inUse)).toThrow(inUse);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('server: the database and the uploads folder (AC11)', () => {
  it('opens the database once, at the configured path, before it listens', async () => {
    const folder = path.join(tmpdir(), `mtask-server-test-${process.pid}`);
    const file = path.join(folder, 'app.db');
    vi.stubEnv('DATABASE_PATH', file);

    await startServer();

    expect(openDatabase).toHaveBeenCalledTimes(1);
    expect(openDatabase.mock.calls[0]).toEqual([file]);
    expect(listen).toHaveBeenCalledTimes(1);
    expect(openDatabase.mock.invocationCallOrder[0]).toBeLessThan(listen.mock.invocationCallOrder[0]);
    expect(existsSync(folder)).toBe(false);
  });

  it('reads the database path after it has loaded .env', async () => {
    const file = path.join(tmpdir(), `mtask-server-test-${process.pid}`, 'from-env-file.db');
    vi.stubEnv('DATABASE_PATH', undefined);
    // Stands in for a .env file that holds DATABASE_PATH.
    loadEnv.mockImplementation(() => {
      vi.stubEnv('DATABASE_PATH', file);
    });

    await startServer();

    expect(openDatabase).toHaveBeenCalledTimes(1);
    expect(openDatabase.mock.calls[0]).toEqual([file]);
  });

  it('builds the app on that database and the configured uploads folder', async () => {
    const uploadsDir = path.join(tmpdir(), `mtask-server-test-${process.pid}`, 'uploads');
    vi.stubEnv('UPLOADS_DIR', uploadsDir);

    await startServer();

    expect(createApp).toHaveBeenCalledTimes(1);
    expect(createApp.mock.calls[0]).toStrictEqual([{ db: database, uploadsDir }]);
    // The very object openDatabase returned, not a copy of it.
    expect(createApp.mock.calls[0][0].db).toBe(openDatabase.mock.results[0].value);
    expect(existsSync(uploadsDir)).toBe(false);
  });

  it('stops before it listens when the database cannot be opened', async () => {
    const failure = new Error('unable to open database file');
    openDatabase.mockImplementation(() => {
      throw failure;
    });

    await expect(startServer()).rejects.toBe(failure);

    expect(createApp).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });
});
