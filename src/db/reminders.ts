import type { Database } from './database.ts';

/*
 * The reminder job's own reads and writes. `reminded_at` is not a field of `Task` (see
 * `./tasks.ts`), so the only SQL that names the column lives here.
 */

/** One marked task, as the alarm list needs it. */
export interface AlarmTask {
  id: number;
  title: string;
}

/**
 * Marks every urgent task whose reminder is due at `now` and which was not marked for
 * it: `pending` or `in_progress`, a `reminder_at` that is not null and at or before
 * `now`, and a `reminded_at` that is null or earlier than `reminder_at`. Sets
 * `reminded_at` to `now` and leaves every other column, `updated_at` included, as it is.
 * Returns the changed tasks in `reminder_at` then `id` order: `RETURNING` answers only
 * the rows this call changed, so a second call at the same or an earlier `now` is empty.
 */
export function markDueReminderTasks(db: Database, now: string): AlarmTask[] {
  return db
    .prepare(
      `UPDATE tasks SET reminded_at = ?
        WHERE priority = 'urgent'
          AND status IN ('pending', 'in_progress')
          AND reminder_at IS NOT NULL
          AND reminder_at <= ?
          AND (reminded_at IS NULL OR reminded_at < reminder_at)
        RETURNING id, title, reminder_at`,
    )
    .all(now, now)
    .map((row) => ({ id: Number(row.id), title: String(row.title), reminder_at: String(row.reminder_at) }))
    .sort((left, right) =>
      left.reminder_at === right.reminder_at ? left.id - right.id : left.reminder_at < right.reminder_at ? -1 : 1,
    )
    .map(({ id, title }) => ({ id, title }));
}

/**
 * The number of rows `markDueReminderTasks` changed. Sets `reminded_at` to `now` and
 * leaves every other column, `updated_at` included, as it is.
 */
export function markDueReminders(db: Database, now: string): number {
  return markDueReminderTasks(db, now).length;
}

/**
 * The marked tasks whose reminder is due at `now`, in `reminder_at` order then `id`
 * order.
 */
export function listAlarmTasks(db: Database, now: string): AlarmTask[] {
  return db
    .prepare(
      `SELECT id, title FROM tasks
        WHERE priority = 'urgent'
          AND status IN ('pending', 'in_progress')
          AND reminder_at IS NOT NULL
          AND reminder_at <= ?
          AND reminded_at IS NOT NULL
        ORDER BY reminder_at, id`,
    )
    .all(now)
    .map((row) => ({ id: Number(row.id), title: String(row.title) }));
}
