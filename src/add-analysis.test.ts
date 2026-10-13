import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask, listTasks, type Task } from './db/tasks.ts';
import {
  AnalyzerKeyError,
  createAnalyze,
  type AnalyzedTask,
  type Analysis,
  type Analyze,
  type AnalyzerInput,
} from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, isShown, one, parseHtml, textOf, type DomDocument } from './testing/dom.ts';

/*
 * What an upload becomes once the analyzer has looked at it, and the retry of a failed
 * analysis. The analyzer is a stub in every test; the one describe that builds the real
 * analyzer, without a key, holds `fetch` to no call at all.
 */

const NO_TASKS = 'No tasks were found in that photo.';
const NOT_ANALYZED = 'The photo could not be analyzed.';

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

/** The bytes every upload of this file posts. */
const PHOTO_BYTES = Buffer.from([0x89, 0x50, 0x4e]);

/** The columns of a task that an analysis never sets. */
const UNSET_COLUMNS = [
  'image_path',
  'time_slot',
  'actual_minutes',
  'scheduled_start',
  'scheduled_end',
  'started_at',
  'completed_at',
  'reminder_at',
  'recurrence_rule',
  'parent_task_id',
] as const;

interface SourceRow {
  id: unknown;
  kind: unknown;
  image_path: unknown;
}

/** An analysis that found these tasks. */
function found(...tasks: AnalyzedTask[]): Analysis {
  return { tasks, fallback: false };
}

/** The analysis of two failed attempts: the analyzer's fallback, with a task in it. */
function failed(): Analysis {
  return { tasks: [milk], fallback: true };
}

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

/** Posts three bytes as a PNG to the upload route, the way the form does. */
function upload(): request.Test {
  return request(testApp.app)
    .post('/add/photo')
    .attach('photo', PHOTO_BYTES, { filename: 'list.png', contentType: 'image/png' });
}

function retry(sourceId: number | string = 1): request.Test {
  return request(testApp.app).post(`/review/${sourceId}/analyze`);
}

/** The names in the uploads folder, or none when the folder does not exist. */
function storedFiles(): string[] {
  return existsSync(testApp.uploadsDir) ? readdirSync(testApp.uploadsDir) : [];
}

/** The one file in the uploads folder. Throws when there is none or several. */
function storedFile(): string {
  const names = storedFiles();
  if (names.length !== 1) throw new Error(`Expected one stored file, found ${names.length}`);
  return names[0];
}

function sources(): SourceRow[] {
  return testApp.db
    .prepare('SELECT id, kind, image_path FROM sources ORDER BY id')
    .all()
    .map((row) => ({ id: row.id, kind: row.kind, image_path: row.image_path }));
}

function tasks(): Task[] {
  return listTasks(testApp.db);
}

/** Asserts that the one source and its one file are there, with the bytes of the upload. */
function expectOneStoredPhoto(): void {
  const name = storedFile();
  expect(readFileSync(path.join(testApp.uploadsDir, name)).equals(PHOTO_BYTES)).toBe(true);
  expect(sources()).toEqual([{ id: 1, kind: 'photo', image_path: `/uploads/${name}` }]);
}

/** Asserts the marks of the Add page in the layout. */
function expectAddPage(document: DomDocument): void {
  expect(all(one(document, 'nav'), 'a')).toHaveLength(5);
  expect(all(document, '[aria-current]')).toHaveLength(1);
  expect(one(document, '[aria-current="page"]').getAttribute('href')).toBe('/add');
  expect(textOf(one(document, 'main h1'))).toBe('Add task');
}

/** Asserts that the page has the upload form of the Add page. */
function expectUploadForm(document: DomDocument): void {
  const form = one(document, 'main form[action="/add/photo"]');
  expect(form.getAttribute('method')).toBe('post');
  expect(all(form, 'input[type="file"][name="photo"]')).toHaveLength(1);
  expect(textOf(one(form, 'button[type="submit"]'))).toBe('Upload photo');
}

