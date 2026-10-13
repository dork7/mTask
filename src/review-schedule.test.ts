import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSetting } from './db/settings.ts';
import { createSource, type Source } from './db/sources.ts';
import { createTask, getTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { findRule, valueOf } from './testing/css.ts';
import { all, formFields, one, parseHtml, textOf, visibleText, type DomDocument } from './testing/dom.ts';
import { getStylesheet } from './testing/page.ts';

/*
 * The scheduler behind the review page: a confirm gives every draft a time, and every
 * card says where its draft would land. The drafts are written straight into the
 * database, with the seeded settings unless a test changes them.
 *
 * Only `Date` is faked. The drafts are stored at `STORED`; `rows()` reads every task and
 * then moves the clock to `NOW`, so a request after it is made at 1:36 PM in Dubai and
 * any write shows in `updated_at`. "As it was" below means that not even that changed.
 *
 * The expected times are Dubai clock times turned into timestamps by `dubai()`, which is
 * this file's own arithmetic, or the labels a person reads, written out.
 */

/** 9:00 AM on 12 Oct 2026 in Dubai. */
const STORED = '2026-10-12T05:00:00.000Z';
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

type Fields = Record<string, string>;
type Times = Pick<Task, 'scheduled_start' | 'scheduled_end'>;

const NO_TIMES: Times = { scheduled_start: null, scheduled_end: null };

let testApp: TestApp;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(STORED));
  testApp = createTestApp({ analyze: vi.fn<Analyze>() });
});

afterEach(() => {
  testApp.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A Dubai clock time, `HH:MM`, of 12 Oct 2026 or of a day after it, as a stored timestamp. */
function dubai(time: string, daysAhead = 0): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12 + daysAhead, hours - 4, minutes)).toISOString();
}

/** The two columns of a task that lies from `start` to `end` today, on the Dubai clock. */
function times(start: string, end: string): Times {
  return { scheduled_start: dubai(start), scheduled_end: dubai(end) };
}

function photoSource(): Source {
  return createSource(testApp.db, { kind: 'photo', image_path: '/uploads/list.png' });
}

/** A draft of a source. */
function draft(sourceId: number, extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: sourceId, ...extra });
}

/**
 * A photo source with three drafts: `high` `morning` 90 minutes, `medium` `night` 40
 * minutes, and `low` with no slot 15 minutes. In a database with nothing else they are
 * source 1 and tasks 1, 2 and 3.
 */
function seed(): Source {
  const source = photoSource();
  draft(source.id, { priority: 'high', time_slot: 'morning', estimated_minutes: 90 });
  draft(source.id, { priority: 'medium', time_slot: 'night', estimated_minutes: 40 });
  draft(source.id, { priority: 'low', estimated_minutes: 15 });
  return source;
}

/** A task of a photo source of its own that has a time today, pending and `medium` unless `extra` says otherwise. */
function booked(start: string, end: string, extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, {
    title: 'Booked',
    status: 'pending',
    priority: 'medium',
    estimated_minutes: (Date.parse(dubai(end)) - Date.parse(dubai(start))) / 60_000,
    source_id: photoSource().id,
    ...times(start, end),
    ...extra,
  });
}

function tasks(): Task[] {
  return listTasks(testApp.db);
}

