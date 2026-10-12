import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from './database.ts';
import { createSource } from './sources.ts';
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  taskStatuses,
  updateTask,
  type NewTask,
  type Task,
  type TaskChanges,
  type TaskFields,
} from './tasks.ts';

/** The time on the clock when a test starts. */
const T = '2026-03-04T05:06:07.089Z';

/** The clock one hour later. */
const LATER = '2026-03-04T06:06:07.089Z';

const timestampFields = ['scheduled_start', 'scheduled_end', 'started_at', 'completed_at', 'reminder_at'] as const;

/** Strings that are a time but not in the stored format, and a Date. */
const wrongTimestamps: [string, unknown][] = [
  ['a space in place of the T, no zone', '2026-10-12 08:00:00'],
  ['no milliseconds', '2026-10-12T08:00:00Z'],
  ['an offset in place of Z', '2026-10-12T12:00:00.000+04:00'],
  ['no zone', '2026-10-12T08:00:00.000'],
  ['a day that does not exist', '2026-02-30T08:00:00.000Z'],
  ['the empty string', ''],
  ['a Date', new Date('2026-10-12T08:00:00.000Z')],
];

let db: Database;

/** A new task with only the fields a caller did not set, as `createTask` returns it. */
function draft(id: number, title: string): Task {
  return {
    id,
    title,
    description: null,
    image_path: null,
    category: null,
    estimated_minutes: null,
    actual_minutes: null,
    priority: null,
    time_slot: null,
    scheduled_start: null,
    scheduled_end: null,
    status: 'draft',
    started_at: null,
    completed_at: null,
    reminder_at: null,
    recurrence_rule: null,
    parent_task_id: null,
    source_id: null,
    confidence: null,
    created_at: T,
    updated_at: T,
  };
}

/** Passes input the types forbid, the way untyped code could. */
function unchecked<Input>(input: object): Input {
  return input as Input;
}

