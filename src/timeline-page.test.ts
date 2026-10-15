import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSetting } from './db/settings.ts';
import { createSource } from './db/sources.ts';
import { createTask, listTasks, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { findRule, valueOf, type CssRule } from './testing/css.ts';
import { all, one, parseHtml, textOf, type DomDocument, type DomElement } from './testing/dom.ts';
import { getStylesheet } from './testing/page.ts';

/*
 * The timeline as it is served: the day it shows, the switcher, the axis and its bands,
 * the blocks, their layout and conflicts, the now line and the empty day. The tasks are
 * written straight into the database.
 *
 * Only `Date` is faked, so a request is made at 1:36 PM in Dubai unless a test moves the
 * clock. Expected times are Dubai clock times turned into timestamps by `dubai()`, this
 * file's own arithmetic, and expected percents are written out or worked here from the
 * minutes of the axis.
 */

/** 1:36 PM on Monday 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

/** `Node.DOCUMENT_POSITION_FOLLOWING`. */
const FOLLOWING = 4;

const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;
const SLOTS = ['morning', 'afternoon', 'evening', 'night'] as const;

let testApp: TestApp;
let savedTz: string | undefined;

beforeEach(() => {
  savedTz = process.env.TZ;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  testApp = createTestApp({ analyze: vi.fn<Analyze>() });
});

afterEach(() => {
  testApp.close();
  vi.useRealTimers();
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

/** A Dubai clock time, `HH:MM`, of 12 Oct 2026 or of a day after it, as a stored timestamp. */
function dubai(time: string, daysAhead = 0): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12 + daysAhead, hours - 4, minutes)).toISOString();
}

/** A pending medium task from `from` to `to`, unless `extra` says otherwise. */
function block(from: string, to: string, extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, {
    title: 'A task',
    status: 'pending',
    priority: 'medium',
    scheduled_start: from,
    scheduled_end: to,
    ...extra,
  });
}

/** The timeline for this query, as it is served, parsed with its scripts off. */
async function timeline(query = ''): Promise<DomDocument> {
  const response = await request(testApp.app).get(`/timeline${query}`);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** A percent in an element's inline style. Throws when there is none. */
function percentOf(element: DomElement, property: string): number {
  const style = element.getAttribute('style') ?? '';
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*(-?[\\d.]+)%`).exec(style);
  if (match === null) throw new Error(`No ${property} percent in "${style}"`);
  return Number(match[1]);
}

function heading(document: DomDocument): string {
  return textOf(one(document, '.day-switcher__day'));
}

function hourLabels(document: DomDocument): string[] {
  return all(document, '.tl .hour').map(textOf);
}

function hour(document: DomDocument, label: string): DomElement {
  const found = all(document, '.tl .hour').filter((element) => textOf(element) === label);
  if (found.length !== 1) throw new Error(`Expected one hour "${label}", found ${found.length}`);
  return found[0];
}

function hrefOf(document: DomDocument, selector: string): string | null {
  return one(document, selector).getAttribute('href');
}

/** The rule list position of a selector's one rule. */
function indexOf(rules: CssRule[], selector: string): number {
  return rules.indexOf(findRule(rules, selector));
}

describe('GET /timeline: the day (AC1)', () => {
  it('answers with the layout, the title and the Timeline link current, on today', async () => {
    const response = await request(testApp.app).get('/timeline');
    expect(response.status).toBe(200);
    const document = parseHtml(response.text);

    expect(textOf(one(document, 'title'))).toBe('Timeline - Task Image AI');
    expect(textOf(one(document, 'main h1'))).toBe('Timeline');
    expect(one(document, 'a[aria-current="page"]').getAttribute('href')).toBe('/timeline');
    expect(heading(document)).toBe('Today · 12 Oct');
  });

  it('shows the day a date names', async () => {
    expect(heading(await timeline('?date=2026-10-14'))).toBe('Wed · 14 Oct');
  });

  it.each([
    '?date=2026-13-01',
    '?date=2026-02-30',
    '?date=tomorrow',
    '?date=',
    '?date=2026-10-14&date=2026-10-14',
    '?date[]=2026-10-14',
  ])('falls back to today for %s', async (query) => {
    expect(heading(await timeline(query))).toBe('Today · 12 Oct');
  });

  it('shows the tasks of the day it names, not only its heading', async () => {
    const task = block(dubai('10:00', 2), dubai('11:00', 2));

    expect(all(await timeline('?date=2026-10-14'), `#block-${task.id}`)).toHaveLength(1);
    expect(all(await timeline(), `#block-${task.id}`)).toHaveLength(0);
  });

  it('reads the day and the times on the Dubai clock in another time zone', async () => {
    process.env.TZ = 'Pacific/Kiritimati';
    const task = block(dubai('09:00'), dubai('10:00'));
    const document = await timeline();

    expect(heading(document)).toBe('Today · 12 Oct');
    expect(textOf(one(document, `#block-${task.id}`))).toContain('9:00 AM–10:00 AM');
  });
});

