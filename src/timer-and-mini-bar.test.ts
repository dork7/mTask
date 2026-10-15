import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask, updateTask, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import {
  all,
  one,
  openPage,
  parseHtml,
  scriptErrors,
  stubClock,
  textOf,
  type DomDocument,
  type DomWindow,
} from './testing/dom.ts';
import { runLinkedScripts } from './testing/page.ts';

/*
 * The running timer on the sheet and its script (AC8), and the mini-bar every page shows
 * while a task is in progress (AC9). Only the host's `Date` is faked, so a request is
 * made at 1:36 PM in Dubai; a page opened in jsdom gets its own stub clock.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';
/** 12 minutes 5 seconds before `NOW`. */
const STARTED = '2026-10-12T09:23:55.000Z';

const PAGES = ['/', '/tasks', '/timeline', '/add', '/no-such-page'];

let testApp: TestApp;
const opened: DomWindow[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  testApp = createTestApp({ analyze: vi.fn<Analyze>() });
});

// A script that throws, on load or on a tick, fails the test that opened the page.
afterEach(() => {
  testApp.close();
  vi.useRealTimers();
  for (const window of opened.splice(0)) {
    const errors = scriptErrors(window);
    window.close();
    expect(errors).toEqual([]);
  }
});

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

async function get(address: string, status = 200): Promise<DomDocument> {
  const response = await request(testApp.app).get(address);
  expect(response.status).toBe(status);
  return parseHtml(response.text);
}

function statusOf(address: string): number {
  return address === '/no-such-page' ? 404 : 200;
}

describe('the running timer (AC8)', () => {
  it.each([
    [STARTED, '12:05'],
    ['2026-10-12T08:33:55.000Z', '1:02:05'],
    ['2026-10-12T08:36:01.000Z', '59:59'],
    ['2026-10-12T08:36:00.000Z', '1:00:00'],
  ])('started at %s, shows %s on the sheet', async (startedAt, text) => {
    task({ status: 'in_progress', started_at: startedAt });

    const timer = one(await get('/tasks/1'), '.task-sheet__timer .timer');

    expect(timer.getAttribute('data-started-at')).toBe(startedAt);
    expect(textOf(timer)).toBe(text);
  });

  it('says when the task started', async () => {
    task({ status: 'in_progress', started_at: STARTED });

    expect(textOf(one(await get('/tasks/1'), '.task-sheet__started'))).toBe('Started Today 1:23 PM');
  });

  it('is not on the sheet of a pending or a done task', async () => {
    task();
    task({ status: 'done', started_at: STARTED });

    for (const id of [1, 2]) {
      const document = await get(`/tasks/${id}`);
      expect(all(document, '.timer')).toEqual([]);
      expect(all(document, '.task-sheet__started')).toEqual([]);
    }
  });

  it('loads its script, which the app serves', async () => {
    task({ status: 'in_progress', started_at: STARTED });

    const scripts = all(await get('/tasks/1'), 'script[src="/js/timer.js"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].hasAttribute('defer')).toBe(true);

    const script = await request(testApp.app).get('/js/timer.js');
    expect(script.status).toBe(200);
    expect(script.headers['content-type']).toMatch(/javascript/);
  });

  it.each([
    [STARTED, '12:05', '12:06'],
    ['2026-10-12T08:36:01.000Z', '59:59', '1:00:00'],
  ])('started at %s, the script writes %s at once and %s a second later', async (startedAt, first, second) => {
    task({ status: 'in_progress', started_at: startedAt });
    const response = await request(testApp.app).get('/tasks/1');
    expect(response.status).toBe(200);
    const window = openPage(response.text);
    opened.push(window);
    const timers = all(window.document, '[data-started-at]');
    expect(timers).toHaveLength(2);
    for (const timer of timers) timer.textContent = '';

    const clock = stubClock(window, Date.parse(NOW));
    await expect(runLinkedScripts(testApp.app, window)).resolves.toEqual(['/js/timer.js']);

    expect(timers.map(textOf)).toEqual([first, first]);
    clock.advance(1000);
    expect(timers.map(textOf)).toEqual([second, second]);
  });
});

describe('the mini-bar (AC9)', () => {
  it.each(PAGES)('is on %s while a task is in progress', async (address) => {
    task({ title: '<b>x</b>', status: 'in_progress', started_at: STARTED });

    const document = await get(address, statusOf(address));

    const bar = one(document, '#mini-bar');
    expect(bar.closest('main')).toBeNull();
    const title = one(bar, 'a.mini-bar__title');
    expect(textOf(title)).toBe('<b>x</b>');
    expect(all(bar, 'b')).toEqual([]);
    expect(title.getAttribute('href')).toBe('/tasks/1');
    const timer = one(bar, '.timer');
    expect(timer.getAttribute('data-started-at')).toBe(STARTED);
    expect(textOf(timer)).toBe('12:05');
    const form = one(bar, 'form');
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/tasks/1/done?from=sheet');
    expect(all(form, 'button[type="submit"]').map(textOf)).toEqual(['Done']);
  });

  it.each(PAGES)('is not on %s with no task in progress', async (address) => {
    task();
    task({ status: 'done', started_at: STARTED });

    const document = await get(address, statusOf(address));

    expect(all(document, '#mini-bar')).toEqual([]);
    expect(all(document, 'script[src="/js/timer.js"]')).toEqual([]);
    if (address === '/') expect(all(document, 'script')).toHaveLength(2);
  });

  it('shows the task started last, and the higher id on the same start', async () => {
    task({ status: 'in_progress', started_at: '2026-10-12T08:00:00.000Z' });
    task({ status: 'in_progress', started_at: '2026-10-12T09:00:00.000Z' });
    task();

    expect(one(await get('/tasks'), '#mini-bar a.mini-bar__title').getAttribute('href')).toBe('/tasks/2');

    updateTask(testApp.db, 1, { started_at: '2026-10-12T09:00:00.000Z' });

    expect(one(await get('/tasks'), '#mini-bar a.mini-bar__title').getAttribute('href')).toBe('/tasks/2');
  });

  it('shows a task in progress without a start, without a timer', async () => {
    task({ status: 'in_progress' });

    const bar = one(await get('/tasks'), '#mini-bar');

    expect(one(bar, 'a.mini-bar__title').getAttribute('href')).toBe('/tasks/1');
    expect(all(bar, '.timer')).toEqual([]);
  });
});
