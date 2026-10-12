import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './testing/app.ts';
import {
  all,
  chooseFile,
  one,
  openPage,
  parseHtml,
  scriptErrors,
  setChosenFile,
  stubObjectUrls,
  textOf,
  type DomDocument,
  type DomElement,
  type DomFile,
  type DomFileInput,
  type DomWindow,
  type ObjectUrls,
} from './testing/dom.ts';
import { getStylesheet, runLinkedScripts } from './testing/page.ts';

/** The classes this page brought to the stylesheet. */
const NEW_CLASSES = [
  'tabs',
  'tab-panel',
  'notice',
  'notice--error',
  'photo',
  'photo-form',
  'photo-form__label',
  'photo-form__input',
  'photo-form__actions',
];

/** The Add page opened as a browser would, with the handles the preview tests use. */
interface OpenAdd {
  window: DomWindow;
  urls: ObjectUrls;
  input: DomFileInput;
  preview: DomElement;
  retake: DomElement;
  /** Runs the page's linked script, as the browser does once the page is parsed. */
  start(): Promise<string[]>;
  /** A file to choose, made in the page. */
  file(name: string): DomFile;
}

let testApp: TestApp;
const opened: DomWindow[] = [];

beforeEach(() => {
  testApp = createTestApp();
});

// A script that throws, on load or in a listener, fails the test that opened the page.
afterEach(() => {
  testApp.close();
  for (const window of opened.splice(0)) {
    const errors = scriptErrors(window);
    window.close();
    expect(errors).toEqual([]);
  }
});

/** The Add page before anything is posted, with its scripts off. */
async function getAdd(): Promise<DomDocument> {
  const response = await request(testApp.app).get('/add');
  return parseHtml(response.text);
}

/** The Add page as it answers a stored photo. */
async function getAddAfterPhoto(): Promise<DomDocument> {
  const response = await request(testApp.app)
    .post('/add/photo')
    .attach('photo', Buffer.from('abc'), { filename: 'list.png', contentType: 'image/png' });
  expect(response.status).toBe(201);
  return parseHtml(response.text);
}

/** The Add page as it answers a post with no file. */
async function getAddAfterRejection(): Promise<DomDocument> {
  const response = await request(testApp.app).post('/add/photo');
  expect(response.status).toBe(400);
  return parseHtml(response.text);
}

/** The three states the page is served in. */
function addPages(): Promise<DomDocument[]> {
  return Promise.all([getAdd(), getAddAfterPhoto(), getAddAfterRejection()]);
}

async function openAdd(): Promise<OpenAdd> {
  const response = await request(testApp.app).get('/add');
  const window = openPage(response.text);
  opened.push(window);

  return {
    window,
    urls: stubObjectUrls(window),
    input: one(window.document, '[data-photo-input]') as DomFileInput,
    preview: one(window.document, '[data-photo-preview]'),
    retake: one(window.document, '[data-photo-retake]'),
    start: () => runLinkedScripts(testApp.app, window),
    file: (name) => new window.File(['abc'], name, { type: 'image/png' }),
  };
}

function isHidden(element: DomElement): boolean {
  return element.hasAttribute('hidden');
}

