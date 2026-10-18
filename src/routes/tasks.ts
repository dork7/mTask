import express, { Router, type Response } from 'express';
import type { AppDeps } from '../app.ts';
import type { Database } from '../db/database.ts';
import { getTask, listTasks, type Task, type TaskStatus } from '../db/tasks.ts';
import { dateTimeValue, dayTimeLabel } from '../dubai.ts';
import { renderPage, type PageToast } from '../render.ts';
import { postedStrings, postedValue, type DraftProblems } from '../services/drafts.ts';
import { dismissTask, readSnooze, snoozeTask } from '../services/reminders.ts';
import { daysOf, repeatOf, repeats, weekdays, type Repeat, type Weekday } from '../services/recurrence.ts';
import {
  markDone,
  readSheetEdit,
  readTaskEdit,
  rescheduleTask,
  saveTaskEdit,
  startTask,
  type SheetProblems,
} from '../services/task-actions.ts';
import {
  LIST_PATH,
  isListed,
  queryPairs,
  readListQuery,
  sheetDoneAction,
  shownTasks,
  sortOptions,
  taskPath,
  togglePriority,
  toggleSlot,
  withQuery,
  withToastParam,
  type ListQuery,
} from '../services/task-list.ts';
import { timerOf, type TaskTimer } from '../services/timer.ts';
import {
  DELETED_TOAST,
  DONE_TOAST,
  canUndoDelete,
  canUndoDone,
  deleteWithUndo,
  doneWithUndo,
  undoDelete,
  undoDone,
  type UndoStore,
} from '../services/undo.ts';
import { priorities, slots, type Priority, type Slot } from '../ui.ts';
import { requestTime } from './mini-bar.ts';
import { readId } from './review.ts';

const NO_TITLE = 'Give the task a title.';
const BAD_MINUTES = 'Set the duration to a whole number of minutes from 1 to 1440.';
const BAD_CHOICE = 'Choose a priority and a slot from the ones offered.';
const BAD_REMINDER = 'Set the reminder as a date and time, or leave it empty.';
const BAD_REPEAT = 'Choose a repeat from the ones offered.';

/** What a card shows for a task without a start, without a slot, and without minutes. */
const NOT_SCHEDULED = 'Not scheduled';
const NO_SLOT = 'No slot';
const NO_ESTIMATE = 'No estimate';

/** The status of a task as a card shows it. A draft is never listed. */
const STATUS_LABELS: Record<TaskStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
};

/** The task a path segment names when the list shows it, or `undefined`: no such id, a draft, or not written as an id. */
export function findListedTask(db: Database, raw: unknown): Task | undefined {
  const id = readId(raw);
  const task = id === undefined ? undefined : getTask(db, id);
  return task !== undefined && isListed(task) ? task : undefined;
}

/** One chip of the filter bar or of the active filters, as `partials/chip.ejs` takes it. */
interface ChipLink {
  label: string;
  href: string;
  selected: boolean;
  current: boolean;
  removable: boolean;
  tone?: Priority;
}

/** One task as a card of `pages/tasks.ejs` shows it. */
interface TaskCard {
  id: number;
  title: string;
  href: string;
  /** `25 min`, or `No estimate`. */
  minutes: string;
  /** `null`: no badge. */
  priority: Priority | null;
  /** The slot's label, or `No slot`. */
  slot: string;
  status: string;
  /** `Today 2:30 PM`, or `Not scheduled`. */
  start: string;
  editHref: string;
  /** Where Done posts; `null` for a task that is done. */
  doneAction: string | null;
  /** Where Reschedule posts; `null` for a task that is not pending. */
  rescheduleAction: string | null;
  deleteAction: string;
}

function cardOf(task: Task, list: ListQuery, now: Date): TaskCard {
  const path = taskPath(task.id);
  return {
    id: task.id,
    title: task.title,
    href: path,
    minutes: task.estimated_minutes === null ? NO_ESTIMATE : `${task.estimated_minutes} min`,
    priority: task.priority,
    slot: slots.find((item) => item.id === task.time_slot)?.label ?? NO_SLOT,
    status: STATUS_LABELS[task.status],
    start: task.scheduled_start === null ? NOT_SCHEDULED : dayTimeLabel(new Date(task.scheduled_start), now),
    editHref: `${path}/edit`,
    doneAction: task.status === 'done' ? null : withQuery(`${path}/done`, list),
    rescheduleAction: task.status === 'pending' ? withQuery(`${path}/reschedule`, list) : null,
    deleteAction: withQuery(`${path}/delete`, list),
  };
}

