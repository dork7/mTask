import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSetting } from './db/settings.ts';
import { createTask, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { parseIcs } from './testing/ics.ts';

/*
 * The `.ics` downloads and the calendar feed as they are served: the status codes, the
 * headers, the events each holds, the times whatever the process zone, and the token.
 * The tasks are written straight into the database. Only `Date` is faked, so a request
 * is made at 1:36 PM in Dubai unless a test moves the clock.
 */

/** 1:36 PM on Monday 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

/** The grocery task of AC6: 8:00 to 8:40 PM on the Dubai clock. */
const GROCERIES: NewTask = {
  title: 'Buy groceries',
  status: 'pending',
  time_slot: 'night',
  scheduled_start: '2026-10-12T16:00:00.000Z',
  scheduled_end: '2026-10-12T16:40:00.000Z',
};

let testApp: TestApp;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  testApp = createTestApp({ analyze: vi.fn<Analyze>() });
});

afterEach(() => {
  testApp.close();
  vi.useRealTimers();
});

/** Stores a task scheduled from `start` (a UTC timestamp) for 30 minutes. */
function scheduled(title: string, start: string, fields: Partial<NewTask> = {}): Task {
  const end = new Date(Date.parse(start) + 30 * 60_000).toISOString();
  return createTask(testApp.db, { title, status: 'pending', scheduled_start: start, scheduled_end: end, ...fields });
}

function uids(text: string): string[] {
  return parseIcs(text).events.map((event) => event.UID);
}

function get(path: string): request.Test {
  return request(testApp.app).get(path);
}