describe('GET /add (AC1)', () => {
  it('returns 200 with the Add page in the layout', async () => {
    const response = await request(testApp.app).get('/add');
    const document = parseHtml(response.text);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.text.match(/<html\b/g)).toHaveLength(1);
    expect(textOf(one(document, 'title'))).toBe('Add task - Task Image AI');
    expect(textOf(one(document, 'header.site-header a'))).toBe('Task Image AI');
    expect(one(document, 'main').classList.contains('page')).toBe(true);
  });

  it('has the one heading Add task', async () => {
    const document = await getAdd();

    expect(all(document, 'main h1')).toHaveLength(1);
    expect(textOf(one(document, 'main h1'))).toBe('Add task');
  });

  it('marks the Add link, and only it, as the current page', async () => {
    const document = await getAdd();

    expect(all(one(document, 'nav, [role="navigation"]'), 'a')).toHaveLength(5);
    expect(all(document, '[aria-current]')).toHaveLength(1);
    expect(one(document, '[aria-current="page"]').getAttribute('href')).toBe('/add');
  });

  it('has a named tab list with exactly one tab, Photo, which is selected', async () => {
    const document = await getAdd();
    const tablist = one(document, 'main [role="tablist"]');
    const tab = one(document, '[role="tab"]');

    expect(all(document, '[role="tablist"]')).toHaveLength(1);
    expect(tablist.getAttribute('aria-label')?.trim()).toBeTruthy();
    expect(tablist.contains(tab)).toBe(true);
    expect(textOf(tab)).toBe('Photo');
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('ties the tab to its panel, which holds the form', async () => {
    const document = await getAdd();
    const tab = one(document, '[role="tab"]');
    const panel = one(document, '[role="tabpanel"]');

    expect(tab.id).not.toBe('');
    expect(panel.id).not.toBe('');
    expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    expect(panel.contains(one(document, 'main form'))).toBe(true);
  });

  it('shows no message and no photo before anything is posted', async () => {
    const document = await getAdd();

    expect(all(document, '[role="alert"]')).toEqual([]);
    expect(all(document, '[role="status"]')).toEqual([]);
    expect(all(document, 'main img[src]')).toEqual([]);
  });
});

describe('the photo form (AC2)', () => {
  it('posts to /add/photo as multipart form data, with no script in the way', async () => {
    const document = await getAdd();
    const form = one(document, 'main form');

    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/add/photo');
    expect(form.getAttribute('enctype')).toBe('multipart/form-data');
    expect(form.hasAttribute('onsubmit')).toBe(false);
  });

  it('has one input, the file input as the plan writes it', async () => {
    const document = await getAdd();
    const input = one(one(document, 'main form'), 'input');

    expect(input.getAttribute('type')).toBe('file');
    expect(input.getAttribute('name')).toBe('photo');
    expect(input.getAttribute('accept')).toBe('image/*');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.hasAttribute('multiple')).toBe(false);
    expect(input.hasAttribute('disabled')).toBe(false);
  });

  it('labels the input', async () => {
    const document = await getAdd();
    const form = one(document, 'main form');
    const input = one(form, 'input');
    const label = one(form, 'label');

    expect(input.id).not.toBe('');
    expect(label.getAttribute('for')).toBe(input.id);
    expect(textOf(label)).not.toBe('');
  });

  it('has one submit button, Upload photo', async () => {
    const document = await getAdd();
    const form = one(document, 'main form');
    const submit = one(form, 'button[type="submit"]');

    expect(textOf(submit)).toBe('Upload photo');
    expect(submit.hasAttribute('disabled')).toBe(false);
    expect(all(form, 'input[type="submit"]')).toEqual([]);
  });

  it('gives every button of the page the btn class, whatever the page answers', async () => {
    for (const document of await addPages()) {
      const buttons = all(document, 'button');

      expect(buttons.length).toBeGreaterThanOrEqual(4);
      for (const button of buttons) {
        expect(button.classList.contains('btn'), button.outerHTML).toBe(true);
      }
    }
  });

  it.each(NEW_CLASSES)('uses the class %s in the page and styles it in the stylesheet', async (name) => {
    const pages = await addPages();
    const { rules } = await getStylesheet();
    const inSelector = new RegExp(`\\.${name}(?![\\w-])`);

    expect(pages.some((document) => all(document, `.${name}`).length > 0)).toBe(true);
    expect(rules.some((rule) => inSelector.test(rule.selector))).toBe(true);
  });
});