function setClock(time: string): void {
  vi.setSystemTime(new Date(time));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setClock(T);
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

describe('createTask and getTask (AC4)', () => {
  it('stores a draft with only a title, and returns it as a plain object', () => {
    const task = createTask(db, { title: 'Buy milk' });

    expect(task).toStrictEqual(draft(1, 'Buy milk'));
    expect(Object.getPrototypeOf(task)).toBe(Object.prototype);
    expect(getTask(db, 1)).toStrictEqual(task);
  });

  it('uses the status it is given', () => {
    const task = createTask(db, { title: 'Buy milk', status: 'pending' });

    expect(task.status).toBe('pending');
    expect(getTask(db, task.id)?.status).toBe('pending');
  });

  it('stores every field it is given', () => {
    const source = createSource(db, { kind: 'photo', image_path: 'uploads/a.jpg' });
    const parent = createTask(db, { title: 'Weekly shop' });
    const fields: TaskFields = {
      title: 'Buy milk',
      description: 'Two litres',
      image_path: 'uploads/a.jpg',
      category: 'home',
      estimated_minutes: 15,
      actual_minutes: 20,
      priority: 'high',
      time_slot: 'evening',
      scheduled_start: '2026-03-05T14:00:00.000Z',
      scheduled_end: '2026-03-05T14:15:00.000Z',
      status: 'done',
      started_at: '2026-03-05T14:01:00.000Z',
      completed_at: '2026-03-05T14:21:00.000Z',
      reminder_at: '2026-03-05T13:45:00.000Z',
      recurrence_rule: 'FREQ=WEEKLY',
      parent_task_id: parent.id,
      source_id: source.id,
      confidence: 0.75,
    };

    const task = createTask(db, fields);

    expect(Object.keys(fields)).toHaveLength(18);
    expect(task).toStrictEqual({ id: 2, ...fields, created_at: T, updated_at: T });
    expect(getTask(db, 2)).toStrictEqual(task);
  });

  it('throws without a title and stores nothing', () => {
    expect(() => createTask(db, unchecked<NewTask>({ description: 'No title' }))).toThrow(
      'NOT NULL constraint failed: tasks.title',
    );

    expect(listTasks(db)).toEqual([]);
  });

  it('getTask returns undefined for an id that does not exist', () => {
    createTask(db, { title: 'Buy milk' });

    expect(getTask(db, 999)).toBeUndefined();
  });
});

describe('listTasks (AC4)', () => {
  it('is empty when there are no tasks', () => {
    expect(listTasks(db)).toEqual([]);
  });

  it('returns every task in id order', () => {
    const created = [...taskStatuses, 'draft' as const].map((status, index) =>
      createTask(db, { title: `Task ${index + 1}`, status }),
    );

    const tasks = listTasks(db);

    expect(tasks.map((task) => task.id)).toEqual([1, 2, 3, 4, 5]);
    expect(tasks).toStrictEqual(created);
  });

  it.each([
    ['draft', [1, 5]],
    ['pending', [2]],
    ['in_progress', [3]],
    ['done', [4, 6]],
  ] as const)('returns only the tasks with the status %s', (status, ids) => {
    for (const each of [...taskStatuses, 'draft' as const, 'done' as const]) {
      createTask(db, { title: `A ${each} task`, status: each });
    }

    const tasks = listTasks(db, { status });

    expect(tasks.map((task) => task.id)).toEqual(ids);
    expect(tasks).toStrictEqual(ids.map((id) => getTask(db, id)));
    expect(tasks.every((task) => task.status === status)).toBe(true);
  });

  it.each(taskStatuses)('is empty when no task has the status %s', (status) => {
    for (const other of taskStatuses.filter((each) => each !== status)) {
      createTask(db, { title: `A ${other} task`, status: other });
    }

    expect(listTasks(db, { status })).toEqual([]);
  });
});

describe('updateTask (AC4)', () => {
  it('changes only the fields it is given, and sets updated_at', () => {
    const task = createTask(db, { title: 'Buy milk', description: 'Two litres', status: 'pending' });
    const other = createTask(db, { title: 'Call the bank' });
    setClock(LATER);

    const updated = updateTask(db, task.id, { priority: 'high', estimated_minutes: 15 });

    expect(updated).toStrictEqual({ ...task, priority: 'high', estimated_minutes: 15, updated_at: LATER });
    expect(getTask(db, task.id)).toStrictEqual(updated);
    expect(getTask(db, other.id)).toStrictEqual(other);
  });

  it('leaves a field given as undefined alone, and clears a field given as null', () => {
    const task = createTask(db, { title: 'Buy milk', description: 'Two litres', category: 'home' });

    const updated = updateTask(db, task.id, { description: undefined, category: null });

    expect(updated).toStrictEqual({ ...task, category: null });
    expect(getTask(db, task.id)).toStrictEqual(updated);
  });

  it('with no fields changes updated_at and nothing else', () => {
    const task = createTask(db, { title: 'Buy milk', priority: 'low' });
    setClock(LATER);

    const updated = updateTask(db, task.id, {});

    expect(updated).toStrictEqual({ ...task, updated_at: LATER });
    expect(getTask(db, task.id)).toStrictEqual(updated);
  });

  it('returns undefined for an id that does not exist, and changes no task', () => {
    createTask(db, { title: 'Buy milk' });
    const before = listTasks(db);
    setClock(LATER);

    expect(updateTask(db, 999, { title: 'x' })).toBeUndefined();

    expect(listTasks(db)).toStrictEqual(before);
  });
});

describe('deleteTask (AC4)', () => {
  it('returns false for an id that does not exist, and deletes nothing', () => {
    createTask(db, { title: 'Buy milk' });
    const before = listTasks(db);

    expect(deleteTask(db, 999)).toBe(false);

    expect(listTasks(db)).toStrictEqual(before);
  });

  it('deletes the task and returns true, once', () => {
    const first = createTask(db, { title: 'Buy milk' });
    const second = createTask(db, { title: 'Call the bank' });
    const third = createTask(db, { title: 'Water the plants' });

    expect(deleteTask(db, second.id)).toBe(true);

    expect(getTask(db, second.id)).toBeUndefined();
    expect(listTasks(db)).toStrictEqual([first, third]);
    expect(deleteTask(db, second.id)).toBe(false);
    expect(listTasks(db)).toStrictEqual([first, third]);
  });

  it('never gives the id of a deleted task to a new one', () => {
    createTask(db, { title: 'Buy milk' });
    const newest = createTask(db, { title: 'Call the bank' });
    deleteTask(db, newest.id);

    const next = createTask(db, { title: 'Water the plants' });

    expect(next.id).toBeGreaterThan(newest.id);
  });
});

describe('fields that are not task fields (AC4, AC7)', () => {
  const unknownFields: [string, object][] = [
    ['a misspelled field', { titel: 'x' }],
    ['id', { id: 7 }],
    ['created_at as null', { created_at: null }],
    ['created_at as a timestamp', { created_at: LATER }],
    ['updated_at as null', { updated_at: null }],
    ['updated_at as a timestamp', { updated_at: LATER }],
    ['a field that is not given a value', { titel: undefined }],
  ];

  it.each(unknownFields)('createTask throws for %s, names the key and stores nothing', (_name, extra) => {
    const key = Object.keys(extra)[0];

    expect(() => createTask(db, unchecked<NewTask>({ title: 'Buy milk', ...extra }))).toThrow(
      `Unknown task field "${key}"`,
    );

    expect(listTasks(db)).toEqual([]);
  });

  it.each(unknownFields)('updateTask throws for %s, names the key and changes nothing', (_name, extra) => {
    const task = createTask(db, { title: 'Buy milk' });
    setClock(LATER);
    const key = Object.keys(extra)[0];

    expect(() => updateTask(db, task.id, unchecked<TaskChanges>({ title: 'Changed', ...extra }))).toThrow(
      `Unknown task field "${key}"`,
    );

    expect(getTask(db, task.id)).toStrictEqual(task);
  });
});

describe('values the table does not allow (AC2)', () => {
  const notAllowed: [string, object, string][] = [
    ['status', { status: 'nope' }, 'tasks_status'],
    ['priority', { priority: 'nope' }, 'tasks_priority'],
    ['time slot', { time_slot: 'nope' }, 'tasks_time_slot'],
  ];

  it.each(notAllowed)('createTask throws for a %s that is not allowed and stores nothing', (_name, extra, name) => {
    createTask(db, { title: 'Already there' });
    const before = listTasks(db);

    expect(() => createTask(db, unchecked<NewTask>({ title: 'Buy milk', ...extra }))).toThrow(name);

    expect(listTasks(db)).toHaveLength(before.length);
    expect(listTasks(db)).toStrictEqual(before);
  });

  it.each(notAllowed)('updateTask throws for a %s that is not allowed and changes nothing', (_name, extra, name) => {
    const task = createTask(db, { title: 'Buy milk', status: 'pending', priority: 'low', time_slot: 'morning' });
    setClock(LATER);

    expect(() => updateTask(db, task.id, unchecked<TaskChanges>({ title: 'Changed', ...extra }))).toThrow(name);

    expect(getTask(db, task.id)).toStrictEqual(task);
    expect(getTask(db, task.id)?.updated_at).toBe(T);
  });
});

describe('a task and what it points at (AC3)', () => {
  it.each(['source_id', 'parent_task_id'])('createTask throws for a %s that does not exist', (field) => {
    expect(() => createTask(db, { title: 'Buy milk', [field]: 999 })).toThrow('FOREIGN KEY constraint failed');

    expect(listTasks(db)).toEqual([]);
  });

  it('createTask stores the id of an existing source and of an existing task', () => {
    const source = createSource(db, { kind: 'text', transcript: 'Buy milk and call the bank' });
    const parent = createTask(db, { title: 'Weekly shop' });

    const task = createTask(db, { title: 'Buy milk', source_id: source.id, parent_task_id: parent.id });

    expect(task.source_id).toBe(source.id);
    expect(task.parent_task_id).toBe(parent.id);
    expect(getTask(db, task.id)).toStrictEqual(task);
  });

  it.each(['source_id', 'parent_task_id'])('updateTask throws for a %s that does not exist', (field) => {
    const task = createTask(db, { title: 'Buy milk' });
    setClock(LATER);

    expect(() => updateTask(db, task.id, { title: 'Changed', [field]: 999 })).toThrow('FOREIGN KEY constraint failed');

    expect(getTask(db, task.id)).toStrictEqual(task);
  });

  it('deleting a parent keeps its child and clears the link', () => {
    const parent = createTask(db, { title: 'Weekly shop' });
    const child = createTask(db, { title: 'Buy milk', parent_task_id: parent.id });

    expect(deleteTask(db, parent.id)).toBe(true);

    expect(getTask(db, child.id)).toStrictEqual({ ...child, parent_task_id: null });
    expect(listTasks(db)).toHaveLength(1);
  });
});

describe('the timestamps the helpers set (AC7)', () => {
  it('createTask sets created_at and updated_at to the clock, as UTC ISO text', () => {
    const task = createTask(db, { title: 'Buy milk' });

    expect(task.created_at).toBe(T);
    expect(task.updated_at).toBe(T);
    expect(db.prepare('SELECT created_at, updated_at FROM tasks WHERE id = ?').get(task.id)).toEqual({
      created_at: T,
      updated_at: T,
    });
  });

  it('updateTask moves updated_at to the clock and leaves created_at', () => {
    const task = createTask(db, { title: 'Buy milk' });
    setClock(LATER);

    const updated = updateTask(db, task.id, { title: 'Buy oat milk' });

    expect(updated?.updated_at).toBe(LATER);
    expect(updated?.created_at).toBe(T);
    expect(db.prepare('SELECT created_at, updated_at FROM tasks WHERE id = ?').get(task.id)).toEqual({
      created_at: T,
      updated_at: LATER,
    });
  });
});

describe.each(timestampFields)('the timestamp a caller sets in %s (AC7)', (field) => {
  it('updateTask stores a UTC ISO string exactly as it is given', () => {
    const task = createTask(db, { title: 'Buy milk' });
    const value = '2026-12-31T23:59:59.999Z';

    const updated = updateTask(db, task.id, { [field]: value });

    expect(updated?.[field]).toBe(value);
    expect(db.prepare(`SELECT ${field} AS stored FROM tasks WHERE id = ?`).get(task.id)).toEqual({ stored: value });
  });

  it('updateTask clears it with null', () => {
    const task = createTask(db, { title: 'Buy milk', [field]: LATER });
    expect(task[field]).toBe(LATER);

    const updated = updateTask(db, task.id, { [field]: null });

    expect(updated?.[field]).toBeNull();
    expect(getTask(db, task.id)?.[field]).toBeNull();
  });

  it.each(wrongTimestamps)('updateTask throws a RangeError for %s and changes nothing', (_name, value) => {
    const task = createTask(db, { title: 'Buy milk', [field]: T });
    setClock(LATER);
    const update = (): unknown => updateTask(db, task.id, unchecked<TaskChanges>({ title: 'Changed', [field]: value }));

    expect(update).toThrow(RangeError);
    expect(update).toThrow(`"${field}"`);

    expect(getTask(db, task.id)).toStrictEqual(task);
  });

  it.each(wrongTimestamps)('createTask throws a RangeError for %s and stores nothing', (_name, value) => {
    const create = (): unknown => createTask(db, unchecked<NewTask>({ title: 'Buy milk', [field]: value }));

    expect(create).toThrow(RangeError);
    expect(create).toThrow(`"${field}"`);

    expect(listTasks(db)).toEqual([]);
  });
});
