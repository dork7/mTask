import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ANTHROPIC_MODEL, getAnthropicApiKey, getAnthropicModel } from './config.ts';
import { rootDir } from './paths.ts';

function readRepoFile(name: string): string {
  return readFileSync(path.join(rootDir, name), 'utf8');
}

/** Every non-test `.ts` file under `src/`, as a path from the repo root with forward slashes. */
function sourceFiles(): string[] {
  return readdirSync(path.join(rootDir, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => path.posix.join('src', ...name.split(path.sep)));
}

describe('getAnthropicApiKey (AC10)', () => {
  it.each([
    ['ANTHROPIC_API_KEY is not set', {}],
    ['ANTHROPIC_API_KEY is empty', { ANTHROPIC_API_KEY: '' }],
    ['ANTHROPIC_API_KEY is blank', { ANTHROPIC_API_KEY: '   ' }],
  ])('is undefined when %s', (_name, env) => {
    expect(getAnthropicApiKey(env)).toBeUndefined();
  });

  it('is the value of ANTHROPIC_API_KEY, without the spaces around it', () => {
    expect(getAnthropicApiKey({ ANTHROPIC_API_KEY: '  sk-test ' })).toBe('sk-test');
  });
});

describe('getAnthropicModel (AC10)', () => {
  it.each([
    ['ANTHROPIC_MODEL is not set', {}],
    ['ANTHROPIC_MODEL is empty', { ANTHROPIC_MODEL: '' }],
    ['ANTHROPIC_MODEL is blank', { ANTHROPIC_MODEL: '   ' }],
  ])('is the default model when %s', (_name, env) => {
    expect(getAnthropicModel(env)).toBe('claude-opus-5-5');
  });

  it('has claude-opus-5-5 as its default', () => {
    expect(DEFAULT_ANTHROPIC_MODEL).toBe('claude-opus-5-5');
  });

  it('is the value of ANTHROPIC_MODEL, without the spaces around it', () => {
    expect(getAnthropicModel({ ANTHROPIC_MODEL: ' claude-haiku-5-5 ' })).toBe('claude-haiku-5-5');
  });
});

describe('environment files (AC10)', () => {
  it('.env.example lists ANTHROPIC_API_KEY with an empty value', () => {
    const example = parseEnv(readRepoFile('.env.example'));

    expect(Object.keys(example)).toContain('ANTHROPIC_API_KEY');
    expect(example.ANTHROPIC_API_KEY).toBe('');
    expect(getAnthropicApiKey(example)).toBeUndefined();
  });

  it('.env.example lists ANTHROPIC_MODEL with the default model', () => {
    const example = parseEnv(readRepoFile('.env.example'));

    expect(Object.keys(example)).toContain('ANTHROPIC_MODEL');
    expect(example.ANTHROPIC_MODEL).toBe('claude-opus-5-5');
  });
});

describe('where the environment is read (AC10)', () => {
  it('no source file but src/config.ts reads process.env', () => {
    const files = sourceFiles();

    // So the test cannot pass on an empty list.
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain('src/services/analyzer.ts');
    expect(files).toContain('src/config.ts');

    const readers = files
      .filter((file) => file !== 'src/config.ts')
      .filter((file) => readRepoFile(file).includes('process.env'));

    expect(readers).toEqual([]);
  });
});

describe('the Anthropic SDK (AC10)', () => {
  it('is a dependency, pinned to 0.133.0, and not a dev dependency', () => {
    const pkg = JSON.parse(readRepoFile('package.json'));

    expect(pkg.dependencies['@anthropic-ai/sdk']).toBe('0.133.0');
    expect(pkg.devDependencies).not.toHaveProperty('@anthropic-ai/sdk');
  });
});

describe('the configured API key under the test runner (AC10, AC12)', () => {
  // Reads the real environment of the test run. vitest.config.ts sets ANTHROPIC_API_KEY
  // to the empty string there; without that line this is whatever the shell has.
  it('is blank, so no test gets a key from getAnthropicApiKey()', () => {
    expect(process.env.ANTHROPIC_API_KEY).toBe('');
    expect(getAnthropicApiKey()).toBeUndefined();
  });
});
