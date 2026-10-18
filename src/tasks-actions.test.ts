import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, getTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf, type DomDocument, type DomElement } from './testing/dom.ts';

/*
 * What the buttons of a card do: Done, Reschedule, and the 404 of an id the list does
 * not show. The tasks are stored at `STORED`, a day before; `rows()` reads every task and
 * then moves the clock to `NOW`, so a request after it is made at 1:36 PM in Dubai and
 * any write shows in `updated_at`. "As it was" below means not even that changed.
 */

/** 9:00 AM on 11 Oct 2026 in Dubai. */
const STORED = '2026-10-11T05:00:00.000Z';
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

let testApp: TestApp;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(STORED));
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

/** Yesterday 9:00 to 9:30 AM in Dubai. */
const YESTERDAY = { scheduled_start: dubai('09:00', -1), scheduled_end: dubai('09:30', -1) };

/** A pending `medium` task of 30 minutes, unless `extra` says otherwise. */
function task(extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, {
    title: 'A task',
    status: 'pending',
    priority: 'medium',
    estimated_minutes: 30,
    ...extra,
  });
}

/** Every task as it is now. The clock then moves to `NOW`, so any write after this shows in `updated_at`. */
function rows(): Task[] {
  const before = listTasks(testApp.db);
  vi.setSystemTime(new Date(NOW));
  return before;
}

function stored(id: number): Task | undefined {
  return getTask(testApp.db, id);
}

