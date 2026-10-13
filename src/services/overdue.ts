import type { Task } from '../db/tasks.ts';
import { isTimestamp } from '../db/timestamps.ts';
import { MINUTE_MS, dubaiDay, dubaiDayStart } from '../dubai.ts';
import type { Placement } from './scheduler.ts';

/*
 * The overdue view: which tasks were missed, the day each was due in, and the time a
 * user picks for one. A task is missed when it is still `pending` and its end has
 * passed; the scheduler leaves such a task where it was.
 */

/** The path of the overdue view. */
export const OVERDUE_PATH = '/overdue';

/** The groups of the view, in the order they are shown. */
const GROUPS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'earlier', label: 'Earlier' },
] as const;

export type OverdueGroupId = (typeof GROUPS)[number]['id'];

/** The overdue tasks of one Dubai day or of the days before yesterday. */
export interface OverdueGroup {
  id: OverdueGroupId;
  label: string;
  /** In `scheduled_start` order, a task without one last, then by `id`. Never empty. */
  tasks: Task[];
}

/** The two times of a task, as the two columns hold them. */
export type TaskTimes = Omit<Placement, 'id'>;

/** A picked time as a `datetime-local` input posts it: `YYYY-MM-DDTHH:MM`. */
const PICKED_SHAPE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Whether a task is overdue at `now`: `pending`, with a `scheduled_end` earlier than `now`. */
export function isOverdue(task: Task, now: Date): boolean {
  return task.status === 'pending' && task.scheduled_end !== null && Date.parse(task.scheduled_end) < now.getTime();
}

/** The group of an end that has passed: its Dubai day, against the Dubai day of `now`. */
function groupOf(end: string, now: Date): OverdueGroupId {
  const daysAgo = dubaiDay(now.getTime()) - dubaiDay(Date.parse(end));
  if (daysAgo <= 0) return 'today';
  return daysAgo === 1 ? 'yesterday' : 'earlier';
}

function byStart(a: Task, b: Task): number {
  if (a.scheduled_start !== b.scheduled_start) {
    if (a.scheduled_start === null) return 1;
    if (b.scheduled_start === null) return -1;
    // Stored timestamps sort as text in time order (`src/db/timestamps.ts`).
    return a.scheduled_start < b.scheduled_start ? -1 : 1;
  }
  return a.id - b.id;
}

/**
 * The overdue tasks among these at `now`, grouped by the Dubai day of their end:
 * `Today`, `Yesterday`, `Earlier`. A group without a task is left out. The list handed
 * in is not changed.
 */
export function overdueGroups(tasks: readonly Task[], now: Date): OverdueGroup[] {
  const groups: OverdueGroup[] = GROUPS.map((group) => ({ ...group, tasks: [] }));
  for (const task of tasks) {
    if (!isOverdue(task, now) || task.scheduled_end === null) continue;
    const id = groupOf(task.scheduled_end, now);
    groups.find((group) => group.id === id)?.tasks.push(task);
  }
  for (const group of groups) group.tasks.sort(byStart);
  return groups.filter((group) => group.tasks.length > 0);
}

/**
 * The instant a posted `start` names on the Dubai clock, or `undefined` when it is not
 * one string of the form `YYYY-MM-DDTHH:MM`, is not a real date and time, or is before
 * `now`. `value` is what `postedValue` read: `undefined` when missing, `null` when
 * posted more than once.
 */
export function readPickedStart(value: string | null | undefined, now: Date): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const match = PICKED_SHAPE.exec(value);
  if (match === null) return undefined;

  const [year, month, day, hours, minutes] = match.slice(1).map(Number);
  // `Date.UTC` rolls 30 Feb over to March and a year below 100 into the 1900s; either
  // way the date read back is not the one posted.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  if (hours > 23 || minutes > 59) return undefined;

  const start = dubaiDayStart(dubaiDay(date.getTime())) + (hours * 60 + minutes) * MINUTE_MS;
  return start < now.getTime() ? undefined : new Date(start);
}

/**
 * The times of a task moved to start at `start`, keeping its length: `scheduled_end`
 * minus `scheduled_start`, or its `estimated_minutes` (none: 0) when it has no start.
 * `undefined` when the end would not be a stored timestamp, past the year 9999.
 */
export function pickedTimes(task: Task, start: Date): TaskTimes | undefined {
  const length =
    task.scheduled_start !== null && task.scheduled_end !== null
      ? Date.parse(task.scheduled_end) - Date.parse(task.scheduled_start)
      : (task.estimated_minutes ?? 0) * MINUTE_MS;
  const times = {
    scheduled_start: start.toISOString(),
    scheduled_end: new Date(start.getTime() + length).toISOString(),
  };
  return isTimestamp(times.scheduled_start) && isTimestamp(times.scheduled_end) ? times : undefined;
}
