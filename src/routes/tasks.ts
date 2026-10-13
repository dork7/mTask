import express, { Router, type Response } from 'express';
import type { AppDeps } from '../app.ts';
import type { Database } from '../db/database.ts';
import { deleteTask, getTask, listTasks, type Task, type TaskStatus } from '../db/tasks.ts';
import { dayTimeLabel } from '../dubai.ts';
import { renderPage } from '../render.ts';
import { postedValue, type DraftProblems } from '../services/drafts.ts';
import { markDone, readTaskEdit, rescheduleTask, saveTaskEdit } from '../services/task-actions.ts';
import {
  LIST_PATH,
  isListed,
  queryPairs,
  readListQuery,
  shownTasks,
  sortOptions,
  togglePriority,
  toggleSlot,
  withQuery,
  type ListQuery,
} from '../services/task-list.ts';
import { priorities, slots, type Priority, type Slot } from '../ui.ts';
import { readId } from './review.ts';

const NO_TITLE = 'Give the task a title.';
const BAD_MINUTES = 'Set the duration to a whole number of minutes from 1 to 1440.';
const BAD_CHOICE = 'Choose a priority and a slot from the ones offered.';

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

/** The address of one task, which its actions hang under. */
function taskPath(id: number): string {
  return `${LIST_PATH}/${id}`;
}

/** The task a path segment names when the list shows it, or `undefined`: no such id, a draft, or not written as an id. */
function findListedTask(db: Database, raw: unknown): Task | undefined {
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

/** Renders the list for this query at `now`. */
function renderList(res: Response, db: Database, list: ListQuery, now: Date): void {
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

/**
 * Renders the edit page of a task. A value that was posted is shown in place of the
 * stored one: a title or minutes exactly as posted, a priority or a slot only when the
 * page has a control for it.
 */
function renderEdit(res: Response, task: Task, status = 200, body: unknown = undefined, errors: string[] = []): void {
  const path = taskPath(task.id);
  const postedPriority = postedValue(body, 'priority');
  const postedSlot = postedValue(body, 'slot');
  const edit: EditForm = {
    title: postedValue(body, 'title') ?? task.title,
    minutes: postedValue(body, 'minutes') ?? (task.estimated_minutes === null ? '' : String(task.estimated_minutes)),
    priority: priorities.find((item) => item.id === postedPriority)?.id ?? task.priority,
    slot: postedSlot === '' ? '' : (slots.find((item) => item.id === postedSlot)?.id ?? task.time_slot ?? ''),
    action: `${path}/edit`,
    deleteAction: `${path}/delete`,
    backHref: LIST_PATH,
  };
  res.status(status);
  renderPage(res, 'task-edit', { title: 'Edit task', nav: 'tasks', edit, errors });
}

/**
 * The task list and what it does to one task: the list, Done, Reschedule, the edit page
 * and its post, and Delete. An id that names no task, names a draft or is not written as
 * an id falls through to the app's not-found page. Every redirect goes to the list, with
 * the query of the request as the app writes it.
 */
export function createTasksRouter(deps: AppDeps): Router {
  const router = Router();
  // The edit form posts flat fields, so the simple parser is enough.
  const form = express.urlencoded({ extended: false });

  router.get(LIST_PATH, (req, res) => {
    renderList(res, deps.db, readListQuery(req.query), new Date());
  });

  router.post(`${LIST_PATH}/:taskId/done`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    markDone(deps.db, task, new Date());
    res.redirect(303, `${withQuery(LIST_PATH, readListQuery(req.query))}#task-${task.id}`);
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
    deleteTask(deps.db, task.id);
    res.redirect(303, withQuery(LIST_PATH, readListQuery(req.query)));
  });

  return router;
}
