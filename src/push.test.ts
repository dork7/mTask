import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listSubscriptions, saveSubscription } from './db/push.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml } from './testing/dom.ts';

/*
 * The two subscribe endpoints (AC3) and the VAPID key the layout writes into the page
 * (AC4). The app is built with the key unless a test says otherwise, so a page with a
 * key and a page without both show.
 */

/** A base64url public key, the shape `npx web-push generate-vapid-keys` gives. */
const KEY =
  'BHBjqXnNyMq3hDqYFob0fy-yoSWYlE8d2wXfWRx9qUgXY2L1oQ8_sHxKnUP3RVCWFjJmqHKU88i-EWyYulEtI2U';

/** The three fields of a subscribe, as the client fills them. */
const SUBSCRIPTION = { endpoint: 'https://push.example/x', p256dh: 'P1', auth: 'A1' };

/** Every stored subscription as the three posted values, without the row's own columns. */
function stored(): { endpoint: string; p256dh: string; auth: string }[] {
  return listSubscriptions(testApp.db).map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth }));
}

/** A urlencoded form body, as the client posts it. */
function body(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

/** A urlencoded post, as the client writes it. */
function post(address: string, form: string): request.Test {
  return request(testApp.app).post(address).type('form').send(form);
}

/** One subscribe its route must refuse. */
interface Refusal {
  label: string;
  form: string;
}

/** The three refusals for each subscribe field: left out, blank, and posted twice. */
function subscribeRefusals(): Refusal[] {
  const names = ['endpoint', 'p256dh', 'auth'] as const;
  return names.flatMap((name) => {
    const missing = new URLSearchParams(SUBSCRIPTION);
    missing.delete(name);

    const twice = new URLSearchParams(SUBSCRIPTION);
    twice.append(name, 'second');

    return [
      { label: `${name} left out`, form: missing.toString() },
      { label: `${name} blank`, form: body({ ...SUBSCRIPTION, [name]: '   ' }) },
      { label: `${name} posted twice`, form: twice.toString() },
    ];
  });
}

/** The three refusals for the unsubscribe's one field. */
function unsubscribeRefusals(): Refusal[] {
  const twice = new URLSearchParams({ endpoint: SUBSCRIPTION.endpoint });
  twice.append('endpoint', 'second');
  return [
    { label: 'endpoint left out', form: '' },
    { label: 'endpoint blank', form: body({ endpoint: '   ' }) },
    { label: 'endpoint posted twice', form: twice.toString() },
  ];
}

let testApp: TestApp;

beforeEach(() => {
  testApp = createTestApp({ vapidPublicKey: KEY });
});

afterEach(() => {
  testApp.close();
});

describe('POST /push/subscribe (AC3)', () => {
  it('stores the three fields and answers 303 to /', async () => {
    const response = await post('/push/subscribe', body(SUBSCRIPTION));

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/');
    expect(stored()).toEqual([SUBSCRIPTION]);
  });

  it('keeps one row when the endpoint is posted again, with the new keys', async () => {
    await post('/push/subscribe', body(SUBSCRIPTION));
    const first = listSubscriptions(testApp.db)[0];

    const response = await post('/push/subscribe', body({ ...SUBSCRIPTION, p256dh: 'P2', auth: 'A2' }));

    expect(response.status).toBe(303);
    const rows = listSubscriptions(testApp.db);
    expect(rows).toEqual([{ ...first, p256dh: 'P2', auth: 'A2' }]);
  });

  it.each(subscribeRefusals())('refuses a subscribe with $label: 400 and no new row', async ({ form }) => {
    saveSubscription(testApp.db, { endpoint: 'https://stored.example/x', p256dh: 'S', auth: 'S' });
    const before = listSubscriptions(testApp.db);

    const response = await post('/push/subscribe', form);

    expect(response.status).toBe(400);
    expect(stored()).toEqual(before.map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth })));
  });
});

describe('POST /push/unsubscribe (AC3)', () => {
  it('removes the endpoint and answers 303 to /', async () => {
    saveSubscription(testApp.db, SUBSCRIPTION);

    const response = await post('/push/unsubscribe', body({ endpoint: SUBSCRIPTION.endpoint }));

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/');
    expect(listSubscriptions(testApp.db)).toEqual([]);
  });

  it('answers 303 to / for an endpoint that is not stored, and changes nothing', async () => {
    const kept = saveSubscription(testApp.db, SUBSCRIPTION);

    const response = await post('/push/unsubscribe', body({ endpoint: 'https://other.example/x' }));

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/');
    expect(listSubscriptions(testApp.db)).toEqual([kept]);
  });

  it.each(unsubscribeRefusals())('refuses an unsubscribe with $label: 400 and no change', async ({ form }) => {
    const kept = saveSubscription(testApp.db, SUBSCRIPTION);

    const response = await post('/push/unsubscribe', form);

    expect(response.status).toBe(400);
    expect(listSubscriptions(testApp.db)).toEqual([kept]);
  });
});

describe('the public key in the page (AC4)', () => {
  it('writes the key and the client script into the head', async () => {
    const document = parseHtml((await request(testApp.app).get('/')).text);

    expect(one(document, 'meta[name="vapid-public-key"]').getAttribute('content')).toBe(KEY);
    const scripts = all(document, 'script[src="/js/push.js"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].hasAttribute('defer')).toBe(true);
  });

  it('serves the client script with a JavaScript content type', async () => {
    const response = await request(testApp.app).get('/js/push.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
  });

  it.each([
    ['an empty key', ''],
    ['no key', undefined],
  ])('writes neither the meta nor the script for %s', async (_label, vapidPublicKey) => {
    testApp.close();
    testApp = createTestApp(vapidPublicKey === undefined ? {} : { vapidPublicKey });

    const document = parseHtml((await request(testApp.app).get('/')).text);

    expect(all(document, 'meta[name="vapid-public-key"]')).toEqual([]);
    expect(all(document, 'script[src="/js/push.js"]')).toEqual([]);
  });
});
