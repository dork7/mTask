import type { Database } from '../db/database.ts';
import { getSetting, type SlotRule } from '../db/settings.ts';
import { listTasks, updateTask, type Task } from '../db/tasks.ts';
import { MINUTE_MS, clockMinutes, dubaiDay, dubaiDayStart } from '../dubai.ts';
import type { Priority } from '../ui.ts';
import { readSlotRules } from './rules.ts';

/*
 * The scheduler: finds the time a task is done at. A task goes into the first free gap
 * of the working hours, a task with a slot into the first free gap of its slot's window,
 * and what does not fit today goes to a later day. An urgent task takes the nearest gap
 * and pushes pending tasks of a lower priority later.
 *
 * The hours and the windows are data: the `working_hours` and `slot_rules` settings,
 * read on the Dubai clock (`src/dubai.ts`). `placeTasks` is handed the time and never
 * reads the clock, and it writes nothing: `storeSchedule` stores what it returns.
 */

/** A task starts on a mark of the clock: every five minutes, counted from the hour. */
const STEP_MS = 5 * MINUTE_MS;

/** What the scheduler reads of a task. A row of `tasks` fits as it is. */
export type SchedulableTask = Pick<Task, 'id' | 'priority' | 'time_slot' | 'estimated_minutes'>;

/** The time found for one task, as the two columns hold it: UTC timestamps. */
export interface Placement {
  id: number;
  scheduled_start: string;
  scheduled_end: string;
}

/** What one call decided. Nothing of it is stored until `storeSchedule` is called. */
export interface Schedule {
  /** The tasks handed in that got a time, in the order they were handed in. */
  placed: Placement[];
  /** The tasks that were not handed in and were pushed later by an urgent one, with their new times, in `id` order. */
  moved: Placement[];
  /** The ids of the tasks handed in that cannot be placed, in the order they were handed in. */
  unplaced: number[];
}

/** A part of every day, in minutes after midnight on the Dubai clock. */
interface DayWindow {
  start: number;
  end: number;
}

/** A task that has a time, in UTC milliseconds. */
interface Entry {
  task: SchedulableTask;
  /** `in_progress`: an urgent task does not move it. */
  started: boolean;
  start: number;
  end: number;
}

/** The order tasks are placed in. A task without a priority counts as `low`. */
const RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function rankOf(task: SchedulableTask): number {
  return RANK[task.priority ?? 'low'];
}

/** The first mark of the clock at or after an instant. Dubai is a whole number of steps from UTC. */
function nextMark(at: number): number {
  return Math.ceil(at / STEP_MS) * STEP_MS;
}

/**
 * The part of the day a task may lie in, or `undefined` when it cannot be placed at all:
 * it has no duration, or one that is longer than the working hours. A task with a slot
 * gets the window of the first rule of that slot, cut to the working hours. An urgent
 * task, a task whose slot no rule names and a task longer than its window get the
 * working hours.
 */
function windowOf(task: SchedulableTask, hours: DayWindow, rules: readonly SlotRule[]): DayWindow | undefined {
  const minutes = task.estimated_minutes;
  if (minutes === null || !(minutes > 0) || !(minutes <= hours.end - hours.start)) return undefined;
  if (task.priority === 'urgent' || task.time_slot === null) return hours;

  const rule = rules.find((item) => item.time_slot === task.time_slot);
  if (rule === undefined) return hours;

  const window = {
    start: Math.max(hours.start, clockMinutes(rule.start)),
    end: Math.min(hours.end, clockMinutes(rule.end)),
  };
  return minutes <= window.end - window.start ? window : hours;
}

/** The first of `entries` that shares time with `start` to `end`. One that ends at `start` or starts at `end` does not. */
function firstOverlap(entries: readonly Entry[], start: number, end: number): Entry | undefined {
  return entries.find((entry) => entry.start < end && entry.end > start);
}

/**
 * The earliest start on a mark, at or after `from`, at which `minutes` lie inside the
 * window of one day and overlap none of `blockers`. A task may start at the instant
 * another ends. The day after the last blocker is free, so the search ends there;
 * `undefined` only when the window cannot hold the task on a free day.
 */
function findStart(
  from: number,
  minutes: number,
  window: DayWindow,
  blockers: readonly Entry[],
): number | undefined {
  const length = minutes * MINUTE_MS;
  const firstDay = dubaiDay(from);
  const lastDay = blockers.reduce((day, blocker) => Math.max(day, dubaiDay(blocker.end)), firstDay) + 1;

  for (let day = firstDay; day <= lastDay; day += 1) {
    const midnight = dubaiDayStart(day);
    const windowEnd = midnight + window.end * MINUTE_MS;
    let start = nextMark(Math.max(from, midnight + window.start * MINUTE_MS));

    while (start + length <= windowEnd) {
      const blocker = firstOverlap(blockers, start, start + length);
      if (blocker === undefined) return start;
      // At least one step on, so the search ends whatever the blocker holds.
      start = Math.max(nextMark(blocker.end), start + STEP_MS);
    }
  }
  return undefined;
}