/** Renders the list for this query at `now`, with this toast in the layout's live region. */
function renderList(res: Response, db: Database, list: ListQuery, now: Date, toast: PageToast | null = null): void {
  const listed = listTasks(db).filter(isListed);
  const shown = shownTasks(listed, list);

  const bar = {
    priorities: priorities.map((item): ChipLink => {
      const on = list.priorities.includes(item.id);
      const href = withQuery(LIST_PATH, togglePriority(list, item.id));
      return { label: item.label, href, selected: on, current: on, removable: false, tone: item.id };
    }),
    slots: slots.map((item): ChipLink => {
      const on = list.slots.includes(item.id);
      const href = withQuery(LIST_PATH, toggleSlot(list, item.id));
      return { label: item.label, href, selected: on, current: on, removable: false };
    }),
  };
  const active: ChipLink[] = [
    ...bar.priorities.filter((chip) => chip.selected),
    ...bar.slots.filter((chip) => chip.selected),
  ].map((chip) => ({ ...chip, current: false, removable: true }));
  // The sort form keeps the filters; its own select gives the sort.
  const hidden = queryPairs({ ...list, sort: 'start' }).map(([name, value]) => ({ name, value }));

  renderPage(res, 'tasks', {
    title: 'Tasks',
    nav: 'tasks',
    toast,
    tasks: {
      bar,
      active,
      sort: { action: LIST_PATH, options: sortOptions, current: list.sort, hidden },
      cards: shown.map((task) => cardOf(task, list, now)),
      empty: listed.length === 0 ? 'none' : shown.length === 0 ? 'filtered' : null,
      clearHref: LIST_PATH,
    },
  });
}

/** The edit form of a task as `pages/task-edit.ejs` shows it. */
interface EditForm {
  title: string;
  /** As text, so a refused value is shown as it was posted. */
  minutes: string;
  priority: Priority | null;
  /** The empty string is `No slot`. */
  slot: Slot | '';
  action: string;
  deleteAction: string;
  backHref: string;
}

/** The messages of a refused edit, in the order they are shown. */
function messagesOf(problems: DraftProblems): string[] {
  const messages: string[] = [];
  if (problems.title) messages.push(NO_TITLE);
  if (problems.minutes) messages.push(BAD_MINUTES);
  if (problems.choice) messages.push(BAD_CHOICE);
  return messages;
}

/** The four fields of the edit page as a form shows them: as posted where a value was posted, else as stored. */
function shownEdit(task: Task, body: unknown): Pick<EditForm, 'title' | 'minutes' | 'priority' | 'slot'> {
  const postedPriority = postedValue(body, 'priority');
  const postedSlot = postedValue(body, 'slot');
  return {
    title: postedValue(body, 'title') ?? task.title,
    minutes: postedValue(body, 'minutes') ?? (task.estimated_minutes === null ? '' : String(task.estimated_minutes)),
    priority: priorities.find((item) => item.id === postedPriority)?.id ?? task.priority,
    slot: postedSlot === '' ? '' : (slots.find((item) => item.id === postedSlot)?.id ?? task.time_slot ?? ''),
  };
}

/**
 * Renders the edit page of a task. A value that was posted is shown in place of the
 * stored one: a title or minutes exactly as posted, a priority or a slot only when the
 * page has a control for it.
 */
function renderEdit(res: Response, task: Task, status = 200, body: unknown = undefined, errors: string[] = []): void {
  const path = taskPath(task.id);
  const edit: EditForm = {
    ...shownEdit(task, body),
    action: `${path}/edit`,
    deleteAction: `${path}/delete`,
    backHref: LIST_PATH,
  };
  res.status(status);
  renderPage(res, 'task-edit', { title: 'Edit task', nav: 'tasks', edit, errors });
}

/** The sheet's edit form as `partials/task-sheet-body.ejs` shows it. */
interface SheetForm extends Pick<EditForm, 'title' | 'minutes' | 'priority' | 'slot'> {
  action: string;
  category: string;
  description: string;
  /** `YYYY-MM-DDTHH:MM` on the Dubai clock, or as posted, or ''. */
  reminder: string;
  repeat: Repeat;
  days: Weekday[];
}

