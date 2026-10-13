import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource, getSource, type Source } from './db/sources.ts';
import { createTask, getTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { AnalyzedTask, Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, formFields, one, parseHtml, textOf, type DomDocument } from './testing/dom.ts';

/*
 * The posts of the review page: confirm, remove and discard. The drafts are written
 * straight into the database, except where a test needs the photo file of a real upload.
 *
 * Only `Date` is faked. The drafts are stored at `T`; `rows()` reads every task and then
 * moves the clock on, so a write that changes nothing else still shows in `updated_at`,
 * and "unchanged" below means that not even that happened.
 */

const T = '2026-03-04T05:06:07.089Z';
const LATER = '2026-03-04T06:06:07.089Z';

const NO_TITLE = 'Give every task a title.';
const BAD_MINUTES = 'Set every duration to a whole number of minutes from 1 to 1440.';
const BAD_CHOICE = 'Choose every priority and every slot from the ones offered.';

const bug: AnalyzedTask = {
  title: 'Finish login bug fix',
  description: 'Before Friday',
  category: 'coding',
  estimated_minutes: 90,
  urgency: 'high',
  confidence: 0.9,
};

const milk: AnalyzedTask = {
  title: 'Buy milk, eggs, bread',
  description: '',
  category: 'shopping',
  estimated_minutes: 40,
  urgency: 'medium',
  confidence: 0.5,
};

const bank: AnalyzedTask = {
  title: 'Call the bank',
  description: '',
  category: 'personal',
  estimated_minutes: 15,
  urgency: 'low',
  confidence: 0.49,
};

type Fields = Record<string, string>;

/** The two columns of a task the scheduler placed on 4 March 2026, from `HH:MM` on the UTC clock. */
function scheduled(start: string, end: string): Pick<Task, 'scheduled_start' | 'scheduled_end'> {
  return { scheduled_start: `2026-03-04T${start}:00.000Z`, scheduled_end: `2026-03-04T${end}:00.000Z` };
}

/**
 * Where a confirm at `LATER` puts `bug`, `milk` and `bank` as they are seeded. `LATER` is
 * 10:06 AM in Dubai, so the first mark is 10:10 AM, which is 06:10 UTC; the tasks go by
 * priority, which is also their order, and each starts where the one before it ends.
 */
const SEEDED_TIMES = [scheduled('06:10', '07:40'), scheduled('07:40', '08:20'), scheduled('08:20', '08:35')];

/** The same with the first task at 95 minutes. */
const EDITED_TIMES = [scheduled('06:10', '07:45'), scheduled('07:45', '08:25'), scheduled('08:25', '08:40')];

let testApp: TestApp;
let analyze: ReturnType<typeof vi.fn<Analyze>>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(T));
  analyze = vi.fn<Analyze>();
  testApp = createTestApp({ analyze });
});

