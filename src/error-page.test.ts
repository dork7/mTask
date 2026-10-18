import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createTask, getTask } from './db/tasks.ts';
import { errorStatus } from './routes/errors.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, one, parseHtml, textOf, type DomDocument } from './testing/dom.ts';

/*
 * The error page (AC1, AC2): what a handler that throws or passes an error to `next` is
 * answered with, and that the not-found page stays as it is.
 */

/** The first eight bytes of every PNG file. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let testApp: TestApp;
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  testApp = createTestApp();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  testApp.close();
  vi.restoreAllMocks();
});

/** Asserts the answer is the error page with this status, and returns it parsed. */
function expectErrorPage(response: request.Response, status: number): DomDocument {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toMatch(/^text\/html/);
  const document = parseHtml(response.text);
  expect(textOf(one(document, 'title'))).toBe('Something went wrong - Task Image AI');
  const headings = all(document, 'main h1');
  expect(headings).toHaveLength(1);
  expect(textOf(headings[0])).toBe('Something went wrong');
  expect(all(document, 'main a[href="/"]')).toHaveLength(1);
  return document;
}

describe('the server error page (AC1)', () => {
  it('answers a handler whose database is closed with 500 and the page, and logs the error', async () => {
    testApp.db.close();

    const response = await request(testApp.app).get('/tasks');

    const document = expectErrorPage(response, 500);
    expect(document.querySelector('#mini-bar')).toBeNull();
    expect(document.querySelector('#alarm')).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = consoleError.mock.calls[0].at(-1);
    expect(logged).toBeInstanceOf(Error);
    expect(response.text).not.toContain((logged as Error).message);
    expect(response.text).not.toMatch(/\n\s+at /);
  });

  it('leaves the mini-bar and the alarm out even when a task would show them', async () => {
    createTask(testApp.db, {
      title: 'Running',
      status: 'in_progress',
      started_at: new Date(Date.now() - 60_000).toISOString(),
      reminder_at: new Date(Date.now() - 60_000).toISOString(),
    });
    testApp.db.close();

    const response = await request(testApp.app).get('/tasks');

    const document = expectErrorPage(response, 500);
    expect(document.querySelector('#mini-bar')).toBeNull();
    expect(document.querySelector('#alarm')).toBeNull();
  });

  it('answers an upload that reaches next(failure) with the page', async () => {
    testApp.db.close();

    const response = await request(testApp.app)
      .post('/add/photo')
      .attach('photo', PNG_SIGNATURE, { filename: 'list.png', contentType: 'image/png' });

    expectErrorPage(response, 500);
  });

  it('answers a thrown SQLite error with the page', async () => {
    createTask(testApp.db, { title: 'A task', status: 'pending' });
    testApp.db.exec(
      "CREATE TRIGGER refuse_update BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT, 'refused by the test'); END",
    );

    const response = await request(testApp.app).post('/tasks/1/done');

    expectErrorPage(response, 500);
    expect(response.text).not.toContain('refused by the test');
  });
});

describe('errorStatus (AC1, AC2)', () => {
  it.each([
    [{ status: 404 }, 404],
    [{ statusCode: 418 }, 418],
    [{ status: 415, statusCode: 400 }, 415],
    [{ status: 399 }, 500],
    [{ status: 503 }, 500],
    [{ status: '400' }, 500],
    [{ status: 400.5 }, 500],
    [null, 500],
    ['x', 500],
    [new Error(), 500],
  ])('gives %o the status %i', (error, status) => {
    expect(errorStatus(error)).toBe(status);
  });
});

describe('the client error page (AC2)', () => {
  it('answers a body the parser refuses with its status and the page, and does not log it', async () => {
    createTask(testApp.db, { title: 'Kept title', status: 'pending' });

    const response = await request(testApp.app)
      .post('/tasks/1/edit')
      .set('Content-Type', 'application/x-www-form-urlencoded; charset=koi8-r')
      .send('title=a');

    expectErrorPage(response, 415);
    expect(getTask(testApp.db, 1)?.title).toBe('Kept title');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the not-found page and its 404', async () => {
    const response = await request(testApp.app).get('/no-such-page');

    expect(response.status).toBe(404);
    const document = parseHtml(response.text);
    expect(textOf(one(document, 'title'))).toBe('Page not found - Task Image AI');
    expect(textOf(one(document, 'main h1'))).toBe('Page not found');
  });
});
