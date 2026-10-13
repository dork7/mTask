import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf, type DomDocument, type DomElement, type DomInput } from './testing/dom.ts';

/*
 * The three tabs of the Add page as they are served, with the scripts off: the tab list,
 * the panels, the two text forms, and the elements the voice script shows later.
 */

/** The address of each tab, with the label of the tab it selects and the id that tab has. */
const TAB_ADDRESSES = [
  ['/add?tab=photo', 'Photo', 'photo'],
  ['/add?tab=voice', 'Voice', 'voice'],
  ['/add?tab=text', 'Type', 'text'],
] as const;

/** The two text routes: the address, the kind of source it makes and the label of its tab. */
const ROUTES = [
  ['/add/voice', 'voice', 'Voice'],
  ['/add/text', 'text', 'Type'],
] as const;

const VOICE_UNAVAILABLE = 'Voice input is not available in this browser. Type your tasks instead.';

let testApp: TestApp;
let analyze: ReturnType<typeof vi.fn<Analyze>>;

beforeEach(() => {
  analyze = vi.fn<Analyze>();
  testApp = createTestApp({ analyze });
});

afterEach(() => {
  testApp.close();
  vi.restoreAllMocks();
});

/** A page of the app, parsed with its scripts off. The address has to answer 200. */
async function getDocument(address: string): Promise<DomDocument> {
  const response = await request(testApp.app).get(address);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** Asserts the marks of the Add page in the layout. */
function expectAddPage(document: DomDocument): void {
  expect(textOf(one(document, 'main h1'))).toBe('Add task');
  expect(all(one(document, 'nav'), 'a')).toHaveLength(5);
  expect(all(document, '[aria-current]')).toHaveLength(1);
  expect(one(document, '[aria-current="page"]').getAttribute('href')).toBe('/add');
}

function tabsOf(document: DomDocument): DomElement[] {
  return all(document, '[role="tab"]');
}

/** The text of the one selected tab. */
function selectedTab(document: DomDocument): string {
  return textOf(one(document, '[role="tab"][aria-selected="true"]'));
}

function formOf(document: DomDocument, route: string): DomElement {
  return one(document, `main form[action="${route}"]`);
}

describe('the tab list of GET /add (AC1)', () => {
  it.each(['/add', ...TAB_ADDRESSES.map(([address]) => address)])(
    'has one named tab list at %s, with the three tabs as links, in order',
    async (address) => {
      const document = await getDocument(address);
      expectAddPage(document);

      const tablist = one(document, '[role="tablist"]');
      expect(tablist.getAttribute('aria-label')?.trim()).toBeTruthy();
      expect(one(document, 'main').contains(tablist)).toBe(true);

      const tabs = tabsOf(document);
      expect(tabs.every((tab) => tablist.contains(tab))).toBe(true);
      expect(tabs.map((tab) => [tab.tagName, textOf(tab), tab.getAttribute('href')])).toEqual([
        ['A', 'Photo', '/add?tab=photo'],
        ['A', 'Voice', '/add?tab=voice'],
        ['A', 'Type', '/add?tab=text'],
      ]);
    },
  );

  it.each([
    ['/add', ['true', 'false', 'false']],
    ['/add?tab=photo', ['true', 'false', 'false']],
    ['/add?tab=voice', ['false', 'true', 'false']],
    ['/add?tab=text', ['false', 'false', 'true']],
  ])('selects exactly the tab %s names', async (address, selected) => {
    const document = await getDocument(address);

    expect(tabsOf(document).map((tab) => tab.getAttribute('aria-selected'))).toEqual(selected);
  });

  it.each([
    '/add?tab=',
    '/add?tab=VOICE',
    '/add?tab=type',
    '/add?tab=%20voice',
    '/add?tab=constructor',
    '/add?tab=voice&tab=text',
    '/add?tab[]=voice',
  ])('selects Photo at %s, which names no tab', async (address) => {
    const document = await getDocument(address);

    expect(tabsOf(document).map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(selectedTab(document)).toBe('Photo');
  });

  it.each(TAB_ADDRESSES)('shows at %s the panel of the %s tab and hides the other two', async (address, label, id) => {
    const document = await getDocument(address);
    const selected = one(document, '[role="tab"][aria-selected="true"]');
    const panels = all(document, '[role="tabpanel"]');

    expect(textOf(selected)).toBe(label);
    expect(selected.getAttribute('aria-controls')).toBe(`panel-${id}`);
    expect(panels.map((panel) => panel.id)).toEqual(['panel-photo', 'panel-voice', 'panel-text']);
    expect(panels.map((panel) => [panel.id, panel.hasAttribute('hidden')])).toEqual(
      ['photo', 'voice', 'text'].map((other) => [`panel-${other}`, other !== id]),
    );
  });

  it.each(TAB_ADDRESSES)('ties every tab to its panel at %s, with no id twice and no style', async (address) => {
    const document = await getDocument(address);
    const tabs = tabsOf(document);

    expect(tabs).toHaveLength(3);
    for (const tab of tabs) {
      expect(tab.id).not.toBe('');
      const panel = one(document, `[role="tabpanel"][id="${tab.getAttribute('aria-controls')}"]`);
      expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    }

    const ids = all(document, '[id]').map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(all(document, '[style]')).toEqual([]);
  });

  it('works without a script: the address of each tab answers the page with that tab selected', async () => {
    const document = await getDocument('/add');

    for (const tab of tabsOf(document)) {
      const linked = await getDocument(tab.getAttribute('href') ?? '');

      expect(selectedTab(linked)).toBe(textOf(tab));
    }
  });

  it.each(TAB_ADDRESSES)('keeps each form in the panel of its own tab at %s', async (address) => {
    const document = await getDocument(address);
    const actionsIn = (panel: string): (string | null)[] =>
      all(one(document, `#${panel}`), 'form').map((form) => form.getAttribute('action'));

    expect(actionsIn('panel-photo')).toEqual(['/add/photo']);
    expect(actionsIn('panel-voice')).toEqual(['/add/voice']);
    expect(actionsIn('panel-text')).toEqual(['/add/text']);
    expect(all(document, 'main form')).toHaveLength(3);
  });
});

describe.each(ROUTES)('the text form of %s (AC2)', (route) => {
  it.each(TAB_ADDRESSES)('posts to its route as a plain form at %s, with no script in the way', async (address) => {
    const form = formOf(await getDocument(address), route);

    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe(route);
    expect(form.hasAttribute('enctype')).toBe(false);
    expect(form.hasAttribute('onsubmit')).toBe(false);
    expect(form.hasAttribute('data-analyze-form')).toBe(true);
  });

  it.each(TAB_ADDRESSES)('has one control at %s, an empty required text box of 5000 characters', async (address) => {
    const form = formOf(await getDocument(address), route);
    const box = one(form, 'textarea') as DomInput;

    expect(all(form, 'input')).toEqual([]);
    expect(all(form, 'select')).toEqual([]);
    expect(box.getAttribute('name')).toBe('text');
    expect(box.hasAttribute('required')).toBe(true);
    expect(box.getAttribute('maxlength')).toBe('5000');
    expect(box.hasAttribute('disabled')).toBe(false);
    expect(box.hasAttribute('readonly')).toBe(false);
    expect(box.value).toBe('');
  });

  it('labels the text box', async () => {
    const form = formOf(await getDocument('/add'), route);
    const box = one(form, 'textarea');
    const label = one(form, 'label');

    expect(box.id).not.toBe('');
    expect(label.getAttribute('for')).toBe(box.id);
    expect(textOf(label)).not.toBe('');
  });

  it.each(TAB_ADDRESSES)('has one submit button at %s, Find tasks', async (address) => {
    const form = formOf(await getDocument(address), route);
    const submit = one(form, 'button[type="submit"]');

    expect(textOf(submit)).toBe('Find tasks');
    expect(submit.hasAttribute('disabled')).toBe(false);
    expect(all(form, 'input[type="submit"]')).toEqual([]);
  });
});

describe('the two text forms together (AC2)', () => {
  it('gives the two text boxes different ids', async () => {
    const document = await getDocument('/add');
    const ids = ROUTES.map(([route]) => one(formOf(document, route), 'textarea').id);

    expect(ids[0]).not.toBe(ids[1]);
  });

  it.each(TAB_ADDRESSES)('gives every button of the page at %s the btn class', async (address) => {
    const buttons = all(await getDocument(address), 'button');

    // Retake, Upload photo, Start recording, Find tasks twice, and the buttons of the layout.
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    for (const button of buttons) {
      expect(button.classList.contains('btn'), button.outerHTML).toBe(true);
    }
  });
});

describe('the record button as it is served (AC10)', () => {
  it.each(TAB_ADDRESSES)('is at %s a hidden button of the Voice form that does not post', async (address) => {
    const document = await getDocument(address);
    const record = one(document, '[data-voice-record]');

    expect(record.tagName).toBe('BUTTON');
    expect(formOf(document, '/add/voice').contains(record)).toBe(true);
    expect(textOf(record)).toBe('Start recording');
    expect(record.getAttribute('type')).toBe('button');
    expect(record.getAttribute('aria-pressed')).toBe('false');
    expect(record.classList.contains('btn')).toBe(true);
    expect(record.hasAttribute('hidden')).toBe(true);
  });
});

describe('the message of a browser without voice input as it is served (AC14)', () => {
  it.each(TAB_ADDRESSES)('is at %s a hidden status in the Type panel', async (address) => {
    const document = await getDocument(address);
    const unavailable = one(document, '[data-voice-unavailable]');

    expect(one(document, '#panel-text').contains(unavailable)).toBe(true);
    expect(unavailable.getAttribute('role')).toBe('status');
    expect(unavailable.hasAttribute('hidden')).toBe(true);
    expect(textOf(unavailable)).toBe(VOICE_UNAVAILABLE);
  });
});