afterEach(() => {
  testApp.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function photoSource(): Source {
  return createSource(testApp.db, { kind: 'photo', image_path: '/uploads/list.png' });
}

/** Stores a task as the analysis of a source would, as a draft, with anything in `extra` on top. */
function draftOf(task: AnalyzedTask, sourceId: number, extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, {
    title: task.title,
    description: task.description,
    category: task.category,
    estimated_minutes: task.estimated_minutes,
    confidence: task.confidence,
    priority: task.urgency,
    status: 'draft',
    source_id: sourceId,
    ...extra,
  });
}

/** A photo source, which is source 1, with the drafts `bug`, `milk` and `bank` as tasks 1, 2 and 3. */
function seed(): Source {
  const source = photoSource();
  for (const task of [bug, milk, bank]) draftOf(task, source.id);
  return source;
}

function tasks(): Task[] {
  return listTasks(testApp.db);
}

/** Every task as it is now. The clock moves on, so any write after this shows in `updated_at`. */
function rows(): Task[] {
  const before = tasks();
  vi.setSystemTime(new Date(LATER));
  return before;
}

/** The task with this id. Throws when it is gone. */
function task(id: number): Task {
  const found = getTask(testApp.db, id);
  if (found === undefined) throw new Error(`Task ${id} is gone`);
  return found;
}

/** The review page of a source as it is served, parsed with its scripts off. */
async function served(sourceId: number): Promise<DomDocument> {
  const response = await request(testApp.app).get(`/review/${sourceId}`);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** What a browser would post for the review form of a source as it is served. */
async function fieldsOf(sourceId: number): Promise<Fields> {
  return formFields(one(await served(sourceId), 'main form'));
}

/** Posts a form to a route, the way the review form does. */
function post(address: string, fields: Fields | string): request.Test {
  return request(testApp.app).post(address).type('form').send(fields);
}

function expectNotFound(response: request.Response): void {
  expect(response.status).toBe(404);
  expect(textOf(one(parseHtml(response.text), 'main h1'))).toBe('Page not found');
}

/** The text of the one alert of a refused confirm, which is also the review form again. */
function alertOf(response: request.Response): string {
  expect(response.status).toBe(400);
  expect(response.headers['content-type']).toMatch(/^text\/html/);

  const document = parseHtml(response.text);
  expect(all(document, '[role="alert"]')).toHaveLength(1);
  expect(textOf(one(document, 'main h1'))).toBe('Review 3 tasks');
  expect(all(document, 'main form [data-draft]')).toHaveLength(3);
  return textOf(one(document, 'main [role="alert"]'));
}

describe('POST /review/:sourceId/confirm (AC12)', () => {
  it('confirms the form as it was served: every draft becomes pending with its stored values', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, fields);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe(`/review/${source.id}`);

    expect(tasks()).toEqual(
      before.map((row, index) => ({ ...row, status: 'pending', ...SEEDED_TIMES[index], updated_at: LATER })),
    );
    for (const [index, analyzed] of [bug, milk, bank].entries()) {
      expect(tasks()[index]).toMatchObject({
        status: 'pending',
        title: analyzed.title,
        estimated_minutes: analyzed.estimated_minutes,
        priority: analyzed.urgency,
        time_slot: null,
        description: analyzed.description,
        category: analyzed.category,
        confidence: analyzed.confidence,
        source_id: source.id,
        ...SEEDED_TIMES[index],
      });
    }
  });

  it('stores the posted title, trimmed, the minutes, the priority and the slot', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, {
      ...fields,
      'title-1': '  Fix the login bug  ',
      'minutes-1': '95',
      'priority-1': 'urgent',
      'slot-1': 'morning',
    });

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([
      {
        ...before[0],
        title: 'Fix the login bug',
        estimated_minutes: 95,
        priority: 'urgent',
        time_slot: 'morning',
        status: 'pending',
        ...EDITED_TIMES[0],
        updated_at: LATER,
      },
      { ...before[1], status: 'pending', ...EDITED_TIMES[1], updated_at: LATER },
      { ...before[2], status: 'pending', ...EDITED_TIMES[2], updated_at: LATER },
    ]);
  });

  it('clears a stored slot when No slot is posted', async () => {
    const source = photoSource();
    const draft = draftOf(milk, source.id, { time_slot: 'evening' });
    const fields = await fieldsOf(source.id);
    expect(fields[`slot-${draft.id}`]).toBe('evening');

    const response = await post(`/review/${source.id}/confirm`, { ...fields, [`slot-${draft.id}`]: '' });

    expect(response.status).toBe(303);
    expect(task(draft.id)).toMatchObject({ time_slot: null, status: 'pending' });
  });

  it('keeps a stored slot that is posted as it was served', async () => {
    const source = photoSource();
    const draft = draftOf(milk, source.id, { time_slot: 'evening' });

    const response = await post(`/review/${source.id}/confirm`, await fieldsOf(source.id));

    expect(response.status).toBe(303);
    expect(task(draft.id)).toMatchObject({ time_slot: 'evening', status: 'pending' });
  });

  it('confirms a draft the body has no fields for as it is stored', async () => {
    const source = seed();
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, { 'title-1': 'Edited', 'minutes-1': '95' });

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([
      {
        ...before[0],
        title: 'Edited',
        estimated_minutes: 95,
        status: 'pending',
        ...EDITED_TIMES[0],
        updated_at: LATER,
      },
      { ...before[1], status: 'pending', ...EDITED_TIMES[1], updated_at: LATER },
      { ...before[2], status: 'pending', ...EDITED_TIMES[2], updated_at: LATER },
    ]);
  });

  it('keeps the stored value of a field that is not posted', async () => {
    const source = photoSource();
    const draft = draftOf(bug, source.id, { time_slot: 'night' });
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, { [`title-${draft.id}`]: 'Only the title' });

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([
      { ...before[0], title: 'Only the title', status: 'pending', ...scheduled('16:00', '17:30'), updated_at: LATER },
    ]);
    expect(task(draft.id)).toMatchObject({ estimated_minutes: 90, priority: 'high', time_slot: 'night' });
  });

  it('confirms every draft as stored for a post with no body at all', async () => {
    const source = seed();
    const before = rows();

    const response = await request(testApp.app).post(`/review/${source.id}/confirm`);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe(`/review/${source.id}`);
    expect(tasks()).toEqual(
      before.map((row, index) => ({ ...row, status: 'pending', ...SEEDED_TIMES[index], updated_at: LATER })),
    );
  });

  it('changes nothing through a field named after a task that is not a draft of this source', async () => {
    const source = seed();
    const pending = createTask(testApp.db, { title: 'Already pending', status: 'pending', source_id: source.id });
    const other = photoSource();
    const foreign = draftOf(bank, other.id, { title: 'A draft of another photo' });
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, {
      ...fields,
      [`title-${pending.id}`]: 'changed',
      [`minutes-${pending.id}`]: '5',
      [`title-${foreign.id}`]: 'changed',
      [`priority-${foreign.id}`]: 'urgent',
      [`slot-${foreign.id}`]: 'night',
    });

    expect(response.status).toBe(303);
    expect(task(pending.id)).toEqual(before[3]);
    expect(task(foreign.id)).toEqual(before[4]);
    expect(task(foreign.id).status).toBe('draft');
    expect(tasks().map((row) => row.status)).toEqual(['pending', 'pending', 'pending', 'pending', 'draft']);
  });

  it('is not refused for a bad field named after a task that is not a draft of this source', async () => {
    const source = seed();
    const other = photoSource();
    const foreign = draftOf(bank, other.id);

    const response = await post(`/review/${source.id}/confirm`, {
      ...(await fieldsOf(source.id)),
      [`title-${foreign.id}`]: '',
      [`minutes-${foreign.id}`]: 'abc',
    });

    expect(response.status).toBe(303);
    expect(task(foreign.id)).toMatchObject({ title: bank.title, estimated_minutes: 15, status: 'draft' });
  });

  it.each([
    ['1', 1],
    ['1440', 1440],
    [' 45 ', 45],
    ['030', 30],
  ])('stores minutes posted as "%s" as %i', async (posted, stored) => {
    const source = seed();
    const fields = await fieldsOf(source.id);

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'minutes-2': posted });

    expect(response.status).toBe(303);
    expect(task(2)).toMatchObject({ estimated_minutes: stored, status: 'pending' });
  });

  it.each(['urgent', 'high', 'medium', 'low'] as const)('stores the priority %s', async (priority) => {
    const source = seed();
    const fields = await fieldsOf(source.id);

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'priority-3': priority });

    expect(response.status).toBe(303);
    expect(task(3).priority).toBe(priority);
  });

  it.each(['morning', 'afternoon', 'evening', 'night'] as const)('stores the slot %s', async (slot) => {
    const source = seed();
    const fields = await fieldsOf(source.id);

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'slot-3': slot });

    expect(response.status).toBe(303);
    expect(task(3).time_slot).toBe(slot);
  });
});

