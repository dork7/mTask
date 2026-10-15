import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from '../db/database.ts';
import { createTask, deleteTask, getTask, listTasks, type NewTask, type Task } from '../db/tasks.ts';
import { dateOfDay, dayOfDate } from '../dubai.ts';
import { markDone } from './task-actions.ts';
import {
  daysOf,
  makeNextInstance,
  nextDay,
  readRule,
  repeatOf,
  repeatRule,
  runRecurrence,
  startRecurrence,
} from './recurrence.ts';

/*
 * The recurring tasks, on a database in memory with the seeded settings, as the scheduler
 * tests are. Nothing reads the clock but the two tests that fake it for the starter.
 *
 * Every time is written here as a Dubai calendar date and turned into a day by the real
 * `dayOfDate`, so the tests never name a weekday.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = new Date('2026-10-12T09:36:00.000Z');

let db: Database;
const zone = process.env.TZ;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

/** The Dubai day of a calendar date, `YYYY-MM-DD`. */
function day(date: string): number {
  const found = dayOfDate(date);
  if (found === undefined) throw new Error(`Not a date: ${date}`);
  return found;
}

/** The calendar date of a Dubai day. */
function date(dayNumber: number): string {
  return dateOfDay(dayNumber);
}

/** A task to run the job over: pending, with no rule, unless `extra` says otherwise. */
function task(extra: Partial<NewTask> = {}): Task {
  return createTask(db, { title: 'A task', status: 'pending', estimated_minutes: 30, ...extra });
}

/** The `Weekly groceries` task of AC4: `weekly` on its own weekday, `night`, 40 minutes. */
function groceries(extra: Partial<NewTask> = {}): Task {
  return createTask(db, {
    title: 'Weekly groceries',
    category: 'shopping',
    priority: 'medium',
    time_slot: 'night',
    estimated_minutes: 40,
    recurrence_rule: 'FREQ=WEEKLY',
    status: 'pending',
    scheduled_start: '2026-10-12T16:00:00.000Z',
    scheduled_end: '2026-10-12T16:40:00.000Z',
    ...extra,
  });
}

/** The next date of a stored rule, as a calendar date. */
function next(stored: string, from: string, notBefore: string): string {
  const rule = readRule(stored);
  if (rule === null) throw new Error(`Not a rule: ${stored}`);
  return date(nextDay(rule, day(from), day(notBefore)));
}

describe('the rule forms (AC1)', () => {
  it.each([
    ['FREQ=DAILY', 'daily'],
    ['FREQ=WEEKLY', 'weekly'],
    ['FREQ=MONTHLY', 'monthly'],
  ] as const)('reads %s as %s with no days', (stored, frequency) => {
    expect(readRule(stored)).toEqual({ frequency, days: null });
  });

  it('reads a BYDAY list of one or more days, keeping the order', () => {
    expect(readRule('FREQ=WEEKLY;BYDAY=MO')).toEqual({ frequency: 'weekly', days: ['MO'] });
    expect(readRule('FREQ=WEEKLY;BYDAY=MO,TH')).toEqual({ frequency: 'weekly', days: ['MO', 'TH'] });
    expect(readRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU')).toEqual({
      frequency: 'weekly',
      days: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
    });
  });

  it.each([
    null,
    'FREQ=YEARLY',
    'FREQ=WEEKLY;BYDAY=TH,MO',
    'FREQ=WEEKLY;BYDAY=MO,MO',
    'FREQ=WEEKLY;BYDAY=',
    'FREQ=DAILY;BYDAY=MO',
    'weekly',
  ] as const)('reads %s as no rule', (stored) => {
    expect(readRule(stored)).toBeNull();
  });

  it.each([
    ['', null],
    ['daily', 'FREQ=DAILY'],
    ['monthly', 'FREQ=MONTHLY'],
  ] as const)('writes %s as %s', (value, stored) => {
    expect(repeatRule(value, [])).toBe(stored);
  });

  it('writes the weekly forms, ordered, each day once, and refuses a bad one', () => {
    expect(repeatRule('weekly', [])).toBe('FREQ=WEEKLY');
    expect(repeatRule('weekly', ['TH', 'MO'])).toBe('FREQ=WEEKLY;BYDAY=MO,TH');
    expect(repeatRule('weekly', ['MO', 'MO', 'TH'])).toBe('FREQ=WEEKLY;BYDAY=MO,TH');
    expect(repeatRule('daily', ['MO'])).toBe('FREQ=DAILY');
    expect(repeatRule('yearly', [])).toBeUndefined();
    expect(repeatRule('weekly', ['XX'])).toBeUndefined();
  });

  it('gives the picker its view of a stored rule', () => {
    expect(repeatOf('FREQ=WEEKLY;BYDAY=MO')).toBe('weekly');
    expect(repeatOf(null)).toBe('');
    expect(repeatOf('FREQ=YEARLY')).toBe('');
    expect(daysOf('FREQ=WEEKLY;BYDAY=MO,TH')).toEqual(['MO', 'TH']);
    expect(daysOf('FREQ=WEEKLY')).toEqual([]);
    expect(daysOf(null)).toEqual([]);
  });
});

