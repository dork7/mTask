import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDatabasePath, getUploadsDir } from './config.ts';
import { rootDir } from './paths.ts';

function readRepoFile(name: string): string {
  return readFileSync(path.join(rootDir, name), 'utf8');
}

const defaultDir = path.join(rootDir, 'data', 'uploads');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getUploadsDir (AC11)', () => {
  it.each([
    ['UPLOADS_DIR is not set', {}],
    ['UPLOADS_DIR is empty', { UPLOADS_DIR: '' }],
    ['UPLOADS_DIR is blank', { UPLOADS_DIR: '   ' }],
  ])('is data/uploads under the repo root when %s', (_name, env) => {
    expect(getUploadsDir(env)).toBe(defaultDir);
  });

  it('starts a relative value at the repo root, not at the working folder', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpdir());

    expect(getUploadsDir({ UPLOADS_DIR: 'var/photos' })).toBe(path.join(rootDir, 'var', 'photos'));
  });

  it('returns an absolute value unchanged', () => {
    const absolute = path.resolve(path.sep, 'srv', 'mtask', 'photos');

    expect(getUploadsDir({ UPLOADS_DIR: absolute })).toBe(absolute);
  });
});

describe('environment files (AC11)', () => {
  it('.env.example lists UPLOADS_DIR, and its value names the default folder', () => {
    const example = parseEnv(readRepoFile('.env.example'));

    expect(Object.keys(example)).toContain('UPLOADS_DIR');
    expect(getUploadsDir(example)).toBe(defaultDir);
  });

  it('the default folder is inside the folder .gitignore ignores, beside the default database', () => {
    const lines = readRepoFile('.gitignore')
      .split('\n')
      .map((line) => line.trim());

    expect(lines).toContain('/data/');
    expect(path.basename(getUploadsDir({}))).toBe('uploads');
    expect(path.dirname(getUploadsDir({}))).toBe(path.join(rootDir, 'data'));
    expect(path.dirname(getUploadsDir({}))).toBe(path.dirname(getDatabasePath({})));
  });
});

describe('the configured uploads folder under the test runner (AC12)', () => {
  // Reads the real environment of the test run. vitest.config.ts sets UPLOADS_DIR
  // there; without that line this is data/uploads, or whatever the shell has.
  it('is under the temporary folder, never data/uploads', () => {
    const configured = getUploadsDir();

    expect(configured).toBe(path.join(tmpdir(), 'mtask-vitest-uploads'));
    expect(configured.startsWith(rootDir + path.sep)).toBe(false);
  });
});
