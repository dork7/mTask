import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { viewsDir } from './paths.ts';
import { declarationsOf, findRule } from './testing/css.ts';
import {
  all,
  one,
  parseHtml,
  textOf,
  visibleText,
  type DomDocument,
  type DomElement,
} from './testing/dom.ts';
import { getPage, getStylesheet, renderView, type Page } from './testing/page.ts';

/** Each component partial with the local it reads and a minimal object for it. */
const PARTIALS: { name: string; local: string; sample: Record<string, unknown> }[] = [
  { name: 'page-header', local: 'pageHeader', sample: { heading: 'Tasks' } },
  { name: 'button', local: 'button', sample: { label: 'Start' } },
  { name: 'priority-badge', local: 'priorityBadge', sample: { priority: 'urgent' } },
  { name: 'slot-badge', local: 'slotBadge', sample: { slot: 'morning' } },
  { name: 'chip', local: 'chip', sample: { label: 'Weekly' } },
  { name: 'card', local: 'card', sample: { body: '<p>Body</p>' } },
  { name: 'modal', local: 'modal', sample: { id: 'm', heading: 'Heading', body: '<p>Body</p>' } },
  { name: 'bottom-sheet', local: 'bottomSheet', sample: { id: 's', heading: 'Heading', body: '<p>Body</p>' } },
  { name: 'toast', local: 'toast', sample: { message: 'Saved' } },
  { name: 'empty-state', local: 'emptyState', sample: { heading: 'Nothing here' } },
  { name: 'skeleton', local: 'skeleton', sample: {} },
];

/** The heading of each component's section on the style guide, and what must be inside it. */
const SECTIONS: [heading: string, selectors: string[]][] = [
  ['Page header', ['.page-header h1']],
  ['Button', ['.btn:not(.btn--ghost)', '.btn.btn--ghost']],
  ['Priority badge', ['.badge--urgent', '.badge--high', '.badge--medium', '.badge--low']],
  [
    'Slot badge',
    ['.badge--slot-morning', '.badge--slot-afternoon', '.badge--slot-evening', '.badge--slot-night'],
  ],
  ['Chip', ['.chip']],
  ['Card', ['.card']],
  ['Modal', ['.modal']],
  ['Bottom sheet', ['.sheet']],
  ['Toast', ['.toast']],
  ['Empty state', ['.empty-state']],
  ['Skeleton loader', ['.skeleton .skeleton__line']],
];

const PRIORITY_LABELS = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };
const SLOT_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' };

function partialPath(name: string): string {
  return path.join(viewsDir, 'partials', `${name}.ejs`);
}

/** Renders one partial with its object and returns the parsed fragment. */
async function renderPartial(name: string, data: Record<string, unknown>): Promise<DomElement> {
  const partial = PARTIALS.find((item) => item.name === name);
  if (!partial) throw new Error(`No such partial in the test table: ${name}`);
  const html = await renderView(`partials/${name}`, { [partial.local]: data });
  return parseHtml(html).body;
}

/** The one element a partial renders at its top level. */
function rootOf(fragment: DomElement): DomElement {
  expect(fragment.children).toHaveLength(1);
  return fragment.children[0];
}

/** The sections of the style guide whose own heading (their first child, an h2) has this text. */
function sectionsNamed(document: DomDocument, heading: string): DomElement[] {
  return all(document, 'section.sg-section').filter((section) => {
    const first = section.firstElementChild;
    return first?.tagName === 'H2' && textOf(first) === heading;
  });
}

/** The accessible name a dialog gets through `aria-labelledby`, looked up inside `scope`. */
function dialogName(dialog: DomElement, scope: DomDocument | DomElement): string {
  const id = dialog.getAttribute('aria-labelledby');
  if (!id) return '';
  const labels = all(scope, `[id="${id}"]`);
  expect(labels, `elements with id "${id}"`).toHaveLength(1);
  expect(dialog.contains(labels[0])).toBe(true);
  return textOf(labels[0]);
}

