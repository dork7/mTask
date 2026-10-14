import type { RequestHandler, Response } from 'express';
import type { AppDeps } from '../app.ts';
import { listTasks, type Task } from '../db/tasks.ts';
import { sheetDoneAction, taskPath } from '../services/task-list.ts';
import { runningTask, timerOf, type TaskTimer } from '../services/timer.ts';

/** The bar every page shows while a task is in progress, as `partials/mini-bar.ejs` takes it. */
export interface MiniBar {
  title: string;
  href: string;
  /** `null` for a task without a start. */
  timer: TaskTimer | null;
  doneAction: string;
}

function miniBarOf(task: Task | undefined, now: Date): MiniBar | null {
  if (task === undefined) return null;
  return { title: task.title, href: taskPath(task.id), timer: timerOf(task, now), doneAction: sheetDoneAction(task.id) };
}

/**
 * Reads the clock once for the request, as `res.locals.requestTime`, and puts the
 * mini-bar of the task in progress, or `null`, in `res.locals.miniBar`, where the
 * layout of every page finds it. Mounted before every router. The bar is read from the
 * database only when a page is rendered, so a request that renders none, or whose
 * handler fails first, never reads it.
 */
export function createMiniBarMiddleware(deps: AppDeps): RequestHandler {
  return (_req, res, next) => {
    const now = new Date();
    res.locals.requestTime = now;
    let miniBar: MiniBar | null | undefined;
    Object.defineProperty(res.locals, 'miniBar', {
      enumerable: true,
      get: () => {
        if (miniBar === undefined) miniBar = miniBarOf(runningTask(listTasks(deps.db, { status: 'in_progress' })), now);
        return miniBar;
      },
    });
    next();
  };
}

/** The time of this request, as the middleware read it. */
export function requestTime(res: Response): Date {
  const at: Date | undefined = res.locals.requestTime;
  if (at === undefined) throw new Error('The request time is read before the mini-bar middleware set it');
  return at;
}
