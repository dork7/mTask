import type { DomNotificationClass, DomPushSubscription, DomRequestInit } from 'jsdom';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from './testing/app.ts';
import { openPage, scriptErrors, type DomWindow } from './testing/dom.ts';
import { runLinkedScripts } from './testing/page.ts';

/*
 * The client `public/js/push.js` (AC5): it subscribes through the registration's push
 * manager once the permission is already granted, and posts the three fields. jsdom has
 * neither `Notification` nor a service worker, so the test puts stubs on the window; the
 * four silent cases assert that nothing was posted and no script threw.
 */

/** A base64url public key, the shape `npx web-push generate-vapid-keys` gives. */
const KEY =
  'BHBjqXnNyMq3hDqYFob0fy-yoSWYlE8d2wXfWRx9qUgXY2L1oQ8_sHxKnUP3RVCWFjJmqHKU88i-EWyYulEtI2U';

/** The endpoint the subscription's `endpoint` carries; its `toJSON()` gives another. */
const ENDPOINT = 'https://push.example/from-endpoint';
const P256DH = 'the-p256dh';
const AUTH = 'the-auth';

/** The body the client is expected to post. */
const BODY = `endpoint=${encodeURIComponent(ENDPOINT)}&p256dh=${encodeURIComponent(P256DH)}&auth=${encodeURIComponent(AUTH)}`;

interface FetchCall {
  url: string;
  init?: DomRequestInit;
}

let testApp: TestApp;
const opened: DomWindow[] = [];

beforeEach(() => {
  testApp = createTestApp({ vapidPublicKey: KEY });
});

// A script that throws, on load or in a promise it did not catch, fails the test that
// opened the page.
afterEach(() => {
  testApp.close();
  for (const window of opened.splice(0)) {
    const errors = scriptErrors(window);
    window.close();
    expect(errors).toEqual([]);
  }
});

/** Drains the microtasks the client's promise chain leaves, without a fake clock. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The home page, where the layout wrote the meta and the script. */
async function openHomePage(): Promise<DomWindow> {
  const response = await request(testApp.app).get('/');
  expect(response.status).toBe(200);
  const window = openPage(response.text);
  opened.push(window);
  return window;
}

/** A hand-written page that links the script but carries no VAPID meta. */
function openPageWithoutMeta(): DomWindow {
  const window = openPage('<script src="/js/push.js" defer></script>');
  opened.push(window);
  return window;
}

/** Puts a Notifications API with this permission on the window. */
function stubNotification(window: DomWindow, permission: string): void {
  const Notification = function () {} as unknown as DomNotificationClass;
  Notification.permission = permission;
  window.Notification = Notification;
}

/** The subscription the stub's push manager answers, whose `endpoint` differs from `toJSON()`'s. */
function stubSubscription(): DomPushSubscription {
  return {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: 'https://push.example/from-to-json', keys: { p256dh: P256DH, auth: AUTH } }),
  };
}

/** Puts a ready service worker registration on the window and records its `subscribe`. */
function stubServiceWorker(window: DomWindow): { subscribe: ReturnType<typeof vi.fn> } {
  const subscribe = vi.fn(() => Promise.resolve(stubSubscription()));
  window.navigator.serviceWorker = { ready: Promise.resolve({ pushManager: { subscribe } }) };
  return { subscribe };
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

describe('the client subscribes (AC5)', () => {
  it('subscribes with the key and posts the three fields', async () => {
    const window = await openHomePage();
    stubNotification(window, 'granted');
    const { subscribe } = stubServiceWorker(window);
    const fetch = stubFetch(window);

    await expect(runLinkedScripts(testApp.app, window)).resolves.toEqual(['/js/push.js']);
    await flush();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: KEY });
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe('/push/subscribe');
    expect(fetch.calls[0].init?.method).toBe('POST');
    expect(fetch.calls[0].init?.body).toBe(BODY);
  });

  it('does nothing when the permission is not granted', async () => {
    const window = await openHomePage();
    stubNotification(window, 'default');
    const { subscribe } = stubServiceWorker(window);
    const fetch = stubFetch(window);

    await runLinkedScripts(testApp.app, window);
    await flush();

    expect(subscribe).not.toHaveBeenCalled();
    expect(fetch.calls).toEqual([]);
    expect(scriptErrors(window)).toEqual([]);
  });

  it('does nothing when the meta is absent', async () => {
    const window = openPageWithoutMeta();
    const fetch = stubFetch(window);

    await runLinkedScripts(testApp.app, window);
    await flush();

    expect(fetch.calls).toEqual([]);
    expect(scriptErrors(window)).toEqual([]);
  });

  it('does nothing when navigator has no serviceWorker', async () => {
    const window = await openHomePage();
    stubNotification(window, 'granted');
    const fetch = stubFetch(window);

    await runLinkedScripts(testApp.app, window);
    await flush();

    expect(fetch.calls).toEqual([]);
    expect(scriptErrors(window)).toEqual([]);
  });
});
