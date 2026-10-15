import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask, getTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf, type DomDocument, type DomElement } from './testing/dom.ts';

/*
 * The sheet's Repeat picker: what it shows (AC8) and what its post stores (AC9). The tasks
 * are stored and every request is made at 1:36 PM on 12 Oct 2026 in Dubai.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

const NO_TITLE = 'Give the task a title.';
const BAD_REPEAT = 'Choose a repeat from the ones offered.';

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

/** A pending `medium` task of 30 minutes titled `A task`, matching `base`, unless `extra` says otherwise. */
function task(extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, {
    title: 'A task',
    status: 'pending',
    priority: 'medium',
    estimated_minutes: 30,
    ...extra,
  });
}

/** The four fields the sheet's form requires, as a default task holds them. */
const base = { title: 'A task', minutes: '30', priority: 'medium', slot: '' };

/** The sheet of a task as it is served. */
async function sheet(id: number): Promise<DomDocument> {
  const response = await request(testApp.app).get(`/tasks/${id}`);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

function post(fields: Record<string, unknown>, id = 1): request.Test {
  return request(testApp.app).post(`/tasks/${id}`).type('form').send({ ...base, ...fields });
}

/** The repeat option the select has selected. */
function selectedRepeat(select: DomElement): string[] {
  return all(select, 'option[selected]').map((option) => option.getAttribute('value') ?? '');
}

/** The values of the checked day boxes. */
function checkedDays(document: DomDocument): string[] {
  return all(document, 'input[name="repeat-days"][checked]').map((box) => box.getAttribute('value') ?? '');
}

describe('the sheet picker is shown (AC8)', () => {
  it('offers the four repeats and the seven days, with the stored rule chosen', async () => {
    task({ recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO,TH' });

    const document = await sheet(1);
    const select = one(document, 'select[name="repeat"]');

    expect(all(select, 'option').map((option) => [option.getAttribute('value'), textOf(option)])).toEqual([
      ['', 'Does not repeat'],
      ['daily', 'Daily'],
      ['weekly', 'Weekly'],
      ['monthly', 'Monthly'],
    ]);
    expect(selectedRepeat(select)).toEqual(['weekly']);

    const boxes = all(document, 'input[name="repeat-days"]');
    expect(boxes.map((box) => box.getAttribute('value'))).toEqual(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
    expect(boxes.map((box) => textOf(box.closest('label') ?? box))).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(boxes.filter((box) => box.hasAttribute('checked')).map((box) => box.getAttribute('value'))).toEqual([
      'MO',
      'TH',
    ]);
  });

  it.each([
    [null, ''],
    ['FREQ=DAILY', 'daily'],
    ['FREQ=MONTHLY', 'monthly'],
  ] as const)('shows %s as %s with no day checked', async (rule, repeat) => {
    task({ recurrence_rule: rule });

    const document = await sheet(1);

    expect(selectedRepeat(one(document, 'select[name="repeat"]'))).toEqual([repeat]);
    expect(checkedDays(document)).toEqual([]);
  });
});

describe('saving the picker (AC9)', () => {
  it.each([
    ['', null],
    ['daily', 'FREQ=DAILY'],
    ['monthly', 'FREQ=MONTHLY'],
  ] as const)('stores repeat %s as %s', async (value, stored) => {
    task({ recurrence_rule: 'FREQ=WEEKLY' });

    const response = await post({ repeat: value });

    expect(response.status).toBe(303);
    expect(getTask(testApp.db, 1)?.recurrence_rule).toBe(stored);
  });

  it('stores plain weekly with no day box, and the chosen days ordered and each once', async () => {
    task();
    expect((await post({ repeat: 'weekly' }, 1)).status).toBe(303);
    expect(getTask(testApp.db, 1)?.recurrence_rule).toBe('FREQ=WEEKLY');

    task();
    expect((await post({ repeat: 'weekly', 'repeat-days': ['TH', 'MO'] }, 2)).status).toBe(303);
    expect(getTask(testApp.db, 2)?.recurrence_rule).toBe('FREQ=WEEKLY;BYDAY=MO,TH');

    task();
    expect((await post({ repeat: 'weekly', 'repeat-days': ['MO', 'MO', 'TH'] }, 3)).status).toBe(303);
    expect(getTask(testApp.db, 3)?.recurrence_rule).toBe('FREQ=WEEKLY;BYDAY=MO,TH');
  });

  it('ignores a day box posted with anything but weekly', async () => {
    task();

    const response = await post({ repeat: 'daily', 'repeat-days': ['MO', 'TH'] });

    expect(response.status).toBe(303);
    expect(getTask(testApp.db, 1)?.recurrence_rule).toBe('FREQ=DAILY');
  });

  it('leaves the stored rule alone when no repeat is posted', async () => {
    task({ recurrence_rule: 'FREQ=DAILY' });

    const response = await post({});

    expect(response.status).toBe(303);
    expect(getTask(testApp.db, 1)?.recurrence_rule).toBe('FREQ=DAILY');
  });

  it('does not move a task when only the repeat changes', async () => {
    task({
      scheduled_start: '2026-10-12T09:40:00.000Z',
      scheduled_end: '2026-10-12T10:10:00.000Z',
    });
    const before = listTasks(testApp.db);

    const response = await post({ repeat: 'daily' });

    expect(response.status).toBe(303);
    expect(getTask(testApp.db, 1)).toEqual({
      ...before[0],
      recurrence_rule: 'FREQ=DAILY',
      updated_at: NOW,
    });
  });

  it.each(['yearly', 'DAILY', 'daily-ish', 'none'] as const)('refuses the repeat %s and stores nothing', async (repeat) => {
    task({ recurrence_rule: 'FREQ=DAILY' });
    const before = listTasks(testApp.db);

    const response = await post({ repeat });

    expect(response.status).toBe(400);
    const document = parseHtml(response.text);
    expect(all(document, '.notice--error p').map(textOf)).toEqual([BAD_REPEAT]);
    expect(one(document, 'select[name="repeat"]').getAttribute('name')).toBe('repeat');
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('refuses a repeat posted more than once', async () => {
    task();
    const before = listTasks(testApp.db);

    const response = await post({ repeat: ['daily', 'daily'] });

    expect(response.status).toBe(400);
    expect(all(parseHtml(response.text), '.notice--error p').map(textOf)).toEqual([BAD_REPEAT]);
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('refuses a bad day box and shows the posted values back', async () => {
    task();
    const before = listTasks(testApp.db);

    const response = await post({ repeat: 'weekly', 'repeat-days': ['XX', 'MO'] });

    expect(response.status).toBe(400);
    const document = parseHtml(response.text);
    expect(selectedRepeat(one(document, 'select[name="repeat"]'))).toEqual(['weekly']);
    expect(checkedDays(document)).toEqual(['MO']);
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('shows the repeat message last, once', async () => {
    task();
    const before = listTasks(testApp.db);

    const response = await post({ title: '', repeat: 'yearly' });

    expect(response.status).toBe(400);
    expect(all(parseHtml(response.text), '.notice--error p').map(textOf)).toEqual([NO_TITLE, BAD_REPEAT]);
    expect(listTasks(testApp.db)).toEqual(before);
  });
});
