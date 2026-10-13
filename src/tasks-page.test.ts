import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, updateTask, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { findRule, valueOf } from './testing/css.ts';
import { all, one, parseHtml, textOf, visibleText, type DomDocument, type DomElement } from './testing/dom.ts';
import { getStylesheet, renderView } from './testing/page.ts';

/*
 * The task list as it is served: which tasks it shows, what a card says, the filters,
 * the sort and the empty states. The tasks are written straight into the database at
 * `NOW`, unless a test moves the clock to store one earlier.
 *
 * Only `Date` is faked, so a request is made at 1:36 PM in Dubai. The expected times are
 * Dubai clock times turned into timestamps by `dubai()`, this file's own arithmetic, or
 * the labels a person reads, written out.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';
/** 9:00 AM on 11 Oct 2026 in Dubai. */
const EARLIER = '2026-10-11T05:00:00.000Z';

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

/** A Dubai clock time, `HH:MM`, of 12 Oct 2026 or of a day after it, as a stored timestamp. */
function dubai(time: string, daysAhead = 0): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12 + daysAhead, hours - 4, minutes)).toISOString();
}

/** A pending task, unless `extra` says otherwise. */
function task(extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, { title: 'A task', status: 'pending', ...extra });
}

/** A draft, which needs a source. */
function draftTask(): Task {
  const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
  return createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id });
}

