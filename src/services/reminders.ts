import type { Database } from '../db/database.ts';
import { listAlarmTasks, markDueReminders, type AlarmTask } from '../db/reminders.ts';
import { updateTask, type Task } from '../db/tasks.ts';
import { MINUTE_MS } from '../dubai.ts';
import { postedValue } from './drafts.ts';
import { taskPath } from './task-list.ts';

/*
 * The urgent reminders: which tasks the job marks as due, the alarm list a page polls,
 * and what Snooze and Dismiss write. Nothing here reads the clock; the caller passes it.
 */

/** The minutes a Snooze button offers, in the order the modal shows them. */
export const SNOOZE_MINUTES = [5, 10, 15] as const;

export type SnoozeMinutes = (typeof SNOOZE_MINUTES)[number];

/** One alarm, as `GET /reminders` answers it. */
export interface Alarm {
  id: number;
  title: string;
  href: string;
  snooze: string;
  dismiss: string;
}

/** Marks every urgent task whose reminder is due at `now` and was not marked for it. Returns how many rows changed. */
export function fireDueReminders(db: Database, now: Date): number {
  return markDueReminders(db, now.toISOString());
}

/** The alarm of one marked task. */
function alarmOf(task: AlarmTask): Alarm {
  const path = taskPath(task.id);
  return { id: task.id, title: task.title, href: path, snooze: `${path}/snooze`, dismiss: `${path}/dismiss` };
}

/** The alarms of every marked task whose reminder is due at `now`, in reminder order then id order. */
export function listAlarms(db: Database, now: Date): Alarm[] {
  return listAlarmTasks(db, now.toISOString()).map(alarmOf);
}

/** Whether any task of the list carries a reminder and is not done, so the layout writes the alarm. */
export function anyReminder(tasks: readonly Task[]): boolean {
  return tasks.some((task) => task.reminder_at !== null && task.status !== 'done');
}

/** The minutes a snooze post asks for, or `undefined` when the field is missing, repeated or not one of the three. */
export function readSnooze(body: unknown): SnoozeMinutes | undefined {
  const value = postedValue(body, 'minutes');
  if (value === null || value === undefined) return undefined;
  return SNOOZE_MINUTES.find((minutes) => String(minutes) === value);
}

/** Moves a task's reminder to `minutes` after `now`, so the alarm leaves the list. `reminded_at` is left as it is. */
export function snoozeTask(db: Database, task: Task, minutes: SnoozeMinutes, now: Date): void {
  updateTask(db, task.id, { reminder_at: new Date(now.getTime() + minutes * MINUTE_MS).toISOString() });
}

/** Takes a task's reminder away, so no later job marks it. */
export function dismissTask(db: Database, task: Task): void {
  updateTask(db, task.id, { reminder_at: null });
}

/**
 * Starts the repeating reminder job: `fireDueReminders` every `everyMs`, the first time
 * one interval from now. Returns the function that stops it. The interval is unref'd, so
 * it does not keep the process alive by itself, which `src/server.ts` needs.
 */
export function startReminderJob(db: Database, everyMs = 60_000): () => void {
  const timer = setInterval(() => fireDueReminders(db, new Date()), everyMs);
  if (typeof (timer as { unref?: unknown }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
  return () => clearInterval(timer);
}
