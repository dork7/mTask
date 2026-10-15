import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, getTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, formFields, one, parseHtml, textOf } from './testing/dom.ts';

/*
 * The sheet's edit post: what a valid one stores (AC4) and what a refused one shows and
 * leaves alone (AC5). The tasks are stored at `STORED`, a day before; `rows()` reads
 * every task and then moves the clock to `NOW`, so a request after it is made at 1:36 PM
 * in Dubai and any write shows in `updated_at`.
 */

/** 9:00 AM on 11 Oct 2026 in Dubai. */
const STORED = '2026-10-11T05:00:00.000Z';
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

const BAD_REMINDER = 'Set the reminder as a date and time, or leave it empty.';

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

function postSheet(address: string, body: Record<string, string>): request.Test {
  return request(testApp.app).post(address).type('form').send(body);
}

const VALID = { title: 'New', minutes: '45', priority: 'low', slot: '' };

describe('a valid post (AC4)', () => {
  it('stores the seven fields, the reminder read on the Dubai clock, and nothing else', async () => {
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    task({
      status: 'in_progress',
      started_at: STORED,
      source_id: source.id,
      confidence: 0.8,
      actual_minutes: 5,
      category: 'old',
    });
    const [before] = rows();

    const response = await postSheet('/tasks/1', {
      title: '  Call  ',
      minutes: '45',
      priority: 'low',
      slot: 'night',
      category: '  calls ',
      description: ' line one\r\nline two ',
      reminder: '2026-10-12T20:00',
    });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks/1');
    expect(stored(1)).toEqual({
      ...before,
      title: 'Call',
      estimated_minutes: 45,
      priority: 'low',
      time_slot: 'night',
      category: 'calls',
      description: 'line one\nline two',
      reminder_at: '2026-10-12T16:00:00.000Z',
      updated_at: NOW,
    });
  });

  it('stores empty optional fields as null', async () => {
    task({ category: 'calls', description: 'About it', reminder_at: '2026-10-12T16:00:00.000Z' });
    rows();

    const response = await postSheet('/tasks/1', { ...VALID, category: '', description: '  ', reminder: '' });

    expect(response.status).toBe(303);
    expect(stored(1)).toMatchObject({ category: null, description: null, reminder_at: null });
  });

  it('accepts a reminder in the past', async () => {
    task();
    rows();

    const response = await postSheet('/tasks/1', { ...VALID, reminder: '2026-10-01T09:00' });

    expect(response.status).toBe(303);
    expect(stored(1)?.reminder_at).toBe('2026-10-01T05:00:00.000Z');
  });

  it('places a pending task again when its minutes change, as the edit page does', async () => {
    task({ scheduled_start: dubai('09:00', -1), scheduled_end: dubai('09:30', -1) });
    rows();

    const response = await postSheet('/tasks/1', { title: 'A task', minutes: '20', priority: 'medium', slot: '' });

    expect(response.status).toBe(303);
    expect(stored(1)).toMatchObject({
      scheduled_start: '2026-10-12T09:40:00.000Z',
      scheduled_end: '2026-10-12T10:00:00.000Z',
    });
  });

  it('keeps the times when only the title changes', async () => {
    task({ scheduled_start: dubai('09:00', -1), scheduled_end: dubai('09:30', -1) });
    rows();

    const response = await postSheet('/tasks/1', { title: 'Renamed', minutes: '30', priority: 'medium', slot: '' });

    expect(response.status).toBe(303);
    expect(stored(1)).toMatchObject({
      title: 'Renamed',
      scheduled_start: dubai('09:00', -1),
      scheduled_end: dubai('09:30', -1),
    });
  });
});

describe('a refused post (AC5)', () => {
  it.each(['2026-02-30T10:00', '2026-10-12T24:00', '2026-10-12T20:60', '2026-10-12 20:00', '2026-10-12T20:00:00', 'tomorrow'])(
    'refuses the reminder "%s" and stores nothing',
    async (reminder) => {
      task();
      const before = rows();

      const response = await postSheet('/tasks/1', { ...VALID, reminder });

      expect(response.status).toBe(400);
      const document = parseHtml(response.text);
      expect(all(document, '.notice--error p').map(textOf)).toEqual([BAD_REMINDER]);
      expect(one(document, '#sheet-reminder').getAttribute('value')).toBe(reminder);
      expect(listTasks(testApp.db)).toEqual(before);
    },
  );

  it('shows every message once, the reminder last, and the posted values', async () => {
    task();
    const before = rows();

    const response = await postSheet('/tasks/1', {
      title: ' ',
      minutes: 'x',
      priority: 'bogus',
      slot: 'night',
      category: 'c',
      description: 'd',
      reminder: 'nope',
    });

    expect(response.status).toBe(400);
    const document = parseHtml(response.text);
    expect(all(document, '.notice--error p').map(textOf)).toEqual([
      'Give the task a title.',
      'Set the duration to a whole number of minutes from 1 to 1440.',
      'Choose a priority and a slot from the ones offered.',
      BAD_REMINDER,
    ]);
    const form = one(document, 'form.edit-form');
    expect(formFields(form)).toMatchObject({ minutes: 'x', category: 'c', reminder: 'nope' });
    expect(one(form, '#sheet-description').textContent).toBe('d');
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('shows a category that was not posted as empty', async () => {
    task({ category: 'calls' });
    rows();

    const response = await postSheet('/tasks/1', { ...VALID, title: ' ' });

    expect(response.status).toBe(400);
    expect(one(parseHtml(response.text), '#sheet-category').getAttribute('value')).toBe('');
  });

  it('takes a post of the edit page fields alone, and leaves the edit page as it was', async () => {
    task({ category: 'calls' });
    task({ category: 'calls' });
    rows();

    const sheetPost = await postSheet('/tasks/1', VALID);
    expect(sheetPost.status).toBe(303);
    expect(stored(1)).toMatchObject({ category: null, description: null, reminder_at: null });

    const editPost = await postSheet('/tasks/2/edit', VALID);
    expect(editPost.status).toBe(303);
    expect(editPost.headers.location).toBe('/tasks#task-2');
    expect(stored(2)?.category).toBe('calls');
  });

  it.each(['2', '99', '01', '1e0', 'abc'])('answers 404 for a post to /tasks/%s and changes no row', async (id) => {
    task();
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id });
    const before = rows();

    const response = await postSheet(`/tasks/${id}`, VALID);

    expect(response.status).toBe(404);
    expect(listTasks(testApp.db)).toEqual(before);
  });
});
