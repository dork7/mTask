import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, getTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { fireDueReminders } from './services/reminders.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf, type DomDocument } from './testing/dom.ts';

/*
 * The alarm list and the Snooze and Dismiss posts (AC2 to AC5), and the alarm the layout
 * writes (AC7). The tasks are stored at `STORED`, a day before, where a row after a write
 * is compared; the clock is then at `NOW` (1:36 PM in Dubai), so a request is made then.
 */

/** 9:00 AM on 11 Oct 2026 in Dubai. */
const STORED = '2026-10-11T05:00:00.000Z';
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';
/** One minute, in milliseconds. */
const MINUTE_MS = 60_000;

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

/** A Dubai clock time, `HH:MM`, of 12 Oct 2026 or of a day around it, as a stored timestamp. */
function dubai(time: string, daysAhead = 0): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12 + daysAhead, hours - 4, minutes)).toISOString();
}

/** A pending `medium` task of 30 minutes titled `A task`, unless `extra` says otherwise. */
function task(extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, {
    title: 'A task',
    status: 'pending',
    priority: 'medium',
    estimated_minutes: 30,
    ...extra,
  });
}

/** The `reminded_at` of a task, straight from the table. */
function markOf(id: number): unknown {
  return testApp.db.prepare('SELECT reminded_at FROM tasks WHERE id = ?').get(id)?.reminded_at;
}

/** A urlencoded post, as the alarm's `fetch` writes it. */
function postForm(address: string, body: string): request.Test {
  return request(testApp.app).post(address).type('form').send(body);
}

/** The alarm list as the route answers it. */
function getAlarms(): request.Test {
  return request(testApp.app).get('/reminders');
}

/** The one alarm an id is expected to make. */
function alarmOf(id: number, title = 'A task'): Record<string, unknown> {
  return { id, title, href: `/tasks/${id}`, snooze: `/tasks/${id}/snooze`, dismiss: `/tasks/${id}/dismiss` };
}

describe('the alarm list (AC2)', () => {
  it('lists every marked, due, urgent task in reminder order then id order', async () => {
    task({ priority: 'urgent', reminder_at: dubai('08:00') });
    task({ priority: 'urgent', status: 'in_progress', reminder_at: dubai('08:10') });
    task({ priority: 'urgent', reminder_at: NOW });
    task({ priority: 'urgent', status: 'done', reminder_at: dubai('08:20') });
    task({ priority: 'high', reminder_at: dubai('08:30') });
    task({ priority: 'urgent', reminder_at: dubai('20:00') });
    task({ priority: 'urgent' });
    fireDueReminders(testApp.db, new Date(NOW));

    const response = await getAlarms();

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body).toEqual({ alarms: [alarmOf(1), alarmOf(2), alarmOf(3)] });
  });

  it('answers an empty list when there are no tasks', async () => {
    const response = await getAlarms();

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body).toEqual({ alarms: [] });
  });

  it('keeps a title with markup as it is stored', async () => {
    task({ priority: 'urgent', title: '<b>x</b>', reminder_at: dubai('08:00') });
    fireDueReminders(testApp.db, new Date(NOW));

    const response = await getAlarms();

    expect(response.body.alarms[0].title).toBe('<b>x</b>');
  });

  it('answers tasks with the same reminder in id order, and an earlier reminder first', async () => {
    task({ priority: 'urgent', reminder_at: dubai('08:00') });
    task({ priority: 'urgent', reminder_at: dubai('08:00') });
    task({ priority: 'urgent', reminder_at: dubai('07:00') });
    fireDueReminders(testApp.db, new Date(NOW));

    const response = await getAlarms();

    expect(response.body.alarms.map((alarm: { id: number }) => alarm.id)).toEqual([3, 1, 2]);
  });
});