/** The list for this query, as it is served, parsed with its scripts off. */
async function list(query = ''): Promise<DomDocument> {
  const response = await request(testApp.app).get(`/tasks${query}`);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** The ids of the cards, in order. */
function ids(document: DomDocument): string[] {
  return all(document, '.task-list > li').map((card) => card.id);
}

/** The card ids `task-<n>` of these task numbers. */
function cards(...numbers: number[]): string[] {
  return numbers.map((number) => `task-${number}`);
}

/** The one chip of the filter bar with this label. */
function barChip(document: DomDocument, label: string): DomElement {
  const found = all(document, '.filter-bar a.chip').filter((chip) => visibleText(chip) === label);
  if (found.length !== 1) throw new Error(`Expected one bar chip "${label}", found ${found.length}`);
  return found[0];
}

/**
 * Six pending tasks, ids 1 to 6: `urgent`/`night`, `high`/`night`, `high`/`morning`,
 * `low`/`night`, no priority/`night`, `urgent`/no slot.
 */
function seedSix(): void {
  task({ priority: 'urgent', time_slot: 'night' });
  task({ priority: 'high', time_slot: 'night' });
  task({ priority: 'high', time_slot: 'morning' });
  task({ priority: 'low', time_slot: 'night' });
  task({ time_slot: 'night' });
  task({ priority: 'urgent' });
}

/**
 * Four pending tasks: A (1) at 3:00 PM, B (2) with no start and stored a day earlier,
 * C (3) at 2:00 PM, D (4) with no start.
 */
function seedStarts(): void {
  task({ title: 'A', scheduled_start: dubai('15:00'), scheduled_end: dubai('15:30') });
  vi.setSystemTime(new Date(EARLIER));
  task({ title: 'B' });
  vi.setSystemTime(new Date(NOW));
  task({ title: 'C', scheduled_start: dubai('14:00'), scheduled_end: dubai('14:30') });
  task({ title: 'D' });
}

describe('the list (AC1)', () => {
  it('shows one card per pending, in progress and done task, and no draft, in the app layout', async () => {
    draftTask();
    task();
    task({ status: 'in_progress' });
    task({ status: 'done' });

    const document = await list();

    expect(textOf(one(document, 'title'))).toBe('Tasks - Task Image AI');
    expect(one(document, 'a[aria-current="page"]').getAttribute('href')).toBe('/tasks');
    expect(textOf(one(document, 'main h1'))).toBe('Tasks');
    expect(ids(document)).toEqual(cards(2, 3, 4));
  });
});

describe('a card (AC2)', () => {
  it('shows the title as text, the minutes, the priority badge, the slot, the status and the start', async () => {
    task({
      title: '<b>x</b>',
      estimated_minutes: 25,
      priority: 'high',
      time_slot: 'morning',
      scheduled_start: dubai('14:30'),
      scheduled_end: dubai('14:55'),
    });

    const card = one(await list(), '#task-1');

    expect(all(card, 'b')).toEqual([]);
    expect(textOf(one(card, '.task__title'))).toBe('<b>x</b>');
    expect(textOf(one(card, '.task__minutes'))).toBe('25 min');
    expect(visibleText(one(card, '.badge.badge--high'))).toBe('High');
    expect(textOf(one(card, '.task__slot'))).toBe('Morning');
    expect(textOf(one(card, '.task__status'))).toBe('Pending');
    expect(textOf(one(card, '.task__start'))).toBe('Today 2:30 PM');
  });

  it('says what is not set: no estimate, no badge, no slot, not scheduled', async () => {
    task({ status: 'in_progress' });

    const card = one(await list(), '#task-1');

    expect(textOf(one(card, '.task__minutes'))).toBe('No estimate');
    expect(all(card, '.badge')).toEqual([]);
    expect(textOf(one(card, '.task__slot'))).toBe('No slot');
    expect(textOf(one(card, '.task__status'))).toBe('In progress');
    expect(textOf(one(card, '.task__start'))).toBe('Not scheduled');
  });

  it('shows Done for a done task', async () => {
    task({ status: 'done' });

    expect(textOf(one(one(await list(), '#task-1'), '.task__status'))).toBe('Done');
  });

  it('labels the start by the day of the request', async () => {
    task({ scheduled_start: dubai('09:00', 1), scheduled_end: dubai('09:30', 1) });

    expect(textOf(one(one(await list(), '#task-1'), '.task__start'))).toBe('Tomorrow 9:00 AM');
  });
});

describe('the filters (AC3)', () => {
  it.each([
    ['a priority alone', '?priority=urgent', [1, 6]],
    ['a slot alone', '?slot=night', [1, 2, 4, 5]],
    ['two priorities and a slot', '?priority=urgent&priority=high&slot=night', [1, 2]],
    ['a repeated value', '?priority=high&priority=high', [2, 3]],
    ['an unknown value only', '?priority=bogus', [1, 2, 3, 4, 5, 6]],
    ['an unknown value beside a known one', '?slot=night&slot=bogus', [1, 2, 4, 5]],
  ])('%s: %s', async (_name, query, shown) => {
    seedSix();

    expect(ids(await list(query))).toEqual(cards(...shown));
  });
});

describe('the sort (AC4)', () => {
  it.each(['', '?sort=start', '?sort=bogus'])('%s sorts by start, the tasks without one last', async (query) => {
    seedStarts();

    expect(ids(await list(query))).toEqual(cards(3, 1, 2, 4));
  });

  it('puts two tasks with the same start in id order', async () => {
    task({ title: 'Later', scheduled_start: dubai('15:00'), scheduled_end: dubai('15:30') });
    task({ title: 'Same', scheduled_start: dubai('14:00'), scheduled_end: dubai('14:30') });
    task({ title: 'Same too', scheduled_start: dubai('14:00'), scheduled_end: dubai('14:20') });

    expect(ids(await list())).toEqual(cards(2, 3, 1));
  });

  it('sort=priority goes urgent, high, medium, low, none, and by start within each', async () => {
    seedSix();
    expect(ids(await list('?sort=priority'))).toEqual(cards(1, 6, 2, 3, 4, 5));

    updateTask(testApp.db, 6, { scheduled_start: dubai('14:00'), scheduled_end: dubai('14:30') });
    expect(ids(await list('?sort=priority'))).toEqual(cards(6, 1, 2, 3, 4, 5));
  });

  it('sort=newest goes by created_at descending, then id descending', async () => {
    seedStarts();

    expect(ids(await list('?sort=newest'))).toEqual(cards(4, 3, 1, 2));
  });
});

describe('the filter bar (AC5)', () => {
  const QUERY = '?slot=night&sort=newest&priority=high&priority=bogus';

  it('has a chip link per priority and per slot, in the order of src/ui.ts', async () => {
    task({ priority: 'high', time_slot: 'night' });

    const chips = all(await list(QUERY), '.filter-bar .chip');

    expect(chips.map((chip) => visibleText(chip))).toEqual([
      'Urgent',
      'High',
      'Medium',
      'Low',
      'Morning',
      'Afternoon',
      'Evening',
      'Night',
    ]);
    for (const chip of chips) expect(chip.tagName).toBe('A');
  });

  it('links each chip to the list with its own value toggled, in the one order, keeping the rest', async () => {
    task({ priority: 'high', time_slot: 'night' });

    const document = await list(QUERY);

    expect(barChip(document, 'Urgent').getAttribute('href')).toBe(
      '/tasks?priority=urgent&priority=high&slot=night&sort=newest',
    );
    expect(barChip(document, 'High').getAttribute('href')).toBe('/tasks?slot=night&sort=newest');
    expect(barChip(document, 'Night').getAttribute('href')).toBe('/tasks?priority=high&sort=newest');
    expect(barChip(document, 'Morning').getAttribute('href')).toBe(
      '/tasks?priority=high&slot=morning&slot=night&sort=newest',
    );
  });

  it('marks the chips of the active values', async () => {
    task({ priority: 'high', time_slot: 'night' });

    const document = await list(QUERY);

    for (const label of ['High', 'Night']) {
      expect(barChip(document, label).classList.contains('chip--on')).toBe(true);
      expect(barChip(document, label).getAttribute('aria-current')).toBe('true');
    }
    expect(barChip(document, 'High').classList.contains('chip--high')).toBe(true);
    for (const label of ['Urgent', 'Morning']) {
      expect(barChip(document, label).classList.contains('chip--on')).toBe(false);
      expect(barChip(document, label).hasAttribute('aria-current')).toBe(false);
    }
  });

  it('writes no sort=start', async () => {
    expect(barChip(await list(), 'Low').getAttribute('href')).toBe('/tasks?priority=low');
  });

  it('renders a chip with href as a link, current and removable', async () => {
    const current = parseHtml(
      await renderView('partials/chip', { chip: { label: 'Night', href: '/tasks?slot=night', current: true } }),
    );
    const link = one(current, 'a');
    expect(link.getAttribute('href')).toBe('/tasks?slot=night');
    expect(link.getAttribute('aria-current')).toBe('true');

    const removable = parseHtml(
      await renderView('partials/chip', { chip: { label: 'Night', href: '/tasks', removable: true } }),
    );
    expect(visibleText(one(removable, 'a'))).toBe('Night');
  });

  it('makes a chip link a touch target and lets the bar scroll sideways', async () => {
    const { rules } = await getStylesheet();

    expect(valueOf(findRule(rules, '.chip[href]'), 'min-height')).toBe('var(--touch-target)');
    expect(valueOf(findRule(rules, '.filter-bar'), 'overflow-x')).toBe('auto');
  });
});

describe('the active filters and the sort control (AC6)', () => {
  const QUERY = '?slot=night&sort=newest&priority=high&priority=bogus';

  it('lists each active value as a chip linking to the list without it', async () => {
    task({ priority: 'high', time_slot: 'night' });

    const links = all(await list(QUERY), '.active-filters a');

    expect(links.map((link) => [visibleText(link), link.getAttribute('href')])).toEqual([
      ['High', '/tasks?slot=night&sort=newest'],
      ['Night', '/tasks?priority=high&sort=newest'],
    ]);
  });

  it('has no list of active filters when none is active', async () => {
    task();

    expect(all(await list(), '.active-filters')).toEqual([]);
  });

  it('has a GET form with the sort select, the current sort selected, and the filters as hidden inputs', async () => {
    task({ priority: 'high', time_slot: 'night' });

    const form = one(await list(QUERY), 'form.sort-form');

    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/tasks');
    expect(
      all(form, 'input[type="hidden"]').map((input) => [input.getAttribute('name'), input.getAttribute('value')]),
    ).toEqual([
      ['priority', 'high'],
      ['slot', 'night'],
    ]);
    const options = all(one(form, 'select[name="sort"]'), 'option');
    expect(options.map((option) => [option.getAttribute('value'), textOf(option)])).toEqual([
      ['start', 'Time'],
      ['priority', 'Priority'],
      ['newest', 'Newest'],
    ]);
    expect(all(form, 'option[selected]').map((option) => option.getAttribute('value'))).toEqual(['newest']);
    expect(all(form, 'button[type="submit"]')).toHaveLength(1);
  });

  it('selects start and has no hidden input on the bare list', async () => {
    task();

    const form = one(await list(), 'form.sort-form');

    expect(all(form, 'option[selected]').map((option) => option.getAttribute('value'))).toEqual(['start']);
    expect(all(form, 'input[type="hidden"]')).toEqual([]);
  });
});

describe('the empty states (AC7)', () => {
  it.each([
    ['no task, no query', false, ''],
    ['no task, a filter', false, '?priority=high'],
    ['only a draft', true, ''],
  ])('says No tasks yet with a link to /add: %s', async (_name, withDraft, query) => {
    if (withDraft) draftTask();

    const document = await list(query);

    const empty = one(document, '.empty-state');
    expect(textOf(one(empty, 'h2'))).toBe('No tasks yet');
    expect(all(empty, 'a[href="/add"]')).toHaveLength(1);
    expect(all(document, '.task-list')).toEqual([]);
  });

  it('says No tasks match these filters with a Clear filters link when tasks are listed but none is shown', async () => {
    task({ priority: 'low' });

    const document = await list('?priority=high');

    const empty = one(document, '.empty-state');
    expect(textOf(one(empty, 'h2'))).toBe('No tasks match these filters');
    const clear = one(empty, 'a');
    expect(textOf(clear)).toBe('Clear filters');
    expect(clear.getAttribute('href')).toBe('/tasks');
    expect(all(document, '.task-list')).toEqual([]);
  });
});
