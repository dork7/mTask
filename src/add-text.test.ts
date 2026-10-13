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
} from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, formFields, isShown, one, parseHtml, textOf, type DomDocument, type DomInput } from './testing/dom.ts';

/*
 * What a text posted from the Voice or the Type tab becomes: a source of the route's
 * kind, analyzed and answered as a photo is, and the retry of a failed analysis. Every
 * test runs for both routes. The analyzer is a stub in every test; the one describe that
 * builds the real analyzer, without a key, holds `fetch` to no call at all.
 */

const NO_TEXT = 'Describe what you need to do first.';
const TEXT_TOO_LONG = 'That text is longer than 5000 characters. Shorten it.';
const NO_TASKS_IN_TEXT = 'No tasks were found in that text.';
const TEXT_NOT_ANALYZED = 'The text could not be analyzed.';

/** The two text routes: the address, the kind of source it makes and the label of its tab. */
const ROUTES = [
  ['/add/voice', 'voice', 'Voice'],
  ['/add/text', 'text', 'Type'],
] as const;

const bug: AnalyzedTask = {
  title: 'Finish login bug fix',
  description: 'Before Friday',
  category: 'coding',
  estimated_minutes: 90,
  urgency: 'high',
  confidence: 0.9,
};

const milk: AnalyzedTask = {
  title: 'Buy milk',
  description: '',
  category: 'shopping',
  estimated_minutes: 15,
  urgency: 'medium',
  confidence: 0.49,
};

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
  transcript: unknown;
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

/** Posts a text to one of the two routes, the way its form does. */
function postText(route: string, text: string): request.Test {
  return request(testApp.app).post(route).type('form').send({ text });
}

/** Posts a form body written out by hand: a field twice, or a line break as the browser sends it. */
function postBody(route: string, body: string): request.Test {
  return request(testApp.app).post(route).type('form').send(body);
}

function retry(sourceId: number | string = 1): request.Test {
  return request(testApp.app).post(`/review/${sourceId}/analyze`);
}

function sources(): SourceRow[] {
  return testApp.db
    .prepare('SELECT id, kind, image_path, transcript FROM sources ORDER BY id')
    .all()
    .map((row) => ({ id: row.id, kind: row.kind, image_path: row.image_path, transcript: row.transcript }));
}

function tasks(): Task[] {
  return listTasks(testApp.db);
}

/** The text of the one selected tab. */
function selectedTab(document: DomDocument): string {
  return textOf(one(document, '[role="tab"][aria-selected="true"]'));
}

function shownAlerts(document: DomDocument): string[] {
  return all(document, '[role="alert"]').filter(isShown).map(textOf);
}

function shownStatuses(document: DomDocument): string[] {
  return all(document, '[role="status"]').filter(isShown).map(textOf);
}

/** Where the forms that are shown post, in the order of the page. */
function shownForms(document: DomDocument): (string | null)[] {
  return all(document, 'main form')
    .filter(isShown)
    .map((form) => form.getAttribute('action'));
}

/** What the text box of a route's form holds. */
function boxOf(document: DomDocument, route: string): string {
  return (one(document, `main form[action="${route}"] textarea[name="text"]`) as DomInput).value;
}

/** Asserts the marks of the Add page in the layout. */
function expectAddPage(document: DomDocument): void {
  expect(textOf(one(document, 'main h1'))).toBe('Add task');
  expect(all(one(document, 'nav'), 'a')).toHaveLength(5);
  expect(all(document, '[aria-current]')).toHaveLength(1);
  expect(one(document, '[aria-current="page"]').getAttribute('href')).toBe('/add');
}

/** Asserts everything AC4 says of a refused post: the page, and that nothing was stored or analyzed. */
function expectRefused(
  response: request.Response,
  status: number,
  message: string,
  label: string,
  route: string,
  box: string,
): void {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toMatch(/^text\/html/);

  const document = parseHtml(response.text);
  expectAddPage(document);
  expect(selectedTab(document)).toBe(label);
  expect(shownAlerts(document)).toEqual([message]);
  expect(shownStatuses(document)).toEqual([]);
  expect(shownForms(document)).toEqual([route]);
  expect(boxOf(document, route)).toBe(box);

  expect(sources()).toEqual([]);
  expect(tasks()).toEqual([]);
  expect(analyze).not.toHaveBeenCalled();
}

