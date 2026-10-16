import type { DomNotificationClass, DomRequestInit } from 'jsdom';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask, type NewTask, type Task } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import {
  all,
  one,
  openPage,
  scriptErrors,
  stubClock,
  textOf,
  type DomElement,
  type DomWindow,
} from './testing/dom.ts';
import { runLinkedScripts } from './testing/page.ts';

/*
 * The in-page alarm (AC8 to AC10): it polls `/reminders`, shows the first alarm, plays
 * the sound, posts Snooze and Dismiss, and asks for notification permission. jsdom has
 * neither `fetch` nor `Notification`, so the test puts stubs on the window; the media
 * methods are stubbed too. The page's own interval is the test's stub clock.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

/** One alarm as `GET /reminders` would answer it. */
const ALARM = { id: 1, title: '<b>x</b>', href: '/tasks/1', snooze: '/tasks/1/snooze', dismiss: '/tasks/1/dismiss' };

interface FetchCall {
  url: string;
  init?: DomRequestInit;
}

let testApp: TestApp;
const opened: DomWindow[] = [];

beforeEach(() => {
  testApp = createTestApp({ analyze: vi.fn<Analyze>() });
});

// A script that throws, on load or on a click, fails the test that opened the page.
afterEach(() => {
  testApp.close();
  for (const window of opened.splice(0)) {
    const errors = scriptErrors(window);
    window.close();
    expect(errors).toEqual([]);
  }
});

/** Drains the microtasks a `fetch` promise leaves, without a fake clock. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A pending urgent task with a reminder, so the layout writes the alarm. */
function alarmTask(extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, {
    title: 'A task',
    status: 'pending',
    priority: 'urgent',
    reminder_at: '2026-10-12T08:00:00.000Z',
    ...extra,
  });
}

/** Opens the home page, where the layout wrote the alarm. */
async function openAlarmPage(): Promise<DomWindow> {
  const response = await request(testApp.app).get('/');
  expect(response.status).toBe(200);
  const window = openPage(response.text);
  opened.push(window);
  return window;
}

/** The window's `fetch`: records every call and answers with the given list, the last once. */
function stubFetch(window: DomWindow, answers: unknown[]): { calls: FetchCall[] } {
  const stub = { calls: [] as FetchCall[] };
  window.fetch = (url, init) => {
    stub.calls.push({ url, init });
    const answer = answers[Math.min(stub.calls.length - 1, answers.length - 1)];
    return Promise.resolve({ json: () => Promise.resolve(answer) });
  };
  return stub;
}

/** Stubs `play` and `pause` and records the elements they were called on. */
function stubMedia(window: DomWindow): { played: DomElement[]; paused: DomElement[] } {
  const stub = { played: [] as DomElement[], paused: [] as DomElement[] };
  window.HTMLMediaElement.prototype.play = function (this: DomElement) {
    stub.played.push(this);
    return Promise.resolve();
  };
  window.HTMLMediaElement.prototype.pause = function (this: DomElement) {
    stub.paused.push(this);
  };
  return stub;
}

/** Puts a Notifications API with this permission on the window and records its use. */
function stubNotification(window: DomWindow, permission: string): { created: string[]; requests: number } {
  const stub = { created: [] as string[], requests: 0 };
  const Notification = function (this: unknown, title: string) {
    stub.created.push(title);
  } as unknown as DomNotificationClass;
  Notification.permission = permission;
  Notification.requestPermission = () => {
    stub.requests += 1;
    return Promise.resolve(permission);
  };
  window.Notification = Notification;
  return stub;
}

describe('showing an alarm (AC8)', () => {
  it('shows the one alarm, with the title as text and the sound playing', async () => {
    alarmTask();
    const window = await openAlarmPage();
    stubClock(window, Date.parse(NOW));
    const fetch = stubFetch(window, [{ alarms: [ALARM] }]);
    const media = stubMedia(window);

    await expect(runLinkedScripts(testApp.app, window)).resolves.toEqual(['/js/alarm.js']);
    await flush();

    const alarm = one(window.document, '#alarm');
    expect(alarm.hasAttribute('hidden')).toBe(false);
    expect(textOf(one(alarm, '.alarm__title'))).toBe('<b>x</b>');
    expect(all(alarm, 'b')).toEqual([]);
    expect(media.played).toEqual([one(alarm, '.alarm__sound')]);
    expect(fetch.calls.map((call) => call.url)).toEqual(['/reminders']);
  });

  it('leaves the alarm hidden when the list is empty', async () => {
    alarmTask();
    const window = await openAlarmPage();
    stubClock(window, Date.parse(NOW));
    const fetch = stubFetch(window, [{ alarms: [] }]);
    const media = stubMedia(window);

    await runLinkedScripts(testApp.app, window);
    await flush();

    expect(one(window.document, '#alarm').hasAttribute('hidden')).toBe(true);
    expect(media.played).toEqual([]);
    expect(fetch.calls.map((call) => call.url)).toEqual(['/reminders']);
  });

  it('polls again 30 seconds later, and makes no other request', async () => {
    alarmTask();
    const window = await openAlarmPage();
    const clock = stubClock(window, Date.parse(NOW));
    const fetch = stubFetch(window, [{ alarms: [] }, { alarms: [ALARM] }]);
    const media = stubMedia(window);

    await runLinkedScripts(testApp.app, window);
    await flush();
    expect(fetch.calls).toHaveLength(1);
    expect(one(window.document, '#alarm').hasAttribute('hidden')).toBe(true);

    clock.advance(30_000);
    await flush();

    expect(one(window.document, '#alarm').hasAttribute('hidden')).toBe(false);
    expect(fetch.calls.map((call) => call.url)).toEqual(['/reminders', '/reminders']);
    expect(media.played).toHaveLength(1);
  });
});

