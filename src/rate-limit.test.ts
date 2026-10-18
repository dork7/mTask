import { existsSync, readdirSync } from 'node:fs';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { TOO_MANY_REQUESTS } from './routes/add.ts';
import type { Analyze } from './services/analyzer.ts';
import { createRateLimiter } from './services/rate-limit.ts';
import { createTestApp, oneTaskAnalysis, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf } from './testing/dom.ts';

/*
 * The AI rate limit (AC3): the limiter on its own clock, then the four endpoints of an
 * app sharing one limit of 10 requests per client IP in any 60 seconds.
 */

/** The first eight bytes of every PNG file. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const NOW = '2026-10-12T09:36:00.000Z';

describe('createRateLimiter (AC3)', () => {
  let t: number;
  const limiter = (): ReturnType<typeof createRateLimiter> =>
    createRateLimiter({ limit: 10, windowMs: 60_000, now: () => t });

  beforeEach(() => {
    t = 0;
  });

  it('accepts ten hits of a key and refuses the eleventh with 60 seconds', () => {
    const limit = limiter();
    for (let i = 0; i < 10; i += 1) expect(limit.hit('a')).toBeUndefined();
    expect(limit.hit('a')).toBe(60);
  });

  it('counts each key on its own', () => {
    const limit = limiter();
    for (let i = 0; i < 11; i += 1) limit.hit('a');
    expect(limit.hit('b')).toBeUndefined();
  });

  it('accepts again once 60 seconds have passed since the oldest counted hit', () => {
    const limit = limiter();
    for (let i = 0; i < 10; i += 1) limit.hit('a');
    t = 59_999;
    expect(limit.hit('a')).toBe(1);
    t = 60_000;
    expect(limit.hit('a')).toBeUndefined();
  });

  it('counts refused hits toward the limit', () => {
    const limit = limiter();
    for (let i = 0; i < 5; i += 1) limit.hit('a');
    t = 30_000;
    for (let i = 0; i < 5; i += 1) limit.hit('a');
    t = 31_000;
    for (let i = 0; i < 5; i += 1) expect(limit.hit('a')).toBeTypeOf('number');
    t = 60_000;
    expect(limit.hit('a')).toBe(30);
  });

  it('always asks for a whole number of seconds from 1 to 60', () => {
    const limit = limiter();
    for (let i = 0; i < 10; i += 1) limit.hit('a');
    for (t = 0; t < 60_000; t += 997) {
      const wait = limit.hit('a');
      expect(Number.isInteger(wait)).toBe(true);
      expect(wait).toBeGreaterThanOrEqual(1);
      expect(wait).toBeLessThanOrEqual(60);
    }
  });
});

describe('the AI endpoints (AC3)', () => {
  let testApp: TestApp;
  let analyze: ReturnType<typeof vi.fn<Analyze>>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    analyze = vi.fn<Analyze>(() => Promise.resolve(oneTaskAnalysis()));
    testApp = createTestApp({ analyze });
  });

  afterEach(() => {
    testApp.close();
    vi.useRealTimers();
  });

  function sourceCount(): number {
    return Number(testApp.db.prepare('SELECT COUNT(*) AS n FROM sources').get()?.n);
  }

  function uploads(): string[] {
    return existsSync(testApp.uploadsDir) ? readdirSync(testApp.uploadsDir) : [];
  }

  function postText(address: string, text = 'buy milk'): request.Test {
    return request(testApp.app).post(address).type('form').send({ text });
  }

  function postPhoto(): request.Test {
    return request(testApp.app)
      .post('/add/photo')
      .attach('photo', PNG_SIGNATURE, { filename: 'list.png', contentType: 'image/png' });
  }

  /** Uses up the limit with ten accepted text posts. */
  async function useUpLimit(): Promise<void> {
    for (let i = 0; i < 10; i += 1) expect((await postText('/add/text')).status).toBe(303);
  }

  /** Asserts the answer is a refusal on the Add page with this tab, and returns its document. */
  function expectRefused(response: request.Response, tab: string): ReturnType<typeof parseHtml> {
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toMatch(/^\d+$/);
    const wait = Number(response.headers['retry-after']);
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(60);
    const document = parseHtml(response.text);
    expect(textOf(one(document, '[role="tab"][aria-selected="true"]'))).toBe(tab);
    expect(textOf(one(document, '.notice--error:not([hidden])'))).toBe(TOO_MANY_REQUESTS);
    return document;
  }

  it('refuses the eleventh request, a photo, before anything is stored or analyzed', async () => {
    await useUpLimit();

    const response = await postPhoto();

    expectRefused(response, 'Photo');
    expect(analyze).toHaveBeenCalledTimes(10);
    expect(sourceCount()).toBe(10);
    expect(uploads()).toEqual([]);
  });

  it.each([
    ['/add/voice', 'Voice', '#voice-text'],
    ['/add/text', 'Type', '#type-text'],
  ])('refuses the eleventh post to %s on its tab and keeps the text', async (address, tab, box) => {
    await useUpLimit();

    const response = await postText(address, 'call the bank');

    const document = expectRefused(response, tab);
    expect(textOf(one(document, box))).toBe('call the bank');
    expect(analyze).toHaveBeenCalledTimes(10);
    expect(sourceCount()).toBe(10);
  });

  it('refuses the eleventh request, an analysis on the review page, on the Photo tab', async () => {
    const source = createSource(testApp.db, { kind: 'photo', image_path: '/uploads/a.png' });
    for (let i = 0; i < 10; i += 1) {
      expect((await request(testApp.app).post(`/review/${source.id}/analyze`)).status).toBe(303);
    }
    const calls = analyze.mock.calls.length;

    const response = await request(testApp.app).post(`/review/${source.id}/analyze`);

    expectRefused(response, 'Photo');
    expect(analyze).toHaveBeenCalledTimes(calls);
    expect(sourceCount()).toBe(1);
  });

  it('shares one limit across the endpoints', async () => {
    const source = createSource(testApp.db, { kind: 'photo', image_path: '/uploads/a.png' });
    for (let i = 0; i < 4; i += 1) await postText('/add/voice');
    for (let i = 0; i < 4; i += 1) await request(testApp.app).post(`/review/${source.id}/analyze`);
    for (let i = 0; i < 2; i += 1) await postText('/add/text');

    expect((await postPhoto()).status).toBe(429);
  });

  it('leaves every other route without a limit', async () => {
    const source = createSource(testApp.db, { kind: 'photo', image_path: '/uploads/a.png' });
    await useUpLimit();
    expect((await postPhoto()).status).toBe(429);

    for (let i = 0; i < 16; i += 1) expect((await request(testApp.app).get('/add')).status).toBe(200);
    expect((await request(testApp.app).get('/tasks')).status).toBe(200);
    expect((await request(testApp.app).post(`/review/${source.id}/discard`)).status).toBe(303);
  });

  it('accepts a request again once 60 seconds have passed', async () => {
    await useUpLimit();
    expect((await postText('/add/text')).status).toBe(429);

    vi.setSystemTime(new Date(Date.parse(NOW) + 60_000));

    expect((await postText('/add/text')).status).toBe(303);
  });

  it('answers a refused upload of a large photo instead of resetting the connection', async () => {
    await useUpLimit();
    const large = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(3 * 1024 * 1024)]);

    const response = await request(testApp.app)
      .post('/add/photo')
      .attach('photo', large, { filename: 'large.png', contentType: 'image/png' });

    expect(response.status).toBe(429);
    expect(all(parseHtml(response.text), '.notice--error:not([hidden])')).toHaveLength(1);
    expect(uploads()).toEqual([]);
  });
});
