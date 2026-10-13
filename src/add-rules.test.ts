import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSetting } from './db/settings.ts';
import { listTasks } from './db/tasks.ts';
import type { AnalyzedTask, Analysis, Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, formFields, one, parseHtml, textOf, type DomDocument } from './testing/dom.ts';

/*
 * What the slot rules do to the drafts of an analysis: each draft is stored with the
 * priority and the slot the rules give for its category and urgency, whichever way the
 * source was added, and the review page and the confirm go on from what was stored. The
 * analyzer is a stub in every test. The first post of a test is the first of a new app,
 * so its source is 1 and its drafts are the tasks 1, 2, 3 and 4.
 */

const PHOTO_BYTES = Buffer.from([0x89, 0x50, 0x4e]);

const bug: AnalyzedTask = {
  title: 'Finish login bug fix',
  description: 'Before Friday',
  category: 'coding',
  estimated_minutes: 90,
  urgency: 'high',
  confidence: 0.9,
};

const milk: AnalyzedTask = {
  title: 'Buy milk',
  description: '',
  category: 'shopping',
  estimated_minutes: 15,
  urgency: 'medium',
  confidence: 0.8,
};

const bank: AnalyzedTask = {
  title: 'Call the bank',
  description: '',
  category: 'personal',
  estimated_minutes: 10,
  urgency: 'low',
  confidence: 0.7,
};

const pills: AnalyzedTask = {
  title: 'Buy the medicine today',
  description: '',
  category: 'shopping',
  estimated_minutes: 20,
  urgency: 'urgent',
  confidence: 0.95,
};

type Fields = Record<string, string>;

/** An analysis that found these tasks. */
function found(...tasks: AnalyzedTask[]): Analysis {
  return { tasks, fallback: false };
}

let testApp: TestApp;
let analyze: ReturnType<typeof vi.fn<Analyze>>;

beforeEach(() => {
  analyze = vi.fn<Analyze>();
  testApp = createTestApp({ analyze });
});

afterEach(() => {
  testApp.close();
  vi.restoreAllMocks();
});

/** Posts three bytes as a PNG to the upload route, the way the form does. */
function upload(): request.Test {
  return request(testApp.app)
    .post('/add/photo')
    .attach('photo', PHOTO_BYTES, { filename: 'list.png', contentType: 'image/png' });
}

/** Posts a text to one of the two text routes, the way its form does. */
function postText(route: string): request.Test {
  return request(testApp.app).post(route).type('form').send({ text: 'the list' });
}

/** The three ways to add a source. */
const WAYS: [string, () => request.Test][] = [
  ['a photo', () => upload()],
  ['a spoken text', () => postText('/add/voice')],
  ['a typed text', () => postText('/add/text')],
];

/** Every task as it is stored: its title, priority, slot and status. */
function stored(): unknown[][] {
  return listTasks(testApp.db).map((task) => [task.title, task.priority, task.time_slot, task.status]);
}

/** The four tasks as the seeded rules store them, with this status. */
function seededRows(status: string): unknown[][] {
  return [
    [bug.title, 'high', 'morning', status],
    [milk.title, 'medium', 'night', status],
    [bank.title, 'low', null, status],
    [pills.title, 'urgent', null, status],
  ];
}

