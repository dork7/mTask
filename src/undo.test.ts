import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, getTask, updateTask, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { DELETED_TOAST, DONE_TOAST, UNDO_LIMIT } from './services/undo.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf, type DomDocument } from './testing/dom.ts';

/*
 * The undo of Delete (AC6) and of Done (AC7): the redirect keeps its path and names the
 * task, the page it leads to shows a toast with an Undo form, and posting that form puts
 * back what the Delete or the Done changed.
 */

/** 9:00 AM on 11 Oct 2026 in Dubai. */
const STORED = '2026-10-11T05:00:00.000Z';
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

/** 9:00 to 9:30 AM on 11 Oct in Dubai. */
const YESTERDAY = { scheduled_start: '2026-10-11T05:00:00.000Z', scheduled_end: '2026-10-11T05:30:00.000Z' };

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

function task(extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, {
    title: 'A task',
    status: 'pending',
    priority: 'medium',
    estimated_minutes: 30,
    ...extra,
  });
}

function rawRows(): Record<string, unknown>[] {
  return testApp.db
    .prepare('SELECT * FROM tasks ORDER BY id')
    .all()
    .map((row) => ({ ...row }));
}

function rawRow(id: number): Record<string, unknown> | undefined {
  return rawRows().find((row) => row.id === id);
}

function post(address: string): request.Test {
  return request(testApp.app).post(address);
}