describe('the day switcher (AC2)', () => {
  it('links the day before and after, and has no Today link on today', async () => {
    const document = await timeline();

    expect(hrefOf(document, 'a[aria-label="Previous day"]')).toBe('/timeline?date=2026-10-11');
    expect(hrefOf(document, 'a[aria-label="Next day"]')).toBe('/timeline?date=2026-10-13');
    expect(all(document, 'main a[href="/timeline"]')).toHaveLength(0);
  });

  it.each([
    ['?date=2026-10-13', 'Tomorrow · 13 Oct'],
    ['?date=2026-10-11', 'Yesterday · 11 Oct'],
  ])('on %s says %s and links back to today', async (query, text) => {
    const document = await timeline(query);

    expect(heading(document)).toBe(text);
    const today = all(document, 'main a[href="/timeline"]');
    expect(today.map(textOf)).toEqual(['Today']);
  });

  it('rolls over the end of a year and of a month', async () => {
    const yearEnd = await timeline('?date=2026-12-31');
    expect(heading(yearEnd)).toBe('Thu · 31 Dec');
    expect(hrefOf(yearEnd, 'a[aria-label="Next day"]')).toBe('/timeline?date=2027-01-01');
    expect(hrefOf(yearEnd, 'a[aria-label="Previous day"]')).toBe('/timeline?date=2026-12-30');

    const march = await timeline('?date=2026-03-01');
    expect(hrefOf(march, 'a[aria-label="Previous day"]')).toBe('/timeline?date=2026-02-28');
  });
});

describe('the axis (AC3)', () => {
  it('runs over the working hours with a label per hour', async () => {
    const document = await timeline();

    expect(all(document, '.tl')).toHaveLength(1);
    expect(hourLabels(document)).toEqual([
      '9 AM',
      '10 AM',
      '11 AM',
      '12 PM',
      '1 PM',
      '2 PM',
      '3 PM',
      '4 PM',
      '5 PM',
      '6 PM',
      '7 PM',
      '8 PM',
      '9 PM',
      '10 PM',
    ]);
    expect(percentOf(hour(document, '12 PM'), 'top')).toBeCloseTo(23.08, 2);
    expect(percentOf(hour(document, '9 AM'), 'top')).toBeCloseTo(0, 2);
    expect(percentOf(hour(document, '10 PM'), 'top')).toBeCloseTo(100, 2);
  });

  it('widens to the hour before a block that starts early', async () => {
    block(dubai('07:30'), dubai('08:00'));
    const document = await timeline();
    const labels = hourLabels(document);

    expect(labels[0]).toBe('7 AM');
    expect(percentOf(hour(document, '7 AM'), 'top')).toBeCloseTo(0, 2);
    expect(percentOf(hour(document, '9 AM'), 'top')).toBeCloseTo((2 / 15) * 100, 2);
    expect(labels[labels.length - 1]).toBe('10 PM');
    expect(percentOf(hour(document, '10 PM'), 'top')).toBeCloseTo(100, 2);
  });

  it('widens up to midnight and no further, cutting a block there', async () => {
    const task = block(dubai('23:30'), dubai('00:30', 1));
    const document = await timeline();
    const labels = hourLabels(document);

    expect(labels).toHaveLength(16);
    expect(labels[0]).toBe('9 AM');
    expect(labels[15]).toBe('12 AM');
    expect(percentOf(hour(document, '12 AM'), 'top')).toBeCloseTo(100, 2);
    expect(percentOf(one(document, `#block-${task.id}`), 'height')).toBeCloseTo((30 / 900) * 100, 2);
  });

  it('follows the working hours setting read at the request', async () => {
    setSetting(testApp.db, 'working_hours', { start: '10:00', end: '18:00' });
    const labels = hourLabels(await timeline());

    expect(labels).toHaveLength(9);
    expect(labels[0]).toBe('10 AM');
    expect(labels[8]).toBe('6 PM');
  });
});

