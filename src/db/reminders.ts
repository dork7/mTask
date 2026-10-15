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
 * Returns the number of rows changed.
 */
export function markDueReminders(db: Database, now: string): number {
  return Number(
    db
      .prepare(
        `UPDATE tasks SET reminded_at = ?
          WHERE priority = 'urgent'
            AND status IN ('pending', 'in_progress')
            AND reminder_at IS NOT NULL
            AND reminder_at <= ?
            AND (reminded_at IS NULL OR reminded_at < reminder_at)`,
      )
      .run(now, now).changes,
  );
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