describe('the next date (AC2)', () => {
  it('is the next day for daily, not before today', () => {
    expect(next('FREQ=DAILY', '2026-10-12', '2026-10-12')).toBe('2026-10-13');
    expect(next('FREQ=DAILY', '2026-10-10', '2026-10-12')).toBe('2026-10-12');
  });

  it('is the first of the chosen weekdays for weekly with BYDAY', () => {
    expect(next('FREQ=WEEKLY;BYDAY=MO,TH', '2026-10-12', '2026-10-12')).toBe('2026-10-15');
    expect(next('FREQ=WEEKLY;BYDAY=MO,TH', '2026-10-15', '2026-10-15')).toBe('2026-10-19');
  });

  it('is the instance own weekday for plain weekly, not before today', () => {
    expect(next('FREQ=WEEKLY', '2026-10-12', '2026-10-12')).toBe('2026-10-19');
    expect(next('FREQ=WEEKLY', '2026-10-12', '2026-10-20')).toBe('2026-10-26');
  });

  it('is the same day of a later month, capped to the month last day', () => {
    expect(next('FREQ=MONTHLY', '2026-10-12', '2026-10-12')).toBe('2026-11-12');
    expect(next('FREQ=MONTHLY', '2027-01-31', '2027-01-31')).toBe('2027-02-28');
    expect(next('FREQ=MONTHLY', '2027-01-31', '2027-03-01')).toBe('2027-03-31');
  });

  it.each(['America/New_York', 'Pacific/Kiritimati', 'UTC'])('does not read the process zone (TZ=%s)', (name) => {
    process.env.TZ = name;

    expect(next('FREQ=MONTHLY', '2027-01-31', '2027-01-31')).toBe('2027-02-28');
    expect(next('FREQ=MONTHLY', '2027-01-31', '2027-03-01')).toBe('2027-03-31');
    expect(next('FREQ=DAILY', '2026-10-12', '2026-10-12')).toBe('2026-10-13');
  });
});

