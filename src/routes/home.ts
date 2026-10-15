import { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { listTasks } from '../db/tasks.ts';
import { renderPage } from '../render.ts';
import { TODAY_PATH, buildToday } from '../services/today.ts';
import { requestTime } from './mini-bar.ts';

/**
 * The Today dashboard. It reads every task once, and the time of the request as the
 * mini-bar middleware read it, and writes nothing.
 */
export function createHomeRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(TODAY_PATH, (_req, res) => {
    renderPage(res, 'home', {
      title: 'Today',
      nav: 'today',
      today: buildToday(listTasks(deps.db), requestTime(res)),
    });
  });

  return router;
}
