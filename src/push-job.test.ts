import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from './db/database.ts';
import { saveSubscription, type PushSubscription } from './db/push.ts';
import { createTask, type NewTask, type Task } from './db/tasks.ts';
import { startPushJob, type PushSender } from './services/push.ts';
import { createTestApp, type TestApp } from './testing/app.ts';

/*
 * The repeating push job (AC7): it fires one interval from the start, pushes the due
 * tasks each time, stops when its returned function runs, and is not started by
 * `createApp`, so a test's app runs no interval.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

let db: Database | undefined;
let testApp: TestApp | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  if (db?.isOpen) db.close();
  testApp?.close();
  db = undefined;
  testApp = undefined;
  vi.useRealTimers();
});

/** A Dubai clock time, `HH:MM`, of 12 Oct 2026, as a stored timestamp. */
function dubai(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12, hours - 4, minutes)).toISOString();
}

/** An urgent pending task due at `reminder_at`. */
function dueTask(on: Database, extra: Partial<NewTask> = {}): Task {
  return createTask(on, {
    title: 'A task',
    status: 'pending',
    priority: 'urgent',
    reminder_at: dubai('08:00'),
    ...extra,
  });
}

/** One stored subscription. */
function subscription(on: Database): PushSubscription {
  return saveSubscription(on, { endpoint: 'https://push.example/x', p256dh: 'P1', auth: 'A1' });
}

/** The `reminded_at` of a task of this database, straight from the table. */
function markOf(on: Database, id: number): unknown {
  return on.prepare('SELECT reminded_at FROM tasks WHERE id = ?').get(id)?.reminded_at;
}

describe('the push job (AC7)', () => {
  it('fires one interval from the start, not at once', () => {
    db = openDatabase(':memory:');
    dueTask(db);
    subscription(db);
    const send = vi.fn<PushSender>();

    startPushJob(db, send, 1_000);

    expect(send).not.toHaveBeenCalled();
  });

  it('pushes the marked task after everyMs', () => {
    db = openDatabase(':memory:');
    dueTask(db);
    const stored = subscription(db);
    const send = vi.fn<PushSender>();

    const stop = startPushJob(db, send, 1_000);
    vi.advanceTimersByTime(1_000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(stored, JSON.stringify({ title: 'A task', href: '/tasks/1' }));
    stop();
  });

  it('pushes no further task after the returned stop function runs', () => {
    db = openDatabase(':memory:');
    dueTask(db);
    subscription(db);
    const send = vi.fn<PushSender>();

    const stop = startPushJob(db, send, 1_000);
    vi.advanceTimersByTime(1_000);
    dueTask(db, { reminder_at: dubai('08:30') });
    stop();
    vi.advanceTimersByTime(10_000);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('is not started by createApp', () => {
    testApp = createTestApp({ analyze: vi.fn() });
    dueTask(testApp.db);
    subscription(testApp.db);

    vi.advanceTimersByTime(120_000);

    expect(markOf(testApp.db, 1)).toBeNull();
  });
});
