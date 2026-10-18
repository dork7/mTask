import type { Database } from '../db/database.ts';
import { updateTask, type Task } from '../db/tasks.ts';
import { inTransaction } from '../db/transaction.ts';
import { instantOfDateTime } from '../dubai.ts';
import { priorities, slots, type Priority, type Slot } from '../ui.ts';
import { postedStrings, postedValue, readMinutes, type DraftProblems } from './drafts.ts';
import type { TaskTimes } from './overdue.ts';
import { makeNextInstance, repeatRule } from './recurrence.ts';
import { placeTasks, storeSchedule } from './scheduler.ts';
import { workedMinutes } from './timer.ts';

/*
 * What the task list does to one task: start it, mark it done, place it again, and store
 * an edit that overrides what the analyzer and the rules chose. Each write of several
 * rows is one transaction.
 */

/** What the edit form of a task stores. Every field is posted, and every one is set. */
export interface TaskEdit {
  title: string;
  estimated_minutes: number;
  priority: Priority;
  /** `null` is the form's `No slot`. */
  time_slot: Slot | null;
}

/** The edit a form holds, or what was wrong with it. `edit` is `undefined` exactly when a problem is set. */
export interface TaskEditReading {
  edit: TaskEdit | undefined;
  problems: DraftProblems;
}

/**
 * Reads the edit form of a task. A field that is missing or posted more than once is a
 * problem like a field with a value that breaks its rule.
 */
export function readTaskEdit(body: unknown): TaskEditReading {
  const title = postedValue(body, 'title');
  const minutes = postedValue(body, 'minutes');
  const priority = priorities.find((item) => item.id === postedValue(body, 'priority'));
  const slotValue = postedValue(body, 'slot');
  const slot = slotValue === '' ? null : slots.find((item) => item.id === slotValue)?.id;

  const trimmed = typeof title === 'string' ? title.trim() : '';
  const estimated = typeof minutes === 'string' ? readMinutes(minutes) : undefined;
  const problems: DraftProblems = {
    title: trimmed === '',
    minutes: estimated === undefined,
    choice: priority === undefined || slot === undefined,
    repeat: false,
  };
  if (trimmed === '' || estimated === undefined || priority === undefined || slot === undefined) {
    return { edit: undefined, problems };
  }
  return { edit: { title: trimmed, estimated_minutes: estimated, priority: priority.id, time_slot: slot }, problems };
}

/** What the sheet's edit form stores: the fields of the edit page and three more. */
export interface SheetEdit extends TaskEdit {
  category: string | null;
  description: string | null;
  reminder_at: string | null;
  /** The rule, or `null` for `Does not repeat`. */
  recurrence_rule?: string | null;
}

/** What was wrong in a posted sheet: the problems of the edit page, and a reminder that is no date and time. */
export interface SheetProblems extends DraftProblems {
  reminder: boolean;
}

export interface SheetEditReading {
  edit: SheetEdit | undefined;
  problems: SheetProblems;
}

/** An optional text field: one posted string, line breaks as `\n`, trimmed. Missing or posted more than once is empty. */
function optionalText(body: unknown, name: string): string {
  const value = postedValue(body, name);
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
}

/**
 * Reads the edit form of the sheet: the fields of `readTaskEdit`, and a category, a
 * description and a reminder, each of which may be empty and is then stored as null.
 * The reminder is a Dubai date and time, `YYYY-MM-DDTHH:MM`.
 */
export function readSheetEdit(body: unknown): SheetEditReading {
  const base = readTaskEdit(body);
  const reminderText = optionalText(body, 'reminder');
  const reminder = reminderText === '' ? null : instantOfDateTime(reminderText);

  const postedRepeat = postedValue(body, 'repeat');
  // `false` is a repeat that is not one of the four values, or a day that is not one of the seven.
  let rule: string | null | false | undefined = undefined;
  if (postedRepeat !== undefined) {
    const read = postedRepeat === null ? undefined : repeatRule(postedRepeat, postedStrings(body, 'repeat-days'));
    rule = read === undefined ? false : read;
  }

  const problems: SheetProblems = { ...base.problems, reminder: reminder === undefined, repeat: rule === false };
  if (base.edit === undefined || reminder === undefined || rule === false) return { edit: undefined, problems };

  const category = optionalText(body, 'category');
  const description = optionalText(body, 'description');
  const edit: SheetEdit = {
    ...base.edit,
    category: category === '' ? null : category,
    description: description === '' ? null : description,
    reminder_at: reminder === null ? null : reminder.toISOString(),
  };
  if (rule !== undefined) edit.recurrence_rule = rule;
  return { edit, problems };
}

/** Starts a `pending` task at `now`. A task of any other status is not written. */
export function startTask(db: Database, task: Task, now: Date): void {
  if (task.status !== 'pending') return;
  updateTask(db, task.id, { status: 'in_progress', started_at: now.toISOString() });
}

/**
 * Makes a task `done` at `now`. A task in progress with a start also gets the minutes
 * it ran, as `actual_minutes`; any other keeps its minutes. Its scheduled times are
 * left as they are. A task that is `done` already is not written, and `undefined` is
 * returned. Otherwise `next` is the instance a recurring task made, of which only the
 * id is to be read: its times are those before it was placed.
 */
export function markDone(db: Database, task: Task, now: Date): { next: Task | undefined } | undefined {
  if (task.status === 'done') return undefined;
  const worked =
    task.status === 'in_progress' && task.started_at !== null
      ? { actual_minutes: workedMinutes(task.started_at, now) }
      : {};
  return inTransaction(db, () => {
    updateTask(db, task.id, { status: 'done', completed_at: now.toISOString(), ...worked });
    return { next: makeNextInstance(db, task, now) };
  });
}

/**
 * Gives a `pending` task the time the scheduler finds for it at `now`, and the tasks it
 * pushes later their new times, all or none. Its own times do not stand in its way. A
 * task the scheduler cannot place keeps its times; a task that is not `pending` is not
 * written.
 */
export function rescheduleTask(db: Database, task: Task, now: Date): void {
  if (task.status !== 'pending') return;
  inTransaction(db, () => {
    storeSchedule(db, placeTasks(db, [task], now));
  });
}

/**
 * Stores an edit of a task. A `pending` task whose minutes, priority or slot it changes
 * is placed again at `now`, as `rescheduleTask` does, in the same transaction. Only the
 * fields of the edit are written: the four of the edit page, and for a sheet edit its
 * category, description and reminder.
 */
export function saveTaskEdit(db: Database, task: Task, edit: TaskEdit | SheetEdit, now: Date): void {
  inTransaction(db, () => {
    const saved = updateTask(db, task.id, edit);
    if (saved === undefined || saved.status !== 'pending') return;
    const changed =
      saved.estimated_minutes !== task.estimated_minutes ||
      saved.priority !== task.priority ||
      saved.time_slot !== task.time_slot;
    if (changed) storeSchedule(db, placeTasks(db, [saved], now));
  });
}

/** Gives a task these times. Nothing else of it, and no other task, is written. */
export function moveTask(db: Database, task: Task, times: TaskTimes): void {
  updateTask(db, task.id, times);
}