describe('Snooze (AC3)', () => {
  it.each([5, 10, 15])('moves the reminder %i minutes past the request time', async (minutes) => {
    vi.setSystemTime(new Date(STORED));
    const stored = task({ priority: 'urgent', reminder_at: dubai('08:00') });
    fireDueReminders(testApp.db, new Date(NOW));
    const before = getTask(testApp.db, stored.id);
    vi.setSystemTime(new Date(NOW));

    const response = await postForm('/tasks/1/snooze', `minutes=${minutes}`);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/');
    expect(getTask(testApp.db, 1)).toEqual({
      ...before,
      reminder_at: new Date(Date.parse(NOW) + minutes * MINUTE_MS).toISOString(),
      updated_at: NOW,
    });
    expect(markOf(1)).toBe(NOW);
    expect((await getAlarms()).body).toEqual({ alarms: [] });
  });

  it.each(['0', '30', 'five', ''])('refuses minutes="%s" with 400 and writes no row', async (value) => {
    task();
    const before = listTasks(testApp.db);

    const response = await postForm('/tasks/1/snooze', `minutes=${value}`);

    expect(response.status).toBe(400);
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('refuses a post with no minutes field, or the field twice', async () => {
    task();
    const before = listTasks(testApp.db);

    const missing = await request(testApp.app).post('/tasks/1/snooze');
    const repeated = await postForm('/tasks/1/snooze', 'minutes=5&minutes=10');

    expect(missing.status).toBe(400);
    expect(repeated.status).toBe(400);
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('does not fire again until the new reminder comes due', async () => {
    task({ priority: 'urgent', reminder_at: dubai('08:00') });
    fireDueReminders(testApp.db, new Date(NOW));

    const response = await postForm('/tasks/1/snooze', 'minutes=10');

    expect(response.status).toBe(303);
    expect(fireDueReminders(testApp.db, new Date(NOW))).toBe(0);

    const later = new Date(Date.parse(NOW) + 10 * MINUTE_MS);
    expect(fireDueReminders(testApp.db, later)).toBe(1);

    vi.setSystemTime(later);
    expect((await getAlarms()).body).toEqual({ alarms: [alarmOf(1)] });
  });
});

describe('Dismiss (AC4)', () => {
  it('takes the reminder away, so no later job marks it', async () => {
    task({ priority: 'urgent', reminder_at: dubai('08:00') });
    fireDueReminders(testApp.db, new Date(NOW));
    const before = getTask(testApp.db, 1);

    const response = await request(testApp.app).post('/tasks/1/dismiss');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/');
    expect(getTask(testApp.db, 1)).toEqual({ ...before, reminder_at: null, updated_at: NOW });
    expect(markOf(1)).toBe(NOW);
    expect((await getAlarms()).body).toEqual({ alarms: [] });
    expect(fireDueReminders(testApp.db, new Date(NOW))).toBe(0);
  });
});

describe('unknown and draft tasks (AC5)', () => {
  /** Task 1 is pending with a reminder; task 2 is a draft of a text source. */
  function seed(): void {
    task({ priority: 'urgent', reminder_at: dubai('08:00') });
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id });
  }

  it.each(['2', '99', '01', '1e0', 'abc'])('answers 404 for /tasks/%s/... and writes no row', async (id) => {
    seed();
    const before = listTasks(testApp.db);

    const responses = [
      await postForm(`/tasks/${id}/snooze`, 'minutes=5'),
      await request(testApp.app).post(`/tasks/${id}/dismiss`),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(textOf(one(parseHtml(response.text), 'main h1'))).toBe('Page not found');
    }
    expect(listTasks(testApp.db)).toEqual(before);
  });
});

describe('the alarm the layout writes (AC7)', () => {
  /** The one `#alarm` of a page. */
  function alarmOfPage(document: DomDocument): ReturnType<typeof one> {
    return one(document, '#alarm');
  }

  it('renders the script and one hidden overlay on a page with a reminder', async () => {
    task({ priority: 'urgent', reminder_at: dubai('08:00') });

    const response = await request(testApp.app).get('/');
    expect(response.status).toBe(200);
    const document = parseHtml(response.text);

    const scripts = all(document, 'script[src="/js/alarm.js"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].hasAttribute('defer')).toBe(true);

    const alarm = alarmOfPage(document);
    expect(alarm.getAttribute('class')).toBe('overlay overlay--alarm');
    expect(alarm.getAttribute('role')).toBe('alertdialog');
    expect(alarm.hasAttribute('hidden')).toBe(true);
    expect(textOf(one(alarm, '.alarm__title'))).toBe('');
    expect(one(alarm, '.alarm__sound').hasAttribute('loop')).toBe(true);

    const snoozes = all(alarm, '[data-minutes]');
    expect(snoozes.map((button) => button.getAttribute('data-minutes'))).toEqual(['5', '10', '15']);
    expect(all(alarm, '[data-minutes]').map(textOf)).toEqual(['Snooze 5 min', 'Snooze 10 min', 'Snooze 15 min']);
    expect(all(alarm, '[data-alarm-dismiss]').map(textOf)).toEqual(['Dismiss']);

    const permission = one(alarm, '.alarm__permission');
    expect(textOf(permission)).toContain('Allow alerts so urgent tasks can wake you');
    expect(all(permission, '[data-alarm-permission]')).toHaveLength(1);
    expect(one(alarm, '.alarm__blocked').hasAttribute('hidden')).toBe(true);
  });

  it('serves the script with a JavaScript content type', async () => {
    const response = await request(testApp.app).get('/js/alarm.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
  });

  it('renders neither on a page with no reminder that is not done', async () => {
    task({ priority: 'urgent', status: 'done', reminder_at: dubai('08:00') });
    task();

    const document = parseHtml((await request(testApp.app).get('/')).text);

    expect(all(document, 'script[src="/js/alarm.js"]')).toEqual([]);
    expect(all(document, '#alarm')).toEqual([]);
  });

  it('renders the overlay for a draft that carries a reminder', async () => {
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    const draft = createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id });
    testApp.db.prepare('UPDATE tasks SET reminder_at = ? WHERE id = ?').run(dubai('08:00'), draft.id);

    const document = parseHtml((await request(testApp.app).get('/')).text);

    expect(all(document, '#alarm')).toHaveLength(1);
  });
});