describe('the slot bands (AC4)', () => {
  it('draws the four bands in percent of the axis', async () => {
    const bands = all(await timeline(), '.band');

    expect(bands.map((band) => band.getAttribute('data-slot'))).toEqual([...SLOTS]);
    expect(bands.map(textOf)).toEqual(['Morning', 'Afternoon', 'Evening', 'Night']);
    const expected = [
      [0, 23.08],
      [23.08, 38.46],
      [61.54, 23.08],
      [84.62, 15.38],
    ];
    bands.forEach((band, index) => {
      expect(percentOf(band, 'top')).toBeCloseTo(expected[index][0], 2);
      expect(percentOf(band, 'height')).toBeCloseTo(expected[index][1], 2);
    });
  });

  it('cuts the bands to the axis and leaves out a band with nothing left', async () => {
    setSetting(testApp.db, 'working_hours', { start: '13:00', end: '18:00' });
    const bands = all(await timeline(), '.band');

    expect(bands.map((band) => band.getAttribute('data-slot'))).toEqual(['afternoon', 'evening']);
    expect(percentOf(bands[0], 'top')).toBeCloseTo(0, 2);
    expect(percentOf(bands[0], 'height')).toBeCloseTo(80, 2);
    expect(percentOf(bands[1], 'top')).toBeCloseTo(80, 2);
    expect(percentOf(bands[1], 'height')).toBeCloseTo(20, 2);
  });

  it('puts the bands before the blocks, inside the axis', async () => {
    block(dubai('10:00'), dubai('11:00'));
    const document = await timeline();
    const axis = one(document, '.tl');
    const blocks = one(document, 'ol.tl__blocks');

    expect(axis.contains(blocks)).toBe(true);
    for (const band of all(document, '.band')) {
      expect(axis.contains(band)).toBe(true);
      expect(band.compareDocumentPosition(blocks) & FOLLOWING).toBe(FOLLOWING);
    }
  });

  it('colors each band with its slot token and stacks it without a z-index', async () => {
    const { rules } = await getStylesheet();

    for (const slot of SLOTS) {
      expect(valueOf(findRule(rules, `.band[data-slot="${slot}"]`), 'background')).toBe(`var(--slot-${slot})`);
    }
    expect(valueOf(findRule(rules, '.band'), 'z-index')).toBeUndefined();
  });
});

