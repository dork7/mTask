import { JSDOM, type DomDocument, type DomElement, type DomWindow } from 'jsdom';

export type { DomDocument, DomElement, DomWindow };

/** The address the pages are opened at. localStorage needs a real origin. */
const PAGE_URL = 'http://localhost/';

export interface OpenPageOptions {
  /** The value stored under the key `theme` before the page is parsed. */
  savedTheme?: string;
  /**
   * What `prefers-color-scheme: dark` answers. When left out, the window has no
   * `matchMedia` at all, which is how jsdom comes.
   */
  systemDark?: boolean;
  /** Every access to `localStorage` throws, as in a browser with storage blocked. */
  storageThrows?: boolean;
}

const scriptErrorsByWindow = new WeakMap<DomWindow, string[]>();

/** Parses HTML without running its scripts. */
export function parseHtml(html: string): DomDocument {
  return new JSDOM(html).window.document;
}

/**
 * Parses HTML and runs its inline scripts, as a browser would on load. External
 * resources (the stylesheet, any script with `src`) are not loaded.
 */
export function openPage(html: string, options: OpenPageOptions = {}): DomWindow {
  const { savedTheme, systemDark, storageThrows } = options;

  const dom = new JSDOM(html, {
    url: PAGE_URL,
    runScripts: 'dangerously',
    beforeParse(window) {
      const errors: string[] = [];
      scriptErrorsByWindow.set(window, errors);
      window.addEventListener('error', (event) => errors.push(event.message));

      if (savedTheme !== undefined) window.localStorage.setItem('theme', savedTheme);

      if (systemDark !== undefined) {
        window.matchMedia = (query) => ({
          matches: systemDark && query.includes('prefers-color-scheme: dark'),
          media: query,
        });
      }

      if (storageThrows) {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get(): never {
            throw new Error('localStorage is blocked');
          },
        });
      }
    },
  });

  return dom.window;
}

/**
 * The messages of the exceptions that no script of a page opened with `openPage` caught,
 * on load or in an event listener, so far.
 */
export function scriptErrors(window: DomWindow): string[] {
  return scriptErrorsByWindow.get(window) ?? [];
}

/** Every element under `root` that matches `selector`, as an array. */
export function all(root: DomDocument | DomElement, selector: string): DomElement[] {
  return [...root.querySelectorAll(selector)];
}

/** The one element under `root` that matches `selector`. Throws when there is none or several. */
export function one(root: DomDocument | DomElement, selector: string): DomElement {
  const found = all(root, selector);
  if (found.length !== 1) {
    throw new Error(`Expected one element for "${selector}", found ${found.length}`);
  }
  return found[0];
}

/** The text of an element with its `aria-hidden="true"` parts removed, trimmed. */
export function visibleText(element: DomElement): string {
  const copy = element.cloneNode(true);
  for (const hidden of all(copy, '[aria-hidden="true"]')) hidden.remove();
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The text of an element, with runs of whitespace collapsed, trimmed. */
export function textOf(element: DomElement): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}