/** Asserts everything AC5 says of the page that answers a text with no task in it. */
function expectNoTasksText(response: request.Response, label: string, route: string, text: string): void {
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/^text\/html/);

  const document = parseHtml(response.text);
  expectAddPage(document);
  expect(selectedTab(document)).toBe(label);
  expect(shownStatuses(document)).toEqual([NO_TASKS_IN_TEXT]);
  expect(shownAlerts(document)).toEqual([]);
  expect(shownForms(document)).toEqual([route]);
  expect(boxOf(document, route)).toBe(text);
}

/** Asserts everything AC6 says of the page that answers a text that could not be analyzed. */
function expectFailedText(response: request.Response, label: string, route: string, text: string): void {
  expect(response.status).toBe(502);
  expect(response.headers['content-type']).toMatch(/^text\/html/);

  const document = parseHtml(response.text);
  expectAddPage(document);
  expect(selectedTab(document)).toBe(label);
  expect(shownAlerts(document)).toEqual([TEXT_NOT_ANALYZED]);
  expect(shownStatuses(document)).toEqual([]);

  const retryForm = one(document, 'main form[action="/review/1/analyze"]');
  expect(retryForm.getAttribute('method')).toBe('post');
  expect(all(retryForm, 'input')).toEqual([]);
  expect(all(retryForm, 'button')).toHaveLength(1);
  expect(one(retryForm, 'button').getAttribute('type')).toBe('submit');
  expect(textOf(one(retryForm, 'button'))).toBe('Try again');

  expect(shownForms(document)).toEqual(['/review/1/analyze', route]);
  expect(boxOf(document, route)).toBe(text);
}

/** The one source a post of this text leaves, as `sources()` reads it. */
function oneSource(kind: string, transcript: string): SourceRow[] {
  return [{ id: 1, kind, image_path: null, transcript }];
}

describe.each(ROUTES)('POST %s when the analyzer finds tasks (AC3)', (route, kind) => {
  it('answers 303 to the review page of the one new source, which holds the trimmed text', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk));

    const response = await postText(route, '  buy milk and finish the login bug \n');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');
    expect(sources()).toEqual(oneSource(kind, 'buy milk and finish the login bug'));
  });

  it('calls the analyzer once, with the transcript as a text, after the source is stored', async () => {
    const seen: SourceRow[][] = [];
    analyze.mockImplementationOnce(() => {
      // Read when the analyzer is called: the source has to be there before it runs.
      seen.push(sources());
      return Promise.resolve(found(bug));
    });

    await postText(route, '  buy milk and finish the login bug \n');

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0]).toStrictEqual([{ kind: 'text', text: 'buy milk and finish the login bug' }]);
    expect(seen).toEqual([oneSource(kind, 'buy milk and finish the login bug')]);
  });

  it('stores each task as a draft of the source, in the order of the result', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk));

    await postText(route, 'buy milk and finish the login bug');

    const stored = tasks();
    expect(stored.map((task) => task.id)).toEqual([1, 2]);
    expect(stored.map((task) => task.title)).toEqual([bug.title, milk.title]);

    for (const [index, task] of [bug, milk].entries()) {
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
    expect(stored[1].confidence).toBe(0.49);
  });

  it('leaves every other column of a draft unset', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk));

    await postText(route, 'buy milk and finish the login bug');

    const stored = tasks();
    expect(stored).toHaveLength(2);
    for (const task of stored) {
      for (const column of UNSET_COLUMNS) {
        expect(task[column], `${column} of "${task.title}"`).toBeNull();
      }
    }
  });

  it('stores one draft for a result of one task', async () => {
    analyze.mockResolvedValueOnce(found(milk));

    const response = await postText(route, 'buy milk');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');
    expect(tasks().map((task) => [task.title, task.status])).toEqual([[milk.title, 'draft']]);
  });

  it('answers 500 and stores no part of a list whose second task the table refuses', async () => {
    analyze.mockResolvedValueOnce(found(bug, { ...milk, confidence: 2 }));

    const response = await postText(route, 'buy milk');

    expect(response.status).toBe(500);
    expect(tasks()).toEqual([]);
    expect(sources()).toEqual(oneSource(kind, 'buy milk'));
  });

  it('stores a line break once, as the browser counts it, and hands the analyzer the same text', async () => {
    analyze.mockResolvedValueOnce(found(milk));

    await postBody(route, 'text=buy+milk%0D%0Acall+mum');

    expect(sources()).toEqual(oneSource(kind, 'buy milk\ncall mum'));
    expect(analyze.mock.calls).toEqual([[{ kind: 'text', text: 'buy milk\ncall mum' }]]);
  });

  it('keeps the white space inside the text as it was posted', async () => {
    analyze.mockResolvedValueOnce(found(milk));

    await postText(route, 'buy  milk');

    expect(sources()).toEqual(oneSource(kind, 'buy  milk'));
    expect(analyze.mock.calls).toEqual([[{ kind: 'text', text: 'buy  milk' }]]);
  });

  it('answers 500 and does not call the analyzer when the source cannot be written', async () => {
    testApp.db.close();

    const response = await postText(route, 'buy milk');

    expect(response.status).toBe(500);
    expect(analyze).not.toHaveBeenCalled();
  });
});

