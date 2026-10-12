import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeCommandDeps } from './analyze-command.ts';
import { rootDir } from './paths.ts';

/*
 * `analyze.ts` runs the command as soon as it is imported. These tests import it with
 * `runAnalyzeCommand` replaced by a spy, so nothing is analyzed, with
 * `createAnalyzerClient` replaced by a spy, so no client is made, and with `loadEnv`
 * replaced by a spy, so a developer's own `.env` cannot change the result.
 * `getAnthropicApiKey` and `getAnthropicModel` stay the real ones.
 */

const runAnalyzeCommand = vi.fn<(args: readonly string[], deps: AnalyzeCommandDeps) => Promise<number>>();
const createAnalyzerClient = vi.fn();
const loadEnv = vi.fn();

/** How long the plain-Node child may take to load the command and exit. It needs about 0.1 s. */
const CHILD_TIMEOUT_MS = 10_000;

let savedArgv: string[] = [];
let savedExitCode: typeof process.exitCode;

async function runEntry(): Promise<void> {
  await import('./analyze.ts');
}

/** The dependencies the entry handed to the command. */
function depsHandedOver(): AnalyzeCommandDeps {
  expect(runAnalyzeCommand).toHaveBeenCalledTimes(1);
  return runAnalyzeCommand.mock.calls[0][1];
}

/** Why a child process did not exit as expected: it was stopped, or what it wrote to stderr. */
function describeFailure(result: SpawnSyncReturns<string>): string {
  if (result.error) return `the child process did not finish: ${result.error.message}`;
  if (result.signal) return `the child process was stopped by ${result.signal}`;
  return result.stderr;
}

beforeEach(() => {
  savedArgv = process.argv;
  savedExitCode = process.exitCode;
  process.argv = ['node', 'src/analyze.ts', '--text', 'buy milk'];
  runAnalyzeCommand.mockResolvedValue(0);

  vi.resetModules();
  vi.doMock('./analyze-command.ts', () => ({ runAnalyzeCommand }));
  vi.doMock('./services/analyzer.ts', () => ({ createAnalyzerClient }));
  vi.doMock('./config.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.ts')>();
    return { ...actual, loadEnv };
  });
});

afterEach(() => {
  process.argv = savedArgv;
  process.exitCode = savedExitCode;

  vi.doUnmock('./analyze-command.ts');
  vi.doUnmock('./services/analyzer.ts');
  vi.doUnmock('./config.ts');
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.resetAllMocks();
});

describe('yarn analyze: the entry (AC11)', () => {
  it('runs the command once, with the arguments after the script', async () => {
    await runEntry();

    expect(runAnalyzeCommand).toHaveBeenCalledTimes(1);
    expect(runAnalyzeCommand.mock.calls[0][0]).toEqual(['--text', 'buy milk']);
  });

  it('loads .env, the default file, before it runs the command', async () => {
    await runEntry();

    expect(loadEnv).toHaveBeenCalledTimes(1);
    expect(loadEnv.mock.calls[0]).toEqual([]);
    expect(loadEnv.mock.invocationCallOrder[0]).toBeLessThan(runAnalyzeCommand.mock.invocationCallOrder[0]);
  });

  it('reads the key and the model after it has loaded .env', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    vi.stubEnv('ANTHROPIC_MODEL', undefined);
    // Stands in for a .env file that holds both.
    loadEnv.mockImplementation(() => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'from-env-file');
      vi.stubEnv('ANTHROPIC_MODEL', 'claude-from-env-file');
    });

    await runEntry();

    expect(depsHandedOver().apiKey).toBe('from-env-file');
    expect(depsHandedOver().model).toBe('claude-from-env-file');
  });

  it('hands over no key and the default model when neither is set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    vi.stubEnv('ANTHROPIC_MODEL', undefined);

    await runEntry();

    expect(depsHandedOver().apiKey).toBeUndefined();
    expect(depsHandedOver().model).toBe('claude-opus-5-5');
  });

  it('hands over the function that makes the real client', async () => {
    await runEntry();

    // The very function of the analyzer module, not one that wraps it.
    expect(depsHandedOver().createClient).toBe(createAnalyzerClient);
  });

  it.each([0, 1])('sets the exit code to the %d the command resolved to', async (code) => {
    runAnalyzeCommand.mockResolvedValue(code);
    process.exitCode = undefined;

    await runEntry();

    expect(process.exitCode).toBe(code);
  });

  it('writes to stdout and to stderr', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await runEntry();
    const deps = depsHandedOver();
    deps.write('out');
    deps.writeError('err');

    expect(stdout.mock.calls).toEqual([['out']]);
    expect(stderr.mock.calls).toEqual([['err']]);
  });
});

describe('yarn analyze: as a process (AC11)', () => {
  // The key is the empty string, which a .env on the machine does not replace, and the
  // base URL is a port nothing listens on, so a broken command could not reach the API
  // either. The child is stopped after CHILD_TIMEOUT_MS; the test's own timeout only has
  // to be longer.
  it(
    'exits with 1 and says that the key is not set, without a key',
    () => {
      const result = spawnSync(process.execPath, ['src/analyze.ts', '--text', 'buy milk'], {
        cwd: rootDir,
        encoding: 'utf8',
        timeout: CHILD_TIMEOUT_MS,
        env: { ...process.env, ANTHROPIC_API_KEY: '', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' },
      });

      expect(result.status, describeFailure(result)).toBe(1);
      expect(result.stderr).toContain('ANTHROPIC_API_KEY is not set.');
      expect(result.stdout).toBe('');
    },
    CHILD_TIMEOUT_MS + 5_000,
  );

  it('package.json has the analyze script', () => {
    const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

    expect(pkg.scripts.analyze).toBe('node src/analyze.ts');
  });
});
