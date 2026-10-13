import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource, type Source } from './db/sources.ts';
import { createTask, type NewTask, type Task } from './db/tasks.ts';
import type { AnalyzedTask, Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { findRule, valueOf } from './testing/css.ts';
import {
  all,
  formFields,
  one,
  openPage,
  parseHtml,
  scriptErrors,
  textOf,
  visibleText,
  type DomDocument,
  type DomElement,
  type DomInput,
  type DomWindow,
} from './testing/dom.ts';
import { getStylesheet, runLinkedScripts } from './testing/page.ts';
import { priorities, slots } from './ui.ts';

/*
 * The review page as it is served and as its script changes it. The drafts are written
 * straight into the database: these tests do not go through the analyzer.
 */

const WIDE_MEDIA = '@media (min-width: 900px)';

/** U+2212, the minus sign on the button that takes minutes off. */
const MINUS = '−';

const bug: AnalyzedTask = {
  title: 'Finish login bug fix',
  description: 'Before Friday',
  category: 'coding',
  estimated_minutes: 90,
  urgency: 'high',
  confidence: 0.9,
};

const milk: AnalyzedTask = {
  title: 'Buy milk, eggs, bread',
  description: '',
  category: 'shopping',
  estimated_minutes: 40,
  urgency: 'medium',
  confidence: 0.5,
};

const bank: AnalyzedTask = {
  title: 'Call the bank',
  description: '',
  category: 'personal',
  estimated_minutes: 15,
  urgency: 'low',
  confidence: 0.49,
};

/** The classes this job brought to the stylesheet, each used on the Add page or a review page. */
const NEW_CLASSES = [
  'analyzing',
  'field',
  'source',
  'source__summary',
  'source__text',
  'review-form',
  'drafts',
  'draft',
  'draft__row',
  'draft__flag',
  'stepper',
  'stepper__input',
  'stepper__unit',
  'choices',
  'choice',
  'review-bar',
];

interface Seeded {
  source: Source;
  drafts: Task[];
}

let testApp: TestApp;
let analyze: ReturnType<typeof vi.fn<Analyze>>;
const opened: DomWindow[] = [];

beforeEach(() => {
  analyze = vi.fn<Analyze>();
  testApp = createTestApp({ analyze });
});

// A script that throws, on load or in a listener, fails the test that opened the page.
afterEach(() => {
  testApp.close();
  vi.restoreAllMocks();
  for (const window of opened.splice(0)) {
    const errors = scriptErrors(window);
    window.close();
    expect(errors).toEqual([]);
  }
});

function photoSource(): Source {
  return createSource(testApp.db, { kind: 'photo', image_path: '/uploads/list.png' });
}

/** Stores a task as the analysis of a source would, as a draft, with anything in `extra` on top. */
function draftOf(task: AnalyzedTask, sourceId: number, extra: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, {
    title: task.title,
    description: task.description,
    category: task.category,
    estimated_minutes: task.estimated_minutes,
    confidence: task.confidence,
    priority: task.urgency,
    status: 'draft',
    source_id: sourceId,
    ...extra,
  });
}

/** A photo source with the three drafts `bug`, `milk` and `bank`. */
function seed(): Seeded {
  const source = photoSource();
  return { source, drafts: [bug, milk, bank].map((task) => draftOf(task, source.id)) };
}

/** A photo source with one draft that has these fields on top of `milk`. */
function seedOne(extra: Partial<NewTask> = {}): Seeded {
  const source = photoSource();
  return { source, drafts: [draftOf(milk, source.id, extra)] };
}