describe('component partials (AC5)', () => {
  it('has the eleven components the spec lists', () => {
    expect(PARTIALS.map((partial) => partial.name)).toEqual([
      'page-header',
      'button',
      'priority-badge',
      'slot-badge',
      'chip',
      'card',
      'modal',
      'bottom-sheet',
      'toast',
      'empty-state',
      'skeleton',
    ]);
  });

  it.each(PARTIALS)('$name exists as a partial file', ({ name }) => {
    expect(existsSync(partialPath(name)), partialPath(name)).toBe(true);
  });

  it.each(PARTIALS)('$name renders from its own object', async ({ name, sample }) => {
    const fragment = await renderPartial(name, sample);

    expect(fragment.children).toHaveLength(1);
  });

  it.each(PARTIALS)('$name rejects when its object is left out', async ({ name }) => {
    await expect(renderView(`partials/${name}`, {})).rejects.toThrow();
    await expect(renderView(`partials/${name}`, { title: 'PAGE-TITLE' })).rejects.toThrow();
  });

  it.each(PARTIALS)('$name does not pick up a local of the page', async ({ name, local, sample }) => {
    const html = await renderView(`partials/${name}`, {
      [local]: sample,
      title: 'PAGE-TITLE',
      heading: 'PAGE-TITLE',
      label: 'PAGE-TITLE',
      text: 'PAGE-TITLE',
      sub: 'PAGE-TITLE',
      message: 'PAGE-TITLE',
      body: 'PAGE-TITLE',
      actions: 'PAGE-TITLE',
      id: 'PAGE-TITLE',
      href: 'PAGE-TITLE',
      variant: 'PAGE-TITLE',
      tone: 'PAGE-TITLE',
      selected: true,
      open: true,
    });

    expect(html).not.toContain('PAGE-TITLE');
  });

  it.each(PARTIALS)('$name includes no other partial', ({ name }) => {
    expect(readFileSync(partialPath(name), 'utf8')).not.toContain('include(');
  });

  it.each(PARTIALS)('$name emits no section and no navigation landmark', async ({ name, sample }) => {
    const fragment = await renderPartial(name, sample);

    expect(all(fragment, 'section, nav, [role="navigation"], main')).toEqual([]);
  });
});

describe('button', () => {
  it('is a primary button of type "button" by default', async () => {
    const html = await renderView('partials/button', { button: { label: 'Start' } });
    const button = rootOf(parseHtml(html).body);

    expect(html).toContain('<button type="button" class="btn">Start</button>');
    expect(button.tagName).toBe('BUTTON');
    expect(textOf(button)).toBe('Start');
  });

  it('adds the ghost class for the ghost variant', async () => {
    const button = rootOf(await renderPartial('button', { label: 'Snooze', variant: 'ghost' }));

    expect(button.getAttribute('class')).toBe('btn btn--ghost');
  });

  it('accepts "primary" as a variant by name', async () => {
    const button = rootOf(await renderPartial('button', { label: 'Start', variant: 'primary' }));

    expect(button.getAttribute('class')).toBe('btn');
  });

  it('rejects an unknown variant', async () => {
    await expect(renderPartial('button', { label: 'Start', variant: 'danger' })).rejects.toThrow(
      /unknown variant "danger"/,
    );
  });

  it('is a link with the button classes when it has an href', async () => {
    const link = rootOf(await renderPartial('button', { label: 'Add', href: '/add', variant: 'ghost' }));

    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/add');
    expect(link.getAttribute('class')).toBe('btn btn--ghost');
    expect(link.hasAttribute('type')).toBe(false);
    expect(textOf(link)).toBe('Add');
  });

  it('takes another type', async () => {
    const button = rootOf(await renderPartial('button', { label: 'Save', type: 'submit' }));

    expect(button.getAttribute('type')).toBe('submit');
  });

  it('writes extra attributes with their values escaped', async () => {
    const value = '"><script>alert(1)</script>';
    const fragment = await renderPartial('button', {
      label: 'Toggle',
      attrs: { 'data-theme-toggle': '', 'aria-label': value },
    });
    const button = rootOf(fragment);

    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('data-theme-toggle')).toBe('');
    expect(button.getAttribute('aria-label')).toBe(value);
    expect(all(fragment, 'script')).toEqual([]);
  });

  it('writes extra attributes on a link too', async () => {
    const link = rootOf(await renderPartial('button', { label: 'Add', href: '/add', attrs: { 'data-x': '1' } }));

    expect(link.tagName).toBe('A');
    expect(link.getAttribute('data-x')).toBe('1');
  });

  it('rejects an attribute name that is not a plain name', async () => {
    await expect(
      renderPartial('button', { label: 'Start', attrs: { 'x onclick': 'alert(1)' } }),
    ).rejects.toThrow(/bad attribute name/);
  });

  it('escapes its label', async () => {
    const button = rootOf(await renderPartial('button', { label: '<b>bold</b>' }));

    expect(all(button, 'b')).toEqual([]);
    expect(textOf(button)).toBe('<b>bold</b>');
  });
});

