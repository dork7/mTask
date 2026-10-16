import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from '../db/database.ts';
import { saveSubscription, type PushSubscription } from '../db/push.ts';
import { createTask, type NewTask, type Task } from '../db/tasks.ts';
import { listAlarms } from './reminders.ts';
import { pushDueReminders, type PushSender } from './push.ts';

/*
 * The mark-and-push of the due reminders (AC6): one `send` per marked task and
 * subscription, the tasks in `reminder_at` then `id` order, the payload of AC6, and no
 * second send at the same or an earlier clock. The sender is stubbed, so nothing is
 * ever sent.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

let db: Database;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

/** A Dubai clock time, `HH:MM`, of 12 Oct 2026, as a stored timestamp. */
function dubai(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12, hours - 4, minutes)).toISOString();
}

/** A pending urgent task titled `A task`, due at `reminder_at` before NOW. */
function task(extra: Partial<NewTask> = {}): Task {
  return createTask(db, {
    title: 'A task',
    status: 'pending',
    priority: 'urgent',
    reminder_at: dubai('08:00'),
    ...extra,
  });
}

/** One stored subscription at this endpoint. */
function subscription(endpoint: string): PushSubscription {
  return saveSubscription(db, { endpoint, p256dh: 'P', auth: 'A' });
}

/** The payload of a task, exactly as `pushDueReminders` builds it. */
function payloadOf(task: Pick<Task, 'id' | 'title'>): string {
  return JSON.stringify({ title: task.title, href: `/tasks/${task.id}` });
}

describe('pushDueReminders (AC6)', () => {
  it('sends once per marked task and subscription, in reminder_at then id order', () => {
    const later = task({ reminder_at: dubai('09:30'), title: 'Later' });
    const earlier = task({ reminder_at: dubai('09:00'), title: 'Earlier' });
    const first = subscription('https://push.example/1');
    const second = subscription('https://push.example/2');
    const send = vi.fn<PushSender>();

    expect(pushDueReminders(db, new Date(NOW), send)).toBe(2);

    expect(send.mock.calls).toEqual([
      [first, payloadOf(earlier)],
      [second, payloadOf(earlier)],
      [first, payloadOf(later)],
      [second, payloadOf(later)],
    ]);
  });

  it('sends nothing on a second call at the same now', () => {
    task({ reminder_at: dubai('09:30') });
    task({ reminder_at: dubai('09:00') });
    subscription('https://push.example/1');
    subscription('https://push.example/2');
    const send = vi.fn<PushSender>();
    pushDueReminders(db, new Date(NOW), send);
    const calls = send.mock.calls.length;

    expect(pushDueReminders(db, new Date(NOW), send)).toBe(0);
    expect(send.mock.calls).toHaveLength(calls);
  });

  it('sends nothing at an earlier now', () => {
    task({ reminder_at: dubai('09:30') });
    task({ reminder_at: dubai('09:00') });
    subscription('https://push.example/1');
    const send = vi.fn<PushSender>();
    pushDueReminders(db, new Date(NOW), send);
    const calls = send.mock.calls.length;

    expect(pushDueReminders(db, new Date(dubai('09:00')), send)).toBe(0);
    expect(send.mock.calls).toHaveLength(calls);
  });

  it('marks with no subscription, so the in-page alarm lists the task', () => {
    const only = task({ reminder_at: dubai('08:00') });
    const send = vi.fn<PushSender>();

    expect(pushDueReminders(db, new Date(NOW), send)).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(listAlarms(db, new Date(NOW))).toEqual([
      {
        id: only.id,
        title: 'A task',
        href: `/tasks/${only.id}`,
        snooze: `/tasks/${only.id}/snooze`,
        dismiss: `/tasks/${only.id}/dismiss`,
      },
    ]);
  });
});
