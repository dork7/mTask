import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { rootDir } from './paths.ts';

function readRepoFile(name: string): string {
  return readFileSync(path.join(rootDir, name), 'utf8');
}

/** Every non-test `.ts` file under `src/`. */
function sourceFiles(): string[] {
  return readdirSync(path.join(rootDir, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => path.join(rootDir, 'src', name));
}

/** Every upper-case name read as `env.NAME` or `env['NAME']` in the source files. */
function envNamesRead(): Set<string> {
  const names = new Set<string>();
  const patterns = [/\benv\.([A-Z][A-Z0-9_]*)\b/g, /\benv\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) names.add(match[1]);
    }
  }
  return names;
}

describe('environment files (AC5)', () => {
  it('.env.example lists every environment variable the app reads', () => {
    const read = envNamesRead();
    const listed = Object.keys(parseEnv(readRepoFile('.env.example')));

    expect(read.size).toBeGreaterThan(0);
    expect(read).toContain('PORT');
    for (const name of read) {
      expect(listed, `${name} is read under src/ but missing from .env.example`).toContain(name);
    }
  });

  it('.env is git-ignored', () => {
    const lines = readRepoFile('.gitignore')
      .split('\n')
      .map((line) => line.trim());

    expect(lines).toContain('.env');
  });
});

describe('project commands (AC6)', () => {
  it('package.json has the test, build and dev scripts, with Vitest and supertest', () => {
    const pkg = JSON.parse(readRepoFile('package.json'));

    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.scripts.build).toBe('tsc --noEmit');
    expect(pkg.scripts.dev).toBe('node --watch src/server.ts');
    expect(pkg.devDependencies).toHaveProperty('vitest');
    expect(pkg.devDependencies).toHaveProperty('supertest');
  });

  it('Project facts in CLAUDE.md lists the test, build and dev commands', () => {
    const claude = readRepoFile('CLAUDE.md');
    const start = claude.indexOf('## Project facts');
    expect(start).toBeGreaterThanOrEqual(0);

    const next = claude.indexOf('\n## ', start + 1);
    const facts = claude.slice(start, next === -1 ? undefined : next);

    expect(facts).toContain('`yarn test`');
    expect(facts).toContain('`yarn build`');
    expect(facts).toContain('`yarn dev`');
  });

  it('plain Node, the runtime of the dev command, can load the app', () => {
    const script = "const { createApp } = await import('./src/app.ts'); createApp();";
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: rootDir,
      encoding: 'utf8',
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