describe('page header', () => {
  it('is a header with a bare h1', async () => {
    const html = await renderView('partials/page-header', { pageHeader: { heading: 'Tasks' } });
    const header = rootOf(parseHtml(html).body);

    expect(header.tagName).toBe('HEADER');
    expect(header.getAttribute('class')).toBe('page-header');
    expect(html).toContain('<h1>Tasks</h1>');
    expect(all(header, 'h1')).toHaveLength(1);
  });

  it('leaves out the sub line and the actions when they are not given', async () => {
    const header = rootOf(await renderPartial('page-header', { heading: 'Tasks' }));

    expect(all(header, '.page-header__sub, .page-header__actions')).toEqual([]);
  });

  it('escapes the heading and the sub line, and writes the actions as HTML', async () => {
    const header = rootOf(
      await renderPartial('page-header', {
        heading: '<b>Tasks</b>',
        sub: '<i>12 Oct</i>',
        actions: '<a class="btn" href="/add">Add</a>',
      }),
    );

    expect(all(header, 'b, i')).toEqual([]);
    expect(textOf(one(header, 'h1'))).toBe('<b>Tasks</b>');
    expect(textOf(one(header, '.page-header__sub'))).toBe('<i>12 Oct</i>');
    expect(one(header, '.page-header__actions a.btn').getAttribute('href')).toBe('/add');
  });
});

describe('chip', () => {
  it('is a span with its label', async () => {
    const chip = rootOf(await renderPartial('chip', { label: 'Weekly' }));

    expect(chip.tagName).toBe('SPAN');
    expect(chip.getAttribute('class')).toBe('chip');
    expect(textOf(chip)).toBe('Weekly');
  });

  it('marks a selected chip and its tone', async () => {
    const chip = rootOf(await renderPartial('chip', { label: 'High', selected: true, tone: 'high' }));

    expect(chip.getAttribute('class')).toBe('chip chip--on chip--high');
  });

  it('rejects a tone that is not a priority', async () => {
    await expect(renderPartial('chip', { label: 'x', tone: 'loud' })).rejects.toThrow(/Unknown priority/);
  });

  it('escapes its label', async () => {
    const chip = rootOf(await renderPartial('chip', { label: '<b>bold</b>' }));

    expect(all(chip, 'b')).toEqual([]);
    expect(textOf(chip)).toBe('<b>bold</b>');
  });
});

describe('card', () => {
  it('is a div that holds the body as HTML', async () => {
    const card = rootOf(await renderPartial('card', { body: '<p class="muted">Admin</p>' }));

    expect(card.tagName).toBe('DIV');
    expect(card.getAttribute('class')).toBe('card');
    expect(textOf(one(card, 'p.muted'))).toBe('Admin');
  });
});

describe('empty state', () => {
  it('is a div with its heading', async () => {
    const empty = rootOf(await renderPartial('empty-state', { heading: 'No tasks yet' }));

    expect(empty.tagName).toBe('DIV');
    expect(empty.getAttribute('class')).toBe('empty-state');
    expect(textOf(one(empty, '.empty-state__heading'))).toBe('No tasks yet');
    expect(all(empty, '.empty-state__text, .empty-state__actions')).toEqual([]);
  });

  it('escapes the heading and the text, and writes the actions as HTML', async () => {
    const empty = rootOf(
      await renderPartial('empty-state', {
        heading: '<b>None</b>',
        text: '<i>Add one</i>',
        actions: '<a class="btn" href="/add">Add</a>',
      }),
    );

    expect(all(empty, 'b, i')).toEqual([]);
    expect(textOf(one(empty, '.empty-state__heading'))).toBe('<b>None</b>');
    expect(textOf(one(empty, '.empty-state__text'))).toBe('<i>Add one</i>');
    expect(one(empty, '.empty-state__actions a.btn').getAttribute('href')).toBe('/add');
  });
});

