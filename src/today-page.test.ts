import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, getTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { declarationsOf, findRule } from './testing/css.ts';
import { all, one, parseHtml, textOf, visibleText, type DomDocument } from './testing/dom.ts';
import { getStylesheet } from './testing/page.ts';

/*
 * The Today dashboard as it is served: the date, Next up and its Start form, the empty
 * state, the overdue banner, the progress, Later today and quick add. The tasks are
 * stored at `STORED`, a day before; `rows()` then moves the clock to `NOW`, 1:36 PM on
 * Monday 12 Oct in Dubai, the time of every request.
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

/** Every task as it is now. The clock then moves to `NOW`. */
function rows(): Task[] {
  const before = listTasks(testApp.db);
  vi.setSystemTime(new Date(NOW));
  return before;
}

async function home(): Promise<DomDocument> {
  const response = await request(testApp.app).get('/');
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** The text between `<main ...>` and `</main>`. */
function mainOf(html: string): string {
  const match = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html);
  if (!match) throw new Error('The page has no <main> element');
  return match[1];
}

function nextUpId(document: DomDocument): string | null {
  return one(document, '#next-up-title a').getAttribute('href');
}

describe('the page (AC1)', () => {
  it('is served in the layout with the title Today, its header and the Dubai date', async () => {
    rows();

    const response = await request(testApp.app).get('/');
    expect(response.status).toBe(200);
    const document = parseHtml(response.text);

    expect(textOf(one(document, 'title'))).toBe('Today - Task Image AI');
    expect(textOf(one(document, 'main h1'))).toBe('Today');
    expect(mainOf(response.text)).toContain('<h1>Today</h1>');
    expect(one(document, '[aria-current="page"]').getAttribute('href')).toBe('/');
    expect(textOf(one(document, '.page-header__sub'))).toBe('Monday, 12 Oct');
    expect(textOf(one(document, 'main'))).not.toContain('No tasks yet');
  });

  it('writes the date of the Dubai day of the request', async () => {
    vi.setSystemTime(new Date('2026-10-12T20:30:00.000Z'));

    expect(textOf(one(await home(), '.page-header__sub'))).toBe('Tuesday, 13 Oct');
  });

  it('escapes the task text', async () => {
    task({ title: '<b>x</b>', category: '<i>c</i>', ...times('14:00', '14:45') });
    task({ title: '<b>y</b>', ...times('16:00', '17:00') });
    rows();

    const document = await home();
    const main = one(document, 'main');

    expect(all(main, 'b')).toEqual([]);
    expect(all(main, 'i')).toEqual([]);
    expect(textOf(one(document, '#next-up-title a'))).toBe('<b>x</b>');
    expect(textOf(one(document, '.next-up__meta'))).toBe('<i>c</i> · about 30 min');
    expect(textOf(one(document, '#later-2 .later__title'))).toBe('<b>y</b>');
  });
});

describe('Next up (AC2)', () => {
  function specExample(): void {
    task(times('09:00', '09:30'));
    task({
      title: 'Submit expense report',
      priority: 'urgent',
      category: 'Admin',
      estimated_minutes: 45,
      ...times('14:00', '14:45'),
    });
    task(times('16:00', '17:00'));
  }

  it('is the first pending task of today whose end has not passed', async () => {
    specExample();
    rows();

    const document = await home();

    expect(all(document, '#next-up')).toHaveLength(1);
    expect(textOf(one(document, '.next-up__when'))).toBe('Next up · 2:00 PM');
    expect(textOf(one(document, '#next-up-title a'))).toBe('Submit expense report');
    expect(nextUpId(document)).toBe('/tasks/2');
    expect(visibleText(one(document, '#next-up .badge.badge--urgent'))).toBe('Urgent');
    expect(textOf(one(document, '.next-up__meta'))).toBe('Admin · about 45 min');
  });

  it('goes by start time, so a running slot created last comes first', async () => {
    specExample();
    task(times('13:00', '14:00'));
    rows();

    const document = await home();

    expect(nextUpId(document)).toBe('/tasks/4');
    expect(textOf(one(document, '.next-up__when'))).toBe('Next up · 1:00 PM');
  });

  it('takes a task that ends exactly now', async () => {
    task(times('13:00', '13:36'));
    task(times('15:00', '15:30'));
    rows();

    expect(nextUpId(await home())).toBe('/tasks/1');
  });

  it('is never in progress, done or a draft', async () => {
    task({ status: 'in_progress', ...times('13:30', '14:00') });
    task({ status: 'done', ...times('13:40', '14:00') });
    draftTask(times('13:45', '14:00'));
    task(times('15:00', '15:30'));
    rows();

    expect(nextUpId(await home())).toBe('/tasks/4');
  });

  it.each([
    ['a null category', { category: null, estimated_minutes: 45 }, 'about 45 min'],
    ['null minutes', { category: 'Admin', estimated_minutes: null }, 'Admin'],
  ] as const)('leaves %s out of the meta line', async (_name, extra, meta) => {
    task({ ...extra, ...times('14:00', '14:45') });
    rows();

    expect(textOf(one(await home(), '.next-up__meta'))).toBe(meta);
  });

  it('has no meta line when both parts are null', async () => {
    task({ category: null, estimated_minutes: null, ...times('14:00', '14:45') });
    rows();

    expect(all(await home(), '.next-up__meta')).toEqual([]);
  });

  it('has no badge for a null priority', async () => {
    task({ priority: null, ...times('14:00', '14:45') });
    rows();

    expect(all(one(await home(), '#next-up'), '.badge')).toEqual([]);
  });
});