function placementOf(entry: Entry): Placement {
  return {
    id: entry.task.id,
    scheduled_start: new Date(entry.start).toISOString(),
    scheduled_end: new Date(entry.end).toISOString(),
  };
}

/**
 * Finds a time for each of these tasks, as if `now` were the current time, and returns
 * what it found. Nothing is written and the clock is not read.
 *
 * Time is taken by every `pending` and `in_progress` task that has a start and an end,
 * except the tasks handed in: a time one of those already has is ignored. The tasks are
 * placed one at a time, the most pressing first and then by `id`, and each takes time
 * from the next.
 *
 * An urgent task is placed without regard to its slot and to the pending tasks of a
 * lower priority. The ones it then overlaps are placed again, at or after its end, before
 * the next task of the call. One of them that cannot be placed stays where it is.
 *
 * Reads the `working_hours` and `slot_rules` settings at the call. Throws when there is
 * no `working_hours` setting. With no task, nothing is read.
 */
export function placeTasks(db: Database, tasks: readonly SchedulableTask[], now: Date): Schedule {
  const schedule: Schedule = { placed: [], moved: [], unplaced: [] };
  if (tasks.length === 0) return schedule;

  const setting = getSetting(db, 'working_hours');
  if (setting === undefined) throw new Error('The working_hours setting is missing');
  const hours: DayWindow = { start: clockMinutes(setting.start), end: clockMinutes(setting.end) };
  const rules = readSlotRules(db);

  const given = new Set(tasks.map((task) => task.id));
  const taken: Entry[] = [];
  for (const status of ['pending', 'in_progress'] as const) {
    for (const task of listTasks(db, { status })) {
      if (given.has(task.id) || task.scheduled_start === null || task.scheduled_end === null) continue;
      taken.push({
        task,
        started: status === 'in_progress',
        start: Date.parse(task.scheduled_start),
        end: Date.parse(task.scheduled_end),
      });
    }
  }

  /** Every task this call gave a time, with the last time it got. */
  const timed = new Map<number, Entry>();

  /** Gives a task the earliest time at or after `from` that is free of `blockers`. */
  function place(task: SchedulableTask, from: number, blockers: readonly Entry[]): Entry | undefined {
    const window = windowOf(task, hours, rules);
    if (window === undefined || task.estimated_minutes === null) return undefined;

    const start = findStart(from, task.estimated_minutes, window, blockers);
    if (start === undefined) return undefined;

    const entry: Entry = { task, started: false, start, end: start + task.estimated_minutes * MINUTE_MS };
    taken.push(entry);
    timed.set(task.id, entry);
    return entry;
  }

  const ordered = [...tasks].sort((a, b) => rankOf(a) - rankOf(b) || a.id - b.id);
  for (const task of ordered) {
    if (task.priority !== 'urgent') {
      place(task, now.getTime(), taken);
      continue;
    }

    const urgent = place(
      task,
      now.getTime(),
      taken.filter((entry) => entry.started || entry.task.priority === 'urgent'),
    );
    if (urgent === undefined) continue;

    // Whatever the urgent task now lies on is a pending task of a lower priority: the
    // urgent and the in_progress ones kept it out. Those that can be placed again all give
    // up their times first, so none of them stands in the way of another.
    const bumped = taken
      .filter(
        (entry) =>
          entry !== urgent &&
          firstOverlap([entry], urgent.start, urgent.end) !== undefined &&
          windowOf(entry.task, hours, rules) !== undefined,
      )
      .sort((a, b) => rankOf(a.task) - rankOf(b.task) || a.start - b.start || a.task.id - b.task.id);
    for (const entry of bumped) taken.splice(taken.indexOf(entry), 1);
    for (const entry of bumped) place(entry.task, urgent.end, taken);
  }

  for (const task of tasks) {
    const entry = timed.get(task.id);
    if (entry === undefined) schedule.unplaced.push(task.id);
    else schedule.placed.push(placementOf(entry));
  }
  for (const [id, entry] of timed) {
    if (!given.has(id)) schedule.moved.push(placementOf(entry));
  }
  schedule.moved.sort((a, b) => a.id - b.id);
  return schedule;
}

/**
 * Stores the times of a schedule: the two columns of every placed and every moved task.
 * A task that was not placed is not written. It opens no transaction: the caller wraps
 * it, with whatever else has to be stored or not at all.
 */
export function storeSchedule(db: Database, schedule: Schedule): void {
  for (const { id, scheduled_start, scheduled_end } of [...schedule.placed, ...schedule.moved]) {
    updateTask(db, id, { scheduled_start, scheduled_end });
  }
}