describe('a confirm that is refused (AC13)', () => {
  it('answers a blank title with 400 and the title message, and changes no task', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'title-2': '   ' });

    const alert = alertOf(response);
    expect(alert).toContain(NO_TITLE);
    expect(alert).not.toContain(BAD_MINUTES);
    expect(alert).not.toContain(BAD_CHOICE);
    expect(tasks()).toEqual(before);
  });

  it.each(['', '0', '1441', '-5', '12.5', '30.0', '3e1', 'abc', '99999', '+30', '1 5', '0x1E'])(
    'answers minutes of "%s" with 400 and the minutes message, and changes no task',
    async (minutes) => {
      const source = seed();
      const fields = await fieldsOf(source.id);
      const before = rows();

      const response = await post(`/review/${source.id}/confirm`, { ...fields, 'minutes-2': minutes });

      const alert = alertOf(response);
      expect(alert).toContain(BAD_MINUTES);
      expect(alert).not.toContain(NO_TITLE);
      expect(alert).not.toContain(BAD_CHOICE);
      expect(tasks()).toEqual(before);
    },
  );

  it.each([
    ['priority-2', 'nope'],
    ['priority-2', ''],
    ['priority-2', 'URGENT'],
    ['slot-2', 'tonight'],
    ['slot-2', 'constructor'],
  ])('answers %s of "%s" with 400 and the choice message, and changes no task', async (name, value) => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, { ...fields, [name]: value });

    const alert = alertOf(response);
    expect(alert).toContain(BAD_CHOICE);
    expect(alert).not.toContain(NO_TITLE);
    expect(alert).not.toContain(BAD_MINUTES);
    expect(tasks()).toEqual(before);
  });

  it('gives both messages, the title one first, for a blank title and bad minutes on two cards', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'minutes-1': 'abc', 'title-3': '' });

    const paragraphs = all(parseHtml(response.text), 'main [role="alert"] p').map((paragraph) => textOf(paragraph));
    expect(response.status).toBe(400);
    expect(paragraphs).toEqual([NO_TITLE, BAD_MINUTES]);
    expect(tasks()).toEqual(before);
  });

  it('gives all three messages in their order', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);

    const response = await post(`/review/${source.id}/confirm`, {
      ...fields,
      'slot-1': 'tonight',
      'minutes-2': '0',
      'title-3': '',
    });

    const paragraphs = all(parseHtml(response.text), 'main [role="alert"] p').map((paragraph) => textOf(paragraph));
    expect(response.status).toBe(400);
    expect(paragraphs).toEqual([NO_TITLE, BAD_MINUTES, BAD_CHOICE]);
  });

  it('refuses a field that is posted twice', async () => {
    const source = seed();
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, 'title-1=a&title-1=b');

    expect(alertOf(response)).toContain(NO_TITLE);
    expect(tasks()).toEqual(before);
  });

  it('renders the cards with the posted values, the refused ones as they were posted', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, {
      ...fields,
      'title-1': 'Edited',
      'minutes-1': '95',
      'priority-1': 'urgent',
      'slot-1': 'night',
      'title-2': '',
      'minutes-3': 'abc',
    });

    expect(response.status).toBe(400);
    expect(formFields(one(parseHtml(response.text), 'main form'))).toEqual({
      ...fields,
      'title-1': 'Edited',
      'minutes-1': '95',
      'priority-1': 'urgent',
      'slot-1': 'night',
      'title-2': '',
      'minutes-3': 'abc',
    });
    // Shown, not stored.
    expect(tasks()).toEqual(before);
    expect(task(1)).toMatchObject({ title: bug.title, status: 'draft' });
  });

  it('shows the stored priority and slot of a card whose posted ones the page cannot show', async () => {
    const source = photoSource();
    const draft = draftOf(milk, source.id, { time_slot: 'evening' });
    const fields = await fieldsOf(source.id);

    const response = await post(`/review/${source.id}/confirm`, {
      ...fields,
      [`priority-${draft.id}`]: 'nope',
      [`slot-${draft.id}`]: 'tonight',
    });

    expect(response.status).toBe(400);
    expect(formFields(one(parseHtml(response.text), 'main form'))).toEqual(fields);
    expect(fields[`priority-${draft.id}`]).toBe('medium');
    expect(fields[`slot-${draft.id}`]).toBe('evening');
  });

  it('does not save a good card that stands beside a bad one', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'title-1': 'Edited', 'title-2': '' });

    expect(response.status).toBe(400);
    expect(tasks()).toEqual(before);
    expect(task(1).title).toBe(bug.title);
    expect(tasks().map((row) => row.status)).toEqual(['draft', 'draft', 'draft']);
  });

  it('keeps the page in the layout, with the Add link as the current page', async () => {
    const source = seed();

    const response = await post(`/review/${source.id}/confirm`, { 'title-1': '' });
    const document = parseHtml(response.text);

    expect(response.status).toBe(400);
    expect(one(document, '[aria-current="page"]').getAttribute('href')).toBe('/add');
    expect(one(document, 'main form').getAttribute('action')).toBe(`/review/${source.id}/confirm`);
  });
});

