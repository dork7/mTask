import { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { getSetting } from '../db/settings.ts';
import { listTasks } from '../db/tasks.ts';
import { dubaiDay } from '../dubai.ts';
import { renderPage } from '../render.ts';
import { TIMELINE_PATH, buildTimeline, readDay } from '../services/timeline.ts';

/**
 * The timeline of one Dubai day: today, or the day `?date=YYYY-MM-DD` names. It reads
 * the tasks and the working hours, and the clock once, and writes nothing.
 */
export function createTimelineRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(TIMELINE_PATH, (req, res) => {
    const now = new Date();
    const hours = getSetting(deps.db, 'working_hours');
    if (hours === undefined) throw new Error('The working_hours setting is missing');
    const day = readDay(req.query, dubaiDay(now.getTime()));
    renderPage(res, 'timeline', {
      title: 'Timeline',
      nav: 'timeline',
      timeline: buildTimeline(listTasks(deps.db), hours, day, now),
    });
  });

  return router;
}
