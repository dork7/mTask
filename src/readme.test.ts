import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rootDir } from './paths.ts';

/* The README (AC12): what it takes to run the app, every variable it reads, and its limits. */

const readme = readFileSync(path.join(rootDir, 'README.md'), 'utf8');

describe('README.md (AC12)', () => {
  it('starts with a title naming the app', () => {
    expect(readme.startsWith('# Task Image AI\n')).toBe(true);
  });

  it.each(['22.18', 'yarn install', 'yarn dev', 'yarn test', 'yarn build'])('states %s', (text) => {
    expect(readme).toContain(text);
  });

  it.each([
    'PORT',
    'DATABASE_PATH',
    'UPLOADS_DIR',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
  ])('names the variable %s', (name) => {
    expect(readme).toContain(`\`${name}\``);
  });

  it('names every variable src/config.ts reads', () => {
    const config = readFileSync(path.join(rootDir, 'src', 'config.ts'), 'utf8');
    const names = [...config.matchAll(/env\.([A-Z_]+)/g)].map((match) => match[1]);

    expect(names.length).toBeGreaterThanOrEqual(8);
    for (const name of new Set(names)) expect(readme, name).toContain(`\`${name}\``);
  });

  it('states the rate limit and the photo cleanup', () => {
    expect(readme).toContain('429');
    expect(readme).toContain('24 hours');
  });
});
