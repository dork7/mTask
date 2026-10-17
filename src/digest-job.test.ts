import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from './db/database.ts';
import { saveSubscription, type PushSubscription } from './db/push.ts';
import { createTask, type NewTask, type Task } from './db/tasks.ts';
import { DAY_MS } from './dubai.ts';
import { startDigestJob } from './services/digest.ts';
import type { PushSender } from './services/push.ts';

/*
 * The daily digest job (AC8) and its push (AC9): it fires at the next Dubai 7:30 AM, not
 * at the start, then every 24 hours, and stops when its returned function runs. Each fire
 * pushes the summary of `buildDigest` to every subscription in `id` order.
 */

const MINUTE = 60_000;
/** 6:00 AM on 12 Oct 2026 in Dubai: before 07:30. */
const BEFORE = '2026-10-12T02:00:00.000Z';
/** 8:00 AM on 12 Oct 2026 in Dubai: after 07:30. */
const AFTER = '2026-10-12T04:00:00.000Z';

let db: Database | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(BEFORE));
});

afterEach(() => {
  if (db?.isOpen) db.close();
  db = undefined;
  vi.useRealTimers();
});

/** A time on the Dubai clock, `HH:MM`, on a Dubai date, as a stored timestamp. */
function at(time: string, date = '2026-10-12'): string {
  return new Date(`${date}T${time}:00.000+04:00`).toISOString();
}

/** A task's times, from `start` to `end` on the Dubai clock. */
function times(start: string, end: string, date?: string): Pick<NewTask, 'scheduled_start' | 'scheduled_end'> {
  return { scheduled_start: at(start, date), scheduled_end: at(end, date) };
}

/** A pending `medium` task of 30 minutes titled `A task`, unless `extra` says otherwise. */
function task(on: Database, extra: Partial<NewTask> = {}): Task {
  return createTask(on, {
    title: 'A task',
    status: 'pending',
    priority: 'medium',
    estimated_minutes: 30,
    ...extra,
  });
}

/** One stored subscription. */
function subscription(on: Database, n: number): PushSubscription {
  return saveSubscription(on, { endpoint: `https://push.example/${n}`, p256dh: 'P', auth: 'A' });
}

/** Four tasks today of 210 planned minutes in all. */
function fourToday(on: Database): void {
  task(on, { status: 'done', estimated_minutes: 45, ...times('08:00', '08:45') });
  task(on, { estimated_minutes: 45, ...times('14:00', '14:45') });
  task(on, { estimated_minutes: 60, ...times('16:00', '17:00') });
  task(on, { estimated_minutes: 60, ...times('18:00', '19:00') });
}

/** One overdue pending task, 9:00 to 9:30 AM the day before. */
function overdue(on: Database): void {
  task(on, { ...times('09:00', '09:30', '2026-10-11') });
}

describe('the daily job (AC8)', () => {
  it('fires at the next Dubai 7:30 AM, not at the start', () => {
    db = openDatabase(':memory:');
    subscription(db, 1);
    const send = vi.fn<PushSender>();

    startDigestJob(db, send);

    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(90 * MINUTE);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('waits a day when it starts after 07:30', () => {
    db = openDatabase(':memory:');
    subscription(db, 1);
    const send = vi.fn<PushSender>();
    vi.setSystemTime(new Date(AFTER));

    startDigestJob(db, send);

    vi.advanceTimersByTime(90 * MINUTE);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1320 * MINUTE);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('fires again every 24 hours', () => {
    db = openDatabase(':memory:');
    subscription(db, 1);
    const send = vi.fn<PushSender>();

    startDigestJob(db, send);

    vi.advanceTimersByTime(90 * MINUTE);
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DAY_MS);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('stops when the returned function runs', () => {
    db = openDatabase(':memory:');
    subscription(db, 1);
    const send = vi.fn<PushSender>();

    const stop = startDigestJob(db, send);
    vi.advanceTimersByTime(90 * MINUTE);
    expect(send).toHaveBeenCalledTimes(1);

    stop();
    vi.advanceTimersByTime(DAY_MS);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('pushes nothing and does not throw without a subscription', () => {
    db = openDatabase(':memory:');
    const send = vi.fn<PushSender>();

    startDigestJob(db, send);

    expect(() => vi.advanceTimersByTime(90 * MINUTE)).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the push (AC9)', () => {
  it('sends the summary to every subscription, in id order', () => {
    db = openDatabase(':memory:');
    fourToday(db);
    overdue(db);
    const first = subscription(db, 1);
    const second = subscription(db, 2);
    const send = vi.fn<PushSender>();

    startDigestJob(db, send);
    vi.advanceTimersByTime(90 * MINUTE);

    const payload = JSON.stringify({ title: '4 tasks today · 210 min planned · 1 overdue task', href: '/digest' });
    expect(send.mock.calls).toEqual([
      [first, payload],
      [second, payload],
    ]);
  });

  it('leaves the overdue suffix off when nothing is overdue', () => {
    db = openDatabase(':memory:');
    fourToday(db);
    subscription(db, 1);
    const send = vi.fn<PushSender>();

    startDigestJob(db, send);
    vi.advanceTimersByTime(90 * MINUTE);

    expect(send.mock.calls[0][1]).toBe(
      JSON.stringify({ title: '4 tasks today · 210 min planned', href: '/digest' }),
    );
  });

  it('writes one task in the singular', () => {
    db = openDatabase(':memory:');
    task(db, times('14:00', '14:30'));
    subscription(db, 1);
    const send = vi.fn<PushSender>();

    startDigestJob(db, send);
    vi.advanceTimersByTime(90 * MINUTE);

    expect(send.mock.calls[0][1]).toBe(
      JSON.stringify({ title: '1 task today · 30 min planned', href: '/digest' }),
    );
  });

  it('writes several overdue tasks in the plural', () => {
    db = openDatabase(':memory:');
    fourToday(db);
    overdue(db);
    overdue(db);
    subscription(db, 1);
    const send = vi.fn<PushSender>();

    startDigestJob(db, send);
    vi.advanceTimersByTime(90 * MINUTE);

    const title: string = JSON.parse(send.mock.calls[0][1]).title;
    expect(title).toBe('4 tasks today · 210 min planned · 2 overdue tasks');
  });
});
