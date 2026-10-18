import type { ErrorRequestHandler } from 'express';
import { renderPage } from '../render.ts';
import { skipLayoutReads } from './mini-bar.ts';

/** The text of the error page, and of the plain answer when that page cannot be rendered. */
const SOMETHING_WENT_WRONG = 'Something went wrong';

/** One `status` or `statusCode` value as a client error status: an integer from 400 to 499. */
function clientStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 499 ? value : undefined;
}

/**
 * The status an error is answered with: its `status`, else its `statusCode`, when that is
 * an integer from 400 to 499, and 500 for anything else.
 */
export function errorStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null) return 500;
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  return clientStatus(status) ?? clientStatus(statusCode) ?? 500;
}

/**
 * The app's last handler: answers an error a handler threw or passed to `next` with the
 * error page and its status. The page shows nothing of the error, and reads nothing from
 * the database. A 500 is logged with the method and the path, never the query, which
 * may hold the calendar feed's token. A 4xx is the client's and is not logged.
 */
export function createErrorHandler(): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    // Only the connection can be closed now; Express does that.
    if (res.headersSent) {
      next(error);
      return;
    }

    const status = errorStatus(error);
    if (status === 500) console.error(`${req.method} ${req.path} failed:`, error);

    skipLayoutReads(res);
    res.status(status);
    renderPage(res, 'error', { title: SOMETHING_WENT_WRONG }, (renderError, html) => {
      if (renderError) {
        console.error('The error page could not be rendered:', renderError);
        res.status(status).type('text/plain').send(SOMETHING_WENT_WRONG);
        return;
      }
      res.send(html);
    });
  };
}
