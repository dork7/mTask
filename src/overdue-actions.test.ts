import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf, type DomDocument, type DomElement } from './testing/dom.ts';

/*
 * What the forms of an overdue card do: Mark done, Reschedule, a picked time, a refused
 * pick, and the 404 and no-op of a task the page does not show. The tasks are stored at
 * `STORED`, a day before; `rows()` reads every task and then moves the clock to `NOW`,
 * so a request after it is made at 1:36 PM in Dubai and any write shows in `updated_at`.
 */

/** 9:00 AM on 11 Oct 2026 in Dubai. */
const STORED = '2026-10-11T05:00:00.000Z';
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

/** 9:00 to 9:30 AM on 11 Oct in Dubai. */
const YESTERDAY = { scheduled_start: '2026-10-11T05:00:00.000Z', scheduled_end: '2026-10-11T05:30:00.000Z' };

const MESSAGE = 'Pick a date and time that has not passed.';

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

/** A draft of a text source, with these fields. */
function draftTask(extra: Partial<NewTask> = {}): Task {
  const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
  return createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id, ...extra });
}

/** Every task as it is now. The clock then moves to `NOW`, so any write after this shows in `updated_at`. */
function rows(): Task[] {
  const before = listTasks(testApp.db);
  vi.setSystemTime(new Date(NOW));
  return before;
}