/** The detail sheet of a task as `pages/task-sheet.ejs` shows it. `null`: not shown. */
interface TaskSheet {
  status: string;
  /** `Started Today 1:23 PM`. */
  started: string | null;
  timer: TaskTimer | null;
  /** `Completed Today 1:36 PM`. */
  completed: string | null;
  /** `Estimated 30 min, actual 75 min`. */
  summary: string | null;
  startAction: string | null;
  doneAction: string | null;
  closeHref: string;
  form: SheetForm;
  errors: string[];
}

/** The messages of a refused sheet: those of the edit page, then the reminder's. */
function sheetMessages(problems: SheetProblems): string[] {
  const messages = messagesOf(problems);
  if (problems.reminder) messages.push(BAD_REMINDER);
  if (problems.repeat) messages.push(BAD_REPEAT);
  return messages;
}

/** What an optional field shows: the stored value on a GET; after a post, what was posted, or '' when it was missing or repeated. */
function shownOptional(body: unknown, name: string, stored: string): string {
  if (body === undefined) return stored;
  const posted = postedValue(body, name);
  return typeof posted === 'string' ? posted : '';
}

/** The Repeat picker of the sheet: the matching option, and the day boxes. As posted where the post has them, else as stored. */
function shownRepeat(stored: string | null, body: unknown): { repeat: Repeat; days: Weekday[] } {
  const repeat = repeatOf(stored);
  if (body === undefined) return { repeat, days: daysOf(stored) };

  const posted = postedValue(body, 'repeat');
  const postedDays = postedStrings(body, 'repeat-days');
  return {
    repeat: repeats.find((item) => item.id === posted)?.id ?? repeat,
    days: weekdays.filter((item) => postedDays.includes(item.id)).map((item) => item.id),
  };
}

/** Renders the sheet of a task at `now`, with the values of a refused post when there is one. */
function renderSheet(res: Response, task: Task, now: Date, status = 200, body: unknown = undefined, errors: string[] = []): void {
  const path = taskPath(task.id);
  const running = task.status === 'in_progress';
  const done = task.status === 'done';
  const sheet: TaskSheet = {
    status: STATUS_LABELS[task.status],
    started: running && task.started_at !== null ? `Started ${dayTimeLabel(new Date(task.started_at), now)}` : null,
    timer: running ? timerOf(task, now) : null,
    completed: done && task.completed_at !== null ? `Completed ${dayTimeLabel(new Date(task.completed_at), now)}` : null,
    summary:
      done && task.estimated_minutes !== null && task.actual_minutes !== null
        ? `Estimated ${task.estimated_minutes} min, actual ${task.actual_minutes} min`
        : null,
    startAction: task.status === 'pending' ? `${path}/start` : null,
    doneAction: done ? null : sheetDoneAction(task.id),
    closeHref: `${LIST_PATH}#task-${task.id}`,
    form: {
      ...shownEdit(task, body),
      ...shownRepeat(task.recurrence_rule, body),
      action: path,
      category: shownOptional(body, 'category', task.category ?? ''),
      description: shownOptional(body, 'description', task.description ?? ''),
      reminder: shownOptional(body, 'reminder', task.reminder_at === null ? '' : dateTimeValue(new Date(task.reminder_at))),
    },
    errors,
  };
  res.status(status);
  renderPage(res, 'task-sheet', { title: task.title, nav: 'tasks', sheet });
}

/**
 * The toast of the list a Delete or a Done of it led to, while that can still be undone:
 * `deleted=<id>` or `done=<id>` in the query. `null` for none.
 */
function listToast(db: Database, undo: UndoStore, query: unknown, list: ListQuery): PageToast | null {
  const { deleted, done } = query as { deleted?: unknown; done?: unknown };
  const deletedId = readId(deleted);
  if (deletedId !== undefined && canUndoDelete(undo, deletedId)) {
    return { message: DELETED_TOAST, undoAction: withQuery(`${taskPath(deletedId)}/undo-delete`, list) };
  }
  const doneId = readId(done);
  if (doneId !== undefined && canUndoDone(db, undo, doneId)) {
    return { message: DONE_TOAST, undoAction: withQuery(`${taskPath(doneId)}/undo-done`, list) };
  }
  return null;
}