describe.each(ROUTES)('POST %s with no text, or too much (AC4)', (route, _kind, label) => {
  /** The other route: its text box is never filled by a post to this one. */
  const otherRoute = route === '/add/voice' ? '/add/text' : '/add/voice';

  it.each([
    ['no body', () => request(testApp.app).post(route)],
    ['an empty text', () => postBody(route, 'text=')],
    ['a text of white space', () => postBody(route, 'text=%20%0D%0A%09')],
    ['the text twice', () => postBody(route, 'text=a&text=b')],
    ['another field and no text', () => postBody(route, 'note=buy+milk')],
    ['a JSON body', () => request(testApp.app).post(route).send({ text: 'buy milk' })],
    ['a multipart field', () => request(testApp.app).post(route).field('text', 'buy milk')],
  ])('refuses %s with 400 and the tab of the route', async (_name, post) => {
    const response = await post();

    expectRefused(response, 400, NO_TEXT, label, route, '');
  });

  it('refuses 5001 characters with 413 and gives the text back in the box of its tab only', async () => {
    const text = 'x'.repeat(5001);

    const response = await postText(route, text);

    expectRefused(response, 413, TEXT_TOO_LONG, label, route, text);
    expect(boxOf(parseHtml(response.text), otherRoute)).toBe('');
  });

  it('refuses 5001 characters between spaces with 413, and the box holds the 5001', async () => {
    const text = 'x'.repeat(5001);

    const response = await postText(route, `  ${text}  `);

    expectRefused(response, 413, TEXT_TOO_LONG, label, route, text);
  });

  it('accepts exactly 5000 characters', async () => {
    analyze.mockResolvedValueOnce(found(milk));

    const response = await postText(route, 'x'.repeat(5000));

    expect(response.status).toBe(303);
    expect(sources()).toHaveLength(1);
    expect(String(sources()[0].transcript)).toHaveLength(5000);
  });

  it('measures the text after it is trimmed: 5000 characters between spaces and a line break are accepted', async () => {
    analyze.mockResolvedValueOnce(found(milk));

    const response = await postText(route, `  ${'x'.repeat(5000)} \n`);

    expect(response.status).toBe(303);
    expect(String(sources()[0].transcript)).toHaveLength(5000);
  });

  it('counts a line break once, as the browser does: 5000 characters with line breaks are accepted', async () => {
    analyze.mockResolvedValueOnce(found(milk));
    const posted = `${'x\r\n'.repeat(2499)}xx`;
    expect(posted).toHaveLength(7499);

    const response = await postBody(route, `text=${encodeURIComponent(posted)}`);

    expect(response.status).toBe(303);
    expect(sources()).toHaveLength(1);
    expect(sources()[0].transcript).toBe(`${'x\n'.repeat(2499)}xx`);
    expect(String(sources()[0].transcript)).toHaveLength(5000);
  });
});

