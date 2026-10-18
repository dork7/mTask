import path from 'node:path';
import express, { type Express } from 'express';
import type { Database } from './db/database.ts';
import { publicDir, viewsDir } from './paths.ts';
import { renderPage } from './render.ts';
import { createAddRouter } from './routes/add.ts';
import { createCalendarRouter } from './routes/calendar.ts';
import { createDigestRouter } from './routes/digest.ts';
import { createErrorHandler } from './routes/errors.ts';
import { createHomeRouter } from './routes/home.ts';
import { createMiniBarMiddleware } from './routes/mini-bar.ts';
import { createOverdueRouter } from './routes/overdue.ts';
import { createPushRouter } from './routes/push.ts';
import { createRemindersRouter } from './routes/reminders.ts';
import { createReviewRouter } from './routes/review.ts';
import { createSettingsRouter } from './routes/settings.ts';
import { styleguideRouter } from './routes/styleguide.ts';
import { createTasksRouter } from './routes/tasks.ts';
import { createTimelineRouter } from './routes/timeline.ts';
import type { Analyze } from './services/analyzer.ts';
import { UPLOADS_URL_PATH } from './services/photo-storage.ts';
import { AI_RATE_LIMIT, createRateLimiter } from './services/rate-limit.ts';
import { createUndoStore } from './services/undo.ts';
import { repeats, weekdays } from './services/recurrence.ts';
import { ui } from './ui.ts';

/** What the app is built from. `server.ts` supplies the real ones, tests their own. */
export interface AppDeps {
  /** An open database. The caller opens it and closes it. */
  db: Database;
  /** The folder uploaded photos are stored in, as an absolute path. It may not exist yet. */
  uploadsDir: string;
  /** Turns a stored photo or a transcript into tasks. The real one asks the Anthropic API; a test hands in a stub. */
  analyze: Analyze;
  /** The VAPID public key the page subscribes with, or `null` when the server has none. */
  vapidPublicKey?: string | null;
}

/**
 * Builds the Express app on an open database, an uploads folder and an analyzer. It
 * never listens, never reads the environment and never makes an API client: `server.ts`
 * does all three, and tests drive the app returned here directly. The caller opens the
 * database and closes it.
 *
 * Throws when `uploadsDir` is not absolute, because a relative path would land in
 * whatever folder the process was started from. The folder is not created here; it is
 * created when a photo is stored.
 */
export function createApp(deps: AppDeps): Express {
  if (!path.isAbsolute(deps.uploadsDir)) {
    throw new Error(`The uploads folder must be an absolute path, got "${deps.uploadsDir}"`);
  }

  const app = express();
  // One limit for the four AI endpoints, kept for the life of this app.
  const aiLimiter = createRateLimiter(AI_RATE_LIMIT);
  // What Delete and Done took or changed, for their undo, kept for the life of this app.
  const undo = createUndoStore();

  app.set('view engine', 'ejs');
  app.set('views', viewsDir);
  app.locals.appName = 'Task Image AI';
  app.locals.ui = ui;
  app.locals.vapidPublicKey = deps.vapidPublicKey ?? null;
  app.locals.recurrence = { repeats, weekdays };

  app.use(express.static(publicDir));
  // Stored photos. The bytes of an upload are never inspected, so the browser is told
  // to keep to the type the extension gives.
  app.use(
    UPLOADS_URL_PATH,
    express.static(deps.uploadsDir, {
      index: false,
      redirect: false,
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
  app.use(createMiniBarMiddleware(deps));
  app.use(createHomeRouter(deps));
  app.use(createAddRouter(deps, aiLimiter));
  app.use(createReviewRouter(deps, aiLimiter));
  app.use(createTasksRouter(deps, undo));
  app.use(createPushRouter(deps));
  app.use(createRemindersRouter(deps));
  app.use(createOverdueRouter(deps, undo));
  app.use(createTimelineRouter(deps));
  app.use(createDigestRouter(deps));
  app.use(createCalendarRouter(deps));
  app.use(createSettingsRouter(deps));
  app.use(styleguideRouter);

  app.use((_req, res) => {
    res.status(404);
    renderPage(res, 'not-found', { title: 'Page not found' });
  });
  app.use(createErrorHandler());

  return app;
}