describe('Snooze and Dismiss from the modal (AC9)', () => {
  /** Opens the page, shows the one alarm and hands back the window and the stubs. */
  async function shownAlarm(): Promise<{
    window: DomWindow;
    fetch: { calls: FetchCall[] };
    media: { played: DomElement[]; paused: DomElement[] };
  }> {
    alarmTask();
    const window = await openAlarmPage();
    stubClock(window, Date.parse(NOW));
    const fetch = stubFetch(window, [{ alarms: [ALARM] }]);
    const media = stubMedia(window);
    await runLinkedScripts(testApp.app, window);
    await flush();
    return { window, fetch, media };
  }

  it('posts the chosen snooze and hides the alarm', async () => {
    const { window, fetch, media } = await shownAlarm();

    one(window.document, '[data-minutes="10"]').click();
    await flush();

    const last = fetch.calls[fetch.calls.length - 1];
    expect(last.url).toBe('/tasks/1/snooze');
    expect(last.init?.method).toBe('POST');
    expect(last.init?.body).toBe('minutes=10');
    expect(one(window.document, '#alarm').hasAttribute('hidden')).toBe(true);
    expect(media.paused).toEqual([one(window.document, '.alarm__sound')]);
  });

  it('posts a dismiss and hides the alarm', async () => {
    const { window, fetch, media } = await shownAlarm();

    one(window.document, '[data-alarm-dismiss]').click();
    await flush();

    const last = fetch.calls[fetch.calls.length - 1];
    expect(last.url).toBe('/tasks/1/dismiss');
    expect(last.init?.method).toBe('POST');
    expect(one(window.document, '#alarm').hasAttribute('hidden')).toBe(true);
    expect(media.paused).toEqual([one(window.document, '.alarm__sound')]);
  });
});

describe('permission and fallback (AC10)', () => {
  /** Shows the one alarm with the given Notifications stub, or none when `permission` is undefined. */
  async function shownAlarm(
    permission: string | undefined,
  ): Promise<{ window: DomWindow; notification: { created: string[]; requests: number } }> {
    alarmTask();
    const window = await openAlarmPage();
    stubClock(window, Date.parse(NOW));
    stubFetch(window, [{ alarms: [ALARM] }]);
    stubMedia(window);
    const notification = permission === undefined ? { created: [], requests: 0 } : stubNotification(window, permission);
    await runLinkedScripts(testApp.app, window);
    await flush();
    return { window, notification };
  }

  it('makes one notification when permission is granted', async () => {
    const { window, notification } = await shownAlarm('granted');
    const alarm = one(window.document, '#alarm');

    expect(notification.created).toEqual(['<b>x</b>']);
    expect(one(alarm, '.alarm__permission').hasAttribute('hidden')).toBe(true);
    expect(one(alarm, '.alarm__blocked').hasAttribute('hidden')).toBe(true);
  });

  it('shows the prompt and asks when permission is default', async () => {
    const { window, notification } = await shownAlarm('default');
    const alarm = one(window.document, '#alarm');

    expect(notification.created).toEqual([]);
    const permission = one(alarm, '.alarm__permission');
    expect(permission.hasAttribute('hidden')).toBe(false);

    one(permission, '[data-alarm-permission]').click();

    expect(notification.requests).toBe(1);
  });

  it('shows the fallback and keeps the alarm when permission is denied', async () => {
    const { window, notification } = await shownAlarm('denied');
    const alarm = one(window.document, '#alarm');

    expect(notification.created).toEqual([]);
    expect(one(alarm, '.alarm__blocked').hasAttribute('hidden')).toBe(false);
    expect(alarm.hasAttribute('hidden')).toBe(false);
  });

  it('keeps the alarm and does not throw when Notification does not exist', async () => {
    const { window } = await shownAlarm(undefined);
    const alarm = one(window.document, '#alarm');

    expect(alarm.hasAttribute('hidden')).toBe(false);
    expect(one(alarm, '.alarm__blocked').hasAttribute('hidden')).toBe(false);
    expect(scriptErrors(window)).toEqual([]);
  });
});
