import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../db/database.ts';
import { createTask, type NewTask, type Task } from '../db/tasks.ts';
import { CORRECTIONS_PER_CATEGORY, readCorrections } from './corrections.ts';

/*
 * Which done tasks are shown to the analyzer as corrections. The base task of `addTask`
 * counts; each exclusion changes one field of it.
 */

let db: Database;

beforeEach(() => {
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

/** A done `coding` task, estimated 30 and done in 75, unless a field says otherwise. */
function addTask(fields: Partial<NewTask> = {}): Task {
  return createTask(db, {
    title: 'Fix the login bug',
    category: 'coding',
    status: 'done',
    estimated_minutes: 30,
    actual_minutes: 75,
    completed_at: '2026-10-01T09:00:00.000Z',
    ...fields,
  });
}

/** A completion time on 1 October 2026 at 09:<minute>. */
function at(minute: number): string {
  return `2026-10-01T09:${String(minute).padStart(2, '0')}:00.000Z`;
}

function titles(): string[] {
  return readCorrections(db).map((correction) => correction.title);
}

describe('readCorrections: which tasks count (AC1)', () => {
  it('gives exactly the four values of the base task', () => {
    addTask();

    expect(readCorrections(db)).toStrictEqual([
      { category: 'coding', title: 'Fix the login bug', estimated_minutes: 30, actual_minutes: 75 },
    ]);
  });

  it('copies each value from its own column', () => {
    addTask({ title: 'Call the bank', category: 'personal', estimated_minutes: 60, actual_minutes: 25 });

    expect(readCorrections(db)).toStrictEqual([
      { category: 'personal', title: 'Call the bank', estimated_minutes: 60, actual_minutes: 25 },
    ]);
  });

  it.each(['coding', 'shopping', 'work', 'home', 'personal', 'other'])('counts a task of category %s', (category) => {
    addTask({ category });

    const corrections = readCorrections(db);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].category).toBe(category);
  });

  it.each(['pending', 'in_progress', 'draft'] as const)('leaves out a task whose status is %s', (status) => {
    addTask({ status });

    expect(readCorrections(db)).toEqual([]);
  });

  it('leaves out a task with no completion time', () => {
    addTask({ completed_at: null });

    expect(readCorrections(db)).toEqual([]);
  });

  it('leaves out a task with no estimate', () => {
    addTask({ estimated_minutes: null });

    expect(readCorrections(db)).toEqual([]);
  });

  it('leaves out a task with no actual time (Done without Start)', () => {
    addTask({ actual_minutes: null });

    expect(readCorrections(db)).toEqual([]);
  });

  it.each(['Groceries', null, '', 'Coding', ' coding', 'coding '])(
    'leaves out a task whose category is %j',
    (category) => {
      addTask({ category });

      expect(readCorrections(db)).toEqual([]);
    },
  );

  it('gives an empty list for an empty database', () => {
    expect(readCorrections(db)).toEqual([]);
  });
});

describe('readCorrections: a large gap (AC2)', () => {
  it.each([
    [30, 75, 1],
    [30, 45, 1],
    [30, 15, 1],
    [30, 44, 0],
    [30, 30, 0],
    [30, 16, 0],
    [60, 25, 1],
    [60, 31, 0],
  ])('estimated %i, actual %i: %i correction', (estimated, actual, count) => {
    addTask({ estimated_minutes: estimated, actual_minutes: actual });

    expect(readCorrections(db)).toHaveLength(count);
  });
});

describe('readCorrections: the last ones per category (AC3)', () => {
  it('keeps the three latest of each category, latest first, by category', () => {
    addTask({ title: 'Shop 6', category: 'shopping', completed_at: at(6) });
    addTask({ title: 'Shop 7', category: 'shopping', completed_at: at(7) });
    for (const n of [3, 1, 5, 2, 4]) addTask({ title: `Code ${n}`, completed_at: at(n) });

    expect(titles()).toEqual(['Code 5', 'Code 4', 'Code 3', 'Shop 7', 'Shop 6']);
  });

  it('counts the higher id as later when two tasks were completed at the same time', () => {
    for (const n of [1, 2, 3, 4]) addTask({ title: `Tie ${n}`, completed_at: at(0) });

    expect(titles()).toEqual(['Tie 4', 'Tie 3', 'Tie 2']);
  });

  it('orders the categories as the analyzer does', () => {
    const inserted = ['home', 'other', 'coding', 'personal', 'shopping', 'work'];
    inserted.forEach((category, index) => addTask({ category, completed_at: at(index + 1) }));

    expect(readCorrections(db).map((correction) => correction.category)).toEqual([
      'coding',
      'shopping',
      'work',
      'home',
      'personal',
      'other',
    ]);
  });

  it('gives no slot to a newer task that does not count', () => {
    addTask({ title: 'Old 1', completed_at: at(1) });
    addTask({ title: 'Old 2', completed_at: at(2) });
    for (const n of [5, 6, 7]) addTask({ title: `Close ${n}`, actual_minutes: 31, completed_at: at(n) });
    addTask({ title: 'Started', status: 'in_progress', completed_at: at(9) });

    expect(titles()).toEqual(['Old 2', 'Old 1']);
  });

  it('allows three per category', () => {
    expect(CORRECTIONS_PER_CATEGORY).toBe(3);
  });
});
