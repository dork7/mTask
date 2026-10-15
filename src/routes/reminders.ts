import { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { listAlarms } from '../services/reminders.ts';
import { requestTime } from './mini-bar.ts';

/**
 * The alarm list the page's script polls: every marked urgent task whose reminder has
 * come due at the request time, as JSON. It reads only the database.
 */
export function createRemindersRouter(deps: AppDeps): Router {
  const router = Router();

  router.get('/reminders', (_req, res) => {
    res.json({ alarms: listAlarms(deps.db, requestTime(res)) });
  });

  return router;
}
