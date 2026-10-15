import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';

/*
 * Completing a recurring task (AC4): every route that marks a task done makes its next
 * instance in the same transaction. The clock is 9:00 PM on 12 Oct 2026 in Dubai, so the
 * weekly groceries of the spec are overdue and every write lands at `DONE`.
 */

/** 9:00 PM on 12 Oct 2026 in Dubai. */
const DONE = '2026-10-12T17:00:00.000Z';

let testApp: TestApp;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(DONE));
  testApp = createTestApp({ analyze: vi.fn<Analyze>() });
});

afterEach(() => {
  testApp.close();
  vi.useRealTimers();
});

/** The `Weekly groceries` task of the spec: task 1, pending on 12 Oct, `weekly` on its own day. */
function groceries(extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, {
    title: 'Weekly groceries',
    category: 'shopping',
    priority: 'medium',
    time_slot: 'night',
    estimated_minutes: 40,
    recurrence_rule: 'FREQ=WEEKLY',
    status: 'pending',
    scheduled_start: '2026-10-12T16:00:00.000Z',
    scheduled_end: '2026-10-12T16:40:00.000Z',
    ...extra,
  });
}

/** The next instance the run should make from `groceries()`. */
const NEXT = {
  title: 'Weekly groceries',
  description: null,
  image_path: null,
  category: 'shopping',
  estimated_minutes: 40,
  actual_minutes: null,
  priority: 'medium',
  time_slot: 'night',
  scheduled_start: '2026-10-19T16:00:00.000Z',
  scheduled_end: '2026-10-19T16:40:00.000Z',
  status: 'pending',
  started_at: null,
  completed_at: null,
  reminder_at: null,
  recurrence_rule: 'FREQ=WEEKLY',
  parent_task_id: 1,
  source_id: null,
  confidence: null,
};

/** Every task as it is now, with the clock already at `DONE`. */
function rows(): Task[] {
  return listTasks(testApp.db);
}

function post(address: string): request.Test {
  return request(testApp.app).post(address);
}

describe('completing makes the next one (AC4)', () => {
  it.each([
    ['/tasks/1/done', '/tasks#task-1'],
    ['/tasks/1/done?from=sheet', '/tasks/1'],
    ['/overdue/1/done', '/overdue'],
  ])('from %s: the task is done and its next instance placed', async (address, location) => {
    groceries();
    const [before] = rows();

    const response = await post(address);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe(location);

    const stored = rows();
    expect(stored).toHaveLength(2);
    expect(stored[0]).toEqual({
      ...before,
      status: 'done',
      completed_at: DONE,
      recurrence_rule: null,
      updated_at: DONE,
    });
    expect(stored[1]).toMatchObject({ ...NEXT, id: 2, created_at: DONE, updated_at: DONE });
  });

  it('makes nothing from a task that is done already', async () => {
    groceries({ status: 'done' });
    const before = rows();

    const response = await post('/tasks/1/done');

    expect(response.status).toBe(303);
    expect(rows()).toEqual(before);
  });

  it('makes nothing from a task with no rule', async () => {
    const plain = createTask(testApp.db, {
      title: 'A task',
      status: 'pending',
      estimated_minutes: 30,
      scheduled_start: '2026-10-12T16:00:00.000Z',
      scheduled_end: '2026-10-12T16:40:00.000Z',
    });

    const response = await post('/tasks/1/done');

    expect(response.status).toBe(303);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ id: plain.id, status: 'done', recurrence_rule: null });
  });

  it('makes nothing from a draft, which the route does not even show', async () => {
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id });

    const response = await post('/tasks/1/done');

    expect(response.status).toBe(404);
    expect(rows()).toHaveLength(1);
  });

  it('is all or none: a refused insert rolls the Done back', async () => {
    groceries();
    const before = rows();
    testApp.db.exec(
      "CREATE TRIGGER refuse_insert BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'refused by the test'); END",
    );

    const response = await post('/tasks/1/done');

    expect(response.status).toBe(500);
    expect(rows()).toEqual(before);
  });
});