async function page(): Promise<DomDocument> {
  const response = await request(testApp.app).get('/overdue');
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

function pick(id: number | string, start: string): request.Test {
  return post(`/overdue/${id}/reschedule-at`).type('form').send({ start });
}

describe('Mark done (AC5)', () => {
  it('is one form on each card that posts to /overdue/<id>/done', async () => {
    task(YESTERDAY);
    task(YESTERDAY);
    rows();

    const document = await page();

    for (const id of [1, 2]) {
      const forms = formsOf(one(document, `#task-${id}`), 'Mark done');
      expect(forms).toHaveLength(1);
      expect(forms[0].getAttribute('method')).toBe('post');
      expect(forms[0].getAttribute('action')).toBe(`/overdue/${id}/done`);
    }
  });

  it('makes the task done at the time of the request, keeps its minutes and times, and goes back to the view', async () => {
    task({ ...YESTERDAY, actual_minutes: 7 });
    task(YESTERDAY);
    const before = rows();

    const response = await post('/overdue/1/done');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/overdue?done=1');
    expect(listTasks(testApp.db)).toEqual([
      { ...before[0], status: 'done', completed_at: NOW, updated_at: NOW },
      before[1],
    ]);
  });
});

describe('Reschedule (AC6)', () => {
  it('is one form on each card that posts to /overdue/<id>/reschedule', async () => {
    task(YESTERDAY);
    task(YESTERDAY);
    rows();

    const document = await page();

    for (const id of [1, 2]) {
      const forms = formsOf(one(document, `#task-${id}`), 'Reschedule');
      expect(forms).toHaveLength(1);
      expect(forms[0].getAttribute('method')).toBe('post');
      expect(forms[0].getAttribute('action')).toBe(`/overdue/${id}/reschedule`);
    }
  });

  it('places the task again at the time of the request, and it leaves the page', async () => {
    task(YESTERDAY);
    const [before] = rows();

    const response = await post('/overdue/1/reschedule');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/overdue');
    expect(listTasks(testApp.db)).toEqual([
      {
        ...before,
        scheduled_start: '2026-10-12T09:40:00.000Z',
        scheduled_end: '2026-10-12T10:10:00.000Z',
        updated_at: NOW,
      },
    ]);
    expect(all(await page(), '#task-1')).toEqual([]);
  });

  it('stores the new times of a task an urgent one moves', async () => {
    task({ priority: 'urgent', ...YESTERDAY });
    task({ priority: 'low', scheduled_start: '2026-10-12T09:40:00.000Z', scheduled_end: '2026-10-12T10:10:00.000Z' });
    const before = rows();

    const response = await post('/overdue/1/reschedule');

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

  it('keeps a task the scheduler cannot place, and it stays on the page', async () => {
    task({ ...YESTERDAY, estimated_minutes: null });
    const before = rows();

    const response = await post('/overdue/1/reschedule');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/overdue');
    expect(listTasks(testApp.db)).toEqual(before);
    one(await page(), '#task-1');
  });
});

describe('Pick a time (AC7)', () => {
  it('is one form on each card with a labelled datetime-local start and a submit button', async () => {
    task(YESTERDAY);
    task(YESTERDAY);
    rows();

    const document = await page();

    for (const id of [1, 2]) {
      const card = one(document, `#task-${id}`);
      const forms = all(card, 'form').filter((form) => form.getAttribute('action') === `/overdue/${id}/reschedule-at`);
      expect(forms).toHaveLength(1);
      expect(forms[0].getAttribute('method')).toBe('post');
      const inputs = all(forms[0], 'input');
      expect(inputs).toHaveLength(1);
      expect(inputs[0].getAttribute('type')).toBe('datetime-local');
      expect(inputs[0].getAttribute('name')).toBe('start');
      expect(all(forms[0], `label[for="${inputs[0].id}"]`)).toHaveLength(1);
      expect(all(forms[0], 'button[type="submit"]')).toHaveLength(1);
    }
  });

  it('moves the task to the picked Dubai time, keeps its length and moves no other task', async () => {
    task(YESTERDAY);
    task({ scheduled_start: '2026-10-12T14:00:00.000Z', scheduled_end: '2026-10-12T15:00:00.000Z' });
    const before = rows();

    const response = await pick(1, '2026-10-12T18:00');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/overdue');
    expect(listTasks(testApp.db)).toEqual([
      {
        ...before[0],
        scheduled_start: '2026-10-12T14:00:00.000Z',
        scheduled_end: '2026-10-12T14:30:00.000Z',
        updated_at: NOW,
      },
      before[1],
    ]);
  });

  it('accepts the minute of now', async () => {
    task(YESTERDAY);
    const [before] = rows();

    const response = await pick(1, '2026-10-12T13:36');

    expect(response.status).toBe(303);
    expect(listTasks(testApp.db)).toEqual([
      { ...before, scheduled_start: NOW, scheduled_end: '2026-10-12T10:06:00.000Z', updated_at: NOW },
    ]);
  });

  it('keeps the scheduled length over the estimate, outside the working hours', async () => {
    task({ ...YESTERDAY, scheduled_end: '2026-10-11T06:30:00.000Z', estimated_minutes: 30 });
    const [before] = rows();

    const response = await pick(1, '2026-10-12T22:00');

    expect(response.status).toBe(303);
    expect(listTasks(testApp.db)).toEqual([
      {
        ...before,
        scheduled_start: '2026-10-12T18:00:00.000Z',
        scheduled_end: '2026-10-12T19:30:00.000Z',
        updated_at: NOW,
      },
    ]);
  });
});

describe('a refused pick (AC8)', () => {
  it.each([
    ['no field', ''],
    ['a blank start', 'start='],
    ['start posted twice', 'start=2026-10-12T18:00&start=2026-10-12T18:00'],
    ['a start with a space', 'start=2026-10-12%2018:00'],
    ['a date that does not exist', 'start=2026-02-30T10:00'],
    ['a start before now', 'start=2026-10-12T13:30'],
  ])('answers 400 with the message on that card only, for %s, and stores nothing', async (_name, body) => {
    task(YESTERDAY);
    task(YESTERDAY);
    const before = rows();

    const response = await post('/overdue/2/reschedule-at').type('form').send(body);

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.text.split(MESSAGE)).toHaveLength(2);
    const document = parseHtml(response.text);
    expect(textOf(one(document, 'main h1'))).toBe('Overdue');
    expect(textOf(one(document, '#task-2 [role="alert"]'))).toBe(MESSAGE);
    expect(all(document, '#task-1 [role="alert"]')).toEqual([]);
    expect(one(document, '#task-2 input[name="start"]').getAttribute('aria-invalid')).toBe('true');
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('refuses a time whose end could not be stored, past the year 9999', async () => {
    task({ ...YESTERDAY, scheduled_end: '2026-10-11T10:00:00.000Z' });
    const before = rows();

    const response = await pick(1, '9999-12-31T23:59');

    expect(response.status).toBe(400);
    expect(response.text.split(MESSAGE)).toHaveLength(2);
    expect(listTasks(testApp.db)).toEqual(before);
  });
});

describe('unknown ids and tasks that are not overdue (AC9)', () => {
  it.each(['2', '99', '01', '1e0', 'abc'])('answers 404 for /overdue/%s/... and changes no row', async (id) => {
    task(YESTERDAY);
    draftTask(YESTERDAY);
    const before = rows();

    const responses = [
      await post(`/overdue/${id}/done`),
      await post(`/overdue/${id}/reschedule`),
      await pick(id, '2026-10-12T18:00'),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(textOf(one(parseHtml(response.text), 'main h1'))).toBe('Page not found');
    }
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it.each([
    ['an in progress task', { status: 'in_progress', ...YESTERDAY }],
    ['a done task', { status: 'done', completed_at: STORED, ...YESTERDAY }],
    ['a pending task ending at now', { scheduled_start: '2026-10-12T09:06:00.000Z', scheduled_end: NOW }],
  ] as const)('changes nothing on %s and goes back to the view', async (_name, extra) => {
    task(extra);
    const before = rows();

    const responses = [await post('/overdue/1/done'), await post('/overdue/1/reschedule'), await pick(1, 'bogus')];

    for (const response of responses) {
      expect(response.status).toBe(303);
      expect(response.headers.location).toBe('/overdue');
    }
    expect(listTasks(testApp.db)).toEqual(before);
  });
});
