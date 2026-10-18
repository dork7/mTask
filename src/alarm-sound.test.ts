import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import {
  one,
  openPage,
  scriptErrors,
  stubClock,
  textOf,
  type DomElement,
  type DomWindow,
  type OpenPageOptions,
} from './testing/dom.ts';
import { runLinkedScripts } from './testing/page.ts';

/*
 * The alarm and the sound choice of the settings page (AC5): `public/js/alarm.js` shows
 * the alarm either way, and plays the sound unless localStorage `alarm-sound` is `off`.
 * The stubs are those of `alarm.test.ts`.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

const ALARM = { id: 1, title: 'Call the bank', href: '/tasks/1', snooze: '/tasks/1/snooze', dismiss: '/tasks/1/dismiss' };

let testApp: TestApp;
const opened: DomWindow[] = [];

beforeEach(() => {
  testApp = createTestApp({ analyze: vi.fn<Analyze>() });
});

afterEach(() => {
  testApp.close();
  for (const window of opened.splice(0)) {
    const errors = scriptErrors(window);
    window.close();
    expect(errors).toEqual([]);
  }
});

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Opens the home page with a pending urgent task with a reminder, stores `stored` under
 * `alarm-sound` when it is a string, runs the alarm with one alarm to show, and hands
 * back the window and the elements `play` was called on.
 */
async function shownAlarm(
  stored: string | undefined,
  options: OpenPageOptions = {},
): Promise<{ window: DomWindow; played: DomElement[] }> {
  createTask(testApp.db, {
    title: 'A task',
    status: 'pending',
    priority: 'urgent',
    reminder_at: '2026-10-12T08:00:00.000Z',
  });
  const response = await request(testApp.app).get('/');
  expect(response.status).toBe(200);
  const window = openPage(response.text, options);
  opened.push(window);
  if (stored !== undefined) window.localStorage.setItem('alarm-sound', stored);

  stubClock(window, Date.parse(NOW));
  window.fetch = () => Promise.resolve({ json: () => Promise.resolve({ alarms: [ALARM] }) });
  const played: DomElement[] = [];
  window.HTMLMediaElement.prototype.play = function (this: DomElement) {
    played.push(this);
    return Promise.resolve();
  };
  window.HTMLMediaElement.prototype.pause = () => {};

  await expect(runLinkedScripts(testApp.app, window)).resolves.toContain('/js/alarm.js');
  await flush();
  return { window, played };
}

describe('the alarm sound choice (AC5)', () => {
  it('shows the alarm without playing when the sound is off', async () => {
    const { window, played } = await shownAlarm('off');
    const alarm = one(window.document, '#alarm');

    expect(alarm.hasAttribute('hidden')).toBe(false);
    expect(textOf(one(alarm, '.alarm__title'))).toBe('Call the bank');
    expect(played).toEqual([]);
  });

  it('plays when the sound is on', async () => {
    const { window, played } = await shownAlarm('on');

    expect(played).toEqual([one(window.document, '.alarm__sound')]);
  });

  it('plays when nothing is stored', async () => {
    const { played } = await shownAlarm(undefined);

    expect(played).toHaveLength(1);
  });

  it('plays when storage is blocked', async () => {
    const { window, played } = await shownAlarm(undefined, { storageThrows: true });

    expect(played).toHaveLength(1);
    expect(scriptErrors(window)).toEqual([]);
  });
});
