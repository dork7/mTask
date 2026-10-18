import type { DomEvent, DomNotificationClass, DomPushSubscription, DomRequestInit } from 'jsdom';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_PATH } from './services/settings.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import {
  one,
  openPage,
  parseHtml,
  scriptErrors,
  textOf,
  type DomCheckbox,
  type DomInput,
  type DomWindow,
  type OpenPageOptions,
} from './testing/dom.ts';
import { runLinkedScripts } from './testing/page.ts';

/*
 * The settings page script `public/js/settings.js` (AC5, AC6, AC7, AC9): the sound
 * checkbox, the alert status and buttons, Copy and the install prompt. jsdom has no
 * `fetch`, `Notification`, service worker or clipboard, so the test puts stubs on the
 * window before the page's linked scripts run.
 */

/** A base64url public key, the shape `npx web-push generate-vapid-keys` gives (as in `push-client.test.ts`). */
const KEY =
  'BHBjqXnNyMq3hDqYFob0fy-yoSWYlE8d2wXfWRx9qUgXY2L1oQ8_sHxKnUP3RVCWFjJmqHKU88i-EWyYulEtI2U';

const ENDPOINT = 'https://push.example/from-endpoint';
const P256DH = 'the-p256dh';
const AUTH = 'the-auth';

/** The body the script is expected to post to `/push/subscribe`. */
const BODY = `endpoint=${encodeURIComponent(ENDPOINT)}&p256dh=${encodeURIComponent(P256DH)}&auth=${encodeURIComponent(AUTH)}`;

interface FetchCall {
  url: string;
  init?: DomRequestInit;
}

interface NotificationStub {
  requestPermission: ReturnType<typeof vi.fn>;
}

let testApp: TestApp | undefined;
const opened: DomWindow[] = [];

// A script that throws, on load or on a click, fails the test that opened the page.
afterEach(() => {
  testApp?.close();
  testApp = undefined;
  for (const window of opened.splice(0)) {
    const errors = scriptErrors(window);
    window.close();
    expect(errors).toEqual([]);
  }
});

/** Drains the microtasks the script's promise chains leave, without a fake clock. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Opens the settings page of a new test app, with its inline scripts run and its linked scripts not yet. */
async function openSettings(
  options: { vapidPublicKey?: string; page?: OpenPageOptions } = {},
): Promise<{ app: TestApp; window: DomWindow }> {
  testApp = createTestApp({ vapidPublicKey: options.vapidPublicKey });
  const response = await request(testApp.app).get(SETTINGS_PATH);
  expect(response.status).toBe(200);
  const window = openPage(response.text, options.page);
  opened.push(window);
  return { app: testApp, window };
}

/** The window's `fetch`: records every call and answers with an empty JSON body. */
function stubFetch(window: DomWindow): { calls: FetchCall[] } {
  const stub = { calls: [] as FetchCall[] };
  window.fetch = (url, init) => {
    stub.calls.push({ url, init });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  };
  return stub;
}

/** Puts a Notifications API with this permission on the window; `requestPermission` resolves `answer`. */
function stubNotification(window: DomWindow, permission: string, answer: string = permission): NotificationStub {
  const Notification = function () {} as unknown as DomNotificationClass;
  Notification.permission = permission;
  const requestPermission = vi.fn(() => Promise.resolve(answer));
  Notification.requestPermission = requestPermission;
  window.Notification = Notification;
  return { requestPermission };
}

function stubSubscription(): DomPushSubscription {
  return {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: 'https://push.example/from-to-json', keys: { p256dh: P256DH, auth: AUTH } }),
  };
}

/** Puts a ready registration on the window whose push manager answers `getSubscription` with `existing`. */
function stubServiceWorker(
  window: DomWindow,
  existing: DomPushSubscription | null = null,
): { subscribe: ReturnType<typeof vi.fn>; getSubscription: ReturnType<typeof vi.fn> } {
  const subscribe = vi.fn(() => Promise.resolve(stubSubscription()));
  const getSubscription = vi.fn(() => Promise.resolve(existing));
  window.navigator.serviceWorker = { ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }) };
  return { subscribe, getSubscription };
}