async function page(address: string): Promise<DomDocument> {
  const response = await request(testApp.app).get(address);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** The toast of a page: its text, and the action and button of its Undo form. */
function toastOf(document: DomDocument): { message: string; action: string | null; button: string } {
  const toast = one(document, '#live-region .toast');
  const form = one(toast, 'form[method="post"]');
  return {
    message: textOf(one(toast, '.toast__message')),
    action: form.getAttribute('action'),
    button: textOf(one(form, 'button[type="submit"]')),
  };
}

function liveRegionIsEmpty(document: DomDocument): boolean {
  const region = one(document, '#live-region');
  return region.children.length === 0 && textOf(region) === '';
}

describe('Undo Delete (AC6)', () => {
  beforeEach(() => {
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    task({ title: 'First' });
    task({
      title: 'Second',
      description: 'A description',
      category: 'coding',
      priority: 'high',
      time_slot: 'morning',
      reminder_at: '2026-10-12T04:50:00.000Z',
      recurrence_rule: 'FREQ=DAILY',
      parent_task_id: 1,
      source_id: source.id,
      confidence: 0.8,
      ...YESTERDAY,
    });
    vi.setSystemTime(new Date(NOW));
  });

  it('keeps the redirect to the list with its query, naming the deleted task', async () => {
    const response = await post('/tasks/2/delete?priority=medium');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks?priority=medium&deleted=2');
    expect(new URL(response.headers.location, 'http://localhost').pathname).toBe('/tasks');
    expect(rawRow(2)).toBeUndefined();
  });

  it('shows a toast with an Undo form that posts on the page the redirect leads to', async () => {
    const { headers } = await post('/tasks/2/delete?priority=medium');

    const document = await page(headers.location);

    expect(toastOf(document)).toEqual({
      message: DELETED_TOAST,
      action: '/tasks/2/undo-delete?priority=medium',
      button: 'Undo',
    });
  });

  it('brings the task back with the same id and every stored field', async () => {
    const before = rawRow(2);
    await post('/tasks/2/delete?priority=medium');

    const response = await post('/tasks/2/undo-delete?priority=medium');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks?priority=medium#task-2');
    expect(rawRow(2)).toEqual(before);
    expect((await page('/tasks')).querySelector('#task-2')).not.toBeNull();
  });

  it('answers 404 and changes nothing for an undo already done or an unknown id', async () => {
    await post('/tasks/2/delete');
    await post('/tasks/2/undo-delete');
    const rows = rawRows();

    expect((await post('/tasks/2/undo-delete')).status).toBe(404);
    expect((await post('/tasks/99/undo-delete')).status).toBe(404);
    expect((await post('/tasks/x/undo-delete')).status).toBe(404);
    expect(rawRows()).toEqual(rows);
  });

  it('shows no toast once the delete is undone, nor for an id it does not know', async () => {
    await post('/tasks/2/delete');
    await post('/tasks/2/undo-delete');

    expect(liveRegionIsEmpty(await page('/tasks?deleted=2'))).toBe(true);
    expect(liveRegionIsEmpty(await page('/tasks?deleted=99'))).toBe(true);
  });

  it(`keeps the newest ${UNDO_LIMIT} deletes`, async () => {
    const ids: number[] = [];
    for (let i = 0; i < UNDO_LIMIT + 1; i += 1) ids.push(task({ title: `Task ${i}` }).id);
    for (const id of ids) await post(`/tasks/${id}/delete`);

    expect((await post(`/tasks/${ids[0]}/undo-delete`)).status).toBe(404);
    expect((await post(`/tasks/${ids.at(-1)}/undo-delete`)).status).toBe(303);
  });
});

describe('Undo Done (AC7)', () => {
  it('gives a pending task back what it had before the Done from the list', async () => {
    task({ actual_minutes: 7, ...YESTERDAY });
    vi.setSystemTime(new Date(NOW));
    const before = getTask(testApp.db, 1)!;

    const response = await post('/tasks/1/done?priority=medium');
    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks?priority=medium&done=1#task-1');

    const toast = toastOf(await page(response.headers.location));
    expect(toast).toEqual({ message: DONE_TOAST, action: '/tasks/1/undo-done?priority=medium', button: 'Undo' });

    const undo = await post(toast.action!);
    expect(undo.status).toBe(303);
    expect(undo.headers.location).toBe('/tasks?priority=medium#task-1');
    const after = getTask(testApp.db, 1)!;
    expect({ status: after.status, completed_at: after.completed_at, actual_minutes: after.actual_minutes }).toEqual({
      status: before.status,
      completed_at: before.completed_at,
      actual_minutes: before.actual_minutes,
    });
  });

  it('gives an in-progress task back its status and no actual minutes', async () => {
    task({ status: 'in_progress', started_at: STORED });
    vi.setSystemTime(new Date(NOW));

    await post('/tasks/1/done');
    expect(getTask(testApp.db, 1)?.actual_minutes).not.toBeNull();
    await post('/tasks/1/undo-done');

    expect(getTask(testApp.db, 1)).toMatchObject({ status: 'in_progress', completed_at: null, actual_minutes: null });
  });

  it('removes the next instance a recurring task made and gives the rule back', async () => {
    task({ recurrence_rule: 'FREQ=DAILY', ...YESTERDAY });
    vi.setSystemTime(new Date(NOW));

    await post('/tasks/1/done');
    expect(getTask(testApp.db, 2)).toMatchObject({ status: 'pending', parent_task_id: 1 });
    expect(getTask(testApp.db, 1)?.recurrence_rule).toBeNull();

    expect((await post('/tasks/1/undo-done')).status).toBe(303);

    expect(getTask(testApp.db, 2)).toBeUndefined();
    expect(getTask(testApp.db, 1)).toMatchObject({ status: 'pending', recurrence_rule: 'FREQ=DAILY' });
  });

  it('keeps a next instance that was started, and the rule stays with it', async () => {
    task({ recurrence_rule: 'FREQ=DAILY', ...YESTERDAY });
    vi.setSystemTime(new Date(NOW));

    await post('/tasks/1/done');
    expect((await post('/tasks/2/start')).status).toBe(303);
    await post('/tasks/1/undo-done');

    expect(getTask(testApp.db, 2)).toMatchObject({ status: 'in_progress', recurrence_rule: 'FREQ=DAILY' });
    expect(getTask(testApp.db, 1)).toMatchObject({ status: 'pending', recurrence_rule: null });
  });

  it('undoes a Done from the overdue view back to the view', async () => {
    task(YESTERDAY);
    vi.setSystemTime(new Date(NOW));

    const response = await post('/overdue/1/done');
    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/overdue?done=1');

    const toast = toastOf(await page(response.headers.location));
    expect(toast).toEqual({ message: DONE_TOAST, action: '/overdue/1/undo-done', button: 'Undo' });

    const undo = await post(toast.action!);
    expect(undo.status).toBe(303);
    expect(undo.headers.location).toBe('/overdue');
    expect((await page('/overdue')).querySelector('#task-1')).not.toBeNull();
  });

  it('answers 404 and changes nothing for a second undo, or a task no longer done', async () => {
    task(YESTERDAY);
    task(YESTERDAY);
    vi.setSystemTime(new Date(NOW));

    await post('/tasks/1/done');
    await post('/tasks/1/undo-done');
    let rows = rawRows();
    expect((await post('/tasks/1/undo-done')).status).toBe(404);
    expect((await post('/overdue/1/undo-done')).status).toBe(404);
    expect(rawRows()).toEqual(rows);

    await post('/overdue/2/done');
    updateTask(testApp.db, 2, { status: 'pending', completed_at: null });
    rows = rawRows();
    expect((await post('/overdue/2/undo-done')).status).toBe(404);
    expect(liveRegionIsEmpty(await page('/overdue?done=2'))).toBe(true);
    expect(rawRows()).toEqual(rows);
  });

  it('gives Done from the sheet no toast and no undo', async () => {
    task();
    vi.setSystemTime(new Date(NOW));

    const response = await post('/tasks/1/done?from=sheet');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks/1');
    expect(liveRegionIsEmpty(await page('/tasks/1'))).toBe(true);
    expect(liveRegionIsEmpty(await page('/tasks?done=1'))).toBe(true);
    expect((await post('/tasks/1/undo-done')).status).toBe(404);
  });

  it('names no task when a Done writes nothing', async () => {
    task({ status: 'done', completed_at: STORED });
    vi.setSystemTime(new Date(NOW));

    const response = await post('/tasks/1/done');

    expect(response.headers.location).toBe('/tasks#task-1');
    expect(all(await page('/tasks'), '#live-region .toast')).toEqual([]);
  });
});
