import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf, type DomDocument, type DomElement } from './testing/dom.ts';

/*
 * The Digest page as it is served: the header, today's count and planned minutes, the
 * first task left, the overdue items, the timeline link, and that it writes nothing. The
 * tasks are stored at `STORED`, a day before; `rows()` then moves the clock to `NOW`,
 * 1:36 PM on Monday 12 Oct in Dubai, the time of every request.
 */

/** 9:00 AM on 11 Oct 2026 in Dubai. */
const STORED = '2026-10-11T05:00:00.000Z';
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

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

/** A time on the Dubai clock, `HH:MM`, on a Dubai date, as a stored timestamp. */
function at(time: string, date = '2026-10-12'): string {
  return new Date(`${date}T${time}:00.000+04:00`).toISOString();
}

/** A task's times, from `start` to `end` on the Dubai clock. */
function times(start: string, end: string, date?: string): Pick<NewTask, 'scheduled_start' | 'scheduled_end'> {
  return { scheduled_start: at(start, date), scheduled_end: at(end, date) };
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

/** A draft of a text source, with these fields. */
function draftTask(extra: Partial<NewTask> = {}): Task {
  const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
  return createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id, ...extra });
}

/** Snapshot every task, then move the clock to `NOW`. */
function rows(): Task[] {
  const before = listTasks(testApp.db);
  vi.setSystemTime(new Date(NOW));
  return before;
}

async function digest(): Promise<DomDocument> {
  const response = await request(testApp.app).get('/digest');
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** The text between `<main ...>` and `</main>`. */
function mainOf(html: string): string {
  const match = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html);
  if (!match) throw new Error('The page has no <main> element');
  return match[1];
}

/** The one empty state whose heading is `heading`. The two can appear together (D5). */
function emptyStateNamed(document: DomDocument, heading: string): DomElement {
  const found = all(document, 'main .empty-state').filter(
    (empty) => textOf(one(empty, '.empty-state__heading')) === heading,
  );
  if (found.length !== 1) throw new Error(`Expected one "${heading}" empty state, found ${found.length}`);
  return found[0];
}

/** The `id`s of the overdue items, in document order. */
function overdueItemIds(document: DomDocument): string[] {
  return all(document, '[id^="digest-overdue-"]').map((item) => item.id);
}

describe('the page (AC1)', () => {
  it('is served in the layout with the title Digest, its header and the Dubai date', async () => {
    rows();

    const response = await request(testApp.app).get('/digest');
    expect(response.status).toBe(200);
    const document = parseHtml(response.text);

    expect(textOf(one(document, 'title'))).toBe('Digest - Task Image AI');
    expect(textOf(one(document, 'main h1'))).toBe('Digest');
    expect(mainOf(response.text)).toContain('<h1>Digest</h1>');
    expect(textOf(one(document, '.page-header__sub'))).toBe('Monday, 12 Oct');
  });

  it('marks no nav link current', async () => {
    rows();

    expect(all(await digest(), '[aria-current="page"]')).toEqual([]);
  });

  it("writes the date of the request's Dubai day", async () => {
    vi.setSystemTime(new Date('2026-10-12T20:30:00.000Z'));

    expect(textOf(one(await digest(), '.page-header__sub'))).toBe('Tuesday, 13 Oct');
  });

  it('escapes the task text', async () => {
    task({ title: '<b>x</b>', ...times('14:00', '14:45') });
    task({ title: '<b>y</b>', ...times('09:00', '09:30') });
    rows();

    const document = await digest();

    expect(all(one(document, 'main'), 'b')).toEqual([]);
    expect(textOf(one(document, '#digest-first a'))).toBe('<b>x</b>');
    expect(textOf(one(document, '#digest-overdue-2 a'))).toBe('<b>y</b>');
  });
});

describe('count and planned minutes (AC2)', () => {
  function specExample(): void {
    task({ status: 'done', estimated_minutes: 45, ...times('08:00', '08:45') });
    task({ estimated_minutes: 45, ...times('14:00', '14:45') });
    task({ estimated_minutes: 60, ...times('16:00', '17:00') });
    task({ estimated_minutes: 60, ...times('18:00', '19:00') });
    task({ status: 'done', estimated_minutes: 45, ...times('09:00', '09:45', '2026-10-11') });
    draftTask({ estimated_minutes: 30, ...times('20:00', '20:30') });
    task({ estimated_minutes: 30 });
  }

  it('shows the count and the sum of the spec example, leaving the other tasks out', async () => {
    specExample();
    rows();

    const document = await digest();

    expect(textOf(one(document, '#digest-count'))).toBe('4 tasks today');
    expect(textOf(one(document, '#digest-planned'))).toBe('210 min planned');
  });

  it('has one element with each id', async () => {
    specExample();
    rows();

    const document = await digest();

    expect(all(document, '#digest-count')).toHaveLength(1);
    expect(all(document, '#digest-planned')).toHaveLength(1);
  });

  it('writes one task in the singular', async () => {
    task(times('14:00', '14:30'));
    rows();

    expect(textOf(one(await digest(), '#digest-count'))).toBe('1 task today');
  });

  it('shows nothing for an empty day', async () => {
    rows();

    const document = await digest();

    expect(textOf(one(document, '#digest-count'))).toBe('0 tasks today');
    expect(textOf(one(document, '#digest-planned'))).toBe('0 min planned');
  });

  it('counts a null estimate as 0', async () => {
    task({ estimated_minutes: null, ...times('14:00', '14:30') });
    rows();

    expect(textOf(one(await digest(), '#digest-planned'))).toBe('0 min planned');
  });
});