/** Asserts everything AC3 says of the answer to a photo with no task in it. */
function expectNoTasksPage(response: request.Response): void {
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/^text\/html/);

  const document = parseHtml(response.text);
  expectAddPage(document);

  const statuses = all(document, '[role="status"]').filter(isShown);
  expect(statuses).toHaveLength(1);
  expect(textOf(statuses[0])).toBe(NO_TASKS);
  expect(all(document, '[role="alert"]').filter(isShown)).toEqual([]);
  expect(textOf(one(document, '[role="tab"][aria-selected="true"]'))).toBe('Photo');

  expect(all(document, 'main form').filter(isShown)).toHaveLength(1);
  expectUploadForm(document);
}

/** Asserts everything AC4 says of the answer to a photo that could not be analyzed. */
function expectFailedPage(response: request.Response, sourceId = 1): void {
  expect(response.status).toBe(502);
  expect(response.headers['content-type']).toMatch(/^text\/html/);

  const document = parseHtml(response.text);
  expectAddPage(document);

  expect(all(document, 'main [role="alert"]').filter(isShown).map(textOf)).toEqual([NOT_ANALYZED]);
  expect(all(document, '[role="status"]').filter(isShown)).toEqual([]);
  expect(textOf(one(document, '[role="tab"][aria-selected="true"]'))).toBe('Photo');

  const retryForm = one(document, `main form[action="/review/${sourceId}/analyze"]`);
  expect(retryForm.getAttribute('method')).toBe('post');
  expect(all(retryForm, 'input')).toEqual([]);
  expect(textOf(one(retryForm, 'button[type="submit"]'))).toBe('Try again');
  expect(all(retryForm, 'button')).toHaveLength(1);

  expect(all(document, 'main form').filter(isShown)).toHaveLength(2);
  expectUploadForm(document);
}

describe('POST /add/photo when the analyzer finds tasks (AC2)', () => {
  it('answers 303 to the review page of the new source, and keeps the file and the source as before', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk, bank));

    const response = await upload();

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');
    expectOneStoredPhoto();
  });

  it('calls the analyzer once, with the stored file as an image, which is on disk by then', async () => {
    const seen: { input: AnalyzerInput; bytes: Buffer }[] = [];
    analyze.mockImplementationOnce((input) => {
      // Read when the analyzer is called: the file has to be there before it runs.
      seen.push({ input, bytes: input.kind === 'image' ? readFileSync(input.path) : Buffer.alloc(0) });
      return Promise.resolve(found(bug));
    });

    await upload();

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(1);
    expect(analyze.mock.calls[0]).toStrictEqual([
      { kind: 'image', path: path.join(testApp.uploadsDir, storedFile()) },
    ]);
    expect(seen[0].bytes.equals(PHOTO_BYTES)).toBe(true);
  });

  it('stores each task as a draft of the source, in the order of the result', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk, bank));

    await upload();

    const stored = tasks();
    expect(stored.map((task) => task.id)).toEqual([1, 2, 3]);
    expect(stored.map((task) => task.title)).toEqual([bug.title, milk.title, bank.title]);

    for (const [index, task] of [bug, milk, bank].entries()) {
      expect(stored[index]).toMatchObject({
        status: 'draft',
        source_id: 1,
        title: task.title,
        description: task.description,
        category: task.category,
        estimated_minutes: task.estimated_minutes,
        confidence: task.confidence,
        priority: task.urgency,
      });
    }
    // Not dropped as "empty", not rounded.
    expect(stored[1].description).toBe('');
    expect(stored[2].confidence).toBe(0.49);
  });

  it('leaves every other column of a draft unset: the photo is reached through the source', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk, bank));

    await upload();

    const stored = tasks();
    expect(stored).toHaveLength(3);
    for (const task of stored) {
      for (const column of UNSET_COLUMNS) {
        expect(task[column], `${column} of "${task.title}"`).toBeNull();
      }
    }
  });

  it('stores one draft for a result of one task', async () => {
    analyze.mockResolvedValueOnce(found(milk));

    const response = await upload();

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');
    expect(tasks().map((task) => [task.title, task.status])).toEqual([[milk.title, 'draft']]);
  });

  it('answers 500 and stores no part of a list whose second task the table refuses', async () => {
    analyze.mockResolvedValueOnce(found(bug, { ...milk, confidence: 2 }, bank));

    const response = await upload();

    expect(response.status).toBe(500);
    expect(tasks()).toEqual([]);
    expectOneStoredPhoto();
  });
});

