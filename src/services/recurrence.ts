import type { Database } from '../db/database.ts';
import { createTask, listTasks, updateTask, type Task } from '../db/tasks.ts';
import { inTransaction } from '../db/transaction.ts';
import { DAY_MS, MINUTE_MS, dateOfDay, dayOfDate, dubaiDay, dubaiDayStart } from '../dubai.ts';
import { placeTasks, storeSchedule } from './scheduler.ts';

/*
 * Recurring tasks: the rule a task carries, the date of its next instance, and the job
 * that makes the instances. Nothing here reads the clock: a function that needs the time
 * is handed it.
 *
 * The rule lives in `recurrence_rule` (AC1). When an instance makes its next one its own
 * rule is cleared and the next instance carries it, so a task makes at most one next
 * instance and deleting the newest one ends the series (AC6).
 */

/** The days of the week, in the order a `BYDAY` list keeps them (AC1). */
export const weekdays = [
  { id: 'MO', label: 'Mon' },
  { id: 'TU', label: 'Tue' },
  { id: 'WE', label: 'Wed' },
  { id: 'TH', label: 'Thu' },
  { id: 'FR', label: 'Fri' },
  { id: 'SA', label: 'Sat' },
  { id: 'SU', label: 'Sun' },
] as const;

export type Weekday = (typeof weekdays)[number]['id'];

/** `getUTCDay` counts Sunday as 0; this is the same number for each day of `weekdays`. */
const DAY_INDEX: Record<Weekday, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };

