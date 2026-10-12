/*
 * jsdom ships no types, and `@types/jsdom` pulls the whole DOM library into the type
 * program of `src/`, which is checked as Node code. This declares only what the tests
 * call. Add a member here when a test needs one.
 */
declare module 'jsdom' {
  export interface DomNodeList extends Iterable<DomElement> {
    readonly length: number;
    readonly [index: number]: DomElement;
  }

  export interface DomClassList {
    contains(name: string): boolean;
  }

  export interface DomElement {
    readonly tagName: string;
    readonly id: string;
    readonly classList: DomClassList;
    readonly children: DomNodeList;
    readonly parentElement: DomElement | null;
    readonly firstElementChild: DomElement | null;
    readonly outerHTML: string;
    textContent: string | null;
    innerHTML: string;
    getAttribute(name: string): string | null;
    hasAttribute(name: string): boolean;
    querySelector(selector: string): DomElement | null;
    querySelectorAll(selector: string): DomNodeList;
    closest(selector: string): DomElement | null;
    matches(selector: string): boolean;
    contains(other: DomElement | null): boolean;
    /** A bit mask; 4 (`DOCUMENT_POSITION_FOLLOWING`) is set when `other` comes later. */
    compareDocumentPosition(other: DomElement): number;
    cloneNode(deep?: boolean): DomElement;
    remove(): void;
    click(): void;
    dispatchEvent(event: DomEvent): boolean;
  }

  export interface DomFile {
    readonly name: string;
    readonly type: string;
  }

  export interface DomFileList {
    readonly length: number;
    readonly [index: number]: DomFile;
  }

  /** An `<input type="file">`. */
  export interface DomFileInput extends DomElement {
    value: string;
    readonly files: DomFileList;
  }

  export interface DomEvent {
    readonly type: string;
  }

  export interface DomDocument {
    readonly documentElement: DomElement;
    readonly head: DomElement;
    readonly body: DomElement;
    readonly activeElement: DomElement | null;
    getElementById(id: string): DomElement | null;
    querySelector(selector: string): DomElement | null;
    querySelectorAll(selector: string): DomNodeList;
  }

  export interface DomStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  }

  export interface DomMediaQueryList {
    readonly matches: boolean;
    readonly media: string;
  }

  export interface DomErrorEvent {
    readonly message: string;
  }

  export interface DomWindow {
    readonly document: DomDocument;
    readonly localStorage: DomStorage;
    matchMedia?: (query: string) => DomMediaQueryList;
    /** jsdom reports an exception no script caught as an `error` event on the window. */
    addEventListener(type: 'error', listener: (event: DomErrorEvent) => void): void;
    readonly File: new (parts: string[], name: string, options?: { type?: string }) => DomFile;
    readonly Event: new (type: string, init?: { bubbles?: boolean }) => DomEvent;
    /** jsdom has neither of the two object URL functions; a test puts them here. */
    readonly URL: {
      createObjectURL?: (file: DomFile) => string;
      revokeObjectURL?: (url: string) => void;
    };
    /** Runs a script in the page, as a `<script>` element would. */
    eval(source: string): unknown;
    close(): void;
  }

  export interface JSDOMOptions {
    url?: string;
    runScripts?: 'dangerously' | 'outside-only';
    beforeParse?: (window: DomWindow) => void;
  }

  export class JSDOM {
    constructor(html?: string, options?: JSDOMOptions);
    readonly window: DomWindow;
  }
}
