import express, { Router, type Response } from 'express';
import type { AppDeps } from '../app.ts';
import type { Database } from '../db/database.ts';
import { listTasks, type Task } from '../db/tasks.ts';
import { dayTimeLabel } from '../dubai.ts';
import { renderPage, type PageToast } from '../render.ts';
import { postedValue } from '../services/drafts.ts';
import {
  OVERDUE_PATH,
  isOverdue,
  overdueGroups,
  pickedTimes,
  readPickedStart,
  type OverdueGroupId,
} from '../services/overdue.ts';
import { moveTask, rescheduleTask } from '../services/task-actions.ts';
import { LIST_PATH, withToastParam } from '../services/task-list.ts';
import { DONE_TOAST, canUndoDone, doneWithUndo, undoDone, type UndoStore } from '../services/undo.ts';
import type { Priority } from '../ui.ts';
import { readId } from './review.ts';
import { findListedTask } from './tasks.ts';

const BAD_PICK = 'Pick a date and time that has not passed.';
const NO_ESTIMATE = 'No estimate';

/** One overdue task as a card of `pages/overdue.ejs` shows it. */
interface OverdueCard {
  id: number;
  title: string;
  /** `25 min`, or `No estimate`. */
  minutes: string;
  /** `null`: no badge. */
  priority: Priority | null;
  /** When it was due: `Today 9:00 AM`, `11 Oct 9:00 AM`. */
  due: string;
  doneAction: string;
  rescheduleAction: string;
  pickAction: string;
  /** The message of a refused pick for this card, or `null`. */
  error: string | null;
}

/** One group of `pages/overdue.ejs`: its heading and its cards. */
interface GroupView {
  id: OverdueGroupId;
  label: string;
  cards: OverdueCard[];
}

/** A pick the page refused: the task it was for and what to tell the user. */
interface Refusal {
  taskId: number;
  message: string;
}

function cardOf(task: Task, now: Date, refusal: Refusal | undefined): OverdueCard {
  const path = `${OVERDUE_PATH}/${task.id}`;
  // An overdue task has an end; a task with an end and no start is labelled by its end.
  const due = task.scheduled_start ?? task.scheduled_end;
  return {
    id: task.id,
    title: task.title,
    minutes: task.estimated_minutes === null ? NO_ESTIMATE : `${task.estimated_minutes} min`,
    priority: task.priority,
    due: due === null ? '' : dayTimeLabel(new Date(due), now),
    doneAction: `${path}/done`,
    rescheduleAction: `${path}/reschedule`,
    pickAction: `${path}/reschedule-at`,
    error: refusal?.taskId === task.id ? refusal.message : null,
  };
}

/**
 * Renders the overdue view at `now`, with the message of a refused pick on its card, and
 * this toast in the layout's live region.
 */
function renderOverdue(
  res: Response,
  db: Database,
  now: Date,
  status = 200,
  refusal?: Refusal,
  toast: PageToast | null = null,
): void {
  const groups = overdueGroups(listTasks(db), now).map(
    (group): GroupView => ({
      id: group.id,
      label: group.label,
      cards: group.tasks.map((task) => cardOf(task, now, refusal)),
    }),
  );
  res.status(status);
  renderPage(res, 'overdue', { title: 'Overdue', toast, overdue: { groups, emptyHref: LIST_PATH } });
}

/**
 * The overdue view and what it does to one task: Mark done and its undo, Reschedule, and
 * a move to a picked time. Mark done is kept in `undo`. An id that names no task, names a
 * draft or is not written as an id falls through to the app's not-found page. A task
 * that is no longer overdue at the request is not written. Every post that is not
 * refused goes back to the view.
 */
export function createOverdueRouter(deps: AppDeps, undo: UndoStore): Router {
  const router = Router();
  // The pick form posts one flat field, so the simple parser is enough.
  const form = express.urlencoded({ extended: false });

  router.get(OVERDUE_PATH, (req, res) => {
    const doneId = readId(req.query.done);
    const toast =
      doneId !== undefined && canUndoDone(deps.db, undo, doneId)
        ? { message: DONE_TOAST, undoAction: `${OVERDUE_PATH}/${doneId}/undo-done` }
        : null;
    renderOverdue(res, deps.db, new Date(), 200, undefined, toast);
  });

  router.post(`${OVERDUE_PATH}/:taskId/done`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const now = new Date();
    const written = isOverdue(task, now) && doneWithUndo(deps.db, undo, task, now);
    res.redirect(303, written ? withToastParam(OVERDUE_PATH, 'done', task.id) : OVERDUE_PATH);
  });

  // The id is read, not looked up as a listed task: the undo checks the task itself.
  router.post(`${OVERDUE_PATH}/:taskId/undo-done`, (req, res, next) => {
    const id = readId(req.params.taskId);
    if (id === undefined || undoDone(deps.db, undo, id) === undefined) {
      next();
      return;
    }
    res.redirect(303, OVERDUE_PATH);
  });

  router.post(`${OVERDUE_PATH}/:taskId/reschedule`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const now = new Date();
    if (isOverdue(task, now)) rescheduleTask(deps.db, task, now);
    res.redirect(303, OVERDUE_PATH);
  });

  router.post(`${OVERDUE_PATH}/:taskId/reschedule-at`, form, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const now = new Date();
    if (!isOverdue(task, now)) {
      res.redirect(303, OVERDUE_PATH);
      return;
    }
    const start = readPickedStart(postedValue(req.body, 'start'), now);
    const times = start === undefined ? undefined : pickedTimes(task, start);
    if (times === undefined) {
      renderOverdue(res, deps.db, now, 400, { taskId: task.id, message: BAD_PICK });
      return;
    }
    moveTask(deps.db, task, times);
    res.redirect(303, OVERDUE_PATH);
  });

  return router;
}
