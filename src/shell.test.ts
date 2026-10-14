import { afterEach, describe, expect, it } from 'vitest';
import {
  all,
  one,
  openPage,
  parseHtml,
  scriptErrors,
  textOf,
  type DomDocument,
  type DomElement,
  type DomWindow,
  type OpenPageOptions,
} from './testing/dom.ts';
import { getPage, renderView } from './testing/page.ts';
import { navItems } from './ui.ts';

const NAV_HREFS = ['/', '/timeline', '/add', '/tasks', '/more'];
const NAV_LABELS = ['Today', 'Timeline', 'Add', 'Tasks', 'More'];

/** `compareDocumentPosition` sets this bit when the argument comes later in the document. */
const FOLLOWING = 4;

/** The one navigation landmark of a page. Throws when there is none or several. */
function navOf(document: DomDocument): DomElement {
  return one(document, 'nav, [role="navigation"]');
}

function currentLinks(root: DomDocument | DomElement): DomElement[] {
  return all(root, '[aria-current="page"]');
}

const opened: DomWindow[] = [];

/** Opens the home page as a browser would, with its inline script running. */
async function openHome(options?: OpenPageOptions): Promise<DomWindow> {
  const { html } = await getPage('/');
  const window = openPage(html, options);
  opened.push(window);
  return window;
}

function themeOf(window: DomWindow): string | null {
  return window.document.documentElement.getAttribute('data-theme');
}

function toggleOf(window: DomWindow): DomElement {
  return one(window.document, '[data-theme-toggle]');
}

// A script that throws, on load or on a click, fails the test that opened the page.
afterEach(() => {
  for (const window of opened.splice(0)) {
    const errors = scriptErrors(window);
    window.close();
    expect(errors).toEqual([]);
  }
});

describe('navigation (AC3)', () => {
  it.each(['/', '/no-such-page', '/_styleguide'])('%s has one named navigation landmark', async (path) => {
    const { document } = await getPage(path);

    expect(all(document, 'nav, [role="navigation"]')).toHaveLength(1);
    expect(navOf(document).tagName).toBe('NAV');
    expect(navOf(document).getAttribute('aria-label')?.trim()).toBeTruthy();
  });

  it.each(['/', '/no-such-page', '/_styleguide'])(
    '%s links to Today, Timeline, Add, Tasks and More, with Add in the middle',
    async (path) => {
      const { document } = await getPage(path);
      const links = all(navOf(document), 'a');

      expect(links.map((link) => link.getAttribute('href'))).toEqual(NAV_HREFS);
      expect(links.map(textOf).map((text, index) => text.includes(NAV_LABELS[index]))).toEqual([
        true,
        true,
        true,
        true,
        true,
      ]);
      expect(links).toHaveLength(5);
      expect(links[2].getAttribute('href')).toBe('/add');
    },
  );

  it('names every link by its label alone: the glyph is hidden from assistive technology', async () => {
    const { document } = await getPage('/');

    for (const [index, link] of all(navOf(document), 'a').entries()) {
      const copy = link.cloneNode(true);
      for (const hidden of all(copy, '[aria-hidden="true"]')) hidden.remove();

      expect(textOf(copy)).toBe(NAV_LABELS[index]);
      expect(all(link, '[aria-hidden="true"]')).toHaveLength(1);
    }
  });

  it('sits between the site header and the main content', async () => {
    const { document } = await getPage('/');
    const header = one(document, 'header.site-header');
    const nav = navOf(document);
    const main = one(document, 'main');

    expect(header.compareDocumentPosition(nav) & FOLLOWING).toBe(FOLLOWING);
    expect(nav.compareDocumentPosition(main) & FOLLOWING).toBe(FOLLOWING);
    expect(main.contains(nav)).toBe(false);
    expect(header.contains(nav)).toBe(false);
  });

  it('marks Today as the current page on the home page, and nothing else', async () => {
    const { document } = await getPage('/');
    const current = currentLinks(document);

    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('href')).toBe('/');
    expect(navOf(document).contains(current[0])).toBe(true);
  });

  it.each(navItems.map((item) => [item.id, item.href]))(
    'marks exactly the %s link when the page names it',
    async (id, href) => {
      const html = await renderView('layout', { title: 'x', page: 'home', nav: id });
      const current = currentLinks(parseHtml(html));

      expect(current).toHaveLength(1);
      expect(current[0].getAttribute('href')).toBe(href);
    },
  );

  it('marks no link when the page names none', async () => {
    const html = await renderView('layout', { title: 'x', page: 'home' });

    expect(currentLinks(parseHtml(html))).toEqual([]);
    expect(all(navOf(parseHtml(html)), 'a')).toHaveLength(5);
  });

  it.each(['/no-such-page', '/_styleguide'])('marks no link as current on %s', async (path) => {
    const { document } = await getPage(path);

    expect(currentLinks(document)).toEqual([]);
  });
});

