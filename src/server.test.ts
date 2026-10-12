import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * `server.ts` listens as soon as it is imported. These tests import it with
 * `createApp` replaced by an app whose `listen` is a spy, so no port is opened,
 * and with `loadEnv` replaced by a spy, so a developer's own `.env` cannot change
 * the result. `getPort` stays the real one.
 */

const listen = vi.fn();
const loadEnv = vi.fn();

async function startServer(): Promise<void> {
  await import('./server.ts');
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock('./app.ts', () => ({ createApp: () => ({ listen }) }));
  vi.doMock('./config.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.ts')>();
    return { ...actual, loadEnv };
  });
});

afterEach(() => {
  vi.doUnmock('./app.ts');
  vi.doUnmock('./config.ts');
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.clearAllMocks();
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
