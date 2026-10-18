import {
  JSDOM,
  type DomDocument,
  type DomElement,
  type DomFile,
  type DomFileInput,
  type DomInput,
  type DomWindow,
} from 'jsdom';

export type { DomDocument, DomElement, DomFile, DomFileInput, DomInput, DomWindow };

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
 * resources (the stylesheet, any script with `src`) are not loaded; `runLinkedScripts`
 * in `page.ts` runs the linked scripts.
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

/** The object URLs a page made and released, as `stubObjectUrls` recorded them. */
export interface ObjectUrls {
  /** The files `createObjectURL` was called with, in order. */
  created: DomFile[];
  /** The URLs `revokeObjectURL` was called with, in order. */
  revoked: string[];
  /** The URL the call number `index` of `createObjectURL` returned, counting from 0. */
  urlOf(index: number): string;
}

/**
 * Gives the window `URL.createObjectURL` and `URL.revokeObjectURL`, which jsdom does
 * not have, and records what they are called with.
 */
export function stubObjectUrls(window: DomWindow): ObjectUrls {
  const urls: ObjectUrls = {
    created: [],
    revoked: [],
    urlOf: (index) => `blob:http://localhost/${index}`,
  };
  window.URL.createObjectURL = (file) => {
    urls.created.push(file);
    return urls.urlOf(urls.created.length - 1);
  };
  window.URL.revokeObjectURL = (url) => {
    urls.revoked.push(url);
  };
  return urls;
}

/**
 * Puts a file into a file input, or with `null` empties it, without telling the page.
 * jsdom has no file picker and no way to build a `FileList`, so `files` and `value` are
 * replaced on this one element. A script that sets `value` to the empty string, which
 * is how a page empties a file input, removes the replacement and leaves jsdom's own
 * empty input.
 */
export function setChosenFile(input: DomFileInput, file: DomFile | null): void {
  Reflect.deleteProperty(input, 'files');
  Reflect.deleteProperty(input, 'value');
  if (file === null) return;

  const files = { 0: file, length: 1 };
  Object.defineProperty(input, 'files', { configurable: true, get: () => files });
  Object.defineProperty(input, 'value', {
    configurable: true,
    get: () => `C:\\fakepath\\${file.name}`,
    set(value: string) {
      // A browser refuses any other value for a file input.
      if (value !== '') throw new Error('The value of a file input can only be set to the empty string');
      setChosenFile(input, null);
    },
  });
}

/** Chooses a file in a file input as a user would, or with `null` clears the choice: the page is told. */
export function chooseFile(window: DomWindow, input: DomFileInput, file: DomFile | null): void {
  setChosenFile(input, file);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

/** What a page hears from a recognition: the three events `public/js/add-voice.js` listens for. */
export type SpeechEventType = 'result' | 'end' | 'error';

/** One recognition a page made from a stubbed constructor. */
export interface StubRecognition {
  /** What the page set them to; `undefined` until it does. */
  continuous: unknown;
  interimResults: unknown;
  /** How often the page called `start()` and `stop()`. */
  startCalls: number;
  stopCalls: number;
  /** Calls the handler the page put on `on<type>` with this event. Does nothing when the page set none. */
  fire(type: SpeechEventType, event?: object): void;
}

export interface SpeechStub {
  /** Every recognition the page made, in order. */
  instances: StubRecognition[];
  /** When set, the next `start()` throws it, once. */
  startError: Error | null;
}

/** One result of a `result` event, as a test writes it. */
export interface SpokenResult {
  transcript: string;
  isFinal: boolean;
}

/**
 * A `result` event as a recognition fires it: every result is a list of two
 * alternatives, the spoken one first, with `isFinal` on the list, and `resultIndex` is
 * the index of the last result. A page that reads the second alternative, skips a result
 * that is not final, or starts at `resultIndex` gets another text than the one spoken.
 */
export function resultEvent(results: SpokenResult[]): object {
  return {
    resultIndex: Math.max(results.length - 1, 0),
    results: results.map(({ transcript, isFinal }) =>
      Object.assign(
        [
          { transcript, confidence: 0.9 },
          { transcript: 'a second alternative', confidence: 0.1 },
        ],
        { isFinal },
      ),
    ),
  };
}

/**
 * Gives the window a speech recognition constructor, which jsdom does not have, under
 * one of the two names a browser uses, and records the recognitions the page makes from
 * it. Nothing is ever heard: a test fires the events itself, `end` after a `stop()`
 * included.
 */
export function stubSpeechRecognition(
  window: DomWindow,
  name: 'SpeechRecognition' | 'webkitSpeechRecognition' = 'SpeechRecognition',
): SpeechStub {
  const stub: SpeechStub = { instances: [], startError: null };

  class Recognition implements StubRecognition {
    continuous: unknown = undefined;
    interimResults: unknown = undefined;
    onresult: ((event: object) => void) | null = null;
    onend: ((event: object) => void) | null = null;
    onerror: ((event: object) => void) | null = null;
    startCalls = 0;
    stopCalls = 0;

    constructor() {
      stub.instances.push(this);
    }

    start(): void {
      this.startCalls += 1;
      const error = stub.startError;
      stub.startError = null;
      if (error !== null) throw error;
    }

    stop(): void {
      this.stopCalls += 1;
    }

    fire(type: SpeechEventType, event: object = {}): void {
      this[`on${type}`]?.(event);
    }
  }

  window[name] = Recognition;
  return stub;
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

/** Whether an element is shown: neither it nor anything around it has the `hidden` attribute. */
export function isShown(element: DomElement): boolean {
  return element.closest('[hidden]') === null;
}

/**
 * What a browser would post for a form as it was served, read from the attributes of a
 * page parsed with its scripts off: every named input with its `value` attribute, except
 * a radio or a checkbox that is not checked, and every named select with the value of
 * its selected option, or of its first. Buttons are left out.
 */
export function formFields(form: DomElement): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const input of all(form, 'input[name]')) {
    const type = input.getAttribute('type');
    if ((type === 'radio' || type === 'checkbox') && !input.hasAttribute('checked')) continue;
    fields[input.getAttribute('name') ?? ''] = input.getAttribute('value') ?? '';
  }
  for (const select of all(form, 'select[name]')) {
    const option = select.querySelector('option[selected]') ?? select.querySelector('option');
    fields[select.getAttribute('name') ?? ''] = option?.getAttribute('value') ?? '';
  }
  return fields;
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

/** A clock given to a page by `stubClock`. */
export interface StubClock {
  /** Moves the clock on by `ms`, running each interval of the page every time it falls due, in time order. */
  advance(ms: number): void;
}

/**
 * Gives a page a clock that stands still until the test moves it: `Date.now()` answers
 * it and `setInterval` records its callbacks. Call it before the page's scripts run.
 * `new Date()` in the page still reads the real clock.
 */
export function stubClock(window: DomWindow, at: number): StubClock {
  let now = at;
  const intervals: { run: () => void; every: number; next: number }[] = [];
  window.Date.now = () => now;
  window.setInterval = (run, every) => {
    const step = Math.max(1, every);
    intervals.push({ run, every: step, next: now + step });
    return intervals.length;
  };
  return {
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = intervals.filter((interval) => interval.next <= end).sort((a, b) => a.next - b.next)[0];
        if (due === undefined) break;
        now = due.next;
        due.next += due.every;
        due.run();
      }
      now = end;
    },
  };
}