describe('the blocks (AC5)', () => {
  it('places a block by its start and length, with its title escaped and its times', async () => {
    const task = block(dubai('09:00'), dubai('10:30'), { title: '<b>x</b>', priority: 'high' });
    const element = one(await timeline(), `li#block-${task.id}`);

    expect(element.classList.contains('blk')).toBe(true);
    expect(element.classList.contains('k-high')).toBe(true);
    expect(percentOf(element, 'top')).toBeCloseTo(0, 2);
    expect(percentOf(element, 'height')).toBeCloseTo(11.54, 2);
    expect(all(element, 'b')).toHaveLength(0);
    const text = textOf(element);
    expect(text).toContain('<b>x</b>');
    expect(text).toContain('9:00 AM–10:30 AM');
    expect(text).not.toContain('Done');
    expect(text).not.toContain('In progress');
  });

  it('places an afternoon block', async () => {
    const task = block(dubai('16:00'), dubai('17:00'));
    const element = one(await timeline(), `#block-${task.id}`);

    expect(percentOf(element, 'top')).toBeCloseTo(53.85, 2);
    expect(percentOf(element, 'height')).toBeCloseTo(7.69, 2);
  });

  it('says In progress and Done for those statuses', async () => {
    const started = block(dubai('09:00'), dubai('10:00'), { status: 'in_progress' });
    const done = block(dubai('11:00'), dubai('12:00'), { status: 'done' });
    const document = await timeline();

    expect(textOf(one(document, `#block-${started.id}`))).toContain('In progress');
    expect(textOf(one(document, `#block-${done.id}`))).toContain('Done');
  });

  it('marks an urgent block with a hidden ▲ and a null priority with k-none', async () => {
    const urgent = block(dubai('09:00'), dubai('10:00'), { priority: 'urgent' });
    const high = block(dubai('11:00'), dubai('12:00'), { priority: 'high' });
    const none = block(dubai('13:00'), dubai('14:00'), { priority: null });
    const document = await timeline();

    const urgentBlock = one(document, `#block-${urgent.id}`);
    expect(textOf(all(urgentBlock, '[aria-hidden="true"]')[0])).toBe('▲');
    expect(textOf(urgentBlock).startsWith('▲')).toBe(true);
    expect(textOf(one(document, `#block-${high.id}`))).not.toContain('▲');
    expect(one(document, `#block-${none.id}`).classList.contains('k-none')).toBe(true);
  });

  it('shows only confirmed tasks with both times that start on the Dubai day', async () => {
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    const hidden = [
      block(dubai('10:00'), dubai('11:00'), { status: 'draft', source_id: source.id }),
      block(dubai('10:00'), dubai('11:00'), { scheduled_start: null, scheduled_end: null }),
      block(dubai('10:00'), dubai('11:00'), { scheduled_end: null }),
      block(dubai('10:00', 1), dubai('11:00', 1)),
      block(dubai('23:55', -1), dubai('23:59', -1)),
    ];
    const shown = block(dubai('02:00'), dubai('03:00'));
    const document = await timeline();

    for (const task of hidden) expect(all(document, `#block-${task.id}`), task.scheduled_start ?? 'none').toHaveLength(0);
    expect(all(document, `#block-${shown.id}`)).toHaveLength(1);
  });
});

describe('the priority colors (AC6)', () => {
  it('tints each priority with its tokens, and k-none with none of them', async () => {
    const { rules } = await getStylesheet();

    for (const priority of PRIORITIES) {
      const rule = findRule(rules, `.k-${priority}`);
      expect(valueOf(rule, 'background')).toBe(`var(--${priority}-bg)`);
      expect(valueOf(rule, 'border-color')).toBe(`var(--${priority})`);
    }
    for (const { value } of findRule(rules, '.k-none').declarations) {
      for (const priority of PRIORITIES) expect(value).not.toContain(`--${priority}`);
    }
  });
});

