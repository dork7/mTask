import { Router, type Response } from 'express';
import type { AppDeps } from '../app.ts';
import { getSetting } from '../db/settings.ts';
import { listTasks } from '../db/tasks.ts';
import { dayOfDate } from '../dubai.ts';
import {
  FEED_PATH,
  UPCOMING_ICS_PATH,
  feedTokenMatches,
  icsFromTasks,
  tasksOnDay,
  upcomingTasks,
} from '../services/calendar.ts';
import { requestTime } from './mini-bar.ts';
import { readId } from './review.ts';

/**
 * Sends iCalendar text. A download names its file; the feed names none, because a
 * calendar subscribes to it. The header is set by hand: `res.attachment` drops the quotes.
 */
function sendIcs(res: Response, text: string, filename: string | null): void {
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  if (filename !== null) res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(text);
}

/**
 * The `.ics` downloads of one task, one Dubai day and every upcoming task, and the feed
 * of upcoming tasks, which answers only to the stored token. Each reads the tasks and
 * the clock once and writes nothing. An unknown task or day falls to the not-found page.
 */
export function createCalendarRouter(deps: AppDeps): Router {
  const router = Router();

  router.get('/task/:taskId/ics', (req, res, next) => {
    const now = requestTime(res);
    const id = readId(req.params.taskId);
    const task = listTasks(deps.db).find((candidate) => candidate.id === id);
    if (task === undefined || task.scheduled_start === null || task.scheduled_end === null) {
      next();
      return;
    }
    sendIcs(res, icsFromTasks([task], now), `task-${task.id}.ics`);
  });

  router.get('/day/:date/ics', (req, res, next) => {
    const now = requestTime(res);
    const day = dayOfDate(req.params.date);
    if (day === undefined) {
      next();
      return;
    }
    sendIcs(res, icsFromTasks(tasksOnDay(listTasks(deps.db), day), now), `day-${req.params.date}.ics`);
  });

  router.get(UPCOMING_ICS_PATH, (_req, res) => {
    const now = requestTime(res);
    sendIcs(res, icsFromTasks(upcomingTasks(listTasks(deps.db), now), now), 'upcoming.ics');
  });

  router.get(FEED_PATH, (req, res) => {
    if (!feedTokenMatches(getSetting(deps.db, 'feed_token'), req.query.token)) {
      res.sendStatus(401);
      return;
    }
    const now = requestTime(res);
    sendIcs(res, icsFromTasks(upcomingTasks(listTasks(deps.db), now), now), null);
  });

  return router;
}
