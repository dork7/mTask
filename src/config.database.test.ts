import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { getDatabasePath } from './config.ts';
import { rootDir } from './paths.ts';

function readRepoFile(name: string): string {
  return readFileSync(path.join(rootDir, name), 'utf8');
}

const defaultPath = path.join(rootDir, 'data', 'app.db');

describe('getDatabasePath (AC1)', () => {
  it.each([
    ['DATABASE_PATH is not set', {}],
    ['DATABASE_PATH is empty', { DATABASE_PATH: '' }],
    ['DATABASE_PATH is blank', { DATABASE_PATH: '   ' }],
  ])('is data/app.db under the repo root when %s', (_name, env) => {
    expect(getDatabasePath(env)).toBe(defaultPath);
  });

  it('starts a relative value at the repo root, not at the working folder', () => {
    expect(getDatabasePath({ DATABASE_PATH: 'var/x.db' })).toBe(path.join(rootDir, 'var', 'x.db'));
  });

  it('returns an absolute value unchanged', () => {
    const absolute = path.resolve(path.sep, 'srv', 'mtask', 'tasks.db');

    expect(getDatabasePath({ DATABASE_PATH: absolute })).toBe(absolute);
  });

  it('returns :memory: unchanged', () => {
    expect(getDatabasePath({ DATABASE_PATH: ':memory:' })).toBe(':memory:');
  });
});

describe('environment files (AC1)', () => {
  it('.env.example lists DATABASE_PATH, and its value names the default file', () => {
    const example = parseEnv(readRepoFile('.env.example'));

    expect(Object.keys(example)).toContain('DATABASE_PATH');
    expect(getDatabasePath(example)).toBe(getDatabasePath({}));
  });

  it('the folder of the default file is the one .gitignore ignores', () => {
    const lines = readRepoFile('.gitignore')
      .split('\n')
      .map((line) => line.trim());

    expect(lines).toContain('/data/');
    expect(path.dirname(getDatabasePath({}))).toBe(path.join(rootDir, 'data'));
  });
});

describe('the configured database under the test runner (AC8)', () => {
  // Reads the real environment of the test run. vitest.config.ts sets DATABASE_PATH
  // there; without that line this is data/app.db, or whatever the shell has.
  it('is in memory, never data/app.db', () => {
    expect(getDatabasePath()).toBe(':memory:');
  });
});