/** The review page of the first source as it is served, parsed with its scripts off. */
async function review(): Promise<DomDocument> {
  const response = await request(testApp.app).get('/review/1');
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** Per draft card, the texts of the options its slot picker has selected. */
function selectedSlots(document: DomDocument): string[][] {
  return all(document, '[data-draft] select').map((select) => all(select, 'option[selected]').map(textOf));
}

/** Per draft card, the values of its checked priority buttons. */
function checkedPriorities(document: DomDocument): (string | null)[][] {
  return all(document, '[data-draft]').map((card) =>
    all(card, 'input[type="radio"][checked]').map((radio) => radio.getAttribute('value')),
  );
}

/** What a browser would post for the review form as it is served. */
async function servedFields(): Promise<Fields> {
  return formFields(one(await review(), 'main form'));
}

function confirm(fields: Fields): request.Test {
  return request(testApp.app).post('/review/1/confirm').type('form').send(fields);
}

describe.each(WAYS)('the drafts of %s get their priority and slot from the rules (AC10)', (_name, add) => {
  it('stores each draft with what the seeded rules give for its category and urgency', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk, bank, pills));

    const response = await add();

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');
    expect(stored()).toEqual(seededRows('draft'));
  });

  it('goes by the slot_rules setting of its database', async () => {
    setSetting(testApp.db, 'slot_rules', [
      { category: 'coding', time_slot: 'afternoon', start: '13:00', end: '15:00' },
    ]);
    analyze.mockResolvedValueOnce(found(bug, milk));

    const response = await add();

    expect(response.status).toBe(303);
    expect(stored()).toEqual([
      [bug.title, 'high', 'afternoon', 'draft'],
      [milk.title, 'medium', null, 'draft'],
    ]);
  });

  it('stores the drafts with no slot when the database has no slot_rules setting', async () => {
    testApp.db.prepare("DELETE FROM settings WHERE key = 'slot_rules'").run();
    analyze.mockResolvedValueOnce(found(bug, milk));

    const response = await add();

    expect(response.status).toBe(303);
    expect(stored()).toEqual([
      [bug.title, 'high', null, 'draft'],
      [milk.title, 'medium', null, 'draft'],
    ]);
  });

  it('shows each draft on the review page with its slot selected and its priority checked', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk, bank, pills));
    await add();

    const document = await review();

    expect(selectedSlots(document)).toEqual([['Morning'], ['Night'], ['No slot'], ['No slot']]);
    expect(checkedPriorities(document)).toEqual([['high'], ['medium'], ['low'], ['urgent']]);
  });

  it('a confirm of the form as it is served stores the slots the rules gave', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk, bank, pills));
    await add();
    const fields = await servedFields();

    const response = await confirm(fields);

    expect(fields).toMatchObject({ 'slot-1': 'morning', 'slot-2': 'night', 'slot-3': '', 'slot-4': '' });
    expect(response.status).toBe(303);
    expect(stored()).toEqual(seededRows('pending'));
  });

  it('a confirm with edits stores what was posted, not what the rules give', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk, bank, pills));
    await add();
    const fields = await servedFields();

    const response = await confirm({
      ...fields,
      'slot-1': '',
      'priority-1': 'low',
      'slot-2': 'evening',
      'slot-3': 'morning',
      'priority-3': 'urgent',
      'slot-4': 'night',
    });

    expect(response.status).toBe(303);
    expect(stored()).toEqual([
      [bug.title, 'low', null, 'pending'],
      [milk.title, 'medium', 'evening', 'pending'],
      [bank.title, 'urgent', 'morning', 'pending'],
      [pills.title, 'urgent', 'night', 'pending'],
    ]);
  });
});

describe('the retry of a failed analysis (AC10)', () => {
  it('stores its drafts by the rules as they are at the retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    analyze.mockResolvedValueOnce({ tasks: [milk], fallback: true });
    await upload();
    expect(stored()).toEqual([]);

    setSetting(testApp.db, 'slot_rules', [
      { category: 'shopping', time_slot: 'evening', start: '18:00', end: '19:00' },
    ]);
    analyze.mockResolvedValueOnce(found(bug, milk));
    const response = await request(testApp.app).post('/review/1/analyze');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');
    expect(stored()).toEqual([
      [bug.title, 'high', null, 'draft'],
      [milk.title, 'medium', 'evening', 'draft'],
    ]);
  });
});

describe('the setting as it is when the drafts are stored (AC10)', () => {
  it('a later analysis goes by rules that were changed after an earlier one', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk));
    await postText('/add/text');
    setSetting(testApp.db, 'slot_rules', [
      { category: 'shopping', time_slot: 'evening', start: '18:00', end: '19:00' },
    ]);
    analyze.mockResolvedValueOnce(found(bug, milk));

    const response = await postText('/add/text');

    expect(response.headers.location).toBe('/review/2');
    expect(stored()).toEqual([
      [bug.title, 'high', 'morning', 'draft'],
      [milk.title, 'medium', 'night', 'draft'],
      [bug.title, 'high', null, 'draft'],
      [milk.title, 'medium', 'evening', 'draft'],
    ]);
  });
});