describe('theme toggle (AC4)', () => {
  it('is rendered by the server without a theme on the root element', async () => {
    const { html } = await getPage('/');

    expect(html).toContain('<html lang="en">');
    expect(html).not.toMatch(/<html[^>]*data-theme/);
  });

  it('is one button with a text label, in the site header', async () => {
    const { document } = await getPage('/');
    const toggle = one(document, '[data-theme-toggle]');

    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('type')).toBe('button');
    expect(textOf(toggle)).toBe('Toggle theme');
    expect(one(document, 'header.site-header').contains(toggle)).toBe(true);
  });

  it('has its script inline in the head, before the stylesheet link', async () => {
    const { document } = await getPage('/');
    const script = one(document, 'script');
    const stylesheet = one(document, 'link[rel="stylesheet"]');

    expect(document.head.contains(script)).toBe(true);
    for (const attribute of ['src', 'defer', 'async', 'type']) {
      expect(script.hasAttribute(attribute), attribute).toBe(false);
    }
    expect(script.compareDocumentPosition(stylesheet) & FOLLOWING).toBe(FOLLOWING);
    expect(script.textContent).toContain('data-theme');
  });

  it('keeps out of the script the text that page-level checks search for', async () => {
    const { document } = await getPage('/');
    const source = one(document, 'script').textContent ?? '';

    expect(source).not.toContain('<html');
    expect(source).not.toContain('<main');
    expect(source).not.toContain('<%');
  });

  it('sets no theme when nothing is saved, so the system setting decides', async () => {
    expect(themeOf(await openHome())).toBeNull();
    expect(themeOf(await openHome({ systemDark: true }))).toBeNull();
    expect(themeOf(await openHome({ systemDark: false }))).toBeNull();
  });

  it.each(['dark', 'light'])('applies a saved "%s" theme while the page loads', async (saved) => {
    const window = await openHome({ savedTheme: saved, systemDark: saved !== 'dark' });

    expect(themeOf(window)).toBe(saved);
  });

  it('has applied the saved theme by the time the body is parsed', async () => {
    const { html } = await getPage('/');
    const probe =
      '<script>document.documentElement.setAttribute("data-probe", String(document.documentElement.getAttribute("data-theme")));</script>';
    const window = openPage(html.replace('<body>', `<body>${probe}`), { savedTheme: 'dark' });
    opened.push(window);

    expect(html).toContain('<body>');
    expect(window.document.documentElement.getAttribute('data-probe')).toBe('dark');
  });

  it.each(['purple', '', 'DARK', 'dark '])('ignores a saved value of "%s"', async (saved) => {
    const window = await openHome({ savedTheme: saved });

    expect(themeOf(window)).toBeNull();
  });

  it('switches a light system to dark, saves it, and switches back on the next click', async () => {
    const window = await openHome({ systemDark: false });

    toggleOf(window).click();
    expect(themeOf(window)).toBe('dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');

    toggleOf(window).click();
    expect(themeOf(window)).toBe('light');
    expect(window.localStorage.getItem('theme')).toBe('light');
  });

  it('treats a browser without matchMedia as a light system', async () => {
    const window = await openHome();
    expect(window.matchMedia).toBeUndefined();

    toggleOf(window).click();

    expect(themeOf(window)).toBe('dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
  });

  it('switches a dark system to light on the first click', async () => {
    const window = await openHome({ systemDark: true });
    expect(themeOf(window)).toBeNull();

    toggleOf(window).click();

    expect(themeOf(window)).toBe('light');
    expect(window.localStorage.getItem('theme')).toBe('light');
  });

  it('switches a saved dark theme to light and saves that', async () => {
    const window = await openHome({ savedTheme: 'dark', systemDark: true });

    toggleOf(window).click();

    expect(themeOf(window)).toBe('light');
    expect(window.localStorage.getItem('theme')).toBe('light');
  });

  it('switches a saved light theme to dark on a dark system', async () => {
    const window = await openHome({ savedTheme: 'light', systemDark: true });

    toggleOf(window).click();

    expect(themeOf(window)).toBe('dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
  });

  it('answers a click on an element inside the toggle', async () => {
    const window = await openHome({ systemDark: false });
    const toggle = toggleOf(window);
    toggle.innerHTML = '<span>Toggle theme</span>';

    one(toggle, 'span').click();

    expect(themeOf(window)).toBe('dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
  });

  it('leaves the theme alone on a click anywhere else', async () => {
    const window = await openHome({ systemDark: false });

    one(window.document, 'main h1').click();
    one(window.document, 'header.site-header').click();
    window.document.body.click();

    expect(themeOf(window)).toBeNull();
    expect(window.localStorage.getItem('theme')).toBeNull();
  });

  it('still switches the theme for the page when storage is blocked', async () => {
    const window = await openHome({ storageThrows: true, systemDark: false });
    expect(() => window.localStorage).toThrow('localStorage is blocked');
    expect(themeOf(window)).toBeNull();

    toggleOf(window).click();
    expect(themeOf(window)).toBe('dark');

    toggleOf(window).click();
    expect(themeOf(window)).toBe('light');
  });
});

describe('touch targets in the shell (AC6)', () => {
  it.each(['/', '/_styleguide'])(
    '%s builds its nav links, toggle and buttons from the 44px classes',
    async (path) => {
      const { document } = await getPage(path);
      const navLinks = all(navOf(document), 'a');
      const buttons = all(document, 'button');

      expect(navLinks).toHaveLength(5);
      for (const link of navLinks) expect(link.classList.contains('app-nav__link')).toBe(true);

      expect(one(document, '[data-theme-toggle]').classList.contains('btn')).toBe(true);

      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(button.classList.contains('btn'), button.outerHTML).toBe(true);
      }
    },
  );
});

describe('existing pages in the new layout (AC7)', () => {
  it('renders the home page in the layout, with the navigation', async () => {
    const { status, document } = await getPage('/');

    expect(status).toBe(200);
    expect(all(navOf(document), 'a')).toHaveLength(5);
    expect(textOf(one(document, 'main h1'))).toBe('Today');
    expect(one(document, 'header.site-header a').getAttribute('href')).toBe('/');
    expect(one(document, 'main').classList.contains('page')).toBe(true);
  });

  it('renders the not-found page in the layout, with the navigation', async () => {
    const { status, document } = await getPage('/no-such-page');

    expect(status).toBe(404);
    expect(all(navOf(document), 'a')).toHaveLength(5);
    expect(textOf(one(document, 'main h1'))).toBe('Page not found');
    expect(one(document, '[data-theme-toggle]').tagName).toBe('BUTTON');
  });

  it.each(['/more'])(
    '%s answers with the not-found page until its job builds it',
    async (path) => {
      const { status, document } = await getPage(path);

      expect(status).toBe(404);
      expect(textOf(one(document, 'main h1'))).toBe('Page not found');
    },
  );
});