/** Every task as it is now. The clock then moves to `at`, so any write after this shows in `updated_at`. */
function rows(at: string = NOW): Task[] {
  const before = tasks();
  vi.setSystemTime(new Date(at));
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
function post(address: string, fields: Fields): request.Test {
  return request(testApp.app).post(address).type('form').send(fields);
}

/** Makes the database refuse one kind of write to one task, as a full disk or a broken row would. */
function refuse(write: 'UPDATE' | 'DELETE', taskId: number): void {
  testApp.db.exec(
    `CREATE TRIGGER refuse_write BEFORE ${write} ON tasks WHEN OLD.id = ${taskId}
     BEGIN SELECT RAISE(ABORT, 'refused by the test'); END`,
  );
}

/** What each card says about where its draft would land, in the order of the cards. */
function lands(document: DomDocument): string[] {
  return all(document, '[data-draft]').map((card) => visibleText(one(card, '.land')));
}

describe('a confirm schedules the drafts (AC10)', () => {
  it('stores the start and the end of every draft, placed at the time of the request, and answers 303', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, fields);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');
    const placed: Times[] = [
      { scheduled_start: '2026-10-13T05:00:00.000Z', scheduled_end: '2026-10-13T06:30:00.000Z' },
      { scheduled_start: '2026-10-12T16:00:00.000Z', scheduled_end: '2026-10-12T16:40:00.000Z' },
      { scheduled_start: '2026-10-12T09:40:00.000Z', scheduled_end: '2026-10-12T09:55:00.000Z' },
    ];
    expect(tasks()).toEqual(
      before.map((row, index) => ({ ...row, status: 'pending', ...placed[index], updated_at: NOW })),
    );
  });

  it('goes by the time of the request, not by the time the drafts were stored or served', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    rows('2026-10-12T19:30:00.000Z');

    const response = await post(`/review/${source.id}/confirm`, fields);

    expect(response.status).toBe(303);
    expect(tasks().map((row) => row.scheduled_start)).toEqual([
      dubai('09:00', 1),
      dubai('20:00', 1),
      dubai('10:30', 1),
    ]);
  });

  it('places the drafts with the posted minutes, priority and slot', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, {
      ...fields,
      'slot-1': '',
      'minutes-2': '50',
      'priority-3': 'urgent',
      'minutes-3': '30',
    });

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([
      { ...before[0], time_slot: null, status: 'pending', ...times('14:10', '15:40'), updated_at: NOW },
      { ...before[1], estimated_minutes: 50, status: 'pending', ...times('20:00', '20:50'), updated_at: NOW },
      {
        ...before[2],
        estimated_minutes: 30,
        priority: 'urgent',
        status: 'pending',
        ...times('13:40', '14:10'),
        updated_at: NOW,
      },
    ]);
    expect(before.map((row) => [row.estimated_minutes, row.priority, row.time_slot])).toEqual([
      [90, 'high', 'morning'],
      [40, 'medium', 'night'],
      [15, 'low', null],
    ]);
  });

  it('places all the drafts in one call', async () => {
    const source = photoSource();
    for (let count = 0; count < 3; count += 1) draft(source.id, { priority: 'medium', estimated_minutes: 30 });
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, fields);

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([
      { ...before[0], status: 'pending', ...times('13:40', '14:10'), updated_at: NOW },
      { ...before[1], status: 'pending', ...times('14:10', '14:40'), updated_at: NOW },
      { ...before[2], status: 'pending', ...times('14:40', '15:10'), updated_at: NOW },
    ]);
  });

  it.each([
    ['1000 minutes', 1000],
    ['no minutes', null],
  ])('confirms a draft with %s as pending with no times, and places the others', async (_name, minutes) => {
    const source = photoSource();
    draft(source.id, { priority: 'low', estimated_minutes: 15 });
    draft(source.id, { priority: 'high', estimated_minutes: minutes });
    draft(source.id, { priority: 'low', estimated_minutes: 15 });
    // A blank minutes field is refused, so the draft without minutes is posted with its title only.
    const fields = minutes === null ? { 'title-2': 'A draft' } : await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, fields);

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([
      { ...before[0], status: 'pending', ...times('13:40', '13:55'), updated_at: NOW },
      { ...before[1], status: 'pending', ...NO_TIMES, updated_at: NOW },
      { ...before[2], status: 'pending', ...times('13:55', '14:10'), updated_at: NOW },
    ]);
    expect(task(2).estimated_minutes).toBe(minutes);
  });

  it('places a draft after a scheduled pending task of another source, which keeps its times', async () => {
    const other = booked('13:40', '14:30');
    const source = photoSource();
    const mine = draft(source.id, { priority: 'low', estimated_minutes: 15 });
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, fields);

    expect(response.status).toBe(303);
    expect(task(mine.id)).toEqual({ ...before[1], status: 'pending', ...times('14:30', '14:45'), updated_at: NOW });
    expect(task(other.id)).toEqual(before[0]);
    expect(before[0]).toMatchObject(times('13:40', '14:30'));
  });

  it('moves a pending task of another source for an urgent draft, and stores its new times', async () => {
    booked('13:40', '14:40');
    booked('14:40', '15:10', { priority: 'low' });
    const source = photoSource();
    const mine = draft(source.id, { priority: 'low', estimated_minutes: 30 });
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, { ...fields, [`priority-${mine.id}`]: 'urgent' });

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([
      { ...before[0], ...times('15:10', '16:10'), updated_at: NOW },
      before[1],
      { ...before[2], priority: 'urgent', status: 'pending', ...times('13:40', '14:10'), updated_at: NOW },
    ]);
  });

  it('stores nothing when the new times of a moved task cannot be written', async () => {
    const other = booked('13:40', '14:40');
    const source = photoSource();
    const urgent = draft(source.id, { priority: 'urgent', estimated_minutes: 30 });
    draft(source.id, { priority: 'low', estimated_minutes: 15 });
    const fields = await fieldsOf(source.id);
    const before = rows();
    refuse('UPDATE', other.id);

    const response = await post(`/review/${source.id}/confirm`, { ...fields, [`title-${urgent.id}`]: 'Edited' });

    expect(response.status).toBe(500);
    expect(tasks()).toEqual(before);
    expect(tasks().map((row) => row.status)).toEqual(['pending', 'draft', 'draft']);
  });

  it('stores no time when a draft cannot be written', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    const before = rows();
    refuse('UPDATE', 3);

    const response = await post(`/review/${source.id}/confirm`, fields);

    expect(response.status).toBe(500);
    expect(tasks()).toEqual(before);
  });
});