describe('GET /task/:id/ics (AC2)', () => {
  it('downloads the task as a calendar file', async () => {
    const groceries = createTask(testApp.db, GROCERIES);

    const res = await get(`/task/${groceries.id}/ics`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/calendar/);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="task-${groceries.id}.ics"`);
  });

  it('holds exactly that task, with its title and times', async () => {
    const groceries = createTask(testApp.db, GROCERIES);
    scheduled('Call the bank', '2026-10-12T12:00:00.000Z');

    const res = await get(`/task/${groceries.id}/ics`);

    const { events } = parseIcs(res.text);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      UID: `task-${groceries.id}@mtask`,
      SUMMARY: 'Buy groceries',
      DTSTART: '20261012T160000Z',
      DTEND: '20261012T164000Z',
    });
  });

  it('is not found for an id no task has', async () => {
    expect((await get('/task/999/ics')).status).toBe(404);
  });

  it('is not found for a task with no scheduled times', async () => {
    const unscheduled = createTask(testApp.db, { title: 'Someday', status: 'pending' });

    expect((await get(`/task/${unscheduled.id}/ics`)).status).toBe(404);
  });

  it('is not found for a path that names no id', async () => {
    expect((await get('/task/abc/ics')).status).toBe(404);
  });
});

describe('GET /day/:date/ics (AC3)', () => {
  it('downloads every scheduled task of the Dubai day, of any status, in order of start', async () => {
    const late = scheduled('Late', '2026-10-12T15:00:00.000Z', { status: 'in_progress' });
    const early = scheduled('Early', '2026-10-12T05:00:00.000Z', { status: 'done' });
    const middle = scheduled('Middle', '2026-10-12T10:00:00.000Z');
    scheduled('Tomorrow', '2026-10-13T10:00:00.000Z');
    createTask(testApp.db, { title: 'Someday', status: 'pending' });

    const res = await get('/day/2026-10-12/ics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/calendar/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="day-2026-10-12.ics"');
    expect(uids(res.text)).toEqual([early, middle, late].map((each) => `task-${each.id}@mtask`));
  });

  it('cuts the day at Dubai midnight, not UTC midnight', async () => {
    const lastMinute = scheduled('11:59 PM', '2026-10-12T19:59:00.000Z');
    const midnight = scheduled('Midnight', '2026-10-12T20:00:00.000Z');

    expect(uids((await get('/day/2026-10-12/ics')).text)).toEqual([`task-${lastMinute.id}@mtask`]);
    expect(uids((await get('/day/2026-10-13/ics')).text)).toEqual([`task-${midnight.id}@mtask`]);
  });

  it('serves an empty calendar for a day with no task', async () => {
    createTask(testApp.db, GROCERIES);

    const res = await get('/day/2026-10-20/ics');

    expect(res.status).toBe(200);
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(parseIcs(res.text).events).toEqual([]);
  });

  it.each(['2026-02-30', '2026-13-01', '12-10-2026'])('is not found for %s', async (date) => {
    expect((await get(`/day/${date}/ics`)).status).toBe(404);
  });
});

describe('GET /upcoming/ics and the feed (AC4)', () => {
  it('downloads the pending and in-progress tasks still to come, in order of start', async () => {
    const later = scheduled('Later', '2026-10-12T15:00:00.000Z', { status: 'in_progress' });
    const sooner = scheduled('Sooner', '2026-10-12T11:00:00.000Z');
    scheduled('Past', '2026-10-12T08:00:00.000Z');
    scheduled('Finished', '2026-10-12T12:00:00.000Z', { status: 'done' });

    const res = await get('/upcoming/ics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/calendar/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="upcoming.ics"');
    expect(uids(res.text)).toEqual([sooner, later].map((each) => `task-${each.id}@mtask`));
  });

  it('serves the same events in the feed, which is no download', async () => {
    setSetting(testApp.db, 'feed_token', 'secret-1');
    scheduled('Later', '2026-10-12T15:00:00.000Z', { status: 'in_progress' });
    scheduled('Sooner', '2026-10-12T11:00:00.000Z');
    scheduled('Past', '2026-10-12T08:00:00.000Z');

    const upcoming = await get('/upcoming/ics');
    const feed = await get('/calendar.ics?token=secret-1');

    expect(feed.status).toBe(200);
    expect(uids(feed.text)).toHaveLength(2);
    expect(uids(feed.text)).toEqual(uids(upcoming.text));
    expect(feed.headers['content-disposition']).toBeUndefined();
  });
});

describe('the feed token (AC5)', () => {
  it('serves the feed for the stored token', async () => {
    setSetting(testApp.db, 'feed_token', 'secret-1');

    const res = await get('/calendar.ics?token=secret-1');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/calendar/);
  });

  it.each([
    ['no token', '/calendar.ics'],
    ['an empty token', '/calendar.ics?token='],
    ['another token', '/calendar.ics?token=secret-2'],
    ['the token twice', '/calendar.ics?token=secret-1&token=secret-1'],
    ['the token in other case', '/calendar.ics?token=SECRET-1'],
  ])('refuses %s', async (_name, path) => {
    setSetting(testApp.db, 'feed_token', 'secret-1');
    createTask(testApp.db, GROCERIES);

    const res = await get(path);

    expect(res.status).toBe(401);
    expect(res.text).not.toContain('BEGIN:VCALENDAR');
  });

  it.each(['/calendar.ics', '/calendar.ics?token='])('refuses %s when no token is stored', async (path) => {
    expect((await get(path)).status).toBe(401);
  });

  it('asks no token for the downloads', async () => {
    setSetting(testApp.db, 'feed_token', 'secret-1');
    const groceries = createTask(testApp.db, GROCERIES);

    for (const path of [`/task/${groceries.id}/ics`, '/day/2026-10-12/ics', '/upcoming/ics']) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers['content-type'], path).toMatch(/^text\/calendar/);
    }
  });
});

describe('times on the Dubai clock (AC6)', () => {
  it.each(['America/New_York', 'Asia/Dubai'])('writes the stored UTC times under TZ=%s', async (zone) => {
    const groceries = createTask(testApp.db, GROCERIES);
    const saved = process.env.TZ;
    process.env.TZ = zone;
    try {
      for (const path of [`/task/${groceries.id}/ics`, '/day/2026-10-12/ics']) {
        const { events } = parseIcs((await get(path)).text);
        expect(events, path).toHaveLength(1);
        expect(events[0].DTSTART, path).toBe('20261012T160000Z');
        expect(events[0].DTEND, path).toBe('20261012T164000Z');
      }
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });
});

describe('the clock of a request (AC7)', () => {
  it('stamps and filters with the time of the request', async () => {
    const soon = scheduled('Soon', '2026-10-12T09:45:00.000Z');
    const later = scheduled('Later', '2026-10-12T12:00:00.000Z');

    const first = parseIcs((await get('/upcoming/ics')).text).events;
    vi.setSystemTime(new Date('2026-10-12T10:00:00.000Z'));
    const second = parseIcs((await get('/upcoming/ics')).text).events;

    expect(first.map((event) => event.DTSTAMP)).toEqual(['20261012T093600Z', '20261012T093600Z']);
    expect(first.map((event) => event.UID)).toEqual([`task-${soon.id}@mtask`, `task-${later.id}@mtask`]);
    expect(second.map((event) => event.DTSTAMP)).toEqual(['20261012T100000Z']);
    expect(second.map((event) => event.UID)).toEqual([`task-${later.id}@mtask`]);
  });
});
