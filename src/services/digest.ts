import type { Database } from '../db/database.ts';
import { listSubscriptions } from '../db/push.ts';
import { listTasks, type Task } from '../db/tasks.ts';
import {
  DAY_MS,
  MINUTE_MS,
  clockLabel,
  dayTimeLabel,
  dubaiDay,
  dubaiDayStart,
  weekdayDateLabel,
} from '../dubai.ts';
import { OVERDUE_PATH, isOverdue } from './overdue.ts';
import type { PushSender } from './push.ts';
import { taskPath } from './task-list.ts';
import { TIMELINE_PATH, type ScheduledTask } from './timeline.ts';
import { tasksLeft, todaysTasks } from './today.ts';

/*
 * The morning digest: today's count and planned minutes, the first task left and the
 * overdue items, for the page and the daily push. `buildDigest` takes the tasks and the
 * clock; the job takes the database and the sender. Nothing here reads either by itself.
 */

/** The path of the digest page, which the push opens. */
export const DIGEST_PATH = '/digest';

/** Where the empty state's Add link goes. */
const ADD_PATH = '/add';

/** The Dubai minutes after midnight the daily job runs at: the plan's 7:30 AM. */
const DIGEST_MINUTE_OF_DAY = 7 * 60 + 30;

/** The first task left today, as the page shows it. */
export interface DigestFirst {
  id: number;
  title: string;
  /** Its sheet. */
  href: string;
  /** `2:00 PM`. */
  time: string;
}

/** One overdue task, as the page lists it. */
export interface DigestOverdueItem {
  id: number;
  title: string;
  href: string;
  /** When it was due: `Today 9:00 AM`, `11 Oct 9:00 AM`. */
  due: string;
}

/** Everything `pages/digest.ejs` shows, and what the job's notification says. */
export interface Digest {
  /** `Monday, 12 Oct`. */
  date: string;
  /** The number of today's tasks. */
  count: number;
  /** `4 tasks today`, `1 task today`. */
  countText: string;
  /** The sum of `estimated_minutes` over today's tasks, a null as 0. */
  plannedMinutes: number;
  /** `210 min planned`. */
  plannedText: string;
  /** `null`: the empty state is shown. */
  first: DigestFirst | null;
  /** In `scheduled_start` order, a task without one last, then by id. May be empty. */
  overdue: DigestOverdueItem[];
  /** The number of `overdue` items. */
  overdueCount: number;
  /** Where the empty state's link goes. */
  addHref: string;
  /** The link back to the overdue view. */
  overdueHref: string;
  /** The link to the timeline. */
  timelineHref: string;
}

function minutesOf(tasks: readonly Task[]): number {
  return tasks.reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0);
}

function firstOf(task: ScheduledTask): DigestFirst {
  return {
    id: task.id,
    title: task.title,
    href: taskPath(task.id),
    time: clockLabel(new Date(task.scheduled_start)),
  };
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

function overdueItemOf(task: Task, now: Date): DigestOverdueItem {
  // An overdue task has an end; a task with an end and no start is labelled by its end.
  const due = task.scheduled_start ?? task.scheduled_end;
  return {
    id: task.id,
    title: task.title,
    href: taskPath(task.id),
    due: due === null ? '' : dayTimeLabel(new Date(due), now),
  };
}

/** The digest at `now`, from every task. The ones it does not show are dropped here. */
export function buildDigest(tasks: readonly Task[], now: Date): Digest {
  const todays = todaysTasks(tasks, now);
  const left = tasksLeft(tasks, now);
  const overdue = tasks
    .filter((task) => isOverdue(task, now))
    .sort(byStart)
    .map((task) => overdueItemOf(task, now));
  const count = todays.length;
  const plannedMinutes = minutesOf(todays);
  return {
    date: weekdayDateLabel(now),
    count,
    countText: `${count} task${count === 1 ? '' : 's'} today`,
    plannedMinutes,
    plannedText: `${plannedMinutes} min planned`,
    first: left.length === 0 ? null : firstOf(left[0]),
    overdue,
    overdueCount: overdue.length,
    addHref: ADD_PATH,
    overdueHref: OVERDUE_PATH,
    timelineHref: TIMELINE_PATH,
  };
}

/** The instant of the next Dubai 7:30 AM at or after `now`. */
function nextDigestAt(now: Date): number {
  const at = dubaiDayStart(dubaiDay(now.getTime())) + DIGEST_MINUTE_OF_DAY * MINUTE_MS;
  return at < now.getTime() ? at + DAY_MS : at;
}

/** The notification title of a digest: the count of AC2, the overdue count of 014 AC5. */
function summaryOf(digest: Digest): string {
  const overdue =
    digest.overdueCount === 0 ? '' : ` · ${digest.overdueCount} overdue task${digest.overdueCount === 1 ? '' : 's'}`;
  return `${digest.countText} · ${digest.plannedText}${overdue}`;
}

/** Builds the digest at `now` and sends it to every subscription, in `id` order. */
function pushDigest(db: Database, now: Date, send: PushSender): void {
  const payload = JSON.stringify({ title: summaryOf(buildDigest(listTasks(db), now)), href: DIGEST_PATH });
  for (const subscription of listSubscriptions(db)) send(subscription, payload);
}

/**
 * Starts the daily digest job: at the next Dubai 7:30 AM at or after now, and every 24
 * hours after that, it builds the digest and pushes it to every `push_subscriptions` row.
 * Returns the function that stops it. The first timeout and the interval are both unref'd,
 * so the job does not keep the process alive by itself, which `src/server.ts` needs.
 */
export function startDigestJob(db: Database, send: PushSender): () => void {
  const now = new Date();
  let interval: ReturnType<typeof setInterval> | undefined;
  const first = setTimeout(() => {
    pushDigest(db, new Date(), send);
    interval = setInterval(() => pushDigest(db, new Date(), send), DAY_MS);
    if (typeof (interval as { unref?: unknown }).unref === 'function') {
      (interval as { unref: () => void }).unref();
    }
  }, nextDigestAt(now) - now.getTime());
  if (typeof (first as { unref?: unknown }).unref === 'function') {
    (first as { unref: () => void }).unref();
  }
  return () => {
    clearTimeout(first);
    if (interval !== undefined) clearInterval(interval);
  };
}