/** The list for this query, as it is served. */
async function list(query = ''): Promise<DomDocument> {
  const response = await request(testApp.app).get(`/tasks${query}`);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** The forms of a card whose submit button says `label`. */
function formsOf(card: DomElement, label: string): DomElement[] {
  return all(card, 'form').filter((form) => all(form, 'button[type="submit"]').some((button) => textOf(button) === label));
}

function post(address: string): request.Test {
  return request(testApp.app).post(address);
}

describe('Done (AC8)', () => {
  it('is a form on a pending and an in progress card that posts with the list query, and is absent on a done card', async () => {
    task();
    task({ status: 'done' });
    task({ status: 'in_progress' });
    rows();

    const document = await list('?priority=medium&sort=priority');

    const done = formsOf(one(document, '#task-1'), 'Done');
    expect(done).toHaveLength(1);
    expect(done[0].getAttribute('method')).toBe('post');
    expect(done[0].getAttribute('action')).toBe('/tasks/1/done?priority=medium&sort=priority');
    expect(formsOf(one(document, '#task-2'), 'Done')).toEqual([]);
    expect(formsOf(one(document, '#task-3'), 'Done')).toHaveLength(1);
  });

  it('makes a pending task done at the time of the request, keeps its minutes and times, and goes back to the card', async () => {
    task({ ...YESTERDAY, actual_minutes: 7 });
    const [before] = rows();

    const response = await post('/tasks/1/done?slot=bogus&priority=medium&sort=priority');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks?priority=medium&sort=priority&done=1#task-1');
    expect(stored(1)).toEqual({ ...before, status: 'done', completed_at: NOW, updated_at: NOW });
  });

  it('makes an in progress task done the same way', async () => {
    task({ status: 'in_progress', ...YESTERDAY });
    const [before] = rows();

    const response = await post('/tasks/1/done');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks?done=1#task-1');
    expect(stored(1)).toEqual({ ...before, status: 'done', completed_at: NOW, updated_at: NOW });
  });

  it('changes nothing on a task that is done already', async () => {
    task({ status: 'done', completed_at: STORED });
    const before = rows();

    const response = await post('/tasks/1/done');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks#task-1');
    expect(listTasks(testApp.db)).toEqual(before);
  });
});

describe('Reschedule (AC9)', () => {
  it('is a form on a pending card only, posting with the list query', async () => {
    task();
    task({ status: 'in_progress' });
    task({ status: 'done' });
    rows();

    const document = await list('?priority=medium&sort=priority');

    const reschedule = formsOf(one(document, '#task-1'), 'Reschedule');
    expect(reschedule).toHaveLength(1);
    expect(reschedule[0].getAttribute('method')).toBe('post');
    expect(reschedule[0].getAttribute('action')).toBe('/tasks/1/reschedule?priority=medium&sort=priority');
    expect(formsOf(one(document, '#task-2'), 'Reschedule')).toEqual([]);
    expect(formsOf(one(document, '#task-3'), 'Reschedule')).toEqual([]);
  });

  it('places a task of yesterday again at the time of the request', async () => {
    task(YESTERDAY);
    const [before] = rows();

    const response = await post('/tasks/1/reschedule?slot=bogus&priority=medium&sort=priority');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks?priority=medium&sort=priority#task-1');
    expect(stored(1)).toEqual({
      ...before,
      scheduled_start: '2026-10-12T09:40:00.000Z',
      scheduled_end: '2026-10-12T10:10:00.000Z',
      updated_at: NOW,
    });
  });

  it('does not count the task own times as taken', async () => {
    task({ scheduled_start: '2026-10-12T09:40:00.000Z', scheduled_end: '2026-10-12T10:10:00.000Z' });
    rows();

    const response = await post('/tasks/1/reschedule');

    expect(response.status).toBe(303);
    expect(stored(1)).toMatchObject({
      scheduled_start: '2026-10-12T09:40:00.000Z',
      scheduled_end: '2026-10-12T10:10:00.000Z',
    });
  });

  it('stores the new times of a task an urgent one moves', async () => {
    task({ priority: 'urgent', ...YESTERDAY });
    task({ priority: 'low', scheduled_start: '2026-10-12T09:40:00.000Z', scheduled_end: '2026-10-12T10:10:00.000Z' });
    const before = rows();

    const response = await post('/tasks/1/reschedule');

    expect(response.status).toBe(303);
    expect(listTasks(testApp.db)).toEqual([
      {
        ...before[0],
        scheduled_start: '2026-10-12T09:40:00.000Z',
        scheduled_end: '2026-10-12T10:10:00.000Z',
        updated_at: NOW,
      },
      {
        ...before[1],
        scheduled_start: '2026-10-12T10:10:00.000Z',
        scheduled_end: '2026-10-12T10:40:00.000Z',
        updated_at: NOW,
      },
    ]);
  });

  it.each([
    ['a task the scheduler cannot place', { estimated_minutes: null }],
    ['an in progress task', { status: 'in_progress' }],
    ['a done task', { status: 'done' }],
  ] as const)('changes nothing on %s', async (_name, extra) => {
    task({ ...YESTERDAY, ...extra });
    const before = rows();

    const response = await post('/tasks/1/reschedule');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks#task-1');
    expect(listTasks(testApp.db)).toEqual(before);
  });
});

describe('unknown and draft tasks (AC14)', () => {
  /** Task 1 is pending; task 2 is a draft. */
  function seed(): void {
    task();
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id });
  }

  const VALID_EDIT = { title: 'New', minutes: '45', priority: 'low', slot: '' };

  it.each(['2', '99', '01', '1e0', 'abc'])('answers 404 for /tasks/%s/... and changes no row', async (id) => {
    seed();
    const before = rows();

    const responses = [
      await request(testApp.app).get(`/tasks/${id}/edit`),
      await post(`/tasks/${id}/done`),
      await post(`/tasks/${id}/reschedule`),
      await post(`/tasks/${id}/edit`).type('form').send(VALID_EDIT),
      await post(`/tasks/${id}/delete`),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(textOf(one(parseHtml(response.text), 'main h1'))).toBe('Page not found');
    }
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('keeps only the valid values of a posted query, in the one order', async () => {
    task();
    rows();

    const response = await post('/tasks/1/done?priority=%3Cb%3E&slot=night&sort=newest&sort=x');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks?slot=night&done=1#task-1');
  });
});