describe('skeleton', () => {
  it('draws three lines and says "Loading" by default', async () => {
    const skeleton = rootOf(await renderPartial('skeleton', {}));

    expect(skeleton.tagName).toBe('DIV');
    expect(skeleton.getAttribute('class')).toBe('skeleton');
    expect(all(skeleton, '.skeleton__line')).toHaveLength(3);
    expect(visibleText(skeleton)).toBe('Loading');
  });

  it('draws as many lines as asked, under the given label', async () => {
    const skeleton = rootOf(await renderPartial('skeleton', { lines: 5, label: '<b>Reading</b> the photo' }));

    expect(all(skeleton, '.skeleton__line')).toHaveLength(5);
    expect(all(skeleton, 'b')).toEqual([]);
    expect(visibleText(skeleton)).toBe('<b>Reading</b> the photo');
  });
});

describe('badges show their name as text (AC6)', () => {
  it.each(Object.entries(PRIORITY_LABELS))('the %s badge reads "%s"', async (id, label) => {
    const badge = rootOf(await renderPartial('priority-badge', { priority: id }));

    expect(badge.tagName).toBe('SPAN');
    expect(badge.getAttribute('class')).toBe(`badge badge--${id}`);
    expect(visibleText(badge)).toBe(label);
    expect(badge.hasAttribute('aria-hidden')).toBe(false);
  });

  it.each(Object.entries(SLOT_LABELS))('the %s badge reads "%s"', async (id, label) => {
    const badge = rootOf(await renderPartial('slot-badge', { slot: id }));

    expect(badge.tagName).toBe('SPAN');
    expect(badge.getAttribute('class')).toBe(`badge badge--slot-${id}`);
    expect(visibleText(badge)).toBe(label);
    expect(badge.hasAttribute('aria-hidden')).toBe(false);
  });

  it('renders no badge for an unknown priority or slot', async () => {
    await expect(renderPartial('priority-badge', { priority: 'nope' })).rejects.toThrow(/Unknown priority "nope"/);
    await expect(renderPartial('priority-badge', {})).rejects.toThrow(/Unknown priority/);
    await expect(renderPartial('slot-badge', { slot: 'nope' })).rejects.toThrow(/Unknown slot "nope"/);
    await expect(renderPartial('slot-badge', { slot: 'urgent' })).rejects.toThrow(/Unknown slot/);
  });
});