function soundBox(window: DomWindow): DomCheckbox {
  return one(window.document, '#alarm-sound') as DomCheckbox;
}

function statusOf(window: DomWindow): string {
  return textOf(one(window.document, '#notification-status'));
}

describe('the sound checkbox (AC5)', () => {
  it('is checked with nothing stored', async () => {
    const { app, window } = await openSettings();
    await runLinkedScripts(app.app, window);

    expect(soundBox(window).checked).toBe(true);
  });

  it('is unchecked with off stored', async () => {
    const { app, window } = await openSettings();
    window.localStorage.setItem('alarm-sound', 'off');
    await runLinkedScripts(app.app, window);

    expect(soundBox(window).checked).toBe(false);
  });

  it('is checked with on stored', async () => {
    const { app, window } = await openSettings();
    window.localStorage.setItem('alarm-sound', 'on');
    await runLinkedScripts(app.app, window);

    expect(soundBox(window).checked).toBe(true);
  });

  it('stores off and on as it changes', async () => {
    const { app, window } = await openSettings();
    await runLinkedScripts(app.app, window);
    const box = soundBox(window);

    box.checked = false;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(window.localStorage.getItem('alarm-sound')).toBe('off');

    box.checked = true;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(window.localStorage.getItem('alarm-sound')).toBe('on');
  });

  it('is checked and throws nothing when storage is blocked', async () => {
    const { app, window } = await openSettings({ page: { storageThrows: true } });
    await runLinkedScripts(app.app, window);
    const box = soundBox(window);

    expect(box.checked).toBe(true);
    box.checked = false;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(scriptErrors(window)).toEqual([]);
  });
});

describe('the alerts (AC6)', () => {
  it('has the status and the two buttons', async () => {
    const { window } = await openSettings();

    expect(textOf(one(window.document, 'button#notification-allow'))).toBe('Allow alerts');
    expect(textOf(one(window.document, 'button#notification-off'))).toBe('Turn off alerts');
    expect(statusOf(window)).toBe('Checking alerts...');
  });

  it.each([
    ['granted', 'Alerts are on'],
    ['denied', 'Alerts are blocked in this browser'],
    ['default', 'Alerts are off'],
  ])('shows the status of permission %s', async (permission, text) => {
    const { app, window } = await openSettings();
    stubNotification(window, permission);
    await runLinkedScripts(app.app, window);

    expect(statusOf(window)).toBe(text);
  });

  it('says alerts are not supported without Notification, and the buttons throw nothing', async () => {
    const { app, window } = await openSettings();
    const fetch = stubFetch(window);
    await runLinkedScripts(app.app, window);

    expect(statusOf(window)).toBe('Alerts are not supported');
    one(window.document, '#notification-allow').click();
    one(window.document, '#notification-off').click();
    await flush();
    expect(fetch.calls).toEqual([]);
    expect(scriptErrors(window)).toEqual([]);
  });

  it('asks, subscribes and posts once on Allow when it is granted', async () => {
    const { app, window } = await openSettings({ vapidPublicKey: KEY });
    const notification = stubNotification(window, 'default', 'granted');
    const { subscribe } = stubServiceWorker(window);
    const fetch = stubFetch(window);
    await runLinkedScripts(app.app, window);
    await flush();
    expect(fetch.calls).toEqual([]);

    one(window.document, '#notification-allow').click();
    await flush();

    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: KEY });
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe('/push/subscribe');
    expect(fetch.calls[0].init?.method).toBe('POST');
    expect(fetch.calls[0].init?.body).toBe(BODY);
    expect(statusOf(window)).toBe('Alerts are on');
  });

  it('does not subscribe on Allow when it is denied', async () => {
    const { app, window } = await openSettings({ vapidPublicKey: KEY });
    stubNotification(window, 'default', 'denied');
    const { subscribe } = stubServiceWorker(window);
    const fetch = stubFetch(window);
    await runLinkedScripts(app.app, window);

    one(window.document, '#notification-allow').click();
    await flush();

    expect(subscribe).not.toHaveBeenCalled();
    expect(fetch.calls).toEqual([]);
    expect(statusOf(window)).toBe('Alerts are blocked in this browser');
  });

  it('does not subscribe on Allow when the page has no key', async () => {
    const { app, window } = await openSettings();
    const notification = stubNotification(window, 'default', 'granted');
    const { subscribe } = stubServiceWorker(window);
    const fetch = stubFetch(window);
    await runLinkedScripts(app.app, window);

    one(window.document, '#notification-allow').click();
    await flush();

    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
    expect(fetch.calls).toEqual([]);
  });

  it('posts the endpoint and unsubscribes on Turn off alerts', async () => {
    const { app, window } = await openSettings();
    stubNotification(window, 'granted');
    const unsubscribe = vi.fn(() => Promise.resolve(true));
    const existing = { ...stubSubscription(), endpoint: 'https://push.example/x', unsubscribe };
    stubServiceWorker(window, existing);
    const fetch = stubFetch(window);
    await runLinkedScripts(app.app, window);

    one(window.document, '#notification-off').click();
    await flush();

    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe('/push/unsubscribe');
    expect(fetch.calls[0].init?.method).toBe('POST');
    expect(fetch.calls[0].init?.body).toBe(`endpoint=${encodeURIComponent('https://push.example/x')}`);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('posts nothing on Turn off alerts with no subscription', async () => {
    const { app, window } = await openSettings();
    stubNotification(window, 'granted');
    const { getSubscription } = stubServiceWorker(window, null);
    const fetch = stubFetch(window);
    await runLinkedScripts(app.app, window);

    one(window.document, '#notification-off').click();
    await flush();

    expect(getSubscription).toHaveBeenCalledTimes(1);
    expect(fetch.calls).toEqual([]);
  });
});

