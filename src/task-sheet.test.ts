import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, formFields, one, parseHtml, textOf, type DomDocument } from './testing/dom.ts';

/*
 * The detail sheet of a task as it is served: the page, its status, Close and its 404
 * (AC1), the links to it from the list and the timeline (AC2), its edit form filled with
 * the stored values (AC3), and the estimated against actual summary of a done task
 * (AC10). Only `Date` is faked, so a request is made at 1:36 PM in Dubai.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

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

/** Task 1 is pending; task 2 is a draft of a text source. */
function seedWithDraft(): void {
  task();
  const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
  createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id });
}

async function get(address: string): Promise<DomDocument> {
  const response = await request(testApp.app).get(address);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

function sheet(id: number): Promise<DomDocument> {
  return get(`/tasks/${id}`);
}

const NOT_FOUND_IDS = ['2', '99', '01', '1e0', 'abc'];

describe('the sheet (AC1)', () => {
  it('is a page in the layout with the sheet open and the title as text', async () => {
    task({ title: '<b>x</b>' });

    const document = await sheet(1);

    expect(textOf(one(document, 'title'))).toBe('<b>x</b> - Task Image AI');
    expect(one(document, 'a[aria-current="page"]').getAttribute('href')).toBe('/tasks');
    const overlay = one(document, '#task-sheet');
    expect(overlay.classList.contains('overlay')).toBe(true);
    expect(overlay.classList.contains('overlay--sheet')).toBe(true);
    expect(overlay.hasAttribute('hidden')).toBe(false);
    const dialog = one(overlay, '.sheet[role="dialog"]');
    expect(textOf(one(dialog, '#task-sheet-title'))).toBe('<b>x</b>');
    expect(all(overlay, 'b')).toEqual([]);
  });

  it.each([
    ['pending', 'Pending'],
    ['in_progress', 'In progress'],
    ['done', 'Done'],
  ] as const)('shows the status %s as %s', async (status, label) => {
    task({ status });

    expect(textOf(one(await sheet(1), '.task-sheet__status'))).toBe(label);
  });

  it('has a Close link back to the card', async () => {
    task();

    const links = all(one(await sheet(1), '#task-sheet'), 'a').filter((link) => textOf(link) === 'Close');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/tasks#task-1');
  });

  it.each(NOT_FOUND_IDS)('answers 404 for /tasks/%s', async (id) => {
    seedWithDraft();

    const response = await request(testApp.app).get(`/tasks/${id}`);

    expect(response.status).toBe(404);
    expect(textOf(one(parseHtml(response.text), 'main h1'))).toBe('Page not found');
  });
});

describe('the ways in (AC2)', () => {
  it('links each card title on the list to the sheet', async () => {
    task({ title: 'First' });
    task({ title: 'Second' });

    const document = await get('/tasks');

    const first = one(document, '#task-1 .task__title a');
    expect(first.getAttribute('href')).toBe('/tasks/1');
    expect(textOf(first)).toBe('First');
    expect(one(document, '#task-2 .task__title a').getAttribute('href')).toBe('/tasks/2');
  });

  it('links each block of the timeline to the sheet, keeping its glyph first and its classes', async () => {
    task({ scheduled_start: dubai('09:00'), scheduled_end: dubai('10:00') });
    task({ priority: 'urgent', scheduled_start: dubai('11:00'), scheduled_end: dubai('12:00') });

    const document = await get('/timeline');

    const first = one(document, '#block-1');
    const second = one(document, '#block-2');
    expect(all(first, 'a').map((link) => link.getAttribute('href'))).toEqual(['/tasks/1']);
    expect(all(second, 'a').map((link) => link.getAttribute('href'))).toEqual(['/tasks/2']);
    expect(textOf(second).startsWith('▲')).toBe(true);
    expect(first.classList.contains('blk')).toBe(true);
    expect(first.classList.contains('k-medium')).toBe(true);
    expect(second.classList.contains('blk')).toBe(true);
    expect(second.classList.contains('k-urgent')).toBe(true);
  });
});

describe('the edit fields (AC3)', () => {
  it('posts to the sheet and holds the stored values, the reminder on the Dubai clock', async () => {
    task({
      title: 'Call',
      estimated_minutes: 45,
      priority: 'high',
      time_slot: 'evening',
      category: 'calls',
      description: 'About it',
      reminder_at: '2026-10-12T16:00:00.000Z',
    });

    const document = await sheet(1);

    const form = one(document, 'form.edit-form');
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/tasks/1');
    expect(formFields(form)).toEqual({
      title: 'Call',
      minutes: '45',
      priority: 'high',
      slot: 'evening',
      repeat: '',
      category: 'calls',
      reminder: '2026-10-12T20:00',
    });
    const description = one(form, '#sheet-description');
    expect(description.tagName).toBe('TEXTAREA');
    expect(description.getAttribute('name')).toBe('description');
    expect(description.textContent).toBe('About it');
    expect(one(form, '#sheet-reminder').getAttribute('type')).toBe('datetime-local');
  });

  it('leaves the optional fields empty when nothing is stored', async () => {
    task();

    const form = one(await sheet(1), 'form.edit-form');

    expect(formFields(form)).toMatchObject({ slot: '', category: '', reminder: '' });
    expect(one(form, '#sheet-description').textContent).toBe('');
  });
});

describe('estimated against actual (AC10)', () => {
  it('shows the summary and the completion time of a done task, and the edit form', async () => {
    task({ status: 'done', estimated_minutes: 30, actual_minutes: 75, completed_at: '2026-10-12T09:36:00.000Z' });

    const document = await sheet(1);

    expect(textOf(one(document, '.task-sheet__summary'))).toBe('Estimated 30 min, actual 75 min');
    expect(textOf(one(document, '.task-sheet__completed'))).toBe('Completed Today 1:36 PM');
    expect(all(document, 'form.edit-form')).toHaveLength(1);
  });

  it('writes the task own minutes', async () => {
    task({ status: 'done', estimated_minutes: 45, actual_minutes: 20, completed_at: NOW });

    expect(textOf(one(await sheet(1), '.task-sheet__summary'))).toBe('Estimated 45 min, actual 20 min');
  });

  it.each([
    ['estimated_minutes', { estimated_minutes: null, actual_minutes: 75 }],
    ['actual_minutes', { estimated_minutes: 30, actual_minutes: null }],
  ])('shows no summary without %s', async (_name, minutes) => {
    task({ status: 'done', completed_at: NOW, ...minutes });

    const document = await sheet(1);

    expect(all(document, '.task-sheet__summary')).toEqual([]);
    expect(textOf(one(document, '#task-sheet'))).not.toContain('Estimated');
  });

  it('shows no completion time for a done task without one', async () => {
    task({ status: 'done', actual_minutes: 75 });

    expect(all(await sheet(1), '.task-sheet__completed')).toEqual([]);
  });

  it('shows no summary for a pending task', async () => {
    task({ actual_minutes: 75 });

    expect(all(await sheet(1), '.task-sheet__summary')).toEqual([]);
  });

  it('shows the minutes a task took from Start to Done', async () => {
    vi.setSystemTime(new Date('2026-10-12T08:21:00.000Z'));
    task();
    expect((await request(testApp.app).post('/tasks/1/start')).status).toBe(303);
    vi.setSystemTime(new Date(NOW));

    const done = await request(testApp.app).post('/tasks/1/done?from=sheet');
    expect(done.status).toBe(303);

    const document = await get(done.headers.location);
    expect(textOf(one(document, '.task-sheet__summary'))).toBe('Estimated 30 min, actual 75 min');
  });
});
