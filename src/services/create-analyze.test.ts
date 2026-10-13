import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyzerInputError, AnalyzerKeyError, createAnalyze, type AnalyzedTask } from './analyzer.ts';

/*
 * `createAnalyze` builds the SDK's real client when it is given a key. The tests that
 * give it one say so by setting `expectedFetchCalls`: the SDK's request then ends in the
 * `fetch` spy below, so nothing leaves the process. Any other test that reaches `fetch`
 * fails in `afterEach`.
 */

const milk: AnalyzedTask = {
  title: 'Buy milk, eggs, bread',
  description: '',
  category: 'shopping',
  estimated_minutes: 40,
  urgency: 'medium',
  confidence: 0.5,
};

/** A message as the API sends it, whose text is `{"tasks":[milk]}`. */
function message(): Response {
  return Response.json({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-test-model',
    content: [{ type: 'text', text: JSON.stringify({ tasks: [milk] }) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}

/** What a promise rejects with. Fails when it resolves. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('The promise resolved');
}

let expectedFetchCalls = 0;
const fetchSpy = vi.fn<typeof fetch>();

beforeEach(() => {
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

describe('createAnalyze without a key (006 AC1)', () => {
  it('returns an analyzer that rejects a text with an AnalyzerKeyError', async () => {
    const analyze = createAnalyze(undefined, 'm');

    expect(analyze).toBeTypeOf('function');

    const error = await rejectionOf(analyze({ kind: 'text', text: 'buy milk' }));

    expect(error).toBeInstanceOf(AnalyzerKeyError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('AnalyzerKeyError');
    expect((error as Error).message).toBe('The analyzer has no API key.');
  });

  it('rejects an image whose file does not exist with the same error, before it looks at the input', async () => {
    const analyze = createAnalyze(undefined, 'm');
    const missing = path.join(tmpdir(), `mtask-create-analyze-${process.pid}`, 'missing.png');

    const error = await rejectionOf(analyze({ kind: 'image', path: missing }));

    expect(error).toBeInstanceOf(AnalyzerKeyError);
    expect(error).not.toBeInstanceOf(AnalyzerInputError);
  });
});

describe('createAnalyze with a key (006 AC1)', () => {
  it('asks the model it was given, with the key it was given, and returns the tasks', async () => {
    expectedFetchCalls = 1;
    fetchSpy.mockResolvedValueOnce(message());

    const result = await createAnalyze('test-key', 'claude-test-model')({ kind: 'text', text: 'buy milk' });

    expect(result).toStrictEqual({ tasks: [milk], fallback: false });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/messages$/);
    expect(init?.method?.toUpperCase()).toBe('POST');
    expect(new Headers(init?.headers).get('x-api-key')).toBe('test-key');
    expect(JSON.parse(String(init?.body)).model).toBe('claude-test-model');
  });

  it('sends every call of one analyzer with that key', async () => {
    expectedFetchCalls = 2;
    fetchSpy.mockResolvedValueOnce(message()).mockResolvedValueOnce(message());
    const analyze = createAnalyze('test-key', 'claude-test-model');

    await analyze({ kind: 'text', text: 'buy milk' });
    await analyze({ kind: 'text', text: 'buy eggs' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchSpy.mock.calls) {
      expect(new Headers(init?.headers).get('x-api-key')).toBe('test-key');
    }
  });
});
