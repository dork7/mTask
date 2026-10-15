import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource, type Source } from './db/sources.ts';
import { createTask, getTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, formFields, one, parseHtml, textOf, type DomDocument, type DomElement } from './testing/dom.ts';

/*
 * The review cards' Repeat pickers (AC10): what each shows, what a confirm and a Remove
 * store, and what a bad value refuses. The drafts are written straight into the database
 * and every request is made at 1:36 PM on 12 Oct 2026 in Dubai.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

const NO_TITLE = 'Give every task a title.';
const BAD_REPEAT = 'Choose every repeat from the ones offered.';

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

/** A photo source with three drafts: task 1 `daily`, task 2 `weekly` on MO and TH, task 3 no rule. */
function seed(): { source: Source; drafts: Task[] } {
  const source = createSource(testApp.db, { kind: 'photo', image_path: '/uploads/list.png' });
  const extra: Partial<NewTask>[] = [
    { title: 'One', recurrence_rule: 'FREQ=DAILY' },
    { title: 'Two', recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO,TH' },
    { title: 'Three' },
  ];
  const drafts = extra.map((fields) =>
    createTask(testApp.db, {
      title: 'A task',
      estimated_minutes: 30,
      priority: 'medium',
      status: 'draft',
      source_id: source.id,
      ...fields,
    }),
  );
  return { source, drafts };
}

/** The review page of a source as it is served. */
async function served(sourceId: number): Promise<DomDocument> {
  const response = await request(testApp.app).get(`/review/${sourceId}`);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** What a browser would post for the served review form. */
async function fieldsOf(sourceId: number): Promise<Record<string, string>> {
  return formFields(one(await served(sourceId), 'main form'));
}

function post(address: string, fields: Record<string, unknown>): request.Test {
  return request(testApp.app).post(address).type('form').send(fields);
}

function cardOf(document: DomDocument, id: number): DomElement {
  return one(document, `[data-draft="${id}"]`);
}

/** The repeat option a card's select has selected. */
function selectedRepeat(card: DomElement, id: number): string[] {
  return all(one(card, `select[name="repeat-${id}"]`), 'option[selected]').map((option) => option.getAttribute('value') ?? '');
}

/** The values of a card's checked day boxes. */
function checkedDays(card: DomElement, id: number): string[] {
  return all(card, `input[name="repeat-days-${id}"][checked]`).map((box) => box.getAttribute('value') ?? '');
}

describe("the review card's picker (AC10)", () => {
  it('gives each card its picker, with the stored rule chosen and its days checked', async () => {
    const { source, drafts } = seed();

    const document = await served(source.id);

    for (const draft of drafts) {
      const card = cardOf(document, draft.id);
      const select = one(card, `select[name="repeat-${draft.id}"]`);

      expect(all(select, 'option').map((option) => [option.getAttribute('value'), textOf(option)])).toEqual([
        ['', 'Does not repeat'],
        ['daily', 'Daily'],
        ['weekly', 'Weekly'],
        ['monthly', 'Monthly'],
      ]);
      expect(all(card, `input[name="repeat-days-${draft.id}"]`)).toHaveLength(7);
    }

    expect(selectedRepeat(cardOf(document, 1), 1)).toEqual(['daily']);
    expect(checkedDays(cardOf(document, 1), 1)).toEqual([]);
    expect(selectedRepeat(cardOf(document, 2), 2)).toEqual(['weekly']);
    expect(checkedDays(cardOf(document, 2), 2)).toEqual(['MO', 'TH']);
    expect(selectedRepeat(cardOf(document, 3), 3)).toEqual(['']);
    expect(checkedDays(cardOf(document, 3), 3)).toEqual([]);
  });

  it('a confirm stores the posted rules, places the tasks and makes no instance', async () => {
    const { source } = seed();
    const fields = await fieldsOf(source.id);

    const response = await post(`/review/${source.id}/confirm`, {
      ...fields,
      'repeat-1': 'weekly',
      'repeat-days-1': ['TH', 'MO'],
      'repeat-2': 'daily',
    });

    expect(response.status).toBe(303);
    const rows = listTasks(testApp.db);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.recurrence_rule)).toEqual(['FREQ=WEEKLY;BYDAY=MO,TH', 'FREQ=DAILY', null]);
    expect(rows.every((row) => row.status === 'pending')).toBe(true);
    expect(rows.every((row) => row.scheduled_start !== null)).toBe(true);
    expect(rows.every((row) => row.parent_task_id === null)).toBe(true);
  });

  it('confirms a draft as a pending task with plain weekly and a stored time', async () => {
    const { source } = seed();
    const fields = await fieldsOf(source.id);

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'repeat-3': 'weekly' });

    expect(response.status).toBe(303);
    expect(getTask(testApp.db, 3)).toMatchObject({ status: 'pending', recurrence_rule: 'FREQ=WEEKLY' });
    expect(getTask(testApp.db, 3)?.scheduled_start).not.toBeNull();
  });

  it('leaves the stored rule when no repeat is posted for a card', async () => {
    const { source } = seed();
    const fields = await fieldsOf(source.id);
    const rest: Record<string, string> = { ...fields };
    delete rest['repeat-1'];

    const response = await post(`/review/${source.id}/confirm`, rest);

    expect(response.status).toBe(303);
    expect(getTask(testApp.db, 1)?.recurrence_rule).toBe('FREQ=DAILY');
  });

  it('a Remove stores the other cards posted rules', async () => {
    const { source } = seed();
    const fields = await fieldsOf(source.id);

    const response = await post(`/review/${source.id}/remove/2`, { ...fields, 'repeat-1': 'monthly' });

    expect(response.status).toBe(303);
    expect(getTask(testApp.db, 1)).toMatchObject({ recurrence_rule: 'FREQ=MONTHLY', status: 'draft' });
    expect(getTask(testApp.db, 2)).toBeUndefined();
  });

  it('refuses a bad repeat and stores nothing', async () => {
    const { source } = seed();
    const fields = await fieldsOf(source.id);
    const before = listTasks(testApp.db);

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'repeat-1': 'yearly' });

    expect(response.status).toBe(400);
    expect(textOf(one(parseHtml(response.text), '.notice--error'))).toContain(BAD_REPEAT);
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('shows the repeat message last, once', async () => {
    const { source } = seed();
    const fields = await fieldsOf(source.id);
    const before = listTasks(testApp.db);

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'title-2': '', 'repeat-1': 'yearly' });

    expect(response.status).toBe(400);
    expect(all(parseHtml(response.text), '.notice--error p').map(textOf)).toEqual([NO_TITLE, BAD_REPEAT]);
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('refuses a repeat posted more than once', async () => {
    const { source } = seed();
    const fields = await fieldsOf(source.id);
    const before = listTasks(testApp.db);

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'repeat-1': ['daily', 'daily'] });

    expect(response.status).toBe(400);
    expect(listTasks(testApp.db)).toEqual(before);
  });

  it('refuses a bad day box and shows the posted values back', async () => {
    const { source } = seed();
    const fields = await fieldsOf(source.id);
    const before = listTasks(testApp.db);

    const response = await post(`/review/${source.id}/confirm`, {
      ...fields,
      'repeat-1': 'weekly',
      'repeat-days-1': ['XX', 'MO'],
    });

    expect(response.status).toBe(400);
    const document = parseHtml(response.text);
    expect(selectedRepeat(cardOf(document, 1), 1)).toEqual(['weekly']);
    expect(checkedDays(cardOf(document, 1), 1)).toEqual(['MO']);
    expect(listTasks(testApp.db)).toEqual(before);
  });
});