describe('POST /review/:sourceId/remove/:taskId (AC14)', () => {
  it('deletes that draft and answers 303 to the review page, which then has two cards', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/remove/2`, fields);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe(`/review/${source.id}`);
    // The others were posted as stored: nothing about them differs but the time of the write.
    expect(tasks()).toEqual([
      { ...before[0], updated_at: LATER },
      { ...before[2], updated_at: LATER },
    ]);

    const document = await served(source.id);
    expect(textOf(one(document, 'main h1'))).toBe('Review 2 tasks');
    expect(all(document, '[data-draft]').map((card) => card.getAttribute('data-draft'))).toEqual(['1', '3']);
  });

  it('stores the edits made to the other cards, which stay drafts', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/remove/2`, {
      ...fields,
      'title-1': ' Edited ',
      'minutes-1': '95',
      'slot-3': 'night',
    });

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([
      { ...before[0], title: 'Edited', estimated_minutes: 95, updated_at: LATER },
      { ...before[2], time_slot: 'night', updated_at: LATER },
    ]);
    expect(tasks().map((row) => row.status)).toEqual(['draft', 'draft']);
  });

  it('stores the good fields of another card and leaves its bad ones as stored', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/remove/2`, {
      ...fields,
      'title-1': '',
      'minutes-1': '95',
      'priority-3': 'nope',
      'minutes-3': '0',
      'slot-3': 'night',
    });

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([
      { ...before[0], estimated_minutes: 95, updated_at: LATER },
      { ...before[2], time_slot: 'night', updated_at: LATER },
    ]);
    expect(task(1).title).toBe(bug.title);
  });

  it('does not check the fields of the card that is removed', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);

    const response = await post(`/review/${source.id}/remove/2`, { ...fields, 'title-2': '', 'minutes-2': 'abc' });

    expect(response.status).toBe(303);
    expect(tasks().map((row) => row.id)).toEqual([1, 3]);
  });

  it('removes the draft of a post with no body and writes nothing else', async () => {
    const source = seed();
    const before = rows();

    const response = await request(testApp.app).post(`/review/${source.id}/remove/2`);

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([before[0], before[2]]);
  });

  it('leaves the tasks of another status and of another source alone', async () => {
    const source = seed();
    const pending = createTask(testApp.db, { title: 'Already pending', status: 'pending', source_id: source.id });
    const other = photoSource();
    const foreign = draftOf(bank, other.id);
    const before = rows();

    const response = await post(`/review/${source.id}/remove/2`, {
      [`title-${pending.id}`]: 'changed',
      [`title-${foreign.id}`]: 'changed',
    });

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([before[0], before[2], before[3], before[4]]);
  });

  it.each([
    ['a pending task of this source', '4'],
    ['a draft of another source', '5'],
    ['an id no task has', '999'],
    ['a word', 'abc'],
    ['zero', '0'],
    ['an id with a leading zero', '02'],
  ])('answers 404 for %s and changes nothing, not even the other cards', async (_name, taskId) => {
    const source = seed();
    createTask(testApp.db, { title: 'Already pending', status: 'pending', source_id: source.id });
    draftOf(bank, photoSource().id);
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/remove/${taskId}`, {
      ...fields,
      'title-1': 'Edited',
      'minutes-3': '95',
    });

    expectNotFound(response);
    expect(tasks()).toEqual(before);
  });

  it('leaves nothing to review when the last draft is removed', async () => {
    const source = photoSource();
    const draft = draftOf(milk, source.id);

    const response = await post(`/review/${source.id}/remove/${draft.id}`, await fieldsOf(source.id));

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([]);

    const document = await served(source.id);
    expect(textOf(one(document, 'main .empty-state__heading'))).toBe('Nothing to review');
    expect(all(document, 'main form')).toEqual([]);
  });
});

