import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, getTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf, type DomDocument, type DomElement } from './testing/dom.ts';

/*
 * Start (AC6) and Done from the sheet (AC7). The tasks are stored at `STORED`, a day
 * before; `rows()` reads every task and then moves the clock to `NOW`, so a request after
 * it is made at 1:36 PM in Dubai and any write shows in `updated_at`.
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

/** Every task as it is now. The clock then moves to `NOW`, so any write after this shows in `updated_at`. */
function rows(): Task[] {
  const before = listTasks(testApp.db);
  vi.setSystemTime(new Date(NOW));
  return before;
}

function stored(id: number): Task | undefined {
  return getTask(testApp.db, id);
}

function post(address: string): request.Test {
  return request(testApp.app).post(address);
}

async function sheet(id: number): Promise<DomDocument> {
  const response = await request(testApp.app).get(`/tasks/${id}`);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** The forms of the sheet whose submit button says `label`. */
function formsOf(document: DomDocument, label: string): DomElement[] {
  return all(one(document, '#task-sheet'), 'form').filter((form) =>
    all(form, 'button[type="submit"]').some((button) => textOf(button) === label),
  );
}

const NOT_FOUND_IDS = ['2', '99', '01', '1e0', 'abc'];

/** Task 1 is pending; task 2 is a draft of a text source. */
function seedWithDraft(): void {
  task();
  const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
  createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id });
}

describe('Start (AC6)', () => {
  it('is a form on the sheet of a pending task only', async () => {
    task();
    task({ status: 'in_progress', started_at: STORED });
    task({ status: 'done' });
    rows();

    const start = formsOf(await sheet(1), 'Start');
    expect(start).toHaveLength(1);
    expect(start[0].getAttribute('method')).toBe('post');
    expect(start[0].getAttribute('action')).toBe('/tasks/1/start');
    expect(formsOf(await sheet(2), 'Start')).toEqual([]);
    expect(formsOf(await sheet(3), 'Start')).toEqual([]);
  });

  it('starts a pending task at the time of the request and goes back to the sheet', async () => {
    task();
    const [before] = rows();

    const response = await post('/tasks/1/start');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks/1');
    expect(stored(1)).toEqual({ ...before, status: 'in_progress', started_at: NOW, updated_at: NOW });
  });

  it('leaves a task already in progress as it is', async () => {
    task({ status: 'in_progress', started_at: STORED });
    task();
    const [first] = rows();

    const response = await post('/tasks/2/start');

    expect(response.status).toBe(303);
    expect(stored(1)).toEqual(first);
    expect(stored(2)?.status).toBe('in_progress');
  });

  it.each([
    ['in_progress', { status: 'in_progress', started_at: STORED }],
    ['done', { status: 'done', completed_at: STORED }],
  ] as const)('changes nothing on a task that is %s', async (_name, extra) => {
    task(extra);
    const before = rows();

    const response = await post('/tasks/1/start');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks/1');
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it.each(NOT_FOUND_IDS)('answers 404 for /tasks/%s/start and changes no row', async (id) => {
    seedWithDraft();
    const before = rows();

    const response = await post(`/tasks/${id}/start`);

    expect(response.status).toBe(404);
    expect(listTasks(testApp.db)).toEqual(before);
  });
});

describe('Done from the sheet (AC7)', () => {
  it('is a form on the sheet of a task that is not done', async () => {
    task();
    task({ status: 'in_progress', started_at: STORED });
    task({ status: 'done' });
    rows();

    for (const id of [1, 2]) {
      const done = formsOf(await sheet(id), 'Done');
      expect(done).toHaveLength(1);
      expect(done[0].getAttribute('action')).toBe(`/tasks/${id}/done?from=sheet`);
    }
    expect(formsOf(await sheet(3), 'Done')).toEqual([]);
  });

  it('records the minutes an in progress task ran and goes back to the sheet', async () => {
    task({ status: 'in_progress', started_at: '2026-10-12T08:21:00.000Z' });
    const [before] = rows();

    const response = await post('/tasks/1/done?from=sheet');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks/1');
    expect(stored(1)).toEqual({ ...before, status: 'done', completed_at: NOW, actual_minutes: 75, updated_at: NOW });
  });

  it('records at least one minute', async () => {
    task({ status: 'in_progress', started_at: '2026-10-12T09:35:40.000Z' });
    rows();

    await post('/tasks/1/done?from=sheet');

    expect(stored(1)?.actual_minutes).toBe(1);
  });

  it('records no minutes for a pending task', async () => {
    task();
    const [before] = rows();

    const response = await post('/tasks/1/done?from=sheet');

    expect(response.status).toBe(303);
    expect(stored(1)).toEqual({ ...before, status: 'done', completed_at: NOW, actual_minutes: null, updated_at: NOW });
  });

  it('goes back to the list without from, and still records the minutes', async () => {
    task({ status: 'in_progress', started_at: '2026-10-12T08:21:00.000Z' });
    rows();

    const response = await post('/tasks/1/done?priority=high');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks?priority=high&done=1#task-1');
    expect(stored(1)?.actual_minutes).toBe(75);
  });

  it('keeps any other from out of the list redirect', async () => {
    task();
    rows();

    const response = await post('/tasks/1/done?from=x&priority=high');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks?priority=high&done=1#task-1');
  });
});