describe('Copy (AC7)', () => {
  it('writes the feed URL to the clipboard once', async () => {
    const { app, window } = await openSettings();
    const writeText = vi.fn(() => Promise.resolve());
    window.navigator.clipboard = { writeText };
    await runLinkedScripts(app.app, window);

    const copy = one(window.document, '#feed-copy');
    expect(textOf(copy)).toBe('Copy');
    copy.click();

    const value = (one(window.document, '#feed-url') as DomInput).value;
    expect(value).toMatch(/\/calendar\.ics\?token=./);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(value);
  });
});

describe('Install app (AC9)', () => {
  /** A `beforeinstallprompt` event with a stubbed `prompt`. */
  function installEvent(window: DomWindow): { event: DomEvent; prompt: ReturnType<typeof vi.fn> } {
    const event = new window.Event('beforeinstallprompt', { cancelable: true });
    const prompt = vi.fn(() => Promise.resolve());
    Object.assign(event, { prompt });
    return { event, prompt };
  }

  it('is rendered hidden', async () => {
    testApp = createTestApp();
    const response = await request(testApp.app).get(SETTINGS_PATH);
    const button = one(parseHtml(response.text), 'button#install-app');

    expect(textOf(button)).toBe('Install app');
    expect(button.hasAttribute('hidden')).toBe(true);
  });

  it('stays hidden with no event, and a click throws nothing', async () => {
    const { app, window } = await openSettings();
    await runLinkedScripts(app.app, window);
    const button = one(window.document, '#install-app');

    expect(button.hasAttribute('hidden')).toBe(true);
    button.click();
    expect(button.hasAttribute('hidden')).toBe(true);
    expect(scriptErrors(window)).toEqual([]);
  });

  it('shows on the event, prompts once on a click and hides again', async () => {
    const { app, window } = await openSettings();
    await runLinkedScripts(app.app, window);
    const button = one(window.document, '#install-app');
    const { event, prompt } = installEvent(window);

    expect(window.dispatchEvent(event)).toBe(false);
    expect(button.hasAttribute('hidden')).toBe(false);

    button.click();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute('hidden')).toBe(true);

    button.click();
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