describe.each(ROUTES)('POST %s when the analyzer finds no task (AC5)', (route, kind, label) => {
  it('answers 200 with the Add page, the tab of the route, the message as a status and the text in its box', async () => {
    analyze.mockResolvedValueOnce(found());

    const response = await postText(route, ' buy milk ');

    expectNoTasksText(response, label, route, 'buy milk');
  });

  it('stores no task, keeps the source and calls the analyzer once', async () => {
    analyze.mockResolvedValueOnce(found());

    await postText(route, ' buy milk ');

    expect(tasks()).toEqual([]);
    expect(sources()).toEqual(oneSource(kind, 'buy milk'));
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('gives a text that looks like markup back as the value of the box, and runs none of it', async () => {
    analyze.mockResolvedValueOnce(found());
    const text = '</textarea><script>window.x = 1</script>\nand a second line';

    const response = await postText(route, text);

    const document = parseHtml(response.text);
    expect(response.status).toBe(200);
    expect(boxOf(document, route)).toBe(text);
    expect(all(document, 'main script:not([src])')).toEqual([]);
    expect(all(document, 'main form')).toHaveLength(3);
  });
});

describe.each(ROUTES)('POST %s when the analysis fails (AC6)', (route, kind, label) => {
  it('answers a fallback result with 502, the alert, the Try again form and the text in its box', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    analyze.mockResolvedValueOnce(failed());

    const response = await postText(route, 'buy milk');

    expectFailedText(response, label, route, 'buy milk');
    // The fallback task stands for the failure and is never saved.
    expect(tasks()).toEqual([]);
    expect(sources()).toEqual(oneSource(kind, 'buy milk'));
    // The analyzer has already dropped the reason: there is nothing to log.
    expect(logged).not.toHaveBeenCalled();
  });

  it('answers an analyzer that rejects the same way, and writes the reason to stderr', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('the model is down');
    analyze.mockRejectedValueOnce(failure);

    const response = await postText(route, 'buy milk');

    expectFailedText(response, label, route, 'buy milk');
    expect(tasks()).toEqual([]);
    expect(sources()).toEqual(oneSource(kind, 'buy milk'));

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

    const response = await postText(route, 'buy milk');

    expectFailedText(response, label, route, 'buy milk');
    expect(tasks()).toEqual([]);
    expect(sources()).toEqual(oneSource(kind, 'buy milk'));
    expect(logged.mock.calls).toEqual([['The analysis of source 1 failed:', failure]]);
  });
});