describe('the next instance (AC3)', () => {
  it('copies these fields, clears the rule, and leaves those six null', () => {
    const instance = task({
      title: 'Weekly groceries',
      description: 'From the shop',
      category: 'shopping',
      image_path: '/uploads/x.png',
      estimated_minutes: 40,
      priority: 'medium',
      time_slot: 'night',
      recurrence_rule: 'FREQ=WEEKLY',
      scheduled_start: '2026-10-12T16:00:00.000Z',
    });

    const created = makeNextInstance(db, instance, NOW);

    expect(created).toMatchObject({
      title: 'Weekly groceries',
      description: 'From the shop',
      category: 'shopping',
      image_path: '/uploads/x.png',
      estimated_minutes: 40,
      priority: 'medium',
      time_slot: 'night',
      recurrence_rule: 'FREQ=WEEKLY',
      parent_task_id: instance.id,
      status: 'pending',
      source_id: null,
      confidence: null,
      started_at: null,
      completed_at: null,
      actual_minutes: null,
      reminder_at: null,
    });
    expect(listTasks(db)[0].recurrence_rule).toBeNull();
  });

  it('places a daily task done on its own day at 9:00 AM the next day', () => {
    const instance = task({
      recurrence_rule: 'FREQ=DAILY',
      scheduled_start: '2026-10-12T09:00:00.000Z',
    });

    const created = makeNextInstance(db, instance, NOW);
    if (created === undefined) throw new Error('No next instance');

    expect(getTask(db, created.id)).toMatchObject({
      scheduled_start: '2026-10-13T05:00:00.000Z',
      scheduled_end: '2026-10-13T05:30:00.000Z',
    });
  });

  it('places a daily task done late at the next mark today', () => {
    const instance = task({
      recurrence_rule: 'FREQ=DAILY',
      scheduled_start: '2026-10-10T09:00:00.000Z',
    });

    const created = makeNextInstance(db, instance, NOW);
    if (created === undefined) throw new Error('No next instance');

    expect(getTask(db, created.id)).toMatchObject({
      scheduled_start: '2026-10-12T09:40:00.000Z',
      scheduled_end: '2026-10-12T10:10:00.000Z',
    });
  });

  it('still creates a next instance the scheduler cannot place', () => {
    const instance = task({ recurrence_rule: 'FREQ=DAILY', estimated_minutes: null });

    const created = makeNextInstance(db, instance, NOW);
    if (created === undefined) throw new Error('No next instance');

    expect(getTask(db, created.id)).toMatchObject({ status: 'pending', scheduled_start: null, scheduled_end: null });
    expect(listTasks(db)).toHaveLength(2);
  });

  it('makes nothing, and writes nothing, for a task with no rule the module knows', () => {
    const none = task();
    const unknown = task({ recurrence_rule: 'FREQ=YEARLY' });
    const before = listTasks(db);

    expect(makeNextInstance(db, none, NOW)).toBeUndefined();
    expect(makeNextInstance(db, unknown, NOW)).toBeUndefined();
    expect(listTasks(db)).toEqual(before);
  });
});

describe('the periodic run (AC5)', () => {
  it('makes nothing while the end has not passed', () => {
    groceries();

    expect(runRecurrence(db, new Date('2026-10-12T16:30:00.000Z'))).toEqual([]);
    expect(listTasks(db)).toHaveLength(1);
  });

  it('makes the next instance once the end has passed, and leaves the old task pending', () => {
    groceries();
    const before = listTasks(db);
    vi.setSystemTime(new Date('2026-10-12T18:00:00.000Z'));

    expect(runRecurrence(db, new Date('2026-10-12T18:00:00.000Z'))).toEqual([2]);

    const rows = listTasks(db);
    expect(rows[0]).toEqual({ ...before[0], recurrence_rule: null, updated_at: '2026-10-12T18:00:00.000Z' });
    expect(rows[1]).toMatchObject({
      title: 'Weekly groceries',
      description: null,
      image_path: null,
      category: 'shopping',
      estimated_minutes: 40,
      actual_minutes: null,
      priority: 'medium',
      time_slot: 'night',
      scheduled_start: '2026-10-19T16:00:00.000Z',
      scheduled_end: '2026-10-19T16:40:00.000Z',
      status: 'pending',
      started_at: null,
      completed_at: null,
      reminder_at: null,
      recurrence_rule: 'FREQ=WEEKLY',
      parent_task_id: 1,
      source_id: null,
      confidence: null,
    });
    expect(rows[1]).toMatchObject({ id: 2, created_at: '2026-10-12T18:00:00.000Z', updated_at: '2026-10-12T18:00:00.000Z' });
  });

  it('leaves a draft, a task with no rule and a task not yet due alone, and returns the ids in order', () => {
    groceries();
    groceries({ title: 'Second' });
    groceries({ title: 'A draft', status: 'draft' });
    task({ scheduled_end: '2026-10-12T16:40:00.000Z' });
    groceries({ title: 'Later', scheduled_end: '2026-10-12T18:30:00.000Z' });
    const before = listTasks(db);

    expect(runRecurrence(db, new Date('2026-10-12T18:00:00.000Z'))).toEqual([6, 7]);

    const rows = listTasks(db);
    expect(rows).toHaveLength(7);
    // The three that were left alone are byte for byte as they were.
    expect(rows[2]).toEqual(before[2]);
    expect(rows[3]).toEqual(before[3]);
    expect(rows[4]).toEqual(before[4]);
    expect(rows[0].recurrence_rule).toBeNull();
    expect(rows[1].recurrence_rule).toBeNull();
  });
});