/** The review page of a source as it is served, parsed with its scripts off. */
async function served(sourceId: number): Promise<DomDocument> {
  const response = await request(testApp.app).get(`/review/${sourceId}`);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** The review page of a source opened as a browser would, before its linked script ran. */
async function openReview(sourceId: number): Promise<DomWindow> {
  const response = await request(testApp.app).get(`/review/${sourceId}`);
  expect(response.status).toBe(200);

  const window = openPage(response.text);
  opened.push(window);
  return window;
}

function cardsOf(document: DomDocument): DomElement[] {
  return all(document, '[data-draft]');
}

function cardOf(document: DomDocument, task: Task): DomElement {
  return one(document, `[data-draft="${task.id}"]`);
}

/** The minutes input of a card with the button before it and the button after it. */
function stepperOf(card: DomElement): { input: DomInput; less: DomElement; more: DomElement } {
  const input = one(card, 'input[type="number"]') as DomInput;
  const siblings = [...one(card, '[data-stepper]').children];
  const at = siblings.indexOf(input);
  return { input, less: siblings[at - 1], more: siblings[at + 1] };
}

function expectNotFound(response: request.Response): void {
  expect(response.status).toBe(404);
  expect(textOf(one(parseHtml(response.text), 'main h1'))).toBe('Page not found');
}

describe('GET /review/:sourceId for a source with drafts (AC7)', () => {
  it('returns 200 in the layout, with the Add link as the current page', async () => {
    const { source } = seed();

    const response = await request(testApp.app).get(`/review/${source.id}`);
    const document = parseHtml(response.text);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.text.match(/<html\b/g)).toHaveLength(1);
    expect(textOf(one(document, 'title'))).toBe('Review tasks - Task Image AI');
    expect(all(one(document, 'nav'), 'a')).toHaveLength(5);
    expect(all(document, '[aria-current]')).toHaveLength(1);
    expect(one(document, '[aria-current="page"]').getAttribute('href')).toBe('/add');
  });

  it('has the one heading Review 3 tasks and says that nothing is saved yet', async () => {
    const { source } = seed();

    const document = await served(source.id);

    expect(all(document, 'main h1')).toHaveLength(1);
    expect(textOf(one(document, 'main h1'))).toBe('Review 3 tasks');
    expect(textOf(one(document, 'main'))).toContain('Nothing saved yet');
  });

  it('says Review 1 task for one draft', async () => {
    const { source } = seedOne();

    const document = await served(source.id);

    expect(textOf(one(document, 'main h1'))).toBe('Review 1 task');
  });

  it('pins the photo above the cards in a details element that is closed', async () => {
    const { source } = seed();

    const document = await served(source.id);
    const details = one(document, 'main details');
    const form = one(document, 'main form');
    const img = one(details, 'img');

    expect(details.hasAttribute('open')).toBe(false);
    expect(all(details, 'summary')).toHaveLength(1);
    expect(textOf(one(details, 'summary'))).not.toBe('');
    expect(img.getAttribute('src')).toBe('/uploads/list.png');
    expect(img.getAttribute('alt')?.trim()).toBeTruthy();

    // Before the form, and not inside it.
    expect(form.contains(details)).toBe(false);
    expect(details.compareDocumentPosition(form) & 4).toBe(4);
  });

  it.each(['text', 'voice'] as const)('shows the transcript of a %s source as text, with no image', async (kind) => {
    const source = createSource(testApp.db, { kind, transcript: 'buy <b>milk</b> and call the bank' });
    draftOf(milk, source.id);

    const document = await served(source.id);
    const details = one(document, 'main details');

    expect(details.hasAttribute('open')).toBe(false);
    expect(all(details, 'summary')).toHaveLength(1);
    expect(all(details, 'img')).toEqual([]);
    expect(textOf(details)).toContain('buy <b>milk</b> and call the bank');
    expect(all(details, 'b')).toEqual([]);
  });

  it('has no inline style', async () => {
    const { source } = seed();

    const document = await served(source.id);

    expect(all(document, '[style]')).toEqual([]);
  });
});