describe('Start (AC3)', () => {
  it('is a form that posts to the task’s start route', async () => {
    task(times('14:00', '14:45'));
    rows();

    const form = one(await home(), '#next-up form');

    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/tasks/1/start');
    expect(textOf(one(form, 'button[type="submit"]'))).toBe('Start');
  });

  it('starts the task, and the next pending task becomes Next up', async () => {
    task(times('14:00', '14:45'));
    task(times('16:00', '16:30'));
    rows();
    const action = one(await home(), '#next-up form').getAttribute('action') ?? '';

    const response = await request(testApp.app).post(action);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/tasks/1');
    expect(getTask(testApp.db, 1)).toMatchObject({ status: 'in_progress', started_at: NOW });
    const after = await home();
    expect(nextUpId(after)).toBe('/tasks/2');
    expect(all(after, '#later-1')).toEqual([]);
  });

  it('shows the empty state once the last task is started', async () => {
    task(times('14:00', '14:45'));
    rows();

    await request(testApp.app).post('/tasks/1/start').expect(303);

    const after = await home();
    expect(all(after, '#next-up')).toEqual([]);
    expect(all(after, '.empty-state')).toHaveLength(1);
  });
});

describe('nothing next (AC4)', () => {
  function expectEmptyState(document: DomDocument): void {
    expect(all(document, '#next-up')).toEqual([]);
    const empty = one(document, 'main .empty-state');
    expect(textOf(one(empty, '.empty-state__heading'))).toBe('Nothing up next');
    expect(one(empty, 'a').getAttribute('href')).toBe('/add');
  }

  it('renders the empty state with no task', async () => {
    rows();

    expectEmptyState(await home());
  });

  it('takes no overdue, running or done task, and none from tomorrow', async () => {
    task(times('09:00', '09:30'));
    task({ status: 'in_progress', ...times('13:00', '14:00') });
    task({ status: 'done', ...times('15:00', '15:30') });
    task(times('14:00', '14:30', '2026-10-13'));
    rows();

    expectEmptyState(await home());
  });

  it('is not rendered when there is a Next up task', async () => {
    task(times('14:00', '14:45'));
    rows();

    expect(all(await home(), 'main .empty-state')).toEqual([]);
  });
});

describe('overdue banner (AC5)', () => {
  it('counts the pending tasks whose end has passed, on any day', async () => {
    task(times('09:00', '09:30', '2026-10-11'));
    task(times('09:00', '09:30'));
    task({ status: 'in_progress', ...times('10:00', '10:30', '2026-10-11') });
    task({ status: 'done', ...times('08:00', '08:30') });
    draftTask(times('11:00', '11:30', '2026-10-11'));
    rows();

    const document = await home();

    expect(all(document, '#overdue-banner')).toHaveLength(1);
    const banner = one(document, 'a#overdue-banner');
    expect(banner.getAttribute('href')).toBe('/overdue');
    expect(visibleText(banner)).toBe('2 overdue tasks Review');
  });

  it('writes one task in the singular', async () => {
    task(times('09:00', '09:30'));
    rows();

    expect(visibleText(one(await home(), '#overdue-banner'))).toBe('1 overdue task Review');
  });

  it('is not there when nothing is overdue', async () => {
    task(times('14:00', '14:30'));
    task({ status: 'done', ...times('09:00', '09:30') });
    rows();

    expect(all(await home(), '#overdue-banner')).toEqual([]);
  });
});