describe('POST /review/:sourceId/discard (AC15)', () => {
  it('deletes every draft of the source and nothing else, and answers 303 to the Add page', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e]);
    analyze.mockResolvedValueOnce({ tasks: [bug, milk, bank], fallback: false });
    const uploaded = await request(testApp.app)
      .post('/add/photo')
      .attach('photo', bytes, { filename: 'list.png', contentType: 'image/png' });
    expect(uploaded.headers.location).toBe('/review/1');
    createTask(testApp.db, { title: 'Already pending', status: 'pending', source_id: 1 });
    createTask(testApp.db, { title: 'Already done', status: 'done', source_id: 1 });
    draftOf(bank, photoSource().id, { title: 'A draft of another photo' });
    const sourceBefore = getSource(testApp.db, 1);
    const before = rows();
    expect(before.map((row) => row.status)).toEqual(['draft', 'draft', 'draft', 'pending', 'done', 'draft']);

    const response = await post('/review/1/discard', await fieldsOf(1));

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/add');
    expect(tasks()).toEqual([before[3], before[4], before[5]]);

    expect(sourceBefore).toBeDefined();
    expect(getSource(testApp.db, 1)).toEqual(sourceBefore);
    const files = readdirSync(testApp.uploadsDir);
    expect(files).toHaveLength(1);
    expect(sourceBefore?.image_path).toBe(`/uploads/${files[0]}`);
    expect(readFileSync(path.join(testApp.uploadsDir, files[0])).equals(bytes)).toBe(true);
  });

  it('discards for a post with no body, as the button of a page without script fields would', async () => {
    const source = seed();

    const response = await request(testApp.app).post(`/review/${source.id}/discard`);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/add');
    expect(tasks()).toEqual([]);
    expect(getSource(testApp.db, source.id)).toBeDefined();
  });

  it('answers 303 to the Add page and changes nothing for a source without drafts', async () => {
    const source = photoSource();
    createTask(testApp.db, { title: 'Already pending', status: 'pending', source_id: source.id });
    const before = rows();

    const response = await request(testApp.app).post(`/review/${source.id}/discard`);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/add');
    expect(tasks()).toEqual(before);
    expect(existsSync(testApp.uploadsDir)).toBe(false);
  });
});

