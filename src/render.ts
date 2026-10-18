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
  /** The toast the layout shows in its live region, or `null` for none. */
  toast?: PageToast | null;
  [key: string]: unknown;
}

/** A toast with an Undo button: its text, and where the button posts. */
export interface PageToast {
  message: string;
  undoAction: string;
}

/**
 * Renders the fragment `views/pages/<page>.ejs` inside the shared layout.
 *
 * `page` becomes part of a file path. It must always be a string literal written
 * in a route, never a value taken from a request. With `done`, Express hands it the
 * rendered page or the error, and `done` must send the answer.
 */
export function renderPage(
  res: Response,
  page: string,
  locals: PageLocals,
  done?: (error: Error | null, html?: string) => void,
): void {
  if (done === undefined) {
    res.render('layout', { ...locals, page });
    return;
  }
  res.render('layout', { ...locals, page }, done);
}