describe('progress (AC6)', () => {
  function expectProgress(document: DomDocument, minutes: string, tasks: string, percent: number): void {
    expect(all(document, '#progress')).toHaveLength(1);
    const progress = one(document, '#progress');
    expect(textOf(one(progress, '.progress__minutes'))).toBe(minutes);
    expect(textOf(one(progress, '.progress__tasks'))).toBe(tasks);
    expect(textOf(one(progress, '.progress__percent'))).toBe(`${percent}%`);
    expect(progress.getAttribute('role')).toBe('progressbar');
    expect(progress.getAttribute('aria-valuemin')).toBe('0');
    expect(progress.getAttribute('aria-valuemax')).toBe('100');
    expect(progress.getAttribute('aria-valuenow')).toBe(String(percent));
    expect(one(progress, '.progress__fill').getAttribute('width')).toBe(`${percent}%`);
  }

  it('shows the spec example by estimates, over today’s confirmed tasks', async () => {
    task({ status: 'done', estimated_minutes: 45, actual_minutes: 90, ...times('08:00', '08:45') });
    task({ status: 'done', estimated_minutes: 30, actual_minutes: 10, ...times('09:00', '09:30') });
    task({ estimated_minutes: 45, ...times('14:00', '14:45') });
    task({ estimated_minutes: 60, ...times('16:00', '17:00') });
    task({ estimated_minutes: 60, ...times('18:00', '19:00') });
    task({ status: 'done', estimated_minutes: 30, ...times('09:00', '09:30', '2026-10-11') });
    draftTask({ estimated_minutes: 50, ...times('20:00', '20:50') });
    rows();

    expectProgress(await home(), '75 of 240 min done', '2 of 5 tasks finished', 31);
  });

  it('shows nothing done of nothing with no task', async () => {
    rows();

    expectProgress(await home(), '0 of 0 min done', '0 of 0 tasks finished', 0);
  });

  it('shows nothing done of nothing with only a done task yesterday', async () => {
    task({ status: 'done', ...times('09:00', '09:30', '2026-10-11') });
    rows();

    expectProgress(await home(), '0 of 0 min done', '0 of 0 tasks finished', 0);
  });
});

describe('later today (AC7)', () => {
  it('lists the other pending tasks left today, in start order', async () => {
    task({ title: 'Review PR', priority: 'high', category: 'Coding', estimated_minutes: 60, ...times('16:00', '17:00') });
    task(times('14:00', '14:30'));
    task({ priority: null, category: null, ...times('20:00', '20:30') });
    task({ priority: 'low', ...times('15:00', '15:30') });
    task({ status: 'done', ...times('17:00', '17:30') });
    task({ status: 'in_progress', ...times('15:30', '16:00') });
    draftTask(times('18:00', '18:30'));
    task(times('09:00', '09:30'));
    task(times('14:00', '14:30', '2026-10-13'));
    rows();

    const document = await home();

    expect(textOf(one(document, 'h2#later-heading'))).toBe('Later today');
    expect(all(document, '.later__item').map((item) => item.id)).toEqual(['later-4', 'later-1', 'later-3']);
    expect(all(document, '#later-2')).toEqual([]);

    const first = one(document, '#later-1');
    const title = one(first, '.later__title');
    expect(textOf(title)).toBe('Review PR');
    expect(title.getAttribute('href')).toBe('/tasks/1');
    expect(textOf(one(first, '.later__meta'))).toBe('Coding · 60 min');
    expect(textOf(one(first, '.later__time'))).toBe('4:00 PM');
    expect(one(first, '.dot').getAttribute('class')).toBe('dot d-high');

    const last = one(document, '#later-3');
    expect(one(last, '.dot').classList.contains('d-none')).toBe(true);
    expect(textOf(one(last, '.later__meta'))).toBe('30 min');
  });

  it.each([
    ['only the Next up task', true],
    ['no task', false],
  ])('is not rendered with %s', async (_name, withTask) => {
    if (withTask) task(times('14:00', '14:30'));
    rows();

    const document = await home();

    expect(all(document, '.later')).toEqual([]);
    expect(all(document, 'main *').filter((element) => textOf(element) === 'Later today')).toEqual([]);
  });

  it.each(['urgent', 'high', 'medium', 'low'])('colours the dot of a %s task with its token', async (priority) => {
    const { rules } = await getStylesheet();

    expect(declarationsOf(findRule(rules, `.d-${priority}`))).toEqual({ background: `var(--${priority})` });
  });
});

describe('quick add (AC8)', () => {
  it.each([
    ['no task', false],
    ['a Next up task and a Later item', true],
  ])('links to the three Add tabs in order with %s', async (_name, withTasks) => {
    if (withTasks) {
      task(times('14:00', '14:30'));
      task(times('16:00', '16:30'));
    }
    rows();

    const links = all(one(await home(), '#quick-add'), 'a');

    expect(links.map((link) => [visibleText(link), link.getAttribute('href')])).toEqual([
      ['Photo', '/add?tab=photo'],
      ['Voice', '/add?tab=voice'],
      ['Type', '/add?tab=text'],
    ]);
    for (const link of links) expect(all(link, '[aria-hidden="true"]')).toHaveLength(1);
  });
});

describe('reading only (AC9)', () => {
  it('leaves every task and setting as it was', async () => {
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    task(times('09:00', '09:30', '2026-10-11'));
    task(times('14:00', '14:30'));
    task(times('16:00', '16:30'));
    task({ status: 'in_progress', started_at: STORED, ...times('13:00', '14:00') });
    task({ status: 'done', ...times('08:00', '08:30') });
    createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id, ...times('18:00', '18:30') });
    task();
    const settings = (): unknown[] => testApp.db.prepare('SELECT key, value FROM settings ORDER BY key').all();
    const tasksBefore = listTasks(testApp.db);
    const settingsBefore = settings();
    vi.setSystemTime(new Date(Date.parse(NOW) + 60 * 60_000));

    await home();
    await home();

    expect(listTasks(testApp.db)).toEqual(tasksBefore);
    expect(settings()).toEqual(settingsBefore);
  });
});
