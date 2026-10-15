import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask, type NewTask, type Task } from './db/tasks.ts';
import type { AnalyzedTask, Analysis, Analyze, Correction } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';

/*
 * The corrections the app hands the analyzer when it analyzes a source: on a post to
 * one of the three Add routes and on the retry of the review page. The analyzer is a
 * stub that records its arguments.
 */

const TEXT_ROUTES = ['/add/text', '/add/voice'];

const milk: AnalyzedTask = {
  title: 'Buy milk',
  description: '',
  category: 'shopping',
  estimated_minutes: 15,
  urgency: 'medium',
  confidence: 0.9,
};

/** The correction the done task of `addDone()` gives. */
const fix: Correction = { category: 'coding', title: 'Fix the login bug', estimated_minutes: 30, actual_minutes: 75 };

/** The bytes every upload of this file posts. */
const PHOTO_BYTES = Buffer.from([0x89, 0x50, 0x4e]);

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
  analyze.mockResolvedValue(found(milk));
  testApp = createTestApp({ analyze });
});

afterEach(() => {
  testApp.close();
  vi.restoreAllMocks();
});

/** Posts a text to one of the two text routes, the way its form does. */
function postText(route: string, text: string): request.Test {
  return request(testApp.app).post(route).type('form').send({ text });
}

/** Posts three bytes as a PNG to the upload route, the way the form does. */
function upload(): request.Test {
  return request(testApp.app)
    .post('/add/photo')
    .attach('photo', PHOTO_BYTES, { filename: 'list.png', contentType: 'image/png' });
}

function retry(sourceId: number | string = 1): request.Test {
  return request(testApp.app).post(`/review/${sourceId}/analyze`);
}

/** A done `coding` task, estimated 30 and done in 75, with no source, unless a field says otherwise. */
function addDone(fields: Partial<NewTask> = {}): Task {
  return createTask(testApp.db, {
    title: 'Fix the login bug',
    category: 'coding',
    status: 'done',
    estimated_minutes: 30,
    actual_minutes: 75,
    completed_at: '2026-10-01T09:00:00.000Z',
    ...fields,
  });
}

describe('the app hands the analyzer the corrections (AC6)', () => {
  it.each(TEXT_ROUTES)('passes the one correction with a text posted to %s', async (route) => {
    addDone();

    const response = await postText(route, 'buy milk');

    expect(response.status).toBe(303);
    expect(analyze.mock.calls).toStrictEqual([[{ kind: 'text', text: 'buy milk' }, [fix]]]);
  });

  it('passes the one correction with a photo', async () => {
    addDone();

    const response = await upload();

    expect(response.status).toBe(303);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0]).toHaveLength(2);
    expect(analyze.mock.calls[0][0].kind).toBe('image');
    expect(analyze.mock.calls[0][1]).toStrictEqual([fix]);
  });

  it.each(TEXT_ROUTES)('calls with the input alone for a text posted to %s when no task counts', async (route) => {
    const response = await postText(route, 'buy milk');

    expect(response.status).toBe(303);
    expect(analyze.mock.calls[0]).toHaveLength(1);
    expect(analyze.mock.calls[0]).toStrictEqual([{ kind: 'text', text: 'buy milk' }]);
  });

  it('calls with the input alone for a photo when no task counts', async () => {
    const response = await upload();

    expect(response.status).toBe(303);
    expect(analyze.mock.calls[0]).toHaveLength(1);
  });

  it('calls with the input alone when the database holds only tasks that do not count', async () => {
    addDone({ actual_minutes: 44 });
    addDone({ status: 'pending' });
    addDone({ category: 'Groceries' });

    const response = await postText('/add/text', 'buy milk');

    expect(response.status).toBe(303);
    expect(analyze.mock.calls[0]).toHaveLength(1);
  });
});

describe('the retry reads the corrections at that moment (AC6)', () => {
  it('passes a correction added after the failed post of a text', async () => {
    analyze.mockResolvedValueOnce(failed());
    const first = await postText('/add/text', 'buy milk');
    expect(first.status).toBe(502);
    expect(analyze.mock.calls[0]).toHaveLength(1);

    addDone();
    const response = await retry(1);

    expect(response.status).toBe(303);
    expect(analyze.mock.calls[1]).toStrictEqual([{ kind: 'text', text: 'buy milk' }, [fix]]);
  });

  it('passes a correction added after the failed upload of a photo', async () => {
    analyze.mockResolvedValueOnce(failed());
    const first = await upload();
    expect(first.status).toBe(502);
    expect(analyze.mock.calls[0]).toHaveLength(1);

    addDone();
    const response = await retry(1);

    expect(response.status).toBe(303);
    expect(analyze.mock.calls[1][0].kind).toBe('image');
    expect(analyze.mock.calls[1][1]).toStrictEqual([fix]);
  });

  it('calls with the input alone when still no task counts', async () => {
    analyze.mockResolvedValueOnce(failed());
    const first = await postText('/add/text', 'buy milk');
    expect(first.status).toBe(502);

    const response = await retry(1);

    expect(response.status).toBe(303);
    expect(analyze.mock.calls[1]).toHaveLength(1);
  });
});