/**
 * The task list and what it does to one task: the list, Done, Reschedule, the edit page
 * and its post, Delete, Snooze and Dismiss, the undo of Delete and Done, and the task's
 * sheet, its post and Start. Delete and Done from the list are kept in `undo`. An
 * id that names no task, names a draft or is not written as an id falls through to the
 * app's not-found page. The sheet's post, Start, and Done from the sheet go back to the
 * sheet; every other redirect goes to the list, with the query of the request as the app
 * writes it.
 */
export function createTasksRouter(deps: AppDeps, undo: UndoStore): Router {
  const router = Router();
  // The edit form posts flat fields, so the simple parser is enough.
  const form = express.urlencoded({ extended: false });

  router.get(LIST_PATH, (req, res) => {
    const list = readListQuery(req.query);
    renderList(res, deps.db, list, new Date(), listToast(deps.db, undo, req.query, list));
  });

  router.post(`${LIST_PATH}/:taskId/done`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    // Done from the sheet and the mini-bar answers with the sheet's summary, not a toast.
    if (req.query.from === 'sheet') {
      markDone(deps.db, task, requestTime(res));
      res.redirect(303, taskPath(task.id));
      return;
    }
    const list = withQuery(LIST_PATH, readListQuery(req.query));
    const written = doneWithUndo(deps.db, undo, task, requestTime(res));
    res.redirect(303, `${written ? withToastParam(list, 'done', task.id) : list}#task-${task.id}`);
  });

  router.post(`${LIST_PATH}/:taskId/undo-done`, (req, res, next) => {
    const id = readId(req.params.taskId);
    if (id === undefined || undoDone(deps.db, undo, id) === undefined) {
      next();
      return;
    }
    res.redirect(303, `${withQuery(LIST_PATH, readListQuery(req.query))}#task-${id}`);
  });

  router.post(`${LIST_PATH}/:taskId/reschedule`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    rescheduleTask(deps.db, task, new Date());
    res.redirect(303, `${withQuery(LIST_PATH, readListQuery(req.query))}#task-${task.id}`);
  });

  router.get(`${LIST_PATH}/:taskId/edit`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    renderEdit(res, task);
  });

  router.post(`${LIST_PATH}/:taskId/edit`, form, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const { edit, problems } = readTaskEdit(req.body);
    if (edit === undefined) {
      renderEdit(res, task, 400, req.body, messagesOf(problems));
      return;
    }
    saveTaskEdit(deps.db, task, edit, new Date());
    res.redirect(303, `${LIST_PATH}#task-${task.id}`);
  });

  router.post(`${LIST_PATH}/:taskId/delete`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    deleteWithUndo(deps.db, undo, task);
    res.redirect(303, withToastParam(withQuery(LIST_PATH, readListQuery(req.query)), 'deleted', task.id));
  });

  // The id is read, not looked up: a deleted task is not there to be found.
  router.post(`${LIST_PATH}/:taskId/undo-delete`, (req, res, next) => {
    const id = readId(req.params.taskId);
    if (id === undefined || undoDelete(deps.db, undo, id) === undefined) {
      next();
      return;
    }
    res.redirect(303, `${withQuery(LIST_PATH, readListQuery(req.query))}#task-${id}`);
  });

  router.post(`${LIST_PATH}/:taskId/snooze`, form, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const minutes = readSnooze(req.body);
    if (minutes === undefined) {
      res.sendStatus(400);
      return;
    }
    snoozeTask(deps.db, task, minutes, requestTime(res));
    res.redirect(303, '/');
  });

  router.post(`${LIST_PATH}/:taskId/dismiss`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    dismissTask(deps.db, task);
    res.redirect(303, '/');
  });

  router.get(`${LIST_PATH}/:taskId`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    renderSheet(res, task, requestTime(res));
  });

  router.post(`${LIST_PATH}/:taskId`, form, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const now = requestTime(res);
    const { edit, problems } = readSheetEdit(req.body);
    if (edit === undefined) {
      renderSheet(res, task, now, 400, req.body, sheetMessages(problems));
      return;
    }
    saveTaskEdit(deps.db, task, edit, now);
    res.redirect(303, taskPath(task.id));
  });

  router.post(`${LIST_PATH}/:taskId/start`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    startTask(deps.db, task, requestTime(res));
    res.redirect(303, taskPath(task.id));
  });

  return router;
}