describe('the first task (AC3)', () => {
  it('is the first pending task left today, past an overdue one', async () => {
    task(times('09:00', '09:30'));
    task(times('14:00', '14:45'));
    task(times('16:00', '17:00'));
    rows();

    const document = await digest();

    expect(all(document, '#digest-first')).toHaveLength(1);
    const link = one(document, '#digest-first a');
    expect(link.getAttribute('href')).toBe('/tasks/2');
    expect(textOf(link)).toBe('A task');
    expect(textOf(one(document, '#digest-first .digest__time'))).toBe('2:00 PM');
  });

  it('is never in progress, done or overdue', async () => {
    task({ status: 'in_progress', ...times('13:00', '14:00') });
    task({ status: 'done', ...times('15:00', '15:30') });
    task(times('09:00', '09:30'));
    task(times('16:00', '16:30'));
    rows();

    expect(one(await digest(), '#digest-first a').getAttribute('href')).toBe('/tasks/4');
  });

  it('breaks a tie of start times by id', async () => {
    task(times('14:00', '14:30'));
    task(times('14:00', '14:30'));
    rows();

    expect(one(await digest(), '#digest-first a').getAttribute('href')).toBe('/tasks/1');
  });

  it('shows the empty state when nothing is left today', async () => {
    task(times('14:00', '14:30', '2026-10-13'));
    task(times('09:00', '09:30'));
    rows();

    const document = await digest();

    expect(all(document, '#digest-first')).toEqual([]);
    const empty = emptyStateNamed(document, 'Nothing left today');
    expect(one(empty, 'a').getAttribute('href')).toBe('/add');
  });
});

describe('overdue items (AC4)', () => {
  it('lists the overdue tasks with their due time and the review link', async () => {
    task({ ...times('09:00', '09:30', '2026-10-11') });
    task({ status: 'done', ...times('08:00', '08:30') });
    task({ status: 'in_progress', ...times('09:00', '09:30') });
    task(times('14:00', '14:45'));
    rows();

    const document = await digest();

    expect(overdueItemIds(document)).toEqual(['digest-overdue-1']);
    const item = one(document, '#digest-overdue-1');
    expect(one(item, 'a').getAttribute('href')).toBe('/tasks/1');
    expect(textOf(one(item, '.digest__time'))).toBe('11 Oct 9:00 AM');
    const review = one(document, '#digest-overdue a[href="/overdue"]');
    expect(textOf(review)).toBe('Review overdue');
  });

  it('orders by start, a task without one last and ties by id', async () => {
    task(times('09:00', '09:30'));
    task({ ...times('14:00', '14:30', '2026-10-11') });
    task({ scheduled_end: at('10:00'), status: 'pending' });
    task(times('09:00', '09:30'));
    rows();

    expect(overdueItemIds(await digest())).toEqual([
      'digest-overdue-2',
      'digest-overdue-1',
      'digest-overdue-4',
      'digest-overdue-3',
    ]);
  });

  it('shows the empty state with no review link when nothing is overdue', async () => {
    task(times('14:00', '14:45'));
    task({ status: 'done', ...times('09:00', '09:30') });
    rows();

    const document = await digest();

    expect(overdueItemIds(document)).toEqual([]);
    const empty = emptyStateNamed(document, 'Nothing overdue');
    expect(one(empty, '.empty-state__heading')).toBeDefined();
    expect(all(one(document, 'main'), 'a').filter((link) => textOf(link) === 'Review overdue')).toEqual([]);
  });
});

describe('the timeline link (AC5)', () => {
  it.each([
    ['with tasks', true],
    ['with none', false],
  ])('is one link to the timeline %s', async (_name, withTask) => {
    if (withTask) task(times('14:00', '14:30'));
    rows();

    const document = await digest();
    const link = one(document, '#timeline-link');

    expect(all(document, '#timeline-link')).toHaveLength(1);
    expect(link.getAttribute('href')).toBe('/timeline');
    expect(textOf(link)).toBe('View timeline');
  });
});

describe('reading only (AC6)', () => {
  it('leaves every task and setting as it was', async () => {
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    task(times('09:00', '09:30', '2026-10-11'));
    task(times('14:00', '14:30'));
    task({ status: 'in_progress', started_at: STORED, ...times('13:00', '14:00') });
    task({ status: 'done', ...times('08:00', '08:30') });
    createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id, ...times('18:00', '18:30') });
    task();
    task(times('14:00', '14:30', '2026-10-13'));
    const settings = (): unknown[] => testApp.db.prepare('SELECT key, value FROM settings ORDER BY key').all();
    const tasksBefore = listTasks(testApp.db);
    const settingsBefore = settings();
    vi.setSystemTime(new Date(Date.parse(NOW) + 60 * 60_000));

    await digest();
    await digest();

    expect(listTasks(testApp.db)).toEqual(tasksBefore);
    expect(settings()).toEqual(settingsBefore);
  });
});
