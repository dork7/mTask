import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSetting, setSetting } from './db/settings.ts';
import { SETTINGS_PATH, WORKING_HOURS_PATH } from './services/settings.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import {
  all,
  one,
  openPage,
  parseHtml,
  scriptErrors,
  textOf,
  visibleText,
  type DomDocument,
  type DomInput,
} from './testing/dom.ts';

/*
 * The settings page as the server renders it (AC1, AC3, AC4, AC7, AC8): the layout and
 * the nav item, the read-only slot rules, the theme button, the feed URL and the `.ics`
 * links. The working-hours form is in `settings-working-hours.test.ts`, the page script
 * in `settings-client.test.ts`.
 */

/** The slot rules a new database is seeded with (008). */
const SEEDED_RULES = [
  { category: 'coding', time_slot: 'morning', start: '09:00', end: '11:00' },
  { category: 'shopping', time_slot: 'night', start: '20:00', end: '22:00' },
];

let testApp: TestApp;

beforeEach(() => {
  testApp = createTestApp();
});

afterEach(() => {
  testApp.close();
});

/** GETs the settings page, expecting 200, and parses it with its scripts off. */
async function settingsDocument(host?: string): Promise<DomDocument> {
  const pending = request(testApp.app).get(SETTINGS_PATH);
  const response = await (host === undefined ? pending : pending.set('Host', host));
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** The text of each of a rule item's four spans, in order. */
function ruleTexts(document: DomDocument): string[][] {
  return all(document, '#slot-rules li').map((item) =>
    ['.slot-rule__category', '.slot-rule__slot', '.slot-rule__start', '.slot-rule__end'].map((selector) =>
      textOf(one(item, selector)),
    ),
  );
}

describe('the page (AC1)', () => {
  it('answers 200 with the layout, the title and one h1', async () => {
    const response = await request(testApp.app).get(SETTINGS_PATH);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    const document = parseHtml(response.text);
    expect(textOf(one(document, 'title'))).toBe('Settings - Task Image AI');
    expect(textOf(one(document, 'main h1'))).toBe('Settings');
  });

  it('works with ANTHROPIC_API_KEY unset', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const response = await request(testApp.app).get(SETTINGS_PATH);
      expect(response.status).toBe(200);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it('marks the More item, which links to /settings, as the current page', async () => {
    const document = await settingsDocument();

    const link = one(document, 'nav a[href="/settings"]');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(visibleText(link)).toBe('More');
    expect(all(document, '[aria-current]')).toEqual([link]);
  });

  it('loads /js/settings.js, which is served as JavaScript', async () => {
    const document = await settingsDocument();
    expect(all(document, 'script[src="/js/settings.js"]')).toHaveLength(1);

    const script = await request(testApp.app).get('/js/settings.js');
    expect(script.status).toBe(200);
    expect(script.headers['content-type']).toMatch(/javascript/);
  });
});

describe('the slot rules, read-only (AC3)', () => {
  it('lists the seeded rules with the slot labels', async () => {
    const document = await settingsDocument();

    expect(ruleTexts(document)).toEqual([
      ['coding', 'Morning', '09:00', '11:00'],
      ['shopping', 'Night', '20:00', '22:00'],
    ]);
  });

  it('keeps the stored order', async () => {
    setSetting(testApp.db, 'slot_rules', [
      { category: 'errands', time_slot: 'afternoon', start: '13:00', end: '14:00' },
      { category: 'coding', time_slot: 'evening', start: '18:00', end: '19:30' },
      { category: 'gym', time_slot: 'morning', start: '06:15', end: '07:00' },
    ]);
    const document = await settingsDocument();

    expect(ruleTexts(document)).toEqual([
      ['errands', 'Afternoon', '13:00', '14:00'],
      ['coding', 'Evening', '18:00', '19:30'],
      ['gym', 'Morning', '06:15', '07:00'],
    ]);
  });

  it('has no form and no input in the section', async () => {
    const document = await settingsDocument();
    const section = one(document, '#slot-rules').closest('section');

    expect(section).not.toBeNull();
    expect(all(section!, 'form')).toEqual([]);
    expect(all(section!, 'input')).toEqual([]);
  });

  it('shows No slot rules when the setting is empty', async () => {
    setSetting(testApp.db, 'slot_rules', []);
    const document = await settingsDocument();

    expect(all(document, '#slot-rules')).toEqual([]);
    const section = one(document, 'section[aria-labelledby="settings-rules-heading"]');
    expect(textOf(section)).toContain('No slot rules');
  });

  it('is written by no route', async () => {
    expect(getSetting(testApp.db, 'slot_rules')).toEqual(SEEDED_RULES);

    await request(testApp.app).post(WORKING_HOURS_PATH).type('form').send('start=10:00&end=18:00').expect(303);
    await request(testApp.app).get(SETTINGS_PATH).expect(200);
    expect(getSetting(testApp.db, 'slot_rules')).toEqual(SEEDED_RULES);

    await request(testApp.app).post('/settings/slot-rules').type('form').send('category=x').expect(404);
  });
});

describe('the theme (AC4)', () => {
  it('has one theme toggle in main, a button', async () => {
    const document = await settingsDocument();

    expect(one(document, 'main [data-theme-toggle]').tagName).toBe('BUTTON');
  });

  it('toggles and saves the theme through the layout script', async () => {
    const response = await request(testApp.app).get(SETTINGS_PATH);
    const window = openPage(response.text);
    try {
      const root = window.document.documentElement;
      const toggle = one(window.document, 'main [data-theme-toggle]');

      toggle.click();
      expect(root.getAttribute('data-theme')).toBe('dark');
      expect(window.localStorage.getItem('theme')).toBe('dark');

      toggle.click();
      expect(root.getAttribute('data-theme')).toBe('light');
      expect(window.localStorage.getItem('theme')).toBe('light');
      expect(scriptErrors(window)).toEqual([]);
    } finally {
      window.close();
    }
  });

  it('adds no second theme mechanism in the page script', async () => {
    const script = await request(testApp.app).get('/js/settings.js');

    expect(script.status).toBe(200);
    expect(script.text).not.toMatch(/theme/);
  });
});

describe('the feed URL (AC7)', () => {
  it('shows the feed URL on the request host, with a token it made', async () => {
    expect(getSetting(testApp.db, 'feed_token')).toBeUndefined();
    const document = await settingsDocument('example.test:8123');

    const input = one(document, '#feed-url') as DomInput;
    expect(input.tagName).toBe('INPUT');
    expect(input.hasAttribute('readonly')).toBe(true);
    const token = getSetting(testApp.db, 'feed_token');
    expect(token).toBeTruthy();
    expect(input.value).toBe(`http://example.test:8123/calendar.ics?token=${token}`);
  });

  it('shows a URL that answers with the calendar', async () => {
    const document = await settingsDocument();
    const shown = new URL((one(document, '#feed-url') as DomInput).value);

    const feed = await request(testApp.app).get(shown.pathname + shown.search);
    expect(feed.status).toBe(200);
    expect(feed.headers['content-type']).toMatch(/^text\/calendar/);
  });

  it('keeps a stored token', async () => {
    setSetting(testApp.db, 'feed_token', 'kept-token');
    const document = await settingsDocument();

    expect((one(document, '#feed-url') as DomInput).value).toMatch(/\?token=kept-token$/);
    expect(getSetting(testApp.db, 'feed_token')).toBe('kept-token');
  });

  it('shows the same URL on two visits', async () => {
    // supertest listens on a new port per request, so the host is set.
    const first = (one(await settingsDocument('example.test'), '#feed-url') as DomInput).value;
    const second = (one(await settingsDocument('example.test'), '#feed-url') as DomInput).value;

    expect(second).toBe(first);
  });
});

describe('the .ics downloads (AC8)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T21:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('links the upcoming download and the Dubai day download', async () => {
    const document = await settingsDocument();

    const day = one(document, 'a[href="/day/2026-10-13/ics"]');
    const upcoming = one(document, 'a[href="/upcoming/ics"]');
    expect(day.hasAttribute('download')).toBe(true);
    expect(upcoming.hasAttribute('download')).toBe(true);
  });
});
