import type { Task } from '../db/tasks.ts';
import { MINUTE_MS } from '../dubai.ts';

/*
 * The time a task in progress has run: as a timer shows it, and as the minutes Done
 * stores. And which task the mini-bar shows. Nothing here reads the clock.
 */

/** A running timer as the views write it. */
export interface TaskTimer {
  /** The task's `started_at`, which the page's script counts from. */
  startedAt: string;
  /** The time elapsed at the request: `12:05`, `1:02:05`. */
  text: string;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** The time from `from` to `to`, in ms, as a timer shows it: `m:ss` under an hour, `h:mm:ss` from an hour on. Less than nothing is `0:00`. */
export function elapsedLabel(from: number, to: number): string {
  const total = Math.max(0, Math.floor((to - from) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = twoDigits(total % 60);
  return hours > 0 ? `${hours}:${twoDigits(minutes)}:${seconds}` : `${minutes}:${seconds}`;
}

/** The timer of a task at `now`, or `null` when it has no start. */
export function timerOf(task: Task, now: Date): TaskTimer | null {
  if (task.started_at === null) return null;
  return { startedAt: task.started_at, text: elapsedLabel(Date.parse(task.started_at), now.getTime()) };
}

/** The minutes from `startedAt` to `now`, rounded to the nearest whole minute and at least 1. */
export function workedMinutes(startedAt: string, now: Date): number {
  return Math.max(1, Math.round((now.getTime() - Date.parse(startedAt)) / MINUTE_MS));
}

/** Whether `a` was started after `b`: a later `started_at`, or the same and a higher id. No start is before any start. */
function startedAfter(a: Task, b: Task): boolean {
  if (a.started_at === b.started_at) return a.id > b.id;
  if (b.started_at === null) return true;
  if (a.started_at === null) return false;
  // Stored timestamps sort as text in time order (`src/db/timestamps.ts`).
  return a.started_at > b.started_at;
}

/** The task the mini-bar shows: of the `in_progress` ones, the one started last. `undefined` when none is in progress. */
export function runningTask(tasks: readonly Task[]): Task | undefined {
  let latest: Task | undefined;
  for (const task of tasks) {
    if (task.status !== 'in_progress') continue;
    if (latest === undefined || startedAfter(task, latest)) latest = task;
  }
  return latest;
}
