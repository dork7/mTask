import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * `server.ts` listens as soon as it is imported. These tests import it with
 * `createApp` replaced by a spy that returns an app whose `listen` is a spy, so no
 * port is opened, with `openDatabase` replaced by a spy that returns a stand-in, so
 * no database is opened, with `createAnalyze` replaced by a spy that returns a
 * stand-in, so the SDK is not loaded and no client is made, and with `loadEnv`
 * replaced by a spy, so a developer's own `.env` cannot change the result. `getPort`,
 * `getDatabasePath`, `getUploadsDir`, `getAnthropicApiKey` and `getAnthropicModel` stay
 * the real ones. The reminder, push and digest jobs are replaced by spies, so none of
 * them starts a timer, and so is the photo cleanup, so it never reads the stand-in
 * database.
 */

const listen = vi.fn();
const loadEnv = vi.fn();

/** The VAPID pair `web-push generate-vapid-keys` makes, checked against `web-push@3.6.7`. */
const KEYS = {
  publicKey: 'BHBjqXnNyMq3hDqYFob0fy-yoSWYlE8d2wXfWRx9qUgXY2L1oQ8_sHxKnUP3RVCWFjJmqHKU88i-EWyYulEtI2U',
  privateKey: 'qCQ9VuEsy-NTlptIqrY-O8KMGIc7HPuXj-DH2pt-cR0',
  subject: 'mailto:push@example.test',
};

/** Stands in for the open database. `server.ts` only hands it on. */
const database = { name: 'the database openDatabase returned' };
const openDatabase = vi.fn((_file: string) => database);
const startRecurrence = vi.fn();
const startPhotoCleanup = vi.fn();
const ensureFeedToken = vi.fn();
const createApp = vi.fn(
  (_deps: { db: unknown; uploadsDir: string; analyze: unknown; vapidPublicKey?: string | null }) => ({ listen }),
);

/** Stands in for the analyzer. `server.ts` only hands it on. */
const analyze = vi.fn();
const createAnalyze = vi.fn((_apiKey: string | undefined, _model: string) => analyze);

/** Stands in for the VAPID keys of the environment. The real one is `src/config.ts`'s. */
const getVapidKeys = vi.fn();

/** Stand in for the two jobs; `server.ts` starts exactly one. */
const startPushJob = vi.fn();
const startReminderJob = vi.fn();
/** Stands in for the daily digest job; `server.ts` starts it beside the push job. */
const startDigestJob = vi.fn();

async function startServer(): Promise<void> {
  await import('./server.ts');
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock('./app.ts', () => ({ createApp }));
  vi.doMock('./db/database.ts', () => ({ openDatabase }));
  vi.doMock('./services/analyzer.ts', () => ({ createAnalyze }));
  vi.doMock('./services/push.ts', () => ({ startPushJob }));
  vi.doMock('./services/reminders.ts', () => ({ startReminderJob }));
  vi.doMock('./services/digest.ts', () => ({ startDigestJob }));
  vi.doMock('./services/recurrence.ts', () => ({ startRecurrence }));
  vi.doMock('./services/photo-cleanup.ts', () => ({ startPhotoCleanup }));
  vi.doMock('./services/calendar.ts', () => ({ ensureFeedToken }));
  vi.doMock('./config.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.ts')>();
    return { ...actual, loadEnv, getVapidKeys };
  });
  getVapidKeys.mockReturnValue(undefined);
});

afterEach(() => {
  vi.doUnmock('./app.ts');
  vi.doUnmock('./db/database.ts');
  vi.doUnmock('./services/analyzer.ts');
  vi.doUnmock('./services/push.ts');
  vi.doUnmock('./services/reminders.ts');
  vi.doUnmock('./services/digest.ts');
  vi.doUnmock('./services/recurrence.ts');
  vi.doUnmock('./services/photo-cleanup.ts');
  vi.doUnmock('./services/calendar.ts');
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
    expect(createApp.mock.calls[0]).toStrictEqual([{ db: database, uploadsDir, analyze, vapidPublicKey: undefined }]);
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

describe('server: the analyzer (006 AC1)', () => {
  it('builds the analyzer from the configured key and model and hands it to the app', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-test-model');

    await startServer();

    expect(createAnalyze.mock.calls).toEqual([['test-key', 'claude-test-model']]);
    expect(createApp).toHaveBeenCalledTimes(1);
    // The very function createAnalyze returned, not another one.
    expect(createApp.mock.calls[0][0].analyze).toBe(createAnalyze.mock.results[0].value);
  });

  it('builds it without a key, on the default model, and still listens', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    vi.stubEnv('ANTHROPIC_MODEL', undefined);

    await startServer();

    expect(createAnalyze.mock.calls).toEqual([[undefined, 'claude-opus-5-5']]);
    expect(createApp.mock.calls[0][0].analyze).toBe(createAnalyze.mock.results[0].value);
    expect(listen).toHaveBeenCalledTimes(1);
  });
});

