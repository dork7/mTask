import request from 'supertest';
import { createApp } from '../app.ts';
import { parseCss, type CssRule } from './css.ts';
import { parseHtml, type DomDocument } from './dom.ts';

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
  const response = await request(createApp()).get(path);
  return {
    status: response.status,
    contentType: String(response.headers['content-type'] ?? ''),
    html: response.text,
    document: parseHtml(response.text),
  };
}

/** The stylesheet the layout links to, found through the home page as a browser would. */
export async function getStylesheet(): Promise<Stylesheet> {
  const app = createApp();
  const home = await request(app).get('/');
  const link = parseHtml(home.text).querySelector('link[rel="stylesheet"]');
  const href = link?.getAttribute('href');
  if (!href) throw new Error('The home page has no stylesheet link');

  const response = await request(app).get(href);
  if (response.status !== 200) throw new Error(`GET ${href} answered ${response.status}`);
  return { href, css: response.text, rules: parseCss(response.text) };
}

/**
 * Renders one view on its own, through the app's view engine and `app.locals`.
 * Rejects when the view throws.
 */
export function renderView(view: string, locals: Record<string, unknown> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    createApp().render(view, locals, (error: Error | null, html?: string) => {
      if (error) reject(error);
      else resolve(html ?? '');
    });
  });
}