describe('the cards of the review page (AC8)', () => {
  it('has one card per draft, in id order', async () => {
    const { source, drafts } = seed();

    const document = await served(source.id);

    expect(cardsOf(document).map((card) => card.getAttribute('data-draft'))).toEqual(
      drafts.map((draft) => String(draft.id)),
    );
  });

  it('has no card for a task of another status or of another source', async () => {
    const { source, drafts } = seed();
    createTask(testApp.db, { title: 'Already pending', status: 'pending', source_id: source.id });
    createTask(testApp.db, { title: 'Already done', status: 'done', source_id: source.id });
    const other = photoSource();
    draftOf(bank, other.id, { title: 'A draft of another photo' });

    const document = await served(source.id);

    expect(cardsOf(document).map((card) => card.getAttribute('data-draft'))).toEqual(
      drafts.map((draft) => String(draft.id)),
    );
    expect(textOf(one(document, 'main h1'))).toBe('Review 3 tasks');
    expect(textOf(one(document, 'main'))).not.toContain('Already');
    expect(all(document, 'main input[type="text"]').map((input) => input.getAttribute('value'))).toEqual([
      bug.title,
      milk.title,
      bank.title,
    ]);
  });

  it('holds every card in one form that posts to the confirm route, with no script in the way', async () => {
    const { source } = seed();

    const document = await served(source.id);
    const form = one(document, 'main form');

    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe(`/review/${source.id}/confirm`);
    expect(form.hasAttribute('enctype')).toBe(false);
    expect(form.hasAttribute('onsubmit')).toBe(false);
    expect(cardsOf(document)).toHaveLength(3);
    for (const card of cardsOf(document)) expect(form.contains(card)).toBe(true);
  });

  it('starts the form with a hidden submit button of its own, so Enter in a field confirms', async () => {
    const { source } = seed();

    const document = await served(source.id);
    const first = all(one(document, 'main form'), 'button[type="submit"], input[type="submit"]')[0];

    expect(first.hasAttribute('hidden')).toBe(true);
    expect(first.hasAttribute('formaction')).toBe(false);
    expect(first.tagName).toBe('BUTTON');
  });

  it('gives each card a text input named Task title that holds the title', async () => {
    const { source, drafts } = seed();

    const document = await served(source.id);

    for (const draft of drafts) {
      const input = one(cardOf(document, draft), 'input[type="text"]');

      expect(input.getAttribute('aria-label')).toBe('Task title');
      expect(input.getAttribute('name')).toBe(`title-${draft.id}`);
      expect(input.getAttribute('value')).toBe(draft.title);
    }
  });

  it('gives each card a number input for the minutes, from 1 to 1440, between a − and a + button', async () => {
    const { source, drafts } = seed();

    const document = await served(source.id);

    for (const draft of drafts) {
      const { input, less, more } = stepperOf(cardOf(document, draft));

      expect(input.getAttribute('min')).toBe('1');
      expect(input.getAttribute('max')).toBe('1440');
      expect(input.getAttribute('name')).toBe(`minutes-${draft.id}`);
      expect(input.getAttribute('value')).toBe(String(draft.estimated_minutes));

      expect(less.matches('button[type="button"]')).toBe(true);
      expect(textOf(less)).toBe(MINUS);
      expect(more.matches('button[type="button"]')).toBe(true);
      expect(textOf(more)).toBe('+');
    }
  });

  it('gives each card one radio per priority, with the one of the draft checked', async () => {
    const { source, drafts } = seed();

    const document = await served(source.id);

    for (const draft of drafts) {
      const radios = all(cardOf(document, draft), 'input[type="radio"]');

      expect(radios.map((radio) => radio.getAttribute('name'))).toEqual(priorities.map(() => `priority-${draft.id}`));
      expect(radios.map((radio) => radio.getAttribute('value'))).toEqual(priorities.map((item) => item.id));
      for (const [index, radio] of radios.entries()) {
        const label = radio.closest('label');
        expect(label === null ? '' : visibleText(label)).toBe(priorities[index].label);
      }
      const checked = radios.filter((radio) => radio.hasAttribute('checked'));
      expect(checked.map((radio) => radio.getAttribute('value'))).toEqual([draft.priority]);
    }
  });

  it('checks no radio for a draft without a priority', async () => {
    const { source, drafts } = seedOne({ priority: null });

    const document = await served(source.id);
    const radios = all(cardOf(document, drafts[0]), 'input[type="radio"]');

    expect(radios).toHaveLength(priorities.length);
    expect(radios.filter((radio) => radio.hasAttribute('checked'))).toEqual([]);
  });

  it('gives each card a slot picker with No slot and the four slots, No slot selected', async () => {
    const { source, drafts } = seed();

    const document = await served(source.id);

    for (const draft of drafts) {
      const select = one(cardOf(document, draft), 'select');
      const options = all(select, 'option');

      expect(select.getAttribute('name')).toBe(`slot-${draft.id}`);
      expect(options.map((option) => [option.getAttribute('value'), textOf(option)])).toEqual([
        ['', 'No slot'],
        ...slots.map((item) => [item.id, item.label]),
      ]);
      expect(all(select, 'option[selected]').map((option) => textOf(option))).toEqual(['No slot']);
    }
  });

  it('selects the stored slot of a draft that has one', async () => {
    const { source, drafts } = seedOne({ time_slot: 'evening' });

    const document = await served(source.id);
    const select = one(cardOf(document, drafts[0]), 'select');

    expect(all(select, 'option[selected]').map((option) => option.getAttribute('value'))).toEqual(['evening']);
  });

  it('gives each card a Remove button that posts the form to the remove route of that draft', async () => {
    const { source, drafts } = seed();

    const document = await served(source.id);

    for (const draft of drafts) {
      const remove = all(cardOf(document, draft), 'button').filter((button) => textOf(button) === 'Remove');

      expect(remove).toHaveLength(1);
      expect(remove[0].getAttribute('type')).toBe('submit');
      expect(remove[0].getAttribute('formaction')).toBe(`/review/${source.id}/remove/${draft.id}`);
      expect(remove[0].hasAttribute('formnovalidate')).toBe(true);
      expect(one(document, 'main form').contains(remove[0])).toBe(true);
    }
  });

  it('renders a title with markup in it as the value of the input, not as markup', async () => {
    const title = '"><script>x</script>';
    const { source, drafts } = seedOne({ title });

    const document = await served(source.id);

    expect(one(cardOf(document, drafts[0]), 'input[type="text"]').getAttribute('value')).toBe(title);
    expect(all(document, 'main script:not([src])')).toEqual([]);
    expect(cardsOf(document)).toHaveLength(1);
  });

  it('posts exactly the four fields of each draft, with the stored values', async () => {
    const { source, drafts } = seed();
    const [first, second, third] = drafts;

    const document = await served(source.id);

    expect(formFields(one(document, 'main form'))).toEqual({
      [`title-${first.id}`]: bug.title,
      [`minutes-${first.id}`]: '90',
      [`priority-${first.id}`]: 'high',
      [`slot-${first.id}`]: '',
      [`title-${second.id}`]: milk.title,
      [`minutes-${second.id}`]: '40',
      [`priority-${second.id}`]: 'medium',
      [`slot-${second.id}`]: '',
      [`title-${third.id}`]: bank.title,
      [`minutes-${third.id}`]: '15',
      [`priority-${third.id}`]: 'low',
      [`slot-${third.id}`]: '',
    });
  });
});

