import type { SQLInputValue, SQLOutputValue } from 'node:sqlite';
import type { Priority, Slot } from '../ui.ts';
import type { Database } from './database.ts';
import { isTimestamp, nowTimestamp } from './timestamps.ts';

/*
 * The rules on a task's values (the allowed statuses, priorities and slots, the
 * foreign keys, the column types) are enforced by the table. A helper passes the
 * SQLite error on, with the constraint's name in its message, and does not repeat the
 * check. The helpers add what a table cannot do: the two timestamps they set from the
 * clock, the refusal of a field they do not know, and the check that a timestamp a
 * caller gives is a real UTC instant.
 */

/** The states a task goes through, in order. The table allows no other. */
export const taskStatuses = ['draft', 'pending', 'in_progress', 'done'] as const;

export type TaskStatus = (typeof taskStatuses)[number];

/** A row of `tasks`, with the column names as they are. Timestamps are UTC ISO strings. */
export interface Task {
  id: number;
  title: string;
  description: string | null;
  image_path: string | null;
  category: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  /** `null` until it is decided. */
  priority: Priority | null;
  /** `null` until it is decided. */
  time_slot: Slot | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: TaskStatus;
  started_at: string | null;
  completed_at: string | null;
  reminder_at: string | null;
  recurrence_rule: string | null;
  parent_task_id: number | null;
  source_id: number | null;
  /** From 0 to 1, or `null` when there is none. */
  confidence: number | null;
  created_at: string;
  updated_at: string;
}

/** The columns a caller may set. The helpers set `id`, `created_at` and `updated_at`. */
export type TaskFields = Omit<Task, 'id' | 'created_at' | 'updated_at'>;

export type NewTask = Pick<TaskFields, 'title'> & Partial<TaskFields>;

export type TaskChanges = Partial<TaskFields>;

/**
 * Every field of `TaskFields`, and whether it holds a timestamp. The type makes the
 * compiler reject a field that is missing here and a name that is no field.
 */
const holdsTimestamp: { readonly [Field in keyof TaskFields]: boolean } = {
  title: false,
  description: false,
  image_path: false,
  category: false,
  estimated_minutes: false,
  actual_minutes: false,
  priority: false,
  time_slot: false,
  scheduled_start: true,
  scheduled_end: true,
  status: false,
  started_at: true,
  completed_at: true,
  reminder_at: true,
  recurrence_rule: false,
  parent_task_id: false,
  source_id: false,
  confidence: false,
};

/** The column names that SQL built at run time may contain. They come from here only. */
const taskFields = Object.keys(holdsTimestamp) as (keyof TaskFields)[];

/**
 * Stores a new task and returns it. Only the fields given are written, so a task
 * without a status is a `draft`. Throws on an unknown field, on a timestamp that is
 * not in the stored format, and on a value the table rejects; nothing is stored then.
 */
export function createTask(db: Database, input: NewTask): Task {
  const given = givenFields(input);
  const now = nowTimestamp();
  const columns = [...given.map(([field]) => field), 'created_at', 'updated_at'];
  const values = [...given.map(([, value]) => value), now, now];

  const row = db
    .prepare(`INSERT INTO tasks (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) RETURNING *`)
    .get(...values);
  if (row === undefined) throw new Error('The new task was not stored');
  return toTask(row);
}

/** The task with this id, or `undefined` when there is none. */
export function getTask(db: Database, id: number): Task | undefined {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return row === undefined ? undefined : toTask(row);
}

/** Every task in `id` order, or only those that match all the filters given. */
export function listTasks(db: Database, filter: { status?: TaskStatus; source_id?: number } = {}): Task[] {
  const conditions: string[] = [];
  const values: SQLInputValue[] = [];
  if (filter.status !== undefined) {
    conditions.push('status = ?');
    values.push(filter.status);
  }
  if (filter.source_id !== undefined) {
    conditions.push('source_id = ?');
    values.push(filter.source_id);
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  return db
    .prepare(`SELECT * FROM tasks${where} ORDER BY id`)
    .all(...values)
    .map(toTask);
}

/**
 * Changes the fields given and sets `updated_at`; with no fields, only `updated_at`.
 * `null` clears a field, `undefined` leaves it alone. Returns the task after the
 * change, or `undefined` when there is none with this id. Throws like `createTask`,
 * and the task is unchanged then.
 */
export function updateTask(db: Database, id: number, changes: TaskChanges): Task | undefined {
  const given = givenFields(changes);
  const assignments = [...given.map(([field]) => `${field} = ?`), 'updated_at = ?'];
  const values = [...given.map(([, value]) => value), nowTimestamp(), id];

  const row = db.prepare(`UPDATE tasks SET ${assignments.join(', ')} WHERE id = ? RETURNING *`).get(...values);
  return row === undefined ? undefined : toTask(row);
}

/**
 * Deletes the task with this id. Returns `false` when there was none. Tasks made from
 * the deleted one stay, with their `parent_task_id` cleared.
 */
export function deleteTask(db: Database, id: number): boolean {
  return Number(db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes) > 0;
}

/**
 * The fields of `input` that have a value, as column and value pairs in column order.
 * Throws before any SQL runs: an `Error` for a key that is no task field, a
 * `RangeError` for a timestamp field that is neither a stored timestamp nor `null`.
 */
function givenFields(input: TaskChanges): [keyof TaskFields, SQLInputValue][] {
  for (const key of Object.keys(input)) {
    if (!taskFields.some((field) => field === key)) throw new Error(`Unknown task field "${key}"`);
  }

  const given: [keyof TaskFields, SQLInputValue][] = [];
  for (const field of taskFields) {
    const value = input[field];
    if (value === undefined) continue;
    if (holdsTimestamp[field] && value !== null && !isTimestamp(value)) {
      // A Date is refused too: the caller passes `date.toISOString()`.
      const got = typeof value === 'string' ? JSON.stringify(value) : `a value of type ${typeof value}`;
      throw new RangeError(
        `Task field "${field}" must be null or a UTC timestamp like 2026-01-31T09:00:00.000Z, got ${got}`,
      );
    }
    given.push([field, value]);
  }
  return given;
}

/**
 * The driver's row, which has no prototype, as a plain object. The table is STRICT, so
 * each column holds the type `Task` declares; the compiler cannot see that.
 */
function toTask(row: Record<string, SQLOutputValue>): Task {
  return { ...row } as unknown as Task;
}