describe.each([
  { name: 'modal', overlayClass: 'overlay overlay--modal', dialogClass: 'modal' },
  { name: 'bottom-sheet', overlayClass: 'overlay overlay--sheet', dialogClass: 'sheet' },
])('$name is a named dialog (AC6)', ({ name, overlayClass, dialogClass }) => {
  const data = { id: 'detail', heading: 'Submit expense report', body: '<p class="note">Admin</p>' };

  it('has one dialog, named by its heading', async () => {
    const fragment = await renderPartial(name, data);
    const overlay = rootOf(fragment);
    const dialog = one(fragment, '[role="dialog"]');

    expect(overlay.getAttribute('class')).toBe(overlayClass);
    expect(overlay.getAttribute('id')).toBe('detail');
    expect(dialog.getAttribute('class')).toBe(dialogClass);
    expect(overlay.contains(dialog)).toBe(true);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('detail-title');
    expect(dialogName(dialog, fragment)).toBe('Submit expense report');
    expect(one(dialog, '#detail-title').tagName).toBe('H2');
  });

  it('is hidden unless it is rendered open', async () => {
    const closed = rootOf(await renderPartial(name, data));
    const open = rootOf(await renderPartial(name, { ...data, open: true }));
    const notOpen = rootOf(await renderPartial(name, { ...data, open: false }));

    expect(closed.hasAttribute('hidden')).toBe(true);
    expect(notOpen.hasAttribute('hidden')).toBe(true);
    expect(open.hasAttribute('hidden')).toBe(false);
  });

  it('writes the body and the actions as HTML, and the heading as text', async () => {
    const fragment = await renderPartial(name, {
      ...data,
      heading: '<b>Heading</b>',
      actions: '<button type="button" class="btn">Start</button>',
    });
    const dialog = one(fragment, '[role="dialog"]');

    expect(textOf(one(dialog, 'p.note'))).toBe('Admin');
    expect(textOf(one(dialog, 'button.btn'))).toBe('Start');
    expect(all(dialog, 'b')).toEqual([]);
    expect(dialogName(dialog, fragment)).toBe('<b>Heading</b>');
  });

  it('leaves out the actions when there are none', async () => {
    const fragment = await renderPartial(name, data);

    expect(all(fragment, `.${dialogClass}__actions`)).toEqual([]);
  });

  it('rejects without an id or without a heading', async () => {
    await expect(renderPartial(name, { heading: 'Heading', body: '' })).rejects.toThrow(/id is required/);
    await expect(renderPartial(name, { id: '', heading: 'Heading', body: '' })).rejects.toThrow(/id is required/);
    await expect(renderPartial(name, { id: 'detail', body: '' })).rejects.toThrow(/heading is required/);
    await expect(renderPartial(name, { id: 'detail', heading: '', body: '' })).rejects.toThrow(
      /heading is required/,
    );
  });
});

describe('toast (AC6)', () => {
  it('brings no live region of its own and holds its message', async () => {
    const fragment = await renderPartial('toast', { message: 'Task saved' });
    const region = rootOf(fragment);
    const toast = one(fragment, '.toast');

    expect(region.getAttribute('class')).toBe('toast-region');
    expect(region.hasAttribute('aria-live')).toBe(false);
    expect(all(fragment, '[aria-live]')).toEqual([]);
    expect(textOf(toast)).toBe('Task saved');
    expect(all(fragment, '.toast__actions')).toEqual([]);
  });

  it('escapes its message and writes its actions as HTML', async () => {
    const fragment = await renderPartial('toast', {
      message: '<b>Saved</b>',
      actions: '<button type="button" class="btn">Undo</button>',
    });
    const toast = one(fragment, '.toast');

    expect(all(toast, 'b')).toEqual([]);
    expect(textOf(one(toast, '.toast__message'))).toBe('<b>Saved</b>');
    expect(textOf(one(toast, '.toast__actions button.btn'))).toBe('Undo');
  });
});

