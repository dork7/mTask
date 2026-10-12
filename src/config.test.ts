import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PORT, getPort, loadEnv } from './config.ts';

describe('getPort (AC4)', () => {
  it('is 3000 when PORT is not set', () => {
    expect(DEFAULT_PORT).toBe(3000);
    expect(getPort({})).toBe(3000);
  });

  it('is 3000 when PORT is blank', () => {
    expect(getPort({ PORT: '' })).toBe(3000);
  });

  it('uses PORT when it is a valid port number', () => {
    expect(getPort({ PORT: '4123' })).toBe(4123);
  });

  it.each(['abc', '0', '70000', '80.5'])('throws for PORT=%s and names the value', (value) => {
    expect(() => getPort({ PORT: value })).toThrow(value);
  });
});

describe('loadEnv (AC4)', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mtask-env-'));
    file = path.join(dir, '.env');
    writeFileSync(file, 'PORT=4123\n');
    // Registers PORT with Vitest, so unstubAllEnvs puts back whatever was there
    // before the test, including "not set".
    vi.stubEnv('PORT', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads PORT from the .env file', () => {
    expect(process.env.PORT).toBeUndefined();

    loadEnv(file);

    expect(getPort()).toBe(4123);
  });

  it('does not overwrite a PORT that is already set', () => {
    vi.stubEnv('PORT', '5000');

    loadEnv(file);

    expect(process.env.PORT).toBe('5000');
    expect(getPort()).toBe(5000);
  });

  it('does not throw when the file does not exist', () => {
    expect(() => loadEnv(path.join(dir, 'no-such-file.env'))).not.toThrow();
    expect(process.env.PORT).toBeUndefined();
  });

  it('rethrows an error that is not a missing file', () => {
    expect(() => loadEnv(dir)).toThrow();
  });
});
