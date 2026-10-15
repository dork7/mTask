import type { Settings } from '../db/settings.ts';
import type { Task, TaskStatus } from '../db/tasks.ts';
import {
  DAY_MS,
  MINUTE_MS,
  MONTHS,
  clockLabel,
  clockMinutes,
  dateOfDay,
  dayOfDate,
  dubaiDay,
  dubaiDayStart,
} from '../dubai.ts';
import { slots, type Priority, type Slot } from '../ui.ts';
import { taskPath } from './task-list.ts';

/*
 * The timeline of one Dubai day: an hour axis from the working hours, widened to hold
 * the day's tasks, the slot bands behind them, one block per scheduled task, the tasks
 * that share time side by side, and the now line. Everything is placed in percent of the
 * axis, so the page needs no script. Nothing here reads the clock or the database.
 */

/** The path of the timeline. */
export const TIMELINE_PATH = '/timeline';

/** A part of a day, in minutes after midnight on the Dubai clock. */
export interface DayPart {
  start: number;
  end: number;
}

/** The hours each slot band covers. They are drawn only; the scheduler does not read them. */
export const SLOT_HOURS: Readonly<Record<Slot, DayPart>> = {
  morning: { start: 0, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 17 * 60 },
  evening: { start: 17 * 60, end: 20 * 60 },
  night: { start: 20 * 60, end: 24 * 60 },
};

const DAY_MINUTES = 24 * 60;

/** How tall the axis is drawn, per hour of it. */
const REM_PER_HOUR = 3;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** The statuses a block is drawn for. A draft is not on any day. */
const SHOWN_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'done'];

/** What a block says of its status; a pending task says nothing. */
const STATUS_TEXT: Readonly<Partial<Record<TaskStatus, string>>> = { in_progress: 'In progress', done: 'Done' };

/** One hour label of the axis. */
export interface AxisHour {
  /** `9 AM`, `12 PM`, `12 AM`. */
  label: string;
  /** Percent of the axis, as CSS: `23.08%`. */
  top: string;
}

/** One slot band, cut to the axis. */
export interface AxisBand {
  slot: Slot;
  label: string;
  top: string;
  height: string;
}

/** One task as a block of the timeline. */
export interface TimelineBlock {
  id: number;
  title: string;
  /** The task's sheet. */
  href: string;
  /** The class `k-<tone>`: the priority, or `none`. */
  tone: Priority | 'none';
  urgent: boolean;
  /** `9:00 AM–10:30 AM`. */
  time: string;
  /** `Done`, `In progress`, or `null` for a pending task. */
  status: string | null;
  conflict: boolean;
  /** The inline style: `top`, `height`, `left` and `width`, each in percent. */
  style: string;
}

/** Everything `pages/timeline.ejs` shows. */
export interface Timeline {
  /** `Today · 12 Oct`, `Wed · 14 Oct`. */
  heading: string;
  previousHref: string;
  nextHref: string;
  /** The link back to today, or `null` on today. */
  todayHref: string | null;
  /** The inline height of the axis: `39rem`. */
  height: string;
  hours: AxisHour[];
  bands: AxisBand[];
  /** In document order: by start, then end, then id. */
  blocks: TimelineBlock[];
  /** The `top` of the now line, or `null` when there is none. */
  now: string | null;
}

/** A task with both its times. */
export type ScheduledTask = Task & { scheduled_start: string; scheduled_end: string };

/** A shown task and the part of its day it covers, cut at midnight. */
interface Span {
  task: ScheduledTask;
  start: number;
  end: number;
}

/** A number rounded to two decimals, the precision every percent is written with. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function percent(value: number): string {
  return `${round2(value)}%`;
}

/**
 * The day the query asks for: `date` given once as a real `YYYY-MM-DD` date. Anything
 * else (no `date`, a repeated one, one in another form, a date that does not exist) is
 * `today`.
 */
export function readDay(query: unknown, today: number): number {
  if (typeof query !== 'object' || query === null || !Object.hasOwn(query, 'date')) return today;
  const value: unknown = (query as Record<string, unknown>).date;
  return typeof value === 'string' ? (dayOfDate(value) ?? today) : today;
}

/** The address of the timeline of a day. */
export function dayHref(day: number): string {
  return `${TIMELINE_PATH}?date=${dateOfDay(day)}`;
}