describe('the photo preview (AC3)', () => {
  it('is hidden in the served page, with the Retake button, before any script runs', async () => {
    const document = await getAdd();
    const form = one(document, 'main form');
    const preview = one(document, 'img[data-photo-preview]');
    const retake = one(document, 'button[data-photo-retake]');

    expect(form.contains(preview)).toBe(true);
    expect(isHidden(preview)).toBe(true);
    expect(preview.hasAttribute('src')).toBe(false);
    expect(preview.getAttribute('alt')?.trim()).toBeTruthy();

    expect(form.contains(retake)).toBe(true);
    expect(textOf(retake)).toBe('Retake');
    expect(retake.getAttribute('type')).toBe('button');
    expect(isHidden(retake)).toBe(true);
  });

  it('links to one script, deferred, which the app serves as JavaScript', async () => {
    const document = await getAdd();
    const script = one(document, 'script[src]');

    expect(script.getAttribute('src')).toBe('/js/add-photo.js');
    expect(script.hasAttribute('defer')).toBe(true);

    const response = await request(testApp.app).get('/js/add-photo.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
  });

  it('stays hidden when the script loads with no file chosen', async () => {
    const { start, preview, retake, urls } = await openAdd();

    await expect(start()).resolves.toEqual(['/js/add-photo.js']);

    expect(isHidden(preview)).toBe(true);
    expect(isHidden(retake)).toBe(true);
    expect(urls.created).toEqual([]);
  });

  it('shows the chosen file and the Retake button when a file is chosen', async () => {
    const { window, start, input, preview, retake, urls, file } = await openAdd();
    const chosen = file('list.png');
    await start();

    chooseFile(window, input, chosen);

    expect(isHidden(preview)).toBe(false);
    expect(isHidden(retake)).toBe(false);
    expect(preview.getAttribute('src')).toBe(urls.urlOf(0));
    expect(urls.created).toHaveLength(1);
    expect(urls.created[0]).toBe(chosen);
  });

  it('empties the input and hides both again on Retake', async () => {
    const { window, start, input, preview, retake, urls, file } = await openAdd();
    await start();
    chooseFile(window, input, file('list.png'));

    retake.click();

    expect(input.files.length).toBe(0);
    expect(input.value).toBe('');
    expect(isHidden(preview)).toBe(true);
    expect(isHidden(retake)).toBe(true);
    expect(preview.hasAttribute('src')).toBe(false);
    expect(urls.revoked).toEqual([urls.urlOf(0)]);
    expect(window.document.activeElement).toBe(input);
  });

  it('shows the second file when another one is chosen without Retake', async () => {
    const { window, start, input, preview, retake, urls, file } = await openAdd();
    const first = file('first.png');
    const second = file('second.png');
    await start();

    chooseFile(window, input, first);
    chooseFile(window, input, second);

    expect(isHidden(preview)).toBe(false);
    expect(isHidden(retake)).toBe(false);
    expect(preview.getAttribute('src')).toBe(urls.urlOf(1));
    expect(urls.created).toHaveLength(2);
    expect(urls.created[0]).toBe(first);
    expect(urls.created[1]).toBe(second);
    expect(urls.revoked).toEqual([urls.urlOf(0)]);
  });

  it('shows a file that is chosen after Retake', async () => {
    const { window, start, input, preview, retake, urls, file } = await openAdd();
    await start();
    chooseFile(window, input, file('first.png'));
    retake.click();

    chooseFile(window, input, file('second.png'));

    expect(isHidden(preview)).toBe(false);
    expect(isHidden(retake)).toBe(false);
    expect(preview.getAttribute('src')).toBe(urls.urlOf(1));
  });

  it('hides both again when the choice is cleared in the file picker', async () => {
    const { window, start, input, preview, retake, urls, file } = await openAdd();
    await start();
    chooseFile(window, input, file('list.png'));

    chooseFile(window, input, null);

    expect(isHidden(preview)).toBe(true);
    expect(isHidden(retake)).toBe(true);
    expect(preview.hasAttribute('src')).toBe(false);
    expect(urls.created).toHaveLength(1);
  });

  it('shows a file the browser brought back before the script loaded', async () => {
    const { start, input, preview, retake, urls, file } = await openAdd();
    setChosenFile(input, file('list.png'));

    await start();

    expect(isHidden(preview)).toBe(false);
    expect(isHidden(retake)).toBe(false);
    expect(preview.getAttribute('src')).toBe(urls.urlOf(0));
  });
});
