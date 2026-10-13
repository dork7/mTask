import http from 'node:http';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from './testing/app.ts';

const APP_NAME = 'Task Image AI';

/** The text between `<main ...>` and `</main>`. */
function mainOf(html: string): string {
  const match = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html);
  if (!match) throw new Error('The page has no <main> element');
  return match[1];
}

/** The `href` of the stylesheet link in a rendered page. */
function stylesheetHref(html: string): string {
  const match = /<link\s+rel="stylesheet"\s+href="([^"]+)"/.exec(html);
  if (!match) throw new Error('The page has no stylesheet link');
  return match[1];
}

/** Asserts the marks every page gets from the shared layout. */
function expectLayout(html: string): void {
  expect(html.match(/<html\b/g)).toHaveLength(1);

  const title = /<title>([\s\S]*?)<\/title>/.exec(html);
  expect(title?.[1]).toContain(APP_NAME);

  const header = /<header\b[^>]*class="site-header"[^>]*>([\s\S]*?)<\/header>/.exec(html);
  expect(header?.[1]).toContain(APP_NAME);
}

async function fetchStylesheet(): Promise<{ href: string; css: string; response: request.Response }> {
  const app = testApp.app;
  const page = await request(app).get('/');
  const href = stylesheetHref(page.text);
  const response = await request(app).get(href);
  return { href, css: response.text, response };
}

/** The declarations inside every `:root { ... }` block, and the CSS left without them. */
function splitRoot(css: string): { root: string; rest: string } {
  const blocks = /:root\s*\{([^}]*)\}/g;
  const root = [...css.matchAll(blocks)].map((match) => match[1]).join('\n');
  return { root, rest: css.replace(blocks, '') };
}

let testApp: TestApp;

beforeEach(() => {
  testApp = createTestApp();
});

afterEach(() => {
  testApp.close();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('GET / (AC1)', () => {
  it('returns 200 with an HTML page', async () => {
    const response = await request(testApp.app).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });

  it('renders the shared layout, which carries the app name', async () => {
    const response = await request(testApp.app).get('/');

    expectLayout(response.text);
  });

  it('renders the home view inside the layout', async () => {
    const response = await request(testApp.app).get('/');

    expect(mainOf(response.text)).toContain('<h1>Today</h1>');
  });
});

describe('base stylesheet (AC2)', () => {
  it('is linked from the layout and served as text/css', async () => {
    const { response } = await fetchStylesheet();

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/css/);
  });

  it('defines its colors as CSS variables on :root', async () => {
    const { css } = await fetchStylesheet();
    const { root } = splitRoot(css);

    expect(root).toMatch(/--bg\s*:/);
    expect(root).toMatch(/--text\s*:/);
    expect(root).toMatch(/--accent\s*:/);
  });

  it('has no color literal outside :root', async () => {
    const { css } = await fetchStylesheet();
    const { root, rest } = splitRoot(css);

    expect(root).not.toBe('');
    expect(rest).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(rest).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
  });

  it('declares on :root every variable it uses', async () => {
    const { css } = await fetchStylesheet();
    const { root } = splitRoot(css);
    const declared = new Set([...root.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
    const used = [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]);

    expect(used.length).toBeGreaterThan(0);
    for (const name of used) {
      expect(declared, `${name} is used but not declared on :root`).toContain(name);
    }
  });
});

describe('unknown path (AC3)', () => {
  it('returns 404 with an HTML page', async () => {
    const response = await request(testApp.app).get('/no-such-page');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });

  it('renders the not-found view in the same layout as the home page', async () => {
    const app = testApp.app;
    const home = await request(app).get('/');
    const missing = await request(app).get('/no-such-page');

    expectLayout(missing.text);
    expect(stylesheetHref(missing.text)).toBe(stylesheetHref(home.text));
    expect(mainOf(missing.text)).toContain('<h1>Page not found</h1>');
  });

  it('answers any method, not only GET', async () => {
    const response = await request(testApp.app).post('/no-such-page');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expectLayout(response.text);
    expect(mainOf(response.text)).toContain('<h1>Page not found</h1>');
  });
});

describe('app without a listener (AC4)', () => {
  it('does not listen when the module is imported and the app is created', async () => {
    vi.resetModules();
    const listen = vi.spyOn(http.Server.prototype, 'listen');

    const fresh = await import('./app.ts');
    const app = fresh.createApp({ db: testApp.db, uploadsDir: testApp.uploadsDir, analyze: testApp.analyze });

    expect(app).toBeTypeOf('function');
    expect(listen).not.toHaveBeenCalled();
  });
});

describe('the uploads folder of an app (AC11)', () => {
  it('must be an absolute path, so nothing is stored under the working folder', async () => {
    const { createApp } = await import('./app.ts');

    expect(() => createApp({ db: testApp.db, uploadsDir: 'uploads', analyze: testApp.analyze })).toThrow(
      'The uploads folder must be an absolute path, got "uploads"',
    );
    expect(() => createApp({ db: testApp.db, uploadsDir: '', analyze: testApp.analyze })).toThrow(
      'The uploads folder must be an absolute path, got ""',
    );
  });
});
