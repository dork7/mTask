import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf, type DomDocument } from './testing/dom.ts';

/*
 * One live region (AC8): every page of the layout holds exactly one `#live-region` with
 * `aria-live="polite"`, empty when there is no toast, and the toasts of Delete and Done
 * are rendered inside it.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';
/** 9:00 to 9:30 AM on 11 Oct in Dubai. */
const YESTERDAY = { scheduled_start: '2026-10-11T05:00:00.000Z', scheduled_end: '2026-10-11T05:30:00.000Z' };

let testApp: TestApp;
let reviewId: number;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  testApp = createTestApp({ analyze: vi.fn<Analyze>() });
  createTask(testApp.db, { title: 'Overdue', status: 'pending', estimated_minutes: 30, ...YESTERDAY });
  createTask(testApp.db, { title: 'Second', status: 'pending', estimated_minutes: 30, ...YESTERDAY });
  createTask(testApp.db, { title: 'Third', status: 'pending', estimated_minutes: 30 });
  const source = createSource(testApp.db, { kind: 'photo', image_path: '/uploads/a.png' });
  createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id, estimated_minutes: 15 });
  reviewId = source.id;
});

afterEach(() => {
  testApp.close();
  vi.useRealTimers();
});

async function page(address: string, status = 200): Promise<DomDocument> {
  const response = await request(testApp.app).get(address);
  expect(response.status).toBe(status);
  return parseHtml(response.text);
}

/** Asserts the page's only `[aria-live]` is `#live-region`, polite, and returns it. */
function liveRegionOf(document: DomDocument): ReturnType<typeof one> {
  const regions = all(document, '#live-region');
  expect(regions).toHaveLength(1);
  expect(regions[0].getAttribute('aria-live')).toBe('polite');
  expect(all(document, '[aria-live]')).toEqual(regions);
  return regions[0];
}

describe('the live region (AC8)', () => {
  it.each([
    ['/', 200],
    ['/add', 200],
    ['/tasks', 200],
    ['/overdue', 200],
    ['/timeline', 200],
    ['/digest', 200],
    ['/settings', 200],
    ['/_styleguide', 200],
    ['/no-such-page', 404],
    ['/tasks/1', 200],
    ['/tasks/1/edit', 200],
    ['review', 200],
  ])('is on %s once, and empty', async (address, status) => {
    const region = liveRegionOf(await page(address === 'review' ? `/review/${reviewId}` : address, status));

    expect(region.children).toHaveLength(0);
    expect(textOf(region)).toBe('');
  });

  it('is on the error page once, and empty', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    testApp.db.close();

    const region = liveRegionOf(await page('/tasks', 500));

    expect(region.children).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it.each([
    ['a Delete', '/tasks/3/delete'],
    ['a Done from the list', '/tasks/2/done'],
    ['a Done from the overdue view', '/overdue/1/done'],
  ])('holds the toast of %s', async (_name, address) => {
    const response = await request(testApp.app).post(address);
    expect(response.status).toBe(303);

    const document = await page(response.headers.location);

    const region = liveRegionOf(document);
    const toasts = all(document, '.toast');
    expect(toasts).toHaveLength(1);
    expect(region.contains(toasts[0])).toBe(true);
  });

  it('leaves the style guide toast example outside it, with no live region of its own', async () => {
    const document = await page('/_styleguide');

    liveRegionOf(document);
    const toast = one(document, '.sg-stage .toast');
    expect(toast.closest('#live-region')).toBeNull();
    expect(toast.closest('[aria-live]')).toBeNull();
  });
});