describe('a write of several rows that fails half-way (AC12, AC14, AC15)', () => {
  /** Makes the database refuse one kind of write to one task, as a full disk or a broken row would. */
  function refuse(write: 'UPDATE' | 'DELETE', taskId: number): void {
    testApp.db.exec(
      `CREATE TRIGGER refuse_write BEFORE ${write} ON tasks WHEN OLD.id = ${taskId}
       BEGIN SELECT RAISE(ABORT, 'refused by the test'); END`,
    );
  }

  it('confirms no draft when one of them cannot be written', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();
    refuse('UPDATE', 2);

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'title-1': 'Edited' });

    expect(response.status).toBe(500);
    expect(tasks()).toEqual(before);
  });

  it('removes no draft and stores no edit when one of the other cards cannot be written', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();
    refuse('UPDATE', 3);

    const response = await post(`/review/${source.id}/remove/2`, { ...fields, 'title-1': 'Edited' });

    expect(response.status).toBe(500);
    expect(tasks()).toEqual(before);
  });

  it('discards no draft when one of them cannot be deleted', async () => {
    const source = seed();
    const before = rows();
    refuse('DELETE', 3);

    const response = await request(testApp.app).post(`/review/${source.id}/discard`);

    expect(response.status).toBe(500);
    expect(tasks()).toEqual(before);
  });
});

describe('after a confirm (AC16)', () => {
  it('shows how many tasks are saved, and the link to add another, where the confirm sends the browser', async () => {
    const source = seed();

    const confirmed = await post(`/review/${source.id}/confirm`, await fieldsOf(source.id));
    const response = await request(testApp.app).get(String(confirmed.headers.location));
    const document = parseHtml(response.text);

    expect(response.status).toBe(200);
    expect(textOf(one(document, 'main h1'))).toBe('3 tasks saved');
    expect(all(document, 'main a').map((link) => [textOf(link), link.getAttribute('href')])).toEqual([
      ['Add another', '/add'],
    ]);
    expect(all(document, 'main form')).toEqual([]);
  });

  it('answers a second confirm with 303 and changes nothing', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    await post(`/review/${source.id}/confirm`, fields);
    const before = rows();
    expect(before.map((row) => row.status)).toEqual(['pending', 'pending', 'pending']);

    const response = await post(`/review/${source.id}/confirm`, {
      ...fields,
      'title-1': 'changed',
      'minutes-2': 'abc',
    });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe(`/review/${source.id}`);
    expect(tasks()).toEqual(before);
  });
});

describe('a post to the review of an id that is no source (AC17)', () => {
  it.each([
    '/review/999/analyze',
    '/review/abc/analyze',
    '/review/999/confirm',
    '/review/abc/confirm',
    '/review/999/remove/1',
    '/review/abc/remove/1',
    '/review/999/discard',
    '/review/abc/discard',
    '/review/01/confirm',
    '/review/1.0/discard',
  ])('answers %s with the not-found page and changes nothing', async (address) => {
    const source = seed();
    expect(source.id).toBe(1);
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(address, fields);

    expectNotFound(response);
    expect(analyze).not.toHaveBeenCalled();
    expect(tasks()).toEqual(before);
  });
});

describe('drafts and confirmed tasks in the lists of the database (AC18)', () => {
  it('lists the tasks as drafts before the confirm and as pending after it', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);

    expect(listTasks(testApp.db, { status: 'pending' })).toEqual([]);
    expect(listTasks(testApp.db, { status: 'draft' }).map((row) => row.id)).toEqual([1, 2, 3]);

    await post(`/review/${source.id}/confirm`, fields);

    expect(listTasks(testApp.db, { status: 'pending' }).map((row) => row.id)).toEqual([1, 2, 3]);
    expect(listTasks(testApp.db, { status: 'draft' })).toEqual([]);
  });
});
