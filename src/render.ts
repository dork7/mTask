import type { Response } from 'express';

/** What a page hands to the layout: its title, plus whatever the fragment needs. */
export interface PageLocals {
  title: string;
  [key: string]: unknown;
}

/**
 * Renders the fragment `views/pages/<page>.ejs` inside the shared layout.
 *
 * `page` becomes part of a file path. It must always be a string literal written
 * in a route, never a value taken from a request.
 */
export function renderPage(res: Response, page: string, locals: PageLocals): void {
  res.render('layout', { ...locals, page });
}