describe('the low-confidence mark (AC9)', () => {
  it('is on a card below 0.5 and not on a card at 0.5 or above', async () => {
    const { source, drafts } = seed();

    const document = await served(source.id);
    const marked = drafts.map((draft) => textOf(cardOf(document, draft)).includes('Low confidence'));

    // The confidences are 0.9, 0.5 and 0.49.
    expect(marked).toEqual([false, false, true]);
  });

  it.each([
    [0, true],
    [null, false],
    [1, false],
  ])('for a confidence of %s it is shown: %s', async (confidence, shown) => {
    const { source, drafts } = seedOne({ confidence });

    const document = await served(source.id);

    expect(textOf(cardOf(document, drafts[0])).includes('Low confidence')).toBe(shown);
  });
});

describe('the minutes stepper (AC10)', () => {
  /** Opens the review page of a source and runs its script. */
  async function openWithScript(sourceId: number): Promise<DomWindow> {
    const window = await openReview(sourceId);
    await runLinkedScripts(testApp.app, window);
    return window;
  }

  /** The stepper of the one draft of a source, on a page whose script ran, with the input set to `value`. */
  async function stepperAt(value: string): Promise<{ input: DomInput; less: DomElement; more: DomElement }> {
    const { source, drafts } = seedOne();
    const { document } = await openWithScript(source.id);
    const stepper = stepperOf(cardOf(document, drafts[0]));
    stepper.input.value = value;
    return stepper;
  }

  it('is served with its two buttons hidden, for a browser without the script', async () => {
    const { source, drafts } = seed();

    const document = await served(source.id);

    for (const draft of drafts) {
      const { less, more } = stepperOf(cardOf(document, draft));

      expect(less.hasAttribute('hidden')).toBe(true);
      expect(more.hasAttribute('hidden')).toBe(true);
    }
  });

  it('comes with one script, deferred, which the app serves as JavaScript', async () => {
    const { source } = seed();

    const document = await served(source.id);
    const script = one(document, 'script[src]');

    expect(script.getAttribute('src')).toBe('/js/review.js');
    expect(script.hasAttribute('defer')).toBe(true);

    const response = await request(testApp.app).get('/js/review.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
  });

  it('shows the two buttons of every card once the script ran', async () => {
    const { source, drafts } = seed();
    const window = await openReview(source.id);

    await expect(runLinkedScripts(testApp.app, window)).resolves.toEqual(['/js/review.js']);

    for (const draft of drafts) {
      const { less, more } = stepperOf(cardOf(window.document, draft));

      expect(less.hasAttribute('hidden')).toBe(false);
      expect(more.hasAttribute('hidden')).toBe(false);
    }
    // The first submit button of the form stays hidden: it is not a stepper button.
    expect(all(window.document, 'main form button[type="submit"]')[0].hasAttribute('hidden')).toBe(true);
  });

  it('adds 5 with + and takes 5 off with −, on that card only', async () => {
    const { source, drafts } = seed();
    const { document } = await openWithScript(source.id);
    const first = stepperOf(cardOf(document, drafts[0]));
    const second = stepperOf(cardOf(document, drafts[1]));
    const third = stepperOf(cardOf(document, drafts[2]));

    first.more.click();
    expect(first.input.value).toBe('95');

    first.less.click();
    first.less.click();
    expect(first.input.value).toBe('85');
    expect(second.input.value).toBe('40');
    expect(third.input.value).toBe('15');

    second.more.click();
    third.less.click();
    expect(first.input.value).toBe('85');
    expect(second.input.value).toBe('45');
    expect(third.input.value).toBe('10');
  });

  it.each([
    ['3', MINUS, '1'],
    ['1', MINUS, '1'],
    ['6', MINUS, '1'],
    ['1438', '+', '1440'],
    ['1440', '+', '1440'],
    ['1435', '+', '1440'],
    ['', '+', '5'],
    ['', MINUS, '1'],
  ])('from "%s", %s gives %s', async (from, button, expected) => {
    const { input, less, more } = await stepperAt(from);

    (button === '+' ? more : less).click();

    expect(input.value).toBe(expected);
  });

  it('does not submit the form', async () => {
    const { source, drafts } = seedOne();
    const window = await openWithScript(source.id);
    const { less, more } = stepperOf(cardOf(window.document, drafts[0]));
    // Counted in the page. A submit is stopped there: jsdom cannot navigate.
    window.eval(`
      window.submits = 0;
      document.querySelector('main form').addEventListener('submit', function (event) {
        window.submits += 1;
        event.preventDefault();
      });
    `);

    more.click();
    less.click();

    expect(window.eval('window.submits')).toBe(0);
  });
});

describe('the bar at the end of the form (AC11)', () => {
  it('is the last thing in the form and holds Discard and Confirm all (3)', async () => {
    const { source } = seed();

    const document = await served(source.id);
    const bar = [...one(document, 'main form').children].at(-1);
    if (bar === undefined) throw new Error('The form is empty');
    const buttons = all(bar, 'button');

    expect(bar.classList.contains('review-bar')).toBe(true);
    expect(buttons.map((button) => textOf(button))).toEqual(['Discard', 'Confirm all (3)']);

    const [discard, confirm] = buttons;
    expect(discard.getAttribute('type')).toBe('submit');
    expect(discard.getAttribute('formaction')).toBe(`/review/${source.id}/discard`);
    expect(discard.hasAttribute('formnovalidate')).toBe(true);
    expect(confirm.getAttribute('type')).toBe('submit');
    expect(confirm.hasAttribute('formaction')).toBe(false);
    expect(confirm.hasAttribute('hidden')).toBe(false);
  });

  it('counts one card as Confirm all (1)', async () => {
    const { source } = seedOne();

    const document = await served(source.id);

    expect(all(one(document, '.review-bar'), 'button').map((button) => textOf(button))).toEqual([
      'Discard',
      'Confirm all (1)',
    ]);
  });

  it('is kept in view by the stylesheet: sticky above the tab bar, at the bottom on a wide screen', async () => {
    const { rules } = await getStylesheet();
    const bar = findRule(rules, '.review-bar');
    const wide = findRule(rules, '.review-bar', WIDE_MEDIA);

    expect(valueOf(bar, 'position')).toBe('sticky');
    expect(valueOf(bar, 'bottom')).toContain('var(--nav-height)');
    expect(valueOf(wide, 'bottom')).toBe('0');
  });

  it('gives every button the btn class, in every state of the page', async () => {
    const withDrafts = seed().source;
    const saved = photoSource();
    createTask(testApp.db, { title: 'Saved', status: 'pending', source_id: saved.id });
    const empty = photoSource();
    const refused = await request(testApp.app)
      .post(`/review/${withDrafts.id}/confirm`)
      .type('form')
      .send({ 'title-1': '' });
    expect(refused.status).toBe(400);

    const pages = [
      await served(withDrafts.id),
      await served(saved.id),
      await served(empty.id),
      parseHtml(refused.text),
    ];

    // With drafts: the theme toggle, the hidden submit, three buttons a card, and the bar.
    expect(pages.map((document) => all(document, 'button').length)).toEqual([13, 1, 1, 13]);
    for (const document of pages) {
      for (const button of all(document, 'button')) {
        expect(button.classList.contains('btn'), button.outerHTML).toBe(true);
      }
      // A link that looks like a button is one too.
      for (const link of all(document, 'main a')) {
        expect(link.classList.contains('btn'), link.outerHTML).toBe(true);
      }
    }
  });

  it.each(NEW_CLASSES)('uses the class %s in a page and styles it in the stylesheet', async (name) => {
    const photo = seed().source;
    const text = createSource(testApp.db, { kind: 'text', transcript: 'buy milk' });
    draftOf(milk, text.id);
    const add = await request(testApp.app).get('/add');
    const pages = [parseHtml(add.text), await served(photo.id), await served(text.id)];
    const { rules } = await getStylesheet();
    const inSelector = new RegExp(`\\.${name}(?![\\w-])`);

    expect(pages.some((document) => all(document, `.${name}`).length > 0)).toBe(true);
    expect(rules.some((rule) => inSelector.test(rule.selector))).toBe(true);
  });
});

describe('GET /review/:sourceId for a source without drafts (AC16)', () => {
  it('says how many tasks are saved, with a link to add another, and shows no form', async () => {
    const source = photoSource();
    createTask(testApp.db, { title: 'First', status: 'pending', source_id: source.id });
    createTask(testApp.db, { title: 'Second', status: 'pending', source_id: source.id });
    createTask(testApp.db, { title: 'Third', status: 'done', source_id: source.id });

    const document = await served(source.id);
    const links = all(document, 'main a');

    expect(all(document, 'main h1')).toHaveLength(1);
    expect(textOf(one(document, 'main'))).toContain('3 tasks saved');
    expect(links.map((link) => [textOf(link), link.getAttribute('href')])).toEqual([['Add another', '/add']]);
    expect(all(document, 'main form')).toEqual([]);
    expect(all(document, 'main details')).toEqual([]);
    expect(all(document, 'script[src]')).toEqual([]);
    expect(one(document, '[aria-current="page"]').getAttribute('href')).toBe('/add');
  });

  it('says 1 task saved for one', async () => {
    const source = photoSource();
    createTask(testApp.db, { title: 'Only', status: 'in_progress', source_id: source.id });

    const document = await served(source.id);

    expect(textOf(one(document, 'main'))).toContain('1 task saved');
    expect(textOf(one(document, 'main'))).not.toContain('1 tasks');
  });

  it('counts only the tasks of that source', async () => {
    const source = photoSource();
    createTask(testApp.db, { title: 'Mine', status: 'pending', source_id: source.id });
    const other = photoSource();
    createTask(testApp.db, { title: 'Not mine', status: 'pending', source_id: other.id });
    createTask(testApp.db, { title: 'Nobody’s', status: 'pending' });

    const document = await served(source.id);

    expect(textOf(one(document, 'main'))).toContain('1 task saved');
  });

  it('renders the empty state for a source with no task at all', async () => {
    const source = photoSource();

    const document = await served(source.id);
    const emptyState = one(document, 'main .empty-state');

    expect(textOf(one(emptyState, '.empty-state__heading'))).toBe('Nothing to review');
    expect(all(emptyState, 'a').map((link) => link.getAttribute('href'))).toEqual(['/add']);
    expect(all(document, 'main h1')).toHaveLength(1);
    expect(all(document, 'main form')).toEqual([]);
    expect(textOf(one(document, 'main'))).not.toContain('saved');
    expect(one(document, '[aria-current="page"]').getAttribute('href')).toBe('/add');
  });
});

describe('GET /review/:sourceId for an id that is no source (AC17)', () => {
  it.each(['/review/999', '/review/abc', '/review/0', '/review/01', '/review/1.5', '/review/-1', '/review/1abc'])(
    'answers %s with the not-found page',
    async (address) => {
      const { source } = seed();
      expect(source.id).toBe(1);

      const response = await request(testApp.app).get(address);

      expectNotFound(response);
    },
  );
});
