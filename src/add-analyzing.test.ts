import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicDir } from './paths.ts';
import type { Analysis, Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import {
  all,
  chooseFile,
  isShown,
  one,
  openPage,
  parseHtml,
  scriptErrors,
  stubObjectUrls,
  textOf,
  type DomDocument,
  type DomElement,
  type DomFileInput,
  type DomWindow,
} from './testing/dom.ts';
import { runLinkedScripts } from './testing/page.ts';

/*
 * The "Analyzing..." state of the Add page: the element as it is served, what the page's
 * script does with it, and that the request is answered only when the analysis is done.
 */

const found: Analysis = {
  tasks: [
    {
      title: 'Buy milk, eggs, bread',
      description: '',
      category: 'shopping',
      estimated_minutes: 40,
      urgency: 'medium',
      confidence: 0.5,
    },
  ],
  fallback: false,
};

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

function upload(): request.Test {
  return request(testApp.app)
    .post('/add/photo')
    .attach('photo', Buffer.from('abc'), { filename: 'list.png', contentType: 'image/png' });
}

/** The Add page before anything is posted. */
async function addHtml(): Promise<string> {
  const response = await request(testApp.app).get('/add');
  expect(response.status).toBe(200);
  return response.text;
}

/** The Add page as it answers a photo in which no task was found. */
async function noTasksHtml(): Promise<string> {
  analyze.mockResolvedValueOnce({ tasks: [], fallback: false });
  const response = await upload();
  expect(response.status).toBe(200);
  return response.text;
}

/** The Add page as it answers a photo that could not be analyzed, with its Try again form. */
async function failureHtml(): Promise<string> {
  analyze.mockResolvedValueOnce({ tasks: [], fallback: true });
  const response = await upload();
  expect(response.status).toBe(502);
  return response.text;
}

/** Opens a served Add page as a browser would and runs its two scripts. */
async function openWithScripts(html: string): Promise<DomWindow> {
  const window = openPage(html);
  opened.push(window);
  stubObjectUrls(window);
  await expect(runLinkedScripts(testApp.app, window)).resolves.toEqual(['/js/add-photo.js', '/js/add-analyzing.js']);
  return window;
}

/** Submits a form as a browser does, up to the navigation. `true` when no listener stopped it. */
function submit(window: DomWindow, form: DomElement): boolean {
  return form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

function analyzingOf(document: DomDocument): DomElement {
  return one(document, '[data-analyzing]');
}

function uploadFormOf(document: DomDocument): DomElement {
  return one(document, 'main form[action="/add/photo"]');
}

function uploadButtonOf(document: DomDocument): DomElement {
  return one(uploadFormOf(document), 'button[type="submit"]');
}

function isDisabled(element: DomElement): boolean {
  return element.hasAttribute('disabled');
}

/** Asserts what AC6 says of the element as it is served. */
function expectHiddenAnalyzing(document: DomDocument): void {
  const analyzing = analyzingOf(document);

  expect(analyzing.getAttribute('role')).toBe('status');
  expect(analyzing.hasAttribute('hidden')).toBe(true);
  expect(textOf(analyzing)).toContain('Analyzing...');

  const skeleton = one(analyzing, '.skeleton');
  expect(all(skeleton, '.skeleton__line').length).toBeGreaterThan(0);
  expect(one(document, '[role="tabpanel"]').contains(analyzing)).toBe(true);
}

describe('the Analyzing element as it is served (AC6)', () => {
  it('is a hidden status with the text and the skeleton, inside the tab panel', async () => {
    expectHiddenAnalyzing(parseHtml(await addHtml()));
  });

  it('is there, hidden, on the page that answers a photo with no task', async () => {
    expectHiddenAnalyzing(parseHtml(await noTasksHtml()));
  });

  it('is there, hidden, on the page that answers a failed analysis', async () => {
    expectHiddenAnalyzing(parseHtml(await failureHtml()));
  });

  it('comes with its script, deferred, which the app serves as JavaScript', async () => {
    const document = parseHtml(await addHtml());
    const script = one(document, 'script[src="/js/add-analyzing.js"]');

    expect(script.hasAttribute('defer')).toBe(true);

    const response = await request(testApp.app).get('/js/add-analyzing.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
  });
});

describe('the Analyzing state in the page (AC6)', () => {
  it('changes nothing when the scripts load', async () => {
    const { document } = await openWithScripts(await addHtml());

    expect(isShown(analyzingOf(document))).toBe(false);
    expect(isDisabled(uploadButtonOf(document))).toBe(false);
  });

  it('shows the status and disables Upload photo when the upload form is submitted, without stopping it', async () => {
    const window = await openWithScripts(await addHtml());
    const { document } = window;

    const wentOn = submit(window, uploadFormOf(document));

    expect(wentOn).toBe(true);
    expect(isShown(analyzingOf(document))).toBe(true);
    expect(isDisabled(uploadButtonOf(document))).toBe(true);
  });

  it('leaves the file input and Retake enabled, so the photo is still posted', async () => {
    const window = await openWithScripts(await addHtml());
    const { document } = window;

    submit(window, uploadFormOf(document));

    expect(isDisabled(one(document, '[data-photo-input]'))).toBe(false);
    expect(isDisabled(one(document, '[data-photo-retake]'))).toBe(false);
  });

  it('shows the status and disables both submit buttons when Try again is submitted, without stopping it', async () => {
    const window = await openWithScripts(await failureHtml());
    const { document } = window;
    const retryForm = one(document, 'main form[action="/review/1/analyze"]');
    const tryAgain = one(retryForm, 'button[type="submit"]');

    expect(textOf(tryAgain)).toBe('Try again');
    expect(isShown(analyzingOf(document))).toBe(false);
    expect(isDisabled(tryAgain)).toBe(false);

    const wentOn = submit(window, retryForm);

    expect(wentOn).toBe(true);
    expect(isShown(analyzingOf(document))).toBe(true);
    expect(isDisabled(tryAgain)).toBe(true);
    expect(isDisabled(uploadButtonOf(document))).toBe(true);
  });

  it('shows the status for the upload form too when the page also has the Try again form', async () => {
    const window = await openWithScripts(await failureHtml());
    const { document } = window;
    const tryAgain = one(document, 'main form[action="/review/1/analyze"] button[type="submit"]');

    const wentOn = submit(window, uploadFormOf(document));

    expect(wentOn).toBe(true);
    expect(isShown(analyzingOf(document))).toBe(true);
    expect(isDisabled(uploadButtonOf(document))).toBe(true);
    expect(isDisabled(tryAgain)).toBe(true);
  });

  it('is reset when the browser shows the page again', async () => {
    const window = await openWithScripts(await failureHtml());
    const { document } = window;
    const retryForm = one(document, 'main form[action="/review/1/analyze"]');
    submit(window, retryForm);
    expect(isShown(analyzingOf(document))).toBe(true);

    window.dispatchEvent(new window.Event('pageshow'));

    expect(isShown(analyzingOf(document))).toBe(false);
    expect(isDisabled(one(retryForm, 'button[type="submit"]'))).toBe(false);
    expect(isDisabled(uploadButtonOf(document))).toBe(false);
  });

  it('is not shown by a click or by choosing a photo', async () => {
    const window = await openWithScripts(await addHtml());
    const { document } = window;
    const input = one(document, '[data-photo-input]') as DomFileInput;

    one(document, 'main h1').click();
    uploadFormOf(document).click();
    chooseFile(window, input, new window.File(['abc'], 'list.png', { type: 'image/png' }));

    expect(isShown(analyzingOf(document))).toBe(false);
    expect(isDisabled(uploadButtonOf(document))).toBe(false);
  });
});

describe('the request behind the Analyzing state (AC6)', () => {
  it('is answered only when the analyzer is done', async () => {
    let finish: (analysis: Analysis) => void = () => {};
    analyze.mockImplementationOnce(
      () =>
        new Promise<Analysis>((resolve) => {
          finish = resolve;
        }),
    );

    let answered = false;
    const pending = upload().then((response) => {
      answered = true;
      return response;
    });

    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(answered).toBe(false);

    finish(found);
    const response = await pending;

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');
  });

  it('is not polled for and not sent by the script: the script has no timer and makes no request', () => {
    const script = readFileSync(path.join(publicDir, 'js', 'add-analyzing.js'), 'utf8');

    for (const call of ['setInterval', 'setTimeout', 'fetch(', 'XMLHttpRequest']) {
      expect(script, call).not.toContain(call);
    }
    expect(script).not.toContain('preventDefault');
  });
});