describe('POST /add/photo when the analyzer finds no task (AC3)', () => {
  it('answers 200 with the Add page, the message as a status, and the upload form', async () => {
    analyze.mockResolvedValueOnce(found());

    const response = await upload();

    expectNoTasksPage(response);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('stores no task and keeps the source and the file', async () => {
    analyze.mockResolvedValueOnce(found());

    await upload();

    expect(tasks()).toEqual([]);
    expectOneStoredPhoto();
  });
});

describe('POST /add/photo when the analysis fails (AC4)', () => {
  it('answers a fallback result with 502, the alert, the Try again form and the upload form', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    analyze.mockResolvedValueOnce(failed());

    const response = await upload();

    expectFailedPage(response);
    // The analyzer has already dropped the reason: there is nothing to log.
    expect(logged).not.toHaveBeenCalled();
  });

  it('never saves the fallback task, and keeps the source and the file', async () => {
    analyze.mockResolvedValueOnce(failed());

    await upload();

    expect(tasks()).toEqual([]);
    expectOneStoredPhoto();
  });

  it('answers an analyzer that rejects the same way, and writes the reason to stderr', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('the model is down');
    analyze.mockRejectedValueOnce(failure);

    const response = await upload();

    expectFailedPage(response);
    expect(tasks()).toEqual([]);
    expectOneStoredPhoto();

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][0]).toBe('The analysis of source 1 failed:');
    expect(logged.mock.calls[0][1]).toBe(failure);
  });

  it('answers an analyzer that throws before it returns a promise the same way', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('thrown at once');
    analyze.mockImplementationOnce(() => {
      throw failure;
    });

    const response = await upload();

    expectFailedPage(response);
    expect(tasks()).toEqual([]);
    expectOneStoredPhoto();
    expect(logged.mock.calls).toEqual([['The analysis of source 1 failed:', failure]]);
  });
});

describe('POST /review/:sourceId/analyze on a photo without tasks (AC5)', () => {
  /** The path the analyzer was given by the upload. */
  let firstPath = '';

  // Source 1 with its file and no task: an upload whose analysis failed.
  beforeEach(async () => {
    analyze.mockResolvedValueOnce(failed());
    const response = await upload();
    expect(response.status).toBe(502);

    const input = analyze.mock.calls[0][0];
    firstPath = input.kind === 'image' ? input.path : '';
    analyze.mockClear();
  });

  it('analyzes the stored photo once and answers 303 to the review page, with the drafts stored', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk));

    const response = await retry();

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0]).toStrictEqual([
      { kind: 'image', path: path.join(testApp.uploadsDir, storedFile()) },
    ]);
    expect(analyze.mock.calls[0][0]).toStrictEqual({ kind: 'image', path: firstPath });

    expect(tasks().map((task) => [task.title, task.status, task.source_id, task.priority])).toEqual([
      [bug.title, 'draft', 1, 'high'],
      [milk.title, 'draft', 1, 'medium'],
    ]);
  });

  it('creates no second source and no second file', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk));

    await retry();

    expectOneStoredPhoto();
  });

  it('answers 200 with the no-tasks status when nothing is found this time either', async () => {
    analyze.mockResolvedValueOnce(found());

    const response = await retry();

    expectNoTasksPage(response);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(tasks()).toEqual([]);
    expectOneStoredPhoto();
  });

  it('answers 502 with the retry form again when the result is the fallback again', async () => {
    analyze.mockResolvedValueOnce(failed());

    const response = await retry();

    expectFailedPage(response);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(tasks()).toEqual([]);
    expectOneStoredPhoto();
  });

  it('answers 502 with the retry form again when the analyzer rejects', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('the model is still down');
    analyze.mockRejectedValueOnce(failure);

    const response = await retry();

    expectFailedPage(response);
    expect(tasks()).toEqual([]);
    expectOneStoredPhoto();
    expect(logged.mock.calls).toEqual([['The analysis of source 1 failed:', failure]]);
  });

  it('stores nothing more when another request stored a task for the source while this one waited', async () => {
    analyze.mockImplementationOnce(() => {
      createTask(testApp.db, { title: 'Stored by the other request', source_id: 1 });
      return Promise.resolve(found(bug, milk));
    });

    const response = await retry();

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');
    expect(tasks().map((task) => task.title)).toEqual(['Stored by the other request']);
  });
});