describe('overlaps and conflicts (AC7, AC8)', () => {
  it('lays overlapping blocks side by side and a touching or lone block full width', async () => {
    const first = block(dubai('14:00'), dubai('14:45'));
    const second = block(dubai('14:30'), dubai('15:00'));
    const touching = block(dubai('15:00'), dubai('15:30'));
    const lone = block(dubai('09:00'), dubai('10:00'));
    const document = await timeline();
    const layout = (task: Task): number[] => {
      const element = one(document, `#block-${task.id}`);
      return [percentOf(element, 'left'), percentOf(element, 'width')];
    };

    expect(layout(first)).toEqual([0, 50]);
    expect(layout(second)).toEqual([50, 50]);
    expect(layout(touching)).toEqual([0, 100]);
    expect(layout(lone)).toEqual([0, 100]);
  });

  it('marks two open overlapping blocks as conflicts and a touching one not', async () => {
    const first = block(dubai('14:00'), dubai('14:45'));
    const second = block(dubai('14:30'), dubai('15:00'));
    const touching = block(dubai('15:00'), dubai('15:30'));
    const document = await timeline();

    for (const task of [first, second]) {
      const element = one(document, `#block-${task.id}`);
      expect(element.classList.contains('conflict')).toBe(true);
      expect(textOf(element).endsWith('⚠')).toBe(true);
      expect(textOf(all(element, '[aria-hidden="true"]').at(-1) as DomElement)).toBe('⚠');
      expect(textOf(one(element, '.visually-hidden'))).toBe('Conflict');
    }
    const third = one(document, `#block-${touching.id}`);
    expect(third.classList.contains('conflict')).toBe(false);
    expect(textOf(third)).not.toContain('⚠');
    expect(textOf(third)).not.toContain('Conflict');
  });

  it('makes no conflict of a done task over a pending one, but lays them side by side', async () => {
    const done = block(dubai('14:00'), dubai('14:45'), { status: 'done' });
    const pending = block(dubai('14:30'), dubai('15:00'));
    const document = await timeline();

    for (const task of [done, pending]) {
      const element = one(document, `#block-${task.id}`);
      expect(element.classList.contains('conflict')).toBe(false);
      expect(percentOf(element, 'width')).toBe(50);
    }
  });

  it('hatches a conflict over the priority tint', async () => {
    const { rules } = await getStylesheet();

    expect(valueOf(findRule(rules, '.conflict'), 'background-image')).toMatch(/^repeating-linear-gradient\(/);
    for (const tone of [...PRIORITIES, 'none']) {
      expect(indexOf(rules, '.conflict')).toBeGreaterThan(indexOf(rules, `.k-${tone}`));
    }
  });
});

describe('the now line (AC9)', () => {
  it('is drawn on today at the request time', async () => {
    expect(percentOf(one(await timeline(), '.tl .now'), 'top')).toBeCloseTo(35.38, 2);
  });

  it.each(['?date=2026-10-13', '?date=2026-10-11'])('is not drawn on %s', async (query) => {
    expect(all(await timeline(query), '.now')).toHaveLength(0);
  });

  it('is not drawn at midnight on the day before, whose axis ends at that midnight', async () => {
    vi.setSystemTime(new Date(dubai('00:00')));
    block(dubai('23:30', -1), dubai('00:30'));
    const document = await timeline('?date=2026-10-11');

    expect(hourLabels(document).at(-1)).toBe('12 AM');
    expect(all(document, '.now')).toHaveLength(0);
  });

  it.each(['08:00', '23:00'])('is not drawn at %s, outside the axis', async (time) => {
    vi.setSystemTime(new Date(dubai(time)));

    expect(all(await timeline(), '.now')).toHaveLength(0);
  });

  it('is drawn inside an axis widened by a block', async () => {
    vi.setSystemTime(new Date(dubai('08:00')));
    block(dubai('07:30'), dubai('08:00'));

    expect(percentOf(one(await timeline(), '.tl .now'), 'top')).toBeCloseTo((1 / 15) * 100, 2);
  });

  it('is colored urgent', async () => {
    const { rules } = await getStylesheet();

    expect(valueOf(findRule(rules, '.now'), 'background')).toBe('var(--urgent)');
  });
});

describe('the empty day (AC10)', () => {
  it('still draws the axis, and says Nothing scheduled with a link to add', async () => {
    const document = await timeline();

    expect(textOf(one(document, '.empty-state h2'))).toBe('Nothing scheduled');
    expect(all(one(document, '.empty-state'), 'a[href="/add"]')).toHaveLength(1);
    expect(all(document, '.tl')).toHaveLength(1);
    expect(all(document, '.tl .hour')).toHaveLength(14);
    expect(all(document, '.tl .band')).toHaveLength(4);
    expect(all(document, 'ol.tl__blocks')).toHaveLength(0);
  });

  it('counts only the blocks of the day shown', async () => {
    block(dubai('10:00', 1), dubai('11:00', 1));

    expect(textOf(one(await timeline(), '.empty-state h2'))).toBe('Nothing scheduled');
  });

  it('has no empty state with a block today', async () => {
    block(dubai('10:00'), dubai('11:00'));

    expect(all(await timeline(), '.empty-state')).toHaveLength(0);
  });
});

describe('reading only (AC11)', () => {
  it('leaves every task and settings row as it was', async () => {
    const source = createSource(testApp.db, { kind: 'text', transcript: 'x' });
    block(dubai('09:00'), dubai('10:00'));
    block(dubai('11:00'), dubai('12:00'), { status: 'in_progress' });
    block(dubai('13:00'), dubai('14:00'), { status: 'done' });
    block(dubai('15:00'), dubai('16:00'), { status: 'draft', source_id: source.id });
    createTask(testApp.db, { title: 'No times', status: 'pending' });
    const settings = (): unknown[] => testApp.db.prepare('SELECT key, value FROM settings ORDER BY key').all();
    const tasksBefore = listTasks(testApp.db);
    const settingsBefore = settings();

    vi.setSystemTime(new Date(Date.parse(NOW) + 60 * 60_000));
    for (const query of ['', '?date=2026-10-13', '?date=bogus']) await timeline(query);

    expect(listTasks(testApp.db)).toEqual(tasksBefore);
    expect(settings()).toEqual(settingsBefore);
  });
});
