import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource, getSource } from './db/sources.ts';
import { createTask, getTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, formFields, one, parseHtml, textOf, type DomDocument } from './testing/dom.ts';
import { priorities, slots } from './ui.ts';

/*
 * The edit page of a task, its post, and Delete. The tasks are stored at `STORED`, a day
 * before; `rows()` reads every task and then moves the clock to `NOW`, so a request after
 * it is made at 1:36 PM in Dubai and any write shows in `updated_at`. "As it was" below
 * means not even that changed.
 */

/** 9:00 AM on 11 Oct 2026 in Dubai. */
const STORED = '2026-10-11T05:00:00.000Z';
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

const NO_TITLE = 'Give the task a title.';
const BAD_MINUTES = 'Set the duration to a whole number of minutes from 1 to 1440.';
const BAD_CHOICE = 'Choose a priority and a slot from the ones offered.';

type Fields = Record<string, string>;

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

/** The edit page of a task, as it is served. */
async function editPage(id = 1): Promise<DomDocument> {
  const response = await request(testApp.app).get(`/tasks/${id}/edit`);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** Posts the edit form of a task: fields as an object, or a body written out. */
function postEdit(fields: Fields | string, id = 1): request.Test {
  return request(testApp.app).post(`/tasks/${id}/edit`).type('form').send(fields);
}

/** The messages of the error notice of a page. */
function messages(document: DomDocument): string[] {
  return all(document, '[role="alert"] p').map((element) => textOf(element));
}

const VALID: Fields = { title: 'A task', minutes: '30', priority: 'medium', slot: '' };

describe('the edit page (AC10)', () => {
  it.each(['', '?priority=medium&sort=newest'])('is linked from the card as /tasks/1/edit on /tasks%s', async (query) => {
    task();
    rows();

    const response = await request(testApp.app).get(`/tasks${query}`);
    const edit = all(one(parseHtml(response.text), '#task-1'), 'a').filter((link) => textOf(link) === 'Edit');

    expect(edit.map((link) => link.getAttribute('href'))).toEqual(['/tasks/1/edit']);
  });

  it('is a form posting to its own path, filled with the stored values, with Delete and a link back', async () => {
    task({ title: 'Call', estimated_minutes: 20, priority: 'high' });
    rows();

    const document = await editPage();

    const form = one(document, 'form.edit-form');
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/tasks/1/edit');
    expect(one(form, 'input[name="title"]').getAttribute('type')).toBe('text');
    expect(all(form, 'input[name="minutes"]')).toHaveLength(1);
    expect(formFields(form)).toEqual({ title: 'Call', minutes: '20', priority: 'high', slot: '' });
    expect(all(form, 'input[type="radio"][name="priority"]').map((input) => input.getAttribute('value'))).toEqual(
      priorities.map((item) => item.id),
    );
    expect(all(form, 'input[type="radio"][name="slot"]').map((input) => input.getAttribute('value'))).toEqual([
      '',
      ...slots.map((item) => item.id),
    ]);
    const remove = one(document, 'form[action="/tasks/1/delete"]');
    expect(remove.getAttribute('method')).toBe('post');
    expect(textOf(one(remove, 'button[type="submit"]'))).toBe('Delete');
    expect(all(document, 'main a[href="/tasks"]')).toHaveLength(1);
  });

  it('checks the stored slot', async () => {
    task({ time_slot: 'evening' });
    rows();

    const checked = all(await editPage(), 'input[name="slot"][checked]');

    expect(checked.map((input) => input.getAttribute('value'))).toEqual(['evening']);
  });
});

describe('the edit post (AC11)', () => {
  it('stores the trimmed title, minutes, priority and empty slot, places the task again, and goes to its card', async () => {
    task({ category: 'calls', description: 'About it', confidence: 0.8, ...YESTERDAY });
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    testApp.db.prepare('UPDATE tasks SET source_id = ? WHERE id = 1').run(source.id);
    const [before] = rows();

    const response = await postEdit({ title: '  New  ', minutes: '45', priority: 'low', slot: '' });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks#task-1');
    expect(stored(1)).toEqual({
      ...before,
      title: 'New',
      estimated_minutes: 45,
      priority: 'low',
      time_slot: null,
      scheduled_start: '2026-10-12T09:40:00.000Z',
      scheduled_end: '2026-10-12T10:25:00.000Z',
      updated_at: NOW,
    });
    expect(before).toMatchObject({ category: 'calls', description: 'About it', source_id: source.id, confidence: 0.8 });
  });

  it('keeps the times when only the title changed', async () => {
    task(YESTERDAY);
    const [before] = rows();

    const response = await postEdit({ ...VALID, title: 'Renamed' });

    expect(response.status).toBe(303);
    expect(stored(1)).toEqual({ ...before, title: 'Renamed', updated_at: NOW });
  });

  it.each([
    ['the minutes', { minutes: '45' }],
    ['the priority', { priority: 'high' }],
    ['the slot', { slot: 'night' }],
  ])('places the task again when only %s changed', async (_name, change) => {
    task(YESTERDAY);
    rows();

    const response = await postEdit({ ...VALID, ...change });

    expect(response.status).toBe(303);
    const start = stored(1)?.scheduled_start ?? '';
    expect(start).not.toBe(YESTERDAY.scheduled_start);
    expect(start >= NOW).toBe(true);
  });

  it.each(['in_progress', 'done'] as const)('keeps the times and the status of a task that is %s', async (status) => {
    task({ status, ...YESTERDAY });
    const [before] = rows();

    const response = await postEdit({ ...VALID, minutes: '45' });

    expect(response.status).toBe(303);
    expect(stored(1)).toEqual({ ...before, estimated_minutes: 45, updated_at: NOW });
  });

  it('leaves the times of a form posted back as it was served', async () => {
    task({ time_slot: 'morning', ...YESTERDAY });
    const [before] = rows();

    const response = await postEdit(formFields(one(await editPage(), 'form.edit-form')));

    expect(response.status).toBe(303);
    expect(stored(1)).toEqual({ ...before, updated_at: NOW });
  });
});

describe('a refused edit (AC12)', () => {
  it('answers 400 with each message once, in order, the posted title and minutes, and stores nothing', async () => {
    task(YESTERDAY);
    const before = rows();

    const response = await postEdit('title=%20&minutes=0&priority=loud&slot=dawn');
    const document = parseHtml(response.text);

    expect(response.status).toBe(400);
    expect(messages(document)).toEqual([NO_TITLE, BAD_MINUTES, BAD_CHOICE]);
    expect(formFields(one(document, 'form.edit-form'))).toEqual({
      title: ' ',
      minutes: '0',
      priority: 'medium',
      slot: '',
    });
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it.each([
    ['an empty title', { ...VALID, title: '' }, NO_TITLE],
    ['1441 minutes', { ...VALID, minutes: '1441' }, BAD_MINUTES],
    ['2.5 minutes', { ...VALID, minutes: '2.5' }, BAD_MINUTES],
    ['minutes that are not a number', { ...VALID, minutes: 'abc' }, BAD_MINUTES],
    ['no priority', { title: 'A task', minutes: '30', slot: '' }, BAD_CHOICE],
    ['an unknown slot', { ...VALID, slot: 'dawn' }, BAD_CHOICE],
    ['no slot field', { title: 'A task', minutes: '30', priority: 'medium' }, BAD_CHOICE],
  ])('refuses %s with its message only', async (_name, fields, message) => {
    task(YESTERDAY);
    const before = rows();

    const response = await postEdit(fields);

    expect(response.status).toBe(400);
    expect(messages(parseHtml(response.text))).toEqual([message]);
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('refuses a repeated title with the title message', async () => {
    task();
    rows();

    const response = await postEdit('title=a&title=b&minutes=30&priority=medium&slot=');

    expect(response.status).toBe(400);
    expect(messages(parseHtml(response.text))).toEqual([NO_TITLE]);
  });

  it('refuses a post with no body with all three messages', async () => {
    task();
    rows();

    const response = await request(testApp.app).post('/tasks/1/edit');

    expect(response.status).toBe(400);
    expect(messages(parseHtml(response.text))).toEqual([NO_TITLE, BAD_MINUTES, BAD_CHOICE]);
  });

  it('checks the posted priority on the page of a refused post', async () => {
    task();
    rows();

    const response = await postEdit({ ...VALID, title: '', priority: 'urgent' });

    expect(response.status).toBe(400);
    expect(formFields(one(parseHtml(response.text), 'form.edit-form'))).toMatchObject({ priority: 'urgent' });
  });
});

describe('Delete (AC13)', () => {
  it('is a form on the card that carries the list query', async () => {
    task();
    rows();

    const response = await request(testApp.app).get('/tasks?priority=medium');
    const card = one(parseHtml(response.text), '#task-1');
    const remove = all(card, 'form').filter((form) => textOf(form) === 'Delete');

    expect(remove.map((form) => [form.getAttribute('method'), form.getAttribute('action')])).toEqual([
      ['post', '/tasks/1/delete?priority=medium'],
    ]);
  });

  it('deletes the task row only, and goes back to the list with its query', async () => {
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    task({ source_id: source.id });
    task();
    const before = rows();

    const response = await request(testApp.app).post('/tasks/1/delete?priority=medium');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks?priority=medium');
    expect(listTasks(testApp.db)).toEqual([before[1]]);
    expect(getSource(testApp.db, source.id)).toEqual(source);
  });

  it('goes back to the bare list from the edit page', async () => {
    task();
    rows();

    const response = await request(testApp.app).post('/tasks/1/delete');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks');
    expect(stored(1)).toBeUndefined();
  });

  it('leaves the photo file of the task', async () => {
    mkdirSync(testApp.uploadsDir, { recursive: true });
    const file = path.join(testApp.uploadsDir, 'list.png');
    writeFileSync(file, 'png');
    const source = createSource(testApp.db, { kind: 'photo', image_path: '/uploads/list.png' });
    task({ source_id: source.id, image_path: '/uploads/list.png' });
    rows();

    const response = await request(testApp.app).post('/tasks/1/delete');

    expect(response.status).toBe(303);
    expect(stored(1)).toBeUndefined();
    expect(existsSync(file)).toBe(true);
    expect(getSource(testApp.db, source.id)).toEqual(source);
  });
});