describe('GET /_styleguide (AC5, AC6)', () => {
  let page: Page;
  let document: DomDocument;
  let source: string;

  beforeAll(async () => {
    page = await getPage('/_styleguide');
    document = page.document;
    source = readFileSync(path.join(viewsDir, 'pages', 'styleguide.ejs'), 'utf8');
  });

  it('returns 200 with an HTML page', () => {
    expect(page.status).toBe(200);
    expect(page.contentType).toMatch(/^text\/html/);
  });

  it('renders inside the layout', () => {
    const main = one(document, 'main');

    expect(textOf(one(document, 'header.site-header a'))).toBe('Task Image AI');
    expect(textOf(one(document, 'title'))).toBe('Style guide - Task Image AI');
    expect(textOf(main.children[0])).toBe('Style guide');
    expect(main.children[0].tagName).toBe('H1');
  });

  it.each(PARTIALS)('includes the $name partial, not a copy of its markup', ({ name }) => {
    expect(source).toContain(`include('../partials/${name}'`);
  });

  it('opens every section with its own heading, and nests none', () => {
    const sections = all(document, 'section');

    expect(sections.length).toBeGreaterThanOrEqual(SECTIONS.length);
    for (const section of sections) {
      expect(section.classList.contains('sg-section')).toBe(true);
      expect(section.firstElementChild?.tagName).toBe('H2');
      expect(section.parentElement?.tagName).toBe('MAIN');
      expect(all(section, 'section')).toEqual([]);
    }
  });

  it.each(SECTIONS)('shows %s under a heading that names it', (heading, selectors) => {
    const sections = sectionsNamed(document, heading);

    expect(sections).toHaveLength(1);
    for (const selector of selectors) {
      expect(all(sections[0], selector).length, `${heading}: ${selector}`).toBeGreaterThan(0);
    }
  });

  it('shows the badges in all four priorities and all four slots, each with its name', () => {
    const [priorities] = sectionsNamed(document, 'Priority badge');
    const [slots] = sectionsNamed(document, 'Slot badge');

    expect(all(priorities, '.badge').map(visibleText)).toEqual(Object.values(PRIORITY_LABELS));
    expect(all(slots, '.badge').map(visibleText)).toEqual(Object.values(SLOT_LABELS));
  });

  it('gives every badge on the page a name as text', () => {
    const badges = all(document, '.badge');

    expect(badges).toHaveLength(8);
    for (const badge of badges) expect(visibleText(badge), badge.outerHTML).not.toBe('');
  });

  it('shows the modal and the bottom sheet open, each inside a stage', () => {
    const overlays = all(document, '.overlay');

    expect(overlays.map((overlay) => overlay.id)).toEqual(['sg-modal', 'sg-sheet']);
    for (const overlay of overlays) {
      expect(overlay.hasAttribute('hidden'), overlay.id).toBe(false);
      expect(overlay.closest('.sg-stage'), overlay.id).not.toBeNull();
    }
  });

  it('shows the toast inside a stage', () => {
    const regions = all(document, '.toast-region');

    expect(regions).toHaveLength(1);
    expect(regions[0].closest('.sg-stage')).not.toBeNull();
  });

  it('gives every dialog an accessible name', () => {
    const dialogs = all(document, '[role="dialog"]');

    expect(dialogs).toHaveLength(2);
    for (const dialog of dialogs) expect(dialogName(dialog, document)).not.toBe('');
  });

  it('has the layout\'s live region as its only one, with the stage toast outside it', () => {
    const toasts = all(document, '.toast');

    expect(toasts.length).toBeGreaterThan(0);
    expect(all(document, '[aria-live]')).toEqual([one(document, '#live-region')]);
    for (const toast of toasts) expect(toast.closest('#live-region')).toBeNull();
  });

  it('gives no two elements the same id', () => {
    const ids = all(document, '[id]').map((element) => element.id);

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it('uses inline styles only to point one property at a declared token', async () => {
    const { rules } = await getStylesheet();
    const tokens = declarationsOf(findRule(rules, ':root'));
    const styles = all(document, '[style]').map((element) => element.getAttribute('style') ?? '');

    expect(styles.length).toBeGreaterThan(0);
    for (const style of styles) {
      const match = /^\s*[a-z-]+\s*:\s*var\((--[\w-]+)\)\s*;?\s*$/.exec(style);
      expect(match, `style="${style}"`).not.toBeNull();
      expect(tokens, `style="${style}"`).toHaveProperty(match?.[1] ?? '');
    }
  });

  it('has no inline style outside the style guide', async () => {
    for (const path of ['/', '/no-such-page']) {
      expect(all((await getPage(path)).document, '[style]'), path).toEqual([]);
    }
  });

  it('shows a swatch for every color token', async () => {
    const { rules } = await getStylesheet();
    const colorTokens = Object.keys(declarationsOf(findRule(rules, ':root')))
      .filter((name) => name.startsWith('--light-'))
      .map((name) => `--${name.slice('--light-'.length)}`);
    const [colors] = sectionsNamed(document, 'Colors');
    const swatches = all(colors, '.sg-swatch__color').map((swatch) => swatch.getAttribute('style'));

    expect(colorTokens.length).toBeGreaterThan(0);
    expect(swatches.sort()).toEqual(colorTokens.map((name) => `background: var(${name})`).sort());
  });

  it.each(['Colors', 'Type scale', 'Spacing', 'Radii'])('shows the %s tokens in a section', (heading) => {
    const sections = sectionsNamed(document, heading);

    expect(sections).toHaveLength(1);
    expect(all(sections[0], '[style]').length).toBeGreaterThan(0);
  });
});