/** The heading of a day as it is read on `today`: `Today · 12 Oct`, `Tomorrow · 13 Oct`, `Wed · 14 Oct`. */
export function dayHeading(day: number, today: number): string {
  const date = new Date(day * DAY_MS);
  const offset = day - today;
  const name =
    offset === 0
      ? 'Today'
      : offset === 1
        ? 'Tomorrow'
        : offset === -1
          ? 'Yesterday'
          : WEEKDAYS[date.getUTCDay()];
  return `${name} · ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** An hour of the axis as its label reads: `12 AM` at midnight, at either end of the day. */
function hourLabel(hour: number): string {
  return `${hour % 12 || 12} ${hour % 24 < 12 ? 'AM' : 'PM'}`;
}

/** Whether a task is a block of this day: confirmed, with both times, and starting on it. */
export function isShownOn(task: Task, day: number): task is ScheduledTask {
  return (
    SHOWN_STATUSES.includes(task.status) &&
    task.scheduled_start !== null &&
    task.scheduled_end !== null &&
    dubaiDay(Date.parse(task.scheduled_start)) === day
  );
}

/** Whether two spans share time. One that ends at the minute the other starts does not. */
function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * The column of each span and how many columns its group has. A group is a run of spans
 * each of which overlaps one before it; a span takes the first column that is free at
 * its start. Spans in one column never overlap, and a span that overlaps nothing is
 * alone in its group. `sorted` is by start, then end, so a span of no length at the
 * minute a group starts comes before it and stays out of it.
 */
function columnsOf(sorted: readonly Span[]): Map<Span, { column: number; columns: number }> {
  const placed = new Map<Span, { column: number; columns: number }>();
  let group: Span[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = (): void => {
    for (const span of group) {
      const entry = placed.get(span);
      if (entry !== undefined) entry.columns = columnEnds.length;
    }
  };

  for (const span of sorted) {
    if (span.start >= groupEnd) {
      closeGroup();
      group = [];
      columnEnds = [];
    }
    let column = columnEnds.findIndex((end) => end <= span.start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = span.end;
    group.push(span);
    placed.set(span, { column, columns: 0 });
    groupEnd = Math.max(groupEnd, span.end);
  }
  closeGroup();
  return placed;
}

/**
 * The timeline of `day` at `now`, from every task (the ones it does not show are
 * dropped here) and the `working_hours` setting.
 */
export function buildTimeline(
  tasks: readonly Task[],
  hours: Settings['working_hours'],
  day: number,
  now: Date,
): Timeline {
  const today = dubaiDay(now.getTime());
  const midnight = dubaiDayStart(day);
  const minutesOf = (at: number): number => (at - midnight) / MINUTE_MS;

  const spans: Span[] = tasks
    .filter((task) => isShownOn(task, day))
    .map((task) => {
      const start = minutesOf(Date.parse(task.scheduled_start));
      const end = Math.min(Math.max(minutesOf(Date.parse(task.scheduled_end)), start), DAY_MINUTES);
      return { task, start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end || a.task.id - b.task.id);

  const axis: DayPart = {
    start: Math.min(clockMinutes(hours.start), ...spans.map((span) => Math.floor(span.start / 60) * 60)),
    end: Math.max(clockMinutes(hours.end), ...spans.map((span) => Math.ceil(span.end / 60) * 60)),
  };
  const length = axis.end - axis.start;
  const at = (minute: number): number => ((minute - axis.start) / length) * 100;
  const share = (minutes: number): number => (minutes / length) * 100;

  const hourMarks: AxisHour[] = [];
  for (let hour = Math.ceil(axis.start / 60); hour * 60 <= axis.end; hour += 1) {
    hourMarks.push({ label: hourLabel(hour), top: percent(at(hour * 60)) });
  }

  const bands: AxisBand[] = [];
  for (const item of slots) {
    const start = Math.max(SLOT_HOURS[item.id].start, axis.start);
    const end = Math.min(SLOT_HOURS[item.id].end, axis.end);
    if (end > start) {
      bands.push({ slot: item.id, label: item.label, top: percent(at(start)), height: percent(share(end - start)) });
    }
  }

  const columns = columnsOf(spans);
  const open = spans.filter((span) => span.task.status !== 'done');
  const blocks = spans.map((span): TimelineBlock => {
    const { column, columns: count } = columns.get(span) ?? { column: 0, columns: 1 };
    const left = round2((column / count) * 100);
    const right = round2(((column + 1) / count) * 100);
    const conflict =
      span.task.status !== 'done' && open.some((other) => other !== span && overlaps(span, other));
    const { task } = span;
    return {
      id: task.id,
      title: task.title,
      href: taskPath(task.id),
      tone: task.priority ?? 'none',
      urgent: task.priority === 'urgent',
      time: `${clockLabel(new Date(task.scheduled_start))}–${clockLabel(new Date(task.scheduled_end))}`,
      status: STATUS_TEXT[task.status] ?? null,
      conflict,
      style: [
        `top: ${percent(at(span.start))}`,
        `height: ${percent(share(span.end - span.start))}`,
        `left: ${left}%`,
        `width: ${round2(right - left)}%`,
      ].join('; '),
    };
  });

  const nowMinute = minutesOf(now.getTime());
  return {
    heading: dayHeading(day, today),
    previousHref: dayHref(day - 1),
    nextHref: dayHref(day + 1),
    todayHref: day === today ? null : TIMELINE_PATH,
    height: `${round2((length / 60) * REM_PER_HOUR)}rem`,
    hours: hourMarks,
    bands,
    blocks,
    now: day === today && nowMinute >= axis.start && nowMinute <= axis.end ? percent(at(nowMinute)) : null,
  };
}