describe('POST /review/:sourceId/analyze on a source that is not analyzed (AC5)', () => {
  it.each(['draft', 'done'] as const)(
    'does not call the analyzer for a source whose only task is %s, and answers 303',
    async (status) => {
      const source = createSource(testApp.db, { kind: 'photo', image_path: '/uploads/list.png' });
      createTask(testApp.db, { title: 'Already here', status, source_id: source.id });
      const before = tasks();

      const response = await retry(source.id);

      expect(response.status).toBe(303);
      expect(response.headers.location).toBe(`/review/${source.id}`);
      expect(analyze).not.toHaveBeenCalled();
      expect(tasks()).toEqual(before);
    },
  );

  it('hands the analyzer a path inside the uploads folder, whatever the stored image path says', async () => {
    const source = createSource(testApp.db, { kind: 'photo', image_path: '/uploads/../../outside.png' });
    analyze.mockResolvedValueOnce(found());

    await retry(source.id);

    expect(analyze.mock.calls).toEqual([[{ kind: 'image', path: path.join(testApp.uploadsDir, 'outside.png') }]]);
  });
});

describe('a draft before it is confirmed (AC18)', () => {
  it('is on the review page of its source and on no other page', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk, bank));
    await upload();

    for (const address of ['/', '/add', '/_styleguide']) {
      const page = await request(testApp.app).get(address);

      expect(page.status).toBe(200);
      for (const task of [bug, milk, bank]) {
        expect(page.text, `${address} shows "${task.title}"`).not.toContain(task.title);
      }
    }

    const review = await request(testApp.app).get('/review/1');
    const titles = all(parseHtml(review.text), 'main input[type="text"]').map((input) => input.getAttribute('value'));

    expect(review.status).toBe(200);
    expect(titles).toEqual([bug.title, milk.title, bank.title]);
  });
});

describe('an app without an API key (AC1)', () => {
  let expectedFetchCalls = 0;
  const fetchSpy = vi.fn<typeof fetch>();

  // The real analyzer, as `server.ts` builds it when ANTHROPIC_API_KEY is not set.
  beforeEach(() => {
    testApp.close();
    testApp = createTestApp({ analyze: createAnalyze(undefined, 'm') });

    expectedFetchCalls = 0;
    fetchSpy.mockRejectedValue(new Error('A test tried to reach the network'));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    const fetchCalls = fetchSpy.mock.calls.length;
    vi.unstubAllGlobals();
    fetchSpy.mockReset();
    expect(fetchCalls).toBe(expectedFetchCalls);
  });

  it.each(['/', '/add', '/_styleguide'])('answers GET %s with 200', async (address) => {
    const response = await request(testApp.app).get(address);

    expect(response.status).toBe(200);
  });

  it('answers an upload with the error state, keeps the photo, stores no task and makes no request', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await upload();

    expectFailedPage(response);
    expectOneStoredPhoto();
    expect(tasks()).toEqual([]);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][1]).toBeInstanceOf(AnalyzerKeyError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers the retry of that upload with the error state again', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await upload();

    const response = await retry();

    expectFailedPage(response);
    expectOneStoredPhoto();
    expect(tasks()).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
