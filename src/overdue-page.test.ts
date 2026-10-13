import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf, visibleText, type DomDocument } from './testing/dom.ts';

/*
 * The overdue view as it is served: which tasks it shows, the groups they are in and
 * what a card says. The tasks are stored at `STORED`, a day before; `rows()` then moves
 * the clock to `NOW`, 1:36 PM on 12 Oct in Dubai, the time of every request.
 */

/** 9:00 AM on 11 Oct 2026 in Dubai. */
const STORED = '2026-10-11T05:00:00.000Z';
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

/** 9:00 to 9:30 AM on 11 Oct in Dubai. */
const YESTERDAY = { scheduled_start: '2026-10-11T05:00:00.000Z', scheduled_end: '2026-10-11T05:30:00.000Z' };

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

async function page(): Promise<DomDocument> {
  const response = await request(testApp.app).get('/overdue');
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** Each group as its heading and the ids of its cards. */
function groupsOf(document: DomDocument): [string, string[]][] {
  return all(document, '.overdue-group').map((group) => [
    textOf(one(group, 'h2')),
    all(group, 'li').map((card) => card.id),
  ]);
}

function cardIds(document: DomDocument): string[] {
  return all(document, 'li.card.task').map((card) => card.id);
}

describe('the page (AC1)', () => {
  it('is served in the layout with the title Overdue and no current nav item', async () => {
    rows();

    const document = await page();

    expect(textOf(one(document, 'title'))).toBe('Overdue - Task Image AI');
    expect(textOf(one(document, 'main h1'))).toBe('Overdue');
    one(document, 'nav.app-nav');
    expect(all(document, '[aria-current="page"]')).toEqual([]);
  });

  it('shows only the pending tasks whose end is before now', async () => {
    task(YESTERDAY);
    task({ scheduled_start: '2026-10-12T09:00:00.000Z', scheduled_end: NOW });
    task({ scheduled_start: '2026-10-12T09:07:00.000Z', scheduled_end: '2026-10-12T09:37:00.000Z' });
    task();
    draftTask(YESTERDAY);
    task({ status: 'in_progress', ...YESTERDAY });
    task({ status: 'done', ...YESTERDAY });
    rows();

    expect(cardIds(await page())).toEqual(['task-1']);
  });
});

describe('the groups (AC2)', () => {
  it('puts the spec examples under Today, Yesterday and Earlier, in that order', async () => {
    task({ scheduled_start: '2026-10-09T05:00:00.000Z', scheduled_end: '2026-10-09T05:30:00.000Z' });
    task(YESTERDAY);
    task({ scheduled_start: '2026-10-12T05:00:00.000Z', scheduled_end: '2026-10-12T05:30:00.000Z' });
    task({ scheduled_start: '2026-10-12T09:00:00.000Z', scheduled_end: NOW });
    rows();

    expect(groupsOf(await page())).toEqual([
      ['Today', ['task-3']],
      ['Yesterday', ['task-2']],
      ['Earlier', ['task-1']],
    ]);
  });

  it('groups a task by the Dubai day of its end, not of its start', async () => {
    task({ scheduled_start: '2026-10-11T19:50:00.000Z', scheduled_end: '2026-10-11T20:30:00.000Z' });
    rows();

    expect(groupsOf(await page())).toEqual([['Today', ['task-1']]]);
  });

  it('renders no group without a task', async () => {
    task(YESTERDAY);
    task({ scheduled_start: '2026-10-11T06:00:00.000Z', scheduled_end: '2026-10-11T06:30:00.000Z' });
    rows();

    const document = await page();

    expect(groupsOf(document)).toEqual([['Yesterday', ['task-1', 'task-2']]]);
    expect(all(document, 'h2').map((heading) => textOf(heading))).toEqual(['Yesterday']);
  });

  it('orders a group by start, ties by id', async () => {
    task({ scheduled_start: '2026-10-11T06:00:00.000Z', scheduled_end: '2026-10-11T06:30:00.000Z' });
    task(YESTERDAY);
    task(YESTERDAY);
    rows();

    expect(groupsOf(await page())).toEqual([['Yesterday', ['task-2', 'task-3', 'task-1']]]);
  });
});

describe('a card (AC3)', () => {
  it('shows the escaped title, the minutes, the badge and when it was due', async () => {
    task({
      title: '<b>x</b>',
      priority: 'high',
      estimated_minutes: 25,
      scheduled_start: '2026-10-12T05:00:00.000Z',
      scheduled_end: '2026-10-12T05:30:00.000Z',
    });
    rows();

    const card = one(await page(), '#task-1');

    expect(textOf(one(card, 'h3.task__title'))).toBe('<b>x</b>');
    expect(all(card, 'b')).toEqual([]);
    expect(textOf(one(card, '.task__minutes'))).toBe('25 min');
    expect(all(card, '.badge')).toHaveLength(1);
    expect(visibleText(one(card, '.badge.badge--high'))).toBe('High');
    expect(textOf(one(card, '.task__due'))).toBe('Today 9:00 AM');
  });

  it('says No estimate, has no badge without a priority, and dates a task of another day', async () => {
    task({ estimated_minutes: null, priority: null, ...YESTERDAY });
    rows();

    const card = one(await page(), '#task-1');

    expect(textOf(one(card, '.task__minutes'))).toBe('No estimate');
    expect(all(card, '.badge')).toEqual([]);
    expect(textOf(one(card, '.task__due'))).toBe('11 Oct 9:00 AM');
  });
});

describe('the empty state (AC4)', () => {
  it('says Nothing overdue and links to the task list when no task is overdue', async () => {
    task({ status: 'done', ...YESTERDAY });
    task({ scheduled_start: '2026-10-12T10:00:00.000Z', scheduled_end: '2026-10-12T10:30:00.000Z' });
    rows();

    const document = await page();

    expect(textOf(one(document, '.empty-state h2'))).toBe('Nothing overdue');
    const links = all(document, '.empty-state a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/tasks');
    expect(all(document, '.overdue-group')).toEqual([]);
    expect(all(document, 'h2').map((heading) => textOf(heading))).toEqual(['Nothing overdue']);
  });

  it('is not there when a task is overdue', async () => {
    task(YESTERDAY);
    rows();

    expect(all(await page(), '.empty-state')).toEqual([]);
  });
});