describe.each(ROUTES)('POST %s in an app without an API key (AC6)', (route, kind, label) => {
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

  it('answers a text with the error state, keeps the source, stores no task and makes no request', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await postText(route, 'buy milk');

    expectFailedText(response, label, route, 'buy milk');
    expect(tasks()).toEqual([]);
    expect(sources()).toEqual(oneSource(kind, 'buy milk'));

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][1]).toBeInstanceOf(AnalyzerKeyError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe.each(ROUTES)('POST /review/:sourceId/analyze on a source of %s without tasks (AC7)', (route, kind, label) => {
  // Source 1 with its transcript and no task: a text whose analysis failed.
  beforeEach(async () => {
    analyze.mockResolvedValueOnce(failed());
    const response = await postText(route, 'buy milk');
    expect(response.status).toBe(502);
    analyze.mockClear();
  });

  it('analyzes the stored transcript once and answers 303 to the review page, with the drafts stored', async () => {
    analyze.mockResolvedValueOnce(found(bug, milk));

    const response = await retry();

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0]).toStrictEqual([{ kind: 'text', text: 'buy milk' }]);

    expect(tasks().map((task) => [task.title, task.status, task.source_id, task.priority])).toEqual([
      [bug.title, 'draft', 1, 'high'],
      [milk.title, 'draft', 1, 'medium'],
    ]);
    expect(sources()).toEqual(oneSource(kind, 'buy milk'));
  });

  it('answers 200 with the no-tasks status, the tab of the source and its text when nothing is found', async () => {
    analyze.mockResolvedValueOnce(found());

    const response = await retry();

    expectNoTasksText(response, label, route, 'buy milk');
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(tasks()).toEqual([]);
    expect(sources()).toEqual(oneSource(kind, 'buy milk'));
  });

  it('answers 502 with the retry form again when the result is the fallback again', async () => {
    analyze.mockResolvedValueOnce(failed());

    const response = await retry();

    expectFailedText(response, label, route, 'buy milk');
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(tasks()).toEqual([]);
    expect(sources()).toEqual(oneSource(kind, 'buy milk'));
  });

  it('answers 502 with the retry form again when the analyzer rejects', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('the model is still down');
    analyze.mockRejectedValueOnce(failure);

    const response = await retry();

    expectFailedText(response, label, route, 'buy milk');
    expect(tasks()).toEqual([]);
    expect(sources()).toEqual(oneSource(kind, 'buy milk'));
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

describe.each(ROUTES)('POST /review/:sourceId/analyze on a source of %s that has a task (AC7)', (_route, kind) => {
  it.each(['draft', 'done'] as const)(
    'does not call the analyzer for a source whose only task is %s, and answers 303',
    async (status) => {
      const source = createSource(testApp.db, { kind, transcript: 'buy milk' });
      createTask(testApp.db, { title: 'Already here', status, source_id: source.id });
      const before = tasks();

      const response = await retry(source.id);

      expect(response.status).toBe(303);
      expect(response.headers.location).toBe(`/review/${source.id}`);
      expect(analyze).not.toHaveBeenCalled();
      expect(tasks()).toEqual(before);
    },
  );
});

describe.each(ROUTES)('the drafts of a text posted to %s (AC8)', (route) => {
  const TEXT = 'buy milk and finish the login bug';

  beforeEach(async () => {
    analyze.mockResolvedValueOnce(found(bug, milk));
    const response = await postText(route, TEXT);
    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');
  });

  /** The review page of the source, parsed with its scripts off. */
  async function review(): Promise<DomDocument> {
    const response = await request(testApp.app).get('/review/1');
    expect(response.status).toBe(200);
    return parseHtml(response.text);
  }

  it('are one card each on the review page, under the transcript as text, with no image', async () => {
    const document = await review();
    const titles = all(document, '[data-draft] input[type="text"]').map((input) => input.getAttribute('value'));
    const details = one(document, 'main details');

    expect(all(document, '[data-draft]')).toHaveLength(2);
    expect(titles).toEqual([bug.title, milk.title]);
    expect(textOf(details)).toContain(TEXT);
    expect(all(details, 'summary')).toHaveLength(1);
    expect(all(document, 'main img')).toEqual([]);
  });

  it('become pending tasks when the form is confirmed', async () => {
    const fields = formFields(one(await review(), 'main form'));

    const response = await request(testApp.app).post('/review/1/confirm').type('form').send(fields);

    expect(response.status).toBe(303);
    expect(listTasks(testApp.db, { status: 'pending' }).map((task) => [task.id, task.title])).toEqual([
      [1, bug.title],
      [2, milk.title],
    ]);
    expect(listTasks(testApp.db, { status: 'draft' })).toEqual([]);
  });

  it('lose the one that is removed, and the other stays a draft', async () => {
    const fields = formFields(one(await review(), 'main form'));

    const response = await request(testApp.app).post('/review/1/remove/1').type('form').send(fields);

    expect(response.status).toBe(303);
    expect(tasks().map((task) => [task.id, task.status])).toEqual([[2, 'draft']]);
  });

  it('are all deleted on Discard, which leads to the Add page and keeps the source', async () => {
    const response = await request(testApp.app).post('/review/1/discard');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/add');
    expect(tasks()).toEqual([]);
    expect(sources()).toHaveLength(1);
  });

  it.each(['/', '/add?tab=voice'])('are not on %s before they are confirmed', async (address) => {
    const page = await request(testApp.app).get(address);

    expect(page.status).toBe(200);
    for (const task of [bug, milk]) {
      expect(page.text, `${address} shows "${task.title}"`).not.toContain(task.title);
    }
  });
});

describe.each(ROUTES)('the buttons of the page that answers a post to %s (AC2)', (route) => {
  it.each([
    [400, found(milk), () => postBody(route, 'text=')],
    [413, found(milk), () => postText(route, 'x'.repeat(5001))],
    [200, found(), () => postText(route, 'buy milk')],
    [502, failed(), () => postText(route, 'buy milk')],
  ])('all have the btn class on the %i answer', async (status, analysis, post) => {
    analyze.mockResolvedValueOnce(analysis);
    const response = await post();
    const buttons = all(parseHtml(response.text), 'button');

    expect(response.status).toBe(status);
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    for (const button of buttons) {
      expect(button.classList.contains('btn'), button.outerHTML).toBe(true);
    }
  });
});
