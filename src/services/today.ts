import type { Task } from '../db/tasks.ts';
import { clockLabel, dubaiDay, weekdayDateLabel } from '../dubai.ts';
import { priorities, type Priority } from '../ui.ts';
import { OVERDUE_PATH, isOverdue } from './overdue.ts';
import { taskPath } from './task-list.ts';
import { isShownOn, type ScheduledTask } from './timeline.ts';

/*
 * The Today dashboard: what to do now. Today's tasks are the ones the timeline shows on
 * the Dubai day of `now`. Of those, the pending ones whose end has not passed are left
 * to do: the first is Next up, the others are Later today. A missed task, on any day,
 * is counted for the overdue banner. Nothing here reads the clock or the database.
 */

/** The path of the dashboard. */
export const TODAY_PATH = '/';

const ADD_PATH = '/add';

/** One quick-add link: a tab of the Add page. The glyph is decoration. */
export interface QuickAddLink {
  label: string;
  href: string;
  glyph: string;
}

/** The quick-add links, in the order they are shown. */
export const QUICK_ADD: readonly QuickAddLink[] = [
  { label: 'Photo', href: `${ADD_PATH}?tab=photo`, glyph: '📷' },
  { label: 'Voice', href: `${ADD_PATH}?tab=voice`, glyph: '🎤' },
  { label: 'Type', href: `${ADD_PATH}?tab=text`, glyph: '⌨️' },
];

/** The task to do next, as the Next up card shows it. */
export interface NextUpCard {
  id: number;
  title: string;
  /** Its sheet. */
  href: string;
  /** `Next up · 2:00 PM`. */
  when: string;
  /** `null`: no badge. */
  priority: Priority | null;
  /** `Admin · about 45 min`, or '' when there is nothing to say. */
  meta: string;
  /** Where its Start form posts. */
  startAction: string;
}

/** One task of Later today. */
export interface LaterItem {
  id: number;
  title: string;
  href: string;
  /** `Coding · 60 min`, or ''. */
  meta: string;
  /** `4:00 PM`. */
  time: string;
  /** The class `d-<tone>` of its dot: the priority, or `none`. */
  tone: Priority | 'none';
  /** `High priority`, the name of its dot, or `null` for no priority. */
  priorityLabel: string | null;
}

/** Planned against done minutes of today's tasks. */
export interface TodayProgress {
  /** 0 to 100, whole. */
  percent: number;
  /** `75 of 240 min done`. */
  minutesText: string;
  /** `2 of 5 tasks finished`. */
  tasksText: string;
}

/** The banner that leads to the overdue view. */
export interface OverdueBanner {
  href: string;
  /** `1 overdue task`, `2 overdue tasks`. */
  text: string;
}

/** Everything `pages/home.ejs` shows. */
export interface Today {
  /** `Monday, 12 Oct`. */
  date: string;
  /** `null`: the empty state is shown. */
  nextUp: NextUpCard | null;
  /** Where the empty state's link goes. */
  emptyHref: string;
  progress: TodayProgress;
  /** `null`: nothing is overdue. */
  overdue: OverdueBanner | null;
  /** In `scheduled_start` order, then by id. May be empty. */
  later: LaterItem[];
  quickAdd: readonly QuickAddLink[];
}

/** Today's tasks at `now`: those the timeline shows on the Dubai day of `now`. */
export function todaysTasks(tasks: readonly Task[], now: Date): ScheduledTask[] {
  const today = dubaiDay(now.getTime());
  return tasks.filter((task): task is ScheduledTask => isShownOn(task, today));
}

function byStart(a: ScheduledTask, b: ScheduledTask): number {
  if (a.scheduled_start !== b.scheduled_start) {
    // Stored timestamps sort as text in time order (`src/db/timestamps.ts`).
    return a.scheduled_start < b.scheduled_start ? -1 : 1;
  }
  return a.id - b.id;
}

/**
 * Today's tasks still to do at `now`: pending, with an end that is not earlier than
 * `now`, in `scheduled_start` order and then by id. The first is Next up. The list
 * handed in is not changed.
 */
export function tasksLeft(tasks: readonly Task[], now: Date): ScheduledTask[] {
  return todaysTasks(tasks, now)
    .filter((task) => task.status === 'pending' && !isOverdue(task, now))
    .sort(byStart);
}

/** How many tasks are overdue at `now`, on any day. */
export function overdueCount(tasks: readonly Task[], now: Date): number {
  return tasks.filter((task) => isOverdue(task, now)).length;
}

function minutesOf(tasks: readonly Task[]): number {
  return tasks.reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0);
}

/**
 * Planned and done minutes of today's tasks at `now`, by their estimates. A null
 * estimate counts as 0, and the percent is 0 when nothing is planned.
 */
export function progressOf(tasks: readonly Task[], now: Date): TodayProgress {
  const todays = todaysTasks(tasks, now);
  const done = todays.filter((task) => task.status === 'done');
  const planned = minutesOf(todays);
  const doneMinutes = minutesOf(done);
  return {
    percent: planned === 0 ? 0 : Math.round((doneMinutes * 100) / planned),
    minutesText: `${doneMinutes} of ${planned} min done`,
    tasksText: `${done.length} of ${todays.length} tasks finished`,
  };
}

/** The parts that are there, joined with ` · `. */
function metaLine(...parts: (string | null)[]): string {
  return parts.filter((part): part is string => part !== null && part !== '').join(' · ');
}

function nextUpOf(task: ScheduledTask): NextUpCard {
  return {
    id: task.id,
    title: task.title,
    href: taskPath(task.id),
    when: `Next up · ${clockLabel(new Date(task.scheduled_start))}`,
    priority: task.priority,
    meta: metaLine(task.category, task.estimated_minutes === null ? null : `about ${task.estimated_minutes} min`),
    startAction: `${taskPath(task.id)}/start`,
  };
}

function laterItemOf(task: ScheduledTask): LaterItem {
  const label = priorities.find((item) => item.id === task.priority)?.label;
  return {
    id: task.id,
    title: task.title,
    href: taskPath(task.id),
    meta: metaLine(task.category, task.estimated_minutes === null ? null : `${task.estimated_minutes} min`),
    time: clockLabel(new Date(task.scheduled_start)),
    tone: task.priority ?? 'none',
    priorityLabel: label === undefined ? null : `${label} priority`,
  };
}

/** The dashboard at `now`, from every task. The ones it does not show are dropped here. */
export function buildToday(tasks: readonly Task[], now: Date): Today {
  const left = tasksLeft(tasks, now);
  const overdue = overdueCount(tasks, now);
  return {
    date: weekdayDateLabel(now),
    nextUp: left.length === 0 ? null : nextUpOf(left[0]),
    emptyHref: ADD_PATH,
    progress: progressOf(tasks, now),
    overdue: overdue === 0 ? null : { href: OVERDUE_PATH, text: `${overdue} overdue task${overdue === 1 ? '' : 's'}` },
    later: left.slice(1).map(laterItemOf),
    quickAdd: QUICK_ADD,
  };
}
