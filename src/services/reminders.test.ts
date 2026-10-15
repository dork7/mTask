import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from '../db/database.ts';
import { createTask, type NewTask, type Task } from '../db/tasks.ts';
import { fireDueReminders } from './reminders.ts';

/*
 * The fire rule of the reminder job (AC1). The tasks are stored at `STORED`, so a mark
 * that wrongly wrote `updated_at` would show; the job is then called with `NOW`, a day
 * later, and the rows are read straight from the table.
 */

/** 9:00 AM on 11 Oct 2026 in Dubai. */
const STORED = '2026-10-11T05:00:00.000Z';
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

let db: Database;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(STORED));
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

/** A Dubai clock time, `HH:MM`, of 12 Oct 2026 or of a day around it, as a stored timestamp. */
function dubai(time: string, daysAhead = 0): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12 + daysAhead, hours - 4, minutes)).toISOString();
}

/** A pending `medium` task of 30 minutes titled `A task`, unless `extra` says otherwise. */
function task(extra: Partial<NewTask> = {}): Task {
  return createTask(db, {
    title: 'A task',
    status: 'pending',
    priority: 'medium',
    estimated_minutes: 30,
    ...extra,
  });
}

/** One column of every task, straight from the table, in id order. */
function column(name: string): unknown[] {
  return db
    .prepare(`SELECT ${name} FROM tasks ORDER BY id`)
    .all()
    .map((row) => row[name]);
}

/** Writes `reminded_at` straight into the table, as the job would have. */
function mark(id: number, at: string): void {
  db.prepare('UPDATE tasks SET reminded_at = ? WHERE id = ?').run(at, id);
}

describe('the fire rule (AC1)', () => {
  it('marks every urgent, due, pending or in progress task and leaves the others alone', () => {
    task({ priority: 'urgent', reminder_at: dubai('08:00') });
    task({ priority: 'urgent', status: 'in_progress', reminder_at: dubai('08:10') });
    task({ priority: 'urgent', reminder_at: NOW });
    task({ priority: 'urgent', status: 'done', reminder_at: dubai('08:20') });
    task({ priority: 'urgent', status: 'draft', reminder_at: dubai('08:30') });
    task({ priority: 'high', reminder_at: dubai('08:40') });
    task({ priority: 'urgent', reminder_at: dubai('20:00') });
    task({ priority: 'urgent' });

    expect(fireDueReminders(db, new Date(NOW))).toBe(3);

    expect(column('reminded_at')).toEqual([NOW, NOW, NOW, null, null, null, null, null]);
    expect(column('updated_at')).toEqual(Array.from({ length: 8 }, () => STORED));
  });

  it('changes no row on a second run at the same now', () => {
    task({ priority: 'urgent', reminder_at: dubai('08:00') });
    task({ priority: 'urgent', reminder_at: NOW });
    fireDueReminders(db, new Date(NOW));
    const before = column('reminded_at');

    expect(fireDueReminders(db, new Date(NOW))).toBe(0);
    expect(column('reminded_at')).toEqual(before);
    expect(column('updated_at')).toEqual(Array.from({ length: 2 }, () => STORED));
  });

  it('marks a task again when its reminder moved past its old mark', () => {
    const stored = task({ priority: 'urgent', reminder_at: '2026-10-12T09:30:00.000Z' });
    mark(stored.id, '2026-10-12T09:00:00.000Z');

    expect(fireDueReminders(db, new Date(NOW))).toBe(1);
    expect(column('reminded_at')).toEqual([NOW]);
  });

  it('does not mark a task whose mark is already at its reminder', () => {
    const stored = task({ priority: 'urgent', reminder_at: '2026-10-12T09:00:00.000Z' });
    mark(stored.id, '2026-10-12T09:00:00.000Z');

    expect(fireDueReminders(db, new Date(NOW))).toBe(0);
    expect(column('reminded_at')).toEqual(['2026-10-12T09:00:00.000Z']);
  });
});
