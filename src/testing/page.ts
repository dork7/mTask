import type { Express } from 'express';
import request from 'supertest';
import { withTestApp } from './app.ts';
import { parseCss, type CssRule } from './css.ts';
import { all, parseHtml, type DomDocument, type DomWindow } from './dom.ts';

export interface Page {
  status: number;
  contentType: string;
  html: string;
  /** The body parsed with its scripts off. */
  document: DomDocument;
}

export interface Stylesheet {
  href: string;
  css: string;
  rules: CssRule[];
}

/** Requests a path from a fresh app and parses the answer. */
export async function getPage(path: string): Promise<Page> {
  const response = await withTestApp(({ app }) => request(app).get(path));
  return {
    status: response.status,
    contentType: String(response.headers['content-type'] ?? ''),
    html: response.text,
    document: parseHtml(response.text),
  };
}

/** The stylesheet the layout links to, found through the home page as a browser would. */
export function getStylesheet(): Promise<Stylesheet> {
  return withTestApp(async ({ app }) => {
    const home = await request(app).get('/');
    const link = parseHtml(home.text).querySelector('link[rel="stylesheet"]');
    const href = link?.getAttribute('href');
    if (!href) throw new Error('The home page has no stylesheet link');

    const response = await request(app).get(href);
    if (response.status !== 200) throw new Error(`GET ${href} answered ${response.status}`);
    return { href, css: response.text, rules: parseCss(response.text) };
  });
}

/**
 * Renders one view on its own, through the app's view engine and `app.locals`.
 * Rejects when the view throws.
 */
export function renderView(view: string, locals: Record<string, unknown> = {}): Promise<string> {
  return withTestApp(
    ({ app }) =>
      new Promise<string>((resolve, reject) => {
        app.render(view, locals, (error: Error | null, html?: string) => {
          if (error) reject(error);
          else resolve(html ?? '');
        });
      }),
  );
}

/**
 * Runs the scripts a page links to with `<script src>`, which `openPage` does not load:
 * each is requested from the app and run in the page, in document order. That is when a
 * deferred script runs, after the page is parsed. Returns the `src` values it ran.
 * Rejects when a script is not answered with 200 or throws while it loads.
 */
export async function runLinkedScripts(app: Express, window: DomWindow): Promise<string[]> {
  const ran: string[] = [];
  for (const script of all(window.document, 'script[src]')) {
    const src = script.getAttribute('src') ?? '';
    const response = await request(app).get(src);
    if (response.status !== 200) throw new Error(`GET ${src} answered ${response.status}`);
    window.eval(response.text);
    ran.push(src);
  }
  return ran;
}