describe('server: without an Anthropic API key (005 AC10)', () => {
  it.each([
    ['not set', undefined],
    ['empty', ''],
  ])('starts when ANTHROPIC_API_KEY is %s', async (_name, value) => {
    vi.stubEnv('ANTHROPIC_API_KEY', value);

    await expect(startServer()).resolves.toBeUndefined();

    expect(createApp).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledTimes(1);
  });
});

describe('server: the reminder, push and digest jobs (019 AC7, 020 AC10)', () => {
  it('starts the reminder job and not the push job when there are no VAPID keys', async () => {
    vi.stubEnv('PORT', undefined);

    await startServer();

    expect(startReminderJob).toHaveBeenCalledTimes(1);
    expect(startReminderJob.mock.calls[0]).toEqual([database]);
    expect(startPushJob).not.toHaveBeenCalled();
    expect(startDigestJob).not.toHaveBeenCalled();
    expect(createApp.mock.invocationCallOrder[0]).toBeLessThan(startReminderJob.mock.invocationCallOrder[0]);
    expect(startReminderJob.mock.invocationCallOrder[0]).toBeLessThan(listen.mock.invocationCallOrder[0]);
  });

  it('starts the push job with the real sender and not the reminder job when the keys are there', async () => {
    vi.stubEnv('PORT', undefined);
    getVapidKeys.mockReturnValue(KEYS);

    await startServer();

    expect(startPushJob).toHaveBeenCalledTimes(1);
    expect(startPushJob.mock.calls[0][0]).toBe(database);
    expect(startPushJob.mock.calls[0][1]).toBeTypeOf('function');
    expect(startDigestJob).toHaveBeenCalledTimes(1);
    expect(startDigestJob.mock.calls[0][0]).toBe(database);
    // The very sender the push job got, not a second one.
    expect(startDigestJob.mock.calls[0][1]).toBe(startPushJob.mock.calls[0][1]);
    expect(startDigestJob.mock.calls[0][1]).toBeTypeOf('function');
    expect(startReminderJob).not.toHaveBeenCalled();
    expect(createApp.mock.calls[0][0]).toMatchObject({ vapidPublicKey: KEYS.publicKey });
    expect(createApp.mock.invocationCallOrder[0]).toBeLessThan(startPushJob.mock.invocationCallOrder[0]);
    expect(startPushJob.mock.invocationCallOrder[0]).toBeLessThan(startDigestJob.mock.invocationCallOrder[0]);
    expect(startDigestJob.mock.invocationCallOrder[0]).toBeLessThan(listen.mock.invocationCallOrder[0]);
  });
});

describe('server: the recurring job (016 AC7)', () => {
  it('starts the recurring job once, on the database it opened, after it opens it', async () => {
    await startServer();

    expect(startRecurrence).toHaveBeenCalledTimes(1);
    expect(startRecurrence.mock.calls[0][0]).toBe(database);
    expect(openDatabase.mock.invocationCallOrder[0]).toBeLessThan(startRecurrence.mock.invocationCallOrder[0]);
  });
});

describe('server: the calendar feed token (021 AC5)', () => {
  it('stores the feed token once, on the database it opened, before it listens', async () => {
    await startServer();

    expect(ensureFeedToken).toHaveBeenCalledTimes(1);
    expect(ensureFeedToken.mock.calls[0][0]).toBe(database);
    expect(openDatabase.mock.invocationCallOrder[0]).toBeLessThan(ensureFeedToken.mock.invocationCallOrder[0]);
    expect(ensureFeedToken.mock.invocationCallOrder[0]).toBeLessThan(listen.mock.invocationCallOrder[0]);
  });
});

describe('server: the photo cleanup (023 AC5)', () => {
  it('starts the photo cleanup once, on the database it opened and the configured uploads folder', async () => {
    const uploadsDir = path.join(tmpdir(), `mtask-server-test-${process.pid}`, 'uploads');
    vi.stubEnv('UPLOADS_DIR', uploadsDir);

    await startServer();

    expect(startPhotoCleanup).toHaveBeenCalledTimes(1);
    expect(startPhotoCleanup.mock.calls[0][0]).toBe(database);
    expect(startPhotoCleanup.mock.calls[0][1]).toBe(uploadsDir);
    expect(openDatabase.mock.invocationCallOrder[0]).toBeLessThan(startPhotoCleanup.mock.invocationCallOrder[0]);
    expect(existsSync(uploadsDir)).toBe(false);
  });
});