/** What the Repeat picker offers: the value it posts and the text it shows (AC8). */
export const repeats = [
  { id: '', label: 'Does not repeat' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
] as const;

export type Repeat = (typeof repeats)[number]['id'];

/** A rule as this module reads it. `days` is set on a weekly rule with `BYDAY`, else `null`. */
export interface Rule {
  frequency: 'daily' | 'weekly' | 'monthly';
  days: readonly Weekday[] | null;
}

/** The day of the week of a Dubai day, as one of `weekdays`. */
function weekdayOf(day: number): Weekday {
  const index = new Date(day * DAY_MS).getUTCDay();
  const found = weekdays.find((item) => DAY_INDEX[item.id] === index);
  if (found === undefined) throw new Error(`No day of the week for ${index}`);
  return found.id;
}

/**
 * The rule a stored value holds, or `null` for `null` and for a value that is not one of
 * the forms of AC1 (`FREQ=YEARLY`, `FREQ=WEEKLY;BYDAY=TH,MO`): such a value is treated
 * like `null` everywhere.
 */
export function readRule(stored: string | null): Rule | null {
  if (stored === 'FREQ=DAILY') return { frequency: 'daily', days: null };
  if (stored === 'FREQ=WEEKLY') return { frequency: 'weekly', days: null };
  if (stored === 'FREQ=MONTHLY') return { frequency: 'monthly', days: null };
  if (stored === null || !stored.startsWith('FREQ=WEEKLY;BYDAY=')) return null;

  const days: Weekday[] = [];
  for (const text of stored.slice('FREQ=WEEKLY;BYDAY='.length).split(',')) {
    const index = weekdays.findIndex((item) => item.id === text);
    const previous = days.length === 0 ? -1 : weekdays.findIndex((item) => item.id === days[days.length - 1]);
    // One of the seven, in the order of AC1 and each once; anything else is no rule.
    if (index === -1 || index <= previous) return null;
    days.push(weekdays[index].id);
  }
  return days.length === 0 ? null : { frequency: 'weekly', days };
}

/**
 * The stored rule a posted `repeat` and its day boxes name (AC9), or `undefined` when the
 * repeat is not one of the four values or a day is not one of the seven. A day is kept
 * only for `weekly`; the days are put in the order of AC1 and each once.
 */
export function repeatRule(value: string, days: readonly string[]): string | null | undefined {
  if (value === '') return null;
  if (value === 'daily') return 'FREQ=DAILY';
  if (value === 'monthly') return 'FREQ=MONTHLY';
  if (value !== 'weekly') return undefined;
  if (days.some((day) => !weekdays.some((item) => item.id === day))) return undefined;

  const chosen = weekdays.filter((item) => days.includes(item.id)).map((item) => item.id);
  return chosen.length === 0 ? 'FREQ=WEEKLY' : `FREQ=WEEKLY;BYDAY=${chosen.join(',')}`;
}

/** The value the Repeat picker shows for a stored rule: `''`, `daily`, `weekly` or `monthly`. */
export function repeatOf(stored: string | null): Repeat {
  const rule = readRule(stored);
  return rule === null ? '' : rule.frequency;
}

/** The days the picker shows checked for a stored rule, in the order of AC1. */
export function daysOf(stored: string | null): Weekday[] {
  const rule = readRule(stored);
  return rule === null || rule.days === null ? [] : [...rule.days];
}

/** The day after `from` whose weekday is one of `days`, then on by weeks until it is not before `notBefore`. */
function nextWeeklyDay(days: readonly Weekday[], from: number, notBefore: number): number {
  let candidate = from + 1;
  while (!days.includes(weekdayOf(candidate))) candidate += 1;
  while (candidate < notBefore) candidate += 7;
  return candidate;
}

/** The same day of a later month as `day`, capped to the month's last day, not before `notBefore`. */
function nextMonthlyDay(day: number, notBefore: number): number {
  const [year, month, dayOfMonth] = dateOfDay(day).split('-').map(Number);
  const [nowYear, nowMonth] = dateOfDay(notBefore).split('-').map(Number);
  // Begin at the month before the one `notBefore` is in, so the answer is one of the next
  // two months and the loop always ends.
  const first = Math.max(1, (nowYear - year) * 12 + (nowMonth - month) - 1);
  for (let ahead = first; ; ahead += 1) {
    const months = month - 1 + ahead;
    const laterYear = year + Math.floor(months / 12);
    const laterMonth = months % 12;
    const last = new Date(Date.UTC(laterYear, laterMonth + 1, 0)).getUTCDate();
    const text = `${String(laterYear).padStart(4, '0')}-${String(laterMonth + 1).padStart(2, '0')}-${String(Math.min(dayOfMonth, last)).padStart(2, '0')}`;
    const candidate = dayOfDate(text);
    if (candidate !== undefined && candidate >= notBefore) return candidate;
  }
}

/**
 * The Dubai day of the next instance (AC2): the first day after `day` that fits the rule
 * and is not before `notBefore`, the Dubai day of `now`. `day` is the Dubai day of the
 * instance's `scheduled_start`, or of `now` when it has none.
 */
export function nextDay(rule: Rule, day: number, notBefore: number): number {
  if (rule.frequency === 'daily') return Math.max(day + 1, notBefore);
  if (rule.frequency === 'monthly') return nextMonthlyDay(day, notBefore);
  return nextWeeklyDay(rule.days ?? [weekdayOf(day)], day, notBefore);
}

/**
 * Creates the next instance of one task (AC3), places it (AC3), and clears the task's
 * rule so it never makes another (AC6). Returns the new task, or `undefined` when the
 * task carries no rule this module knows. Opens no transaction: the caller wraps it.
 */
export function makeNextInstance(db: Database, task: Task, now: Date): Task | undefined {
  const rule = readRule(task.recurrence_rule);
  if (rule === null) return undefined;

  const today = dubaiDay(now.getTime());
  const day = task.scheduled_start === null ? today : dubaiDay(Date.parse(task.scheduled_start));
  const next = nextDay(rule, day, today);

  const instance = createTask(db, {
    title: task.title,
    description: task.description,
    category: task.category,
    image_path: task.image_path,
    estimated_minutes: task.estimated_minutes,
    priority: task.priority,
    time_slot: task.time_slot,
    recurrence_rule: task.recurrence_rule,
    parent_task_id: task.id,
    status: 'pending',
  });
  updateTask(db, task.id, { recurrence_rule: null });

  // Its own day's midnight is the earliest it may start; the scheduler places it on its own.
  storeSchedule(db, placeTasks(db, [instance], new Date(Math.max(now.getTime(), dubaiDayStart(next)))));
  return instance;
}

/**
 * Creates the next instance of every task whose status is not `draft`, that carries a
 * rule, and whose `scheduled_end` is before `now` (AC5). A task that has made a next
 * instance carries no rule, so no task is made twice (AC6). Handles the tasks in `id`
 * order, one transaction each, and returns the ids of the tasks it created.
 */
export function runRecurrence(db: Database, now: Date): number[] {
  const created: number[] = [];
  for (const task of listTasks(db)) {
    if (task.status === 'draft') continue;
    if (readRule(task.recurrence_rule) === null) continue;
    if (task.scheduled_end === null || Date.parse(task.scheduled_end) >= now.getTime()) continue;

    inTransaction(db, () => {
      const instance = makeNextInstance(db, task, now);
      if (instance !== undefined) created.push(instance.id);
    });
  }
  return created;
}

/** How often the starter runs the periodic run. */
const EVERY_MS = 15 * MINUTE_MS;

/**
 * Runs the periodic run once at the time it is called, and again every 15 minutes (AC7).
 * Returns a function that stops it. `src/server.ts` calls it once after it opens the
 * database; `createApp` does not, so the app's tests are not affected.
 */
export function startRecurrence(db: Database): () => void {
  const run = (): void => {
    runRecurrence(db, new Date());
  };
  run();
  const timer = setInterval(run, EVERY_MS);
  return () => clearInterval(timer);
}
