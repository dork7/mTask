import type { Database } from '../db/database.ts';
import {
  deleteTask,
  getTask,
  restoreTask,
  takeTask,
  updateTask,
  type Task,
  type TaskChanges,
  type TaskStatus,
  type TakenTask,
} from '../db/tasks.ts';
import { inTransaction } from '../db/transaction.ts';
import { markDone } from './task-actions.ts';

/*
 * The undo of Delete and Done. What each took or changed is kept in memory, per app, so
 * a restart forgets every undo. Each kind keeps its newest `UNDO_LIMIT` entries.
 */

/** The most undos of each kind that are kept. */
export const UNDO_LIMIT = 50;

/** The texts of the two toasts. */
export const DELETED_TOAST = 'Task deleted';
export const DONE_TOAST = 'Task marked done';

/** What a Done changed, to be given back. */
export interface DoneRecord {
  status: TaskStatus;
  completed_at: string | null;
  actual_minutes: number | null;
  /** The instance the Done made, or `null`. */
  nextId: number | null;
}

export interface UndoStore {
  readonly deleted: Map<number, TakenTask>;
  readonly done: Map<number, DoneRecord>;
}

export function createUndoStore(): UndoStore {
  return { deleted: new Map(), done: new Map() };
}

/** Sets `key` as the newest entry of `map`, and drops the oldest while there are more than `UNDO_LIMIT`. */
function remember<T>(map: Map<number, T>, key: number, value: T): void {
  map.delete(key);
  map.set(key, value);
  for (const oldest of map.keys()) {
    if (map.size <= UNDO_LIMIT) break;
    map.delete(oldest);
  }
}

/** Deletes a task and remembers it for its undo. Returns whether a row was deleted. */
export function deleteWithUndo(db: Database, store: UndoStore, task: Task): boolean {
  const taken = takeTask(db, task.id);
  if (taken === undefined) return false;
  remember(store.deleted, task.id, taken);
  return true;
}

/** Whether the delete of this task can be undone. */
export function canUndoDelete(store: UndoStore, taskId: number): boolean {
  return store.deleted.has(taskId);
}

/**
 * Puts a deleted task back as it was. `undefined` when there is no undo for it or it
 * cannot be restored; either way the undo is not offered again.
 */
export function undoDelete(db: Database, store: UndoStore, taskId: number): Task | undefined {
  const taken = store.deleted.get(taskId);
  if (taken === undefined) return undefined;
  const restored = restoreTask(db, taken);
  store.deleted.delete(taskId);
  return restored;
}

/** Marks a task done and remembers what it changed. Returns whether anything was written. */
export function doneWithUndo(db: Database, store: UndoStore, task: Task, now: Date): boolean {
  const before = { status: task.status, completed_at: task.completed_at, actual_minutes: task.actual_minutes };
  const write = markDone(db, task, now);
  if (write === undefined) return false;
  remember(store.done, task.id, { ...before, nextId: write.next?.id ?? null });
  return true;
}

/** Whether the Done of this task can be undone: it is remembered, and the task is still `done`. */
export function canUndoDone(db: Database, store: UndoStore, taskId: number): boolean {
  return store.done.has(taskId) && getTask(db, taskId)?.status === 'done';
}

/**
 * Gives a task back the status, `completed_at` and `actual_minutes` it had before its
 * Done, and removes the instance that Done made while it is still `pending`, moving its
 * rule back to the task. An instance that has moved on stays, and the task's rule stays
 * `null`, so no second chain starts. `undefined`, writing nothing, when it cannot be
 * undone.
 */
export function undoDone(db: Database, store: UndoStore, taskId: number): Task | undefined {
  const record = store.done.get(taskId);
  if (record === undefined || !canUndoDone(db, store, taskId)) {
    store.done.delete(taskId);
    return undefined;
  }

  const restored = inTransaction(db, () => {
    const changes: TaskChanges = {
      status: record.status,
      completed_at: record.completed_at,
      actual_minutes: record.actual_minutes,
    };
    const next = record.nextId === null ? undefined : getTask(db, record.nextId);
    if (next !== undefined && next.status === 'pending') {
      deleteTask(db, next.id);
      changes.recurrence_rule = next.recurrence_rule;
    }
    return updateTask(db, taskId, changes);
  });
  store.done.delete(taskId);
  return restored;
}
