import type { Database } from '../db/database.ts';
import { updateTask, type Task } from '../db/tasks.ts';
import { inTransaction } from '../db/transaction.ts';
import { priorities, slots, type Priority, type Slot } from '../ui.ts';
import { postedValue, readMinutes, type DraftProblems } from './drafts.ts';
import type { TaskTimes } from './overdue.ts';
import { placeTasks, storeSchedule } from './scheduler.ts';

/*
 * What the task list does to one task: mark it done, place it again, and store an edit
 * that overrides what the analyzer and the rules chose. Each write of several rows is
 * one transaction.
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
  };
  if (trimmed === '' || estimated === undefined || priority === undefined || slot === undefined) {
    return { edit: undefined, problems };
  }
  return { edit: { title: trimmed, estimated_minutes: estimated, priority: priority.id, time_slot: slot }, problems };
}

/**
 * Makes a task `done` at `now`. Its minutes and its times are left as they are. A task
 * that is `done` already is not written.
 */
export function markDone(db: Database, task: Task, now: Date): void {
  if (task.status === 'done') return;
  updateTask(db, task.id, { status: 'done', completed_at: now.toISOString() });
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
 * is placed again at `now`, as `rescheduleTask` does, in the same transaction. Nothing
 * else of the task is written.
 */
export function saveTaskEdit(db: Database, task: Task, edit: TaskEdit, now: Date): void {
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