describe('exactly once (AC6)', () => {
  const LATER = new Date('2026-10-12T18:00:00.000Z');

  beforeEach(() => {
    vi.setSystemTime(LATER);
  });

  it('makes no second instance when Done is followed by the run', () => {
    const instance = groceries();

    markDone(db, instance, LATER);

    expect(listTasks(db)).toHaveLength(2);
    expect(runRecurrence(db, LATER)).toEqual([]);
    expect(listTasks(db)).toHaveLength(2);
  });

  it('makes no second instance when the run is followed by Done', () => {
    groceries();
    expect(runRecurrence(db, LATER)).toEqual([2]);

    const [instance] = listTasks(db);
    markDone(db, instance, LATER);

    expect(listTasks(db)).toHaveLength(2);
  });

  it('makes no second instance on a second run', () => {
    groceries();

    expect(runRecurrence(db, LATER)).toEqual([2]);
    expect(runRecurrence(db, LATER)).toEqual([]);
    expect(listTasks(db)).toHaveLength(2);
  });

  it('makes none after the newest instance is deleted', () => {
    groceries();
    expect(runRecurrence(db, LATER)).toEqual([2]);
    deleteTask(db, 2);

    const [instance] = listTasks(db);
    markDone(db, instance, LATER);
    expect(runRecurrence(db, LATER)).toEqual([]);

    expect(listTasks(db)).toHaveLength(1);
  });

  it('carries the rule onto the next instance, which makes its own', () => {
    groceries();
    expect(runRecurrence(db, LATER)).toEqual([2]);
    expect(listTasks(db)[1].recurrence_rule).toBe('FREQ=WEEKLY');

    expect(runRecurrence(db, new Date('2026-10-19T17:00:00.000Z'))).toEqual([3]);
    expect(listTasks(db)).toHaveLength(3);
  });
});

describe('the starter (AC7)', () => {
  beforeEach(() => {
    // The starter's own interval is faked too, so the test can move it; and the clock is
    // 6:00 PM, when A's end has passed and B's and C's have not.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-12T18:00:00.000Z'));
  });

  /** A daily task of 30 minutes with a start on 12 Oct and this end. */
  function repeatable(end: string): Task {
    return createTask(db, {
      title: 'A task',
      status: 'pending',
      estimated_minutes: 30,
      recurrence_rule: 'FREQ=DAILY',
      scheduled_start: '2026-10-12T16:00:00.000Z',
      scheduled_end: end,
    });
  }

  it('runs at once, again every 15 minutes, and not after the stop', () => {
    const a = repeatable('2026-10-12T16:40:00.000Z');
    repeatable('2026-10-12T18:10:00.000Z');
    repeatable('2026-10-12T18:40:00.000Z');

    const stop = startRecurrence(db);

    // A's end has passed: its instance is there right after the start, and placed.
    const afterStart = listTasks(db);
    expect(afterStart).toHaveLength(4);
    expect(afterStart.find((row) => row.parent_task_id === a.id)?.scheduled_start).not.toBeNull();

    // B's end passes within the first quarter hour.
    vi.advanceTimersByTime(15 * 60_000);
    expect(listTasks(db)).toHaveLength(5);

    // C's end passes an hour later, but the stop ends the job.
    stop();
    vi.advanceTimersByTime(60 * 60_000);
    expect(listTasks(db)).toHaveLength(5);
  });
});