describe('what changes no start and no end (AC10)', () => {
  /**
   * Task 1 is a pending task of another source at 1:40 PM. Source 2 has the drafts 2 and
   * 3: an urgent one of 30 minutes, which would move task 1 if it were placed, and a
   * `low` one of 15 minutes.
   */
  function seedBump(): Source {
    booked('13:40', '14:40');
    const source = photoSource();
    draft(source.id, { priority: 'urgent', estimated_minutes: 30 });
    draft(source.id, { priority: 'low', estimated_minutes: 15 });
    return source;
  }

  it('a confirm that is refused', async () => {
    const source = seedBump();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'title-3': '' });

    expect(response.status).toBe(400);
    expect(tasks()).toEqual(before);
    expect(before.map((row) => row.scheduled_start)).toEqual([dubai('13:40'), null, null]);
  });

  it('a remove', async () => {
    const source = seedBump();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/remove/3`, { ...fields, 'minutes-2': '45' });

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([before[0], { ...before[1], estimated_minutes: 45, updated_at: NOW }]);
    expect(task(2)).toMatchObject({ status: 'draft', ...NO_TIMES });
  });

  it('a discard', async () => {
    const source = seedBump();
    const before = rows();

    const response = await request(testApp.app).post(`/review/${source.id}/discard`);

    expect(response.status).toBe(303);
    expect(tasks()).toEqual([before[0]]);
    expect(before[0]).toMatchObject(times('13:40', '14:40'));
  });

  it('a confirm on a source whose drafts are already confirmed', async () => {
    const source = seedBump();
    const fields = await fieldsOf(source.id);
    // At 9:00 AM the urgent draft does not reach the task at 1:40 PM.
    await post(`/review/${source.id}/confirm`, fields);
    const before = rows('2026-10-12T17:40:00.000Z');
    expect(before.map((row) => [row.status, row.scheduled_start])).toEqual([
      ['pending', dubai('13:40')],
      ['pending', dubai('09:00')],
      ['pending', dubai('09:30')],
    ]);

    const response = await post(`/review/${source.id}/confirm`, fields);

    expect(response.status).toBe(303);
    expect(tasks()).toEqual(before);
  });

  it('a confirm on a source with no task, even with no working hours to read', async () => {
    seedBump();
    const empty = photoSource();
    testApp.db.exec("DELETE FROM settings WHERE key = 'working_hours'");
    const before = rows();

    const response = await request(testApp.app).post(`/review/${empty.id}/confirm`);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe(`/review/${empty.id}`);
    expect(tasks()).toEqual(before);
  });
});

describe('the landing preview of a card (AC11)', () => {
  it('shows Tomorrow 9:00 AM, Today 8:00 PM and Today 1:40 PM for the three drafts', async () => {
    const source = seed();
    rows();

    expect(lands(await served(source.id))).toEqual(['Tomorrow 9:00 AM', 'Today 8:00 PM', 'Today 1:40 PM']);
  });

  it('has one land element in each card, with an arrow that is hidden from a screen reader before the text', async () => {
    const source = seed();
    rows();

    const document = await served(source.id);

    expect(all(document, '.land')).toHaveLength(3);
    expect(all(document, 'main form .land')).toHaveLength(3);
    for (const card of all(document, '[data-draft]')) {
      const land = one(card, '.land');
      const arrow = one(land, '[aria-hidden="true"]');

      expect(textOf(arrow)).toBe('→');
      expect(land.firstElementChild).toBe(arrow);
      expect(visibleText(land)).not.toBe('');
      expect(textOf(land)).toBe(`→ ${visibleText(land)}`);
    }
  });

  it('names the day after tomorrow by its date', async () => {
    const source = photoSource();
    for (let count = 0; count < 3; count += 1) {
      draft(source.id, { priority: 'high', time_slot: 'morning', estimated_minutes: 90 });
    }
    rows();

    expect(lands(await served(source.id))).toEqual(['Tomorrow 9:00 AM', '14 Oct 9:00 AM', '15 Oct 9:00 AM']);
  });

  it('places all the drafts in one call', async () => {
    const source = photoSource();
    draft(source.id, { priority: 'low', estimated_minutes: 15 });
    draft(source.id, { priority: 'low', estimated_minutes: 15 });
    draft(source.id, { priority: 'high', estimated_minutes: 60 });
    rows();

    expect(lands(await served(source.id))).toEqual(['Today 2:40 PM', 'Today 2:55 PM', 'Today 1:40 PM']);
  });

  it.each([
    ['1000 minutes', 1000],
    ['no minutes', null],
  ])('shows Not scheduled for a draft with %s, and the time of the others', async (_name, minutes) => {
    const source = photoSource();
    draft(source.id, { priority: 'high', estimated_minutes: minutes });
    draft(source.id, { priority: 'low', estimated_minutes: 15 });
    rows();

    expect(lands(await served(source.id))).toEqual(['Not scheduled', 'Today 1:40 PM']);
  });

  it('goes by the Dubai day of the request', async () => {
    const source = photoSource();
    draft(source.id, { priority: 'low', estimated_minutes: 30 });

    // 2:00 AM on 13 Oct in Dubai, where the UTC day is still the 12th.
    rows('2026-10-12T22:00:00.000Z');
    expect(lands(await served(source.id))).toEqual(['Today 9:00 AM']);

    // 11:30 PM on 12 Oct in Dubai.
    rows('2026-10-12T19:30:00.000Z');
    expect(lands(await served(source.id))).toEqual(['Tomorrow 9:00 AM']);
  });

  it('lands a draft after a scheduled pending task of another source', async () => {
    booked('13:40', '14:30');
    const source = photoSource();
    draft(source.id, { priority: 'low', estimated_minutes: 15 });
    rows();

    expect(lands(await served(source.id))).toEqual(['Today 2:30 PM']);
  });

  it('goes by the settings', async () => {
    setSetting(testApp.db, 'working_hours', { start: '15:00', end: '21:00' });
    const source = seed();
    rows();

    expect(lands(await served(source.id))).toEqual(['Today 3:00 PM', 'Today 8:00 PM', 'Today 4:30 PM']);
  });

  it('shows the preview of the stored values, not of the posted ones, on the page of a refused confirm', async () => {
    const source = seed();
    const fields = await fieldsOf(source.id);
    rows();

    const response = await post(`/review/${source.id}/confirm`, {
      ...fields,
      'title-1': '',
      'slot-1': '',
      'slot-2': '',
      'priority-3': 'urgent',
      'minutes-3': '120',
    });
    const document = parseHtml(response.text);

    expect(response.status).toBe(400);
    expect(formFields(one(document, 'main form'))).toMatchObject({
      'slot-2': '',
      'priority-3': 'urgent',
      'minutes-3': '120',
    });
    expect(lands(document)).toEqual(['Tomorrow 9:00 AM', 'Today 8:00 PM', 'Today 1:40 PM']);
  });

  it('has no land element on a page without drafts, and reads no setting for it', async () => {
    const saved = photoSource();
    createTask(testApp.db, { title: 'Already pending', status: 'pending', source_id: saved.id });
    const empty = photoSource();
    testApp.db.exec('DELETE FROM settings');
    rows();

    for (const source of [saved, empty]) {
      expect(all(await served(source.id), '.land')).toEqual([]);
    }
  });

  it('is styled as muted small text', async () => {
    const { rules } = await getStylesheet();
    const land = findRule(rules, '.land');

    expect(valueOf(land, 'color')).toBe('var(--muted)');
    expect(valueOf(land, 'font-size')).toBe('var(--font-size-sm)');
  });
});

describe('the preview writes nothing, and a confirm stores what it showed (AC12)', () => {
  /**
   * Task 1 is a pending task of another source at 1:40 PM. Source 2 has the three drafts
   * of `seed()` as tasks 2, 3 and 4, and task 5, an urgent draft of 30 minutes that
   * would move task 1 if it were placed.
   */
  function seedAll(): Source {
    booked('13:40', '14:40');
    const source = seed();
    draft(source.id, { priority: 'urgent', estimated_minutes: 30 });
    return source;
  }

  it('leaves every task row as it was, the one an urgent draft would move included', async () => {
    const source = seedAll();
    const before = rows();

    const document = await served(source.id);

    expect(lands(document)).toEqual(['Tomorrow 9:00 AM', 'Today 8:00 PM', 'Today 3:10 PM', 'Today 1:40 PM']);
    expect(tasks()).toEqual(before);
    expect(tasks().map((row) => row.updated_at)).toEqual([STORED, STORED, STORED, STORED, STORED]);
    expect(tasks().slice(1)).toHaveLength(4);
    for (const row of tasks().slice(1)) expect(row).toMatchObject({ status: 'draft', ...NO_TIMES });
  });

  it('writes nothing on the page of a refused confirm', async () => {
    const source = seedAll();
    const fields = await fieldsOf(source.id);
    const before = rows();

    const response = await post(`/review/${source.id}/confirm`, { ...fields, 'minutes-2': 'abc' });

    expect(response.status).toBe(400);
    expect(all(parseHtml(response.text), '.land')).toHaveLength(4);
    expect(tasks()).toEqual(before);
  });

  it('stores for each draft the start its card showed, when the form is confirmed as served at the same time', async () => {
    const source = seedAll();
    draft(source.id, { priority: 'high', estimated_minutes: 1000 });
    draft(source.id, { priority: 'high', time_slot: 'morning', estimated_minutes: 90 });
    rows();

    const document = await served(source.id);
    expect(lands(document)).toEqual([
      'Tomorrow 9:00 AM',
      'Today 8:00 PM',
      'Today 3:10 PM',
      'Today 1:40 PM',
      'Not scheduled',
      '14 Oct 9:00 AM',
    ]);

    const response = await post(`/review/${source.id}/confirm`, formFields(one(document, 'main form')));

    expect(response.status).toBe(303);
    expect(
      tasks()
        .slice(1)
        .map((row) => row.scheduled_start),
    ).toEqual([
      '2026-10-13T05:00:00.000Z',
      '2026-10-12T16:00:00.000Z',
      '2026-10-12T11:10:00.000Z',
      '2026-10-12T09:40:00.000Z',
      null,
      '2026-10-14T05:00:00.000Z',
    ]);
    expect(tasks().map((row) => row.status)).toEqual(Array.from({ length: 7 }, () => 'pending'));
  });
});
