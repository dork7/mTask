import type { Response } from 'express';
import type { NavId } from './ui.ts';

/**
 * What a page hands to the layout: its title, the navigation item it belongs to, plus
 * whatever the fragment needs. A page that belongs to no navigation item leaves `nav`
 * out, and then no link is marked as the current page.
 */
export interface PageLocals {
  title: string;
  nav?: NavId;
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
