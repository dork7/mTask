import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyze,
  AnalyzerInputError,
  createAnalyze,
  type AnalyzedTask,
  type AnalyzerClient,
  type AnalyzerInput,
  type AnalyzerReply,
  type Correction,
} from './analyzer.ts';

/*
 * The corrections the analyzer is handed, as they appear in the request it builds. The
 * client is a stub in every test but one, which builds the analyzer through
 * `createAnalyze` and says so by setting `expectedFetchCalls`: the SDK's request then
 * ends in the `fetch` spy below, so nothing leaves the process. Any other test that
 * reaches `fetch` fails in `afterEach`.
 */

type Create = AnalyzerClient['messages']['create'];
type CreateMock = ReturnType<typeof vi.fn<Create>>;

const MODEL = 'claude-test-model';
const text = 'buy milk and fix the login bug';

const milk: AnalyzedTask = {
  title: 'Buy milk',
  description: '2 litres',
  category: 'shopping',
  estimated_minutes: 15,
  urgency: 'medium',
  confidence: 0.9,
};

/** Not valid UTF-8, so a file read as text does not give these bytes back. */
const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10, 0x80, 0xfe]);

// The SHA-256 of `JSON.stringify(request)` for the request the 005 analyzer built at
// commit 2d2d1cf, with model `claude-test-model`, for `text` and for `list.png` holding
// `imageBytes`.
const TEXT_REQUEST_HASH = 'd0c2062857457d4635f7c8e0ef909f8553b73e29d86b4ba9f60d681006dbb29f';
const IMAGE_REQUEST_HASH = '888b8a81da6edff3c0b4dcc617681b8300c440c1930e98909813e93b6cacf34a';

const fix: Correction = { category: 'coding', title: 'Fix the login bug', estimated_minutes: 30, actual_minutes: 75 };
const FIX_LINE = '- coding: "Fix the login bug", estimated 30 min, actual 75 min';

const milkFix: Correction = { category: 'shopping', title: 'Buy milk', estimated_minutes: 10, actual_minutes: 40 };
const MILK_LINE = '- shopping: "Buy milk", estimated 10 min, actual 40 min';

const bankFix: Correction = { category: 'personal', title: 'Call the bank', estimated_minutes: 60, actual_minutes: 25 };
const BANK_LINE = '- personal: "Call the bank", estimated 60 min, actual 25 min';

function stubClient() {
  const create = vi.fn<Create>();
  const client: AnalyzerClient = { messages: { create } };
  return { client, create };
}

/** A reply whose one text block is this value as JSON. */
function reply(value: unknown): AnalyzerReply {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

/** A reply whose one text block is this text, as it is. */
function textReply(replyText: string): AnalyzerReply {
  return { content: [{ type: 'text', text: replyText }] };
}

/** A message as the API sends it, whose text is `{"tasks":[milk]}`. */
function message(): Response {
  return Response.json({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: MODEL,
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

function hashOf(request: unknown): string {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex');
}

/** The lines of the system prompt of the request of this call. */
function systemLines(create: CreateMock, call = 0): string[] {
  return String(create.mock.calls[call][0].system).split('\n');
}

/** Asserts that these lines follow each other in `lines`, and that each of them is there once. */
function expectLines(lines: string[], expected: string[]): void {
  const index = lines.indexOf(expected[0]);
  expect(index).toBeGreaterThanOrEqual(0);
  expect(lines.slice(index, index + expected.length)).toEqual(expected);
  for (const line of expected) {
    expect(lines.filter((item) => item === line), line).toHaveLength(1);
  }
}

let folder = '';
let expectedFetchCalls = 0;
const fetchSpy = vi.fn<typeof fetch>();

function writeImage(name: string, bytes: Buffer = imageBytes): string {
  const file = path.join(folder, name);
  writeFileSync(file, bytes);
  return file;
}

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'mtask-analyzer-corrections-'));
  expectedFetchCalls = 0;
  fetchSpy.mockRejectedValue(new Error('A test tried to reach the network'));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });

  const fetchCalls = fetchSpy.mock.calls.length;
  vi.unstubAllGlobals();
  fetchSpy.mockReset();
  expect(fetchCalls).toBe(expectedFetchCalls);
});

describe('analyze with corrections: the lines in the request (AC4)', () => {
  it('writes one line per correction, in the order of the list, for a text', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'text', text }, { client, model: MODEL }, [fix, milkFix, bankFix]);

    expectLines(systemLines(create), [FIX_LINE, MILK_LINE, BANK_LINE]);
  });

  it('keeps the order it is handed, without sorting or grouping', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'text', text }, { client, model: MODEL }, [bankFix, fix]);

    expectLines(systemLines(create), [BANK_LINE, FIX_LINE]);
  });

  it('writes the lines for an image', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'image', path: writeImage('list.png') }, { client, model: MODEL }, [fix]);

    expectLines(systemLines(create), [FIX_LINE]);
  });

  it('writes a title with a quote and a line break as a JSON string, on one line', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'text', text }, { client, model: MODEL }, [{ ...fix, title: 'Fix "the" login\nbug' }]);

    const lines = systemLines(create);
    expectLines(lines, ['- coding: "Fix \\"the\\" login\\nbug", estimated 30 min, actual 75 min']);
    expect(lines).not.toContain('bug", estimated 30 min, actual 75 min');
  });

  it('sends the same lines again after an invalid reply, for a text', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(textReply('not JSON')).mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'text', text }, { client, model: MODEL }, [fix]);

    expect(create).toHaveBeenCalledTimes(2);
    expectLines(systemLines(create, 1), [FIX_LINE]);
    expect(create.mock.calls[1][0]).toStrictEqual(create.mock.calls[0][0]);
  });

  it('sends the same lines again after an invalid reply, for an image', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(textReply('not JSON')).mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'image', path: writeImage('list.png') }, { client, model: MODEL }, [fix]);

    expect(create).toHaveBeenCalledTimes(2);
    expectLines(systemLines(create, 1), [FIX_LINE]);
  });

  it('leaves the user message as the input alone', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'text', text }, { client, model: MODEL }, [fix]);

    expect(create.mock.calls[0][0].messages).toStrictEqual([{ role: 'user', content: [{ type: 'text', text }] }]);
  });

  it('is handed the corrections through createAnalyze, and sends them', async () => {
    expectedFetchCalls = 1;
    fetchSpy.mockResolvedValueOnce(message());

    const result = await createAnalyze('test-key', MODEL)({ kind: 'text', text }, [fix]);

    expect(result).toStrictEqual({ tasks: [milk], fallback: false });
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expectLines(String(body.system).split('\n'), [FIX_LINE]);
  });
});

describe('analyze without corrections (AC5)', () => {
  const calls: [string, (input: AnalyzerInput, client: AnalyzerClient) => Promise<unknown>][] = [
    ['no list', (input, client) => analyze(input, { client, model: MODEL })],
    ['an empty list', (input, client) => analyze(input, { client, model: MODEL }, [])],
    ['undefined', (input, client) => analyze(input, { client, model: MODEL }, undefined)],
  ];

  it.each(calls)('builds the 005 request for a text, with %s', async (_name, call) => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await call({ kind: 'text', text }, client);

    expect(hashOf(create.mock.calls[0][0])).toBe(TEXT_REQUEST_HASH);
  });

  it.each(calls)('builds the 005 request for an image, with %s', async (_name, call) => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await call({ kind: 'image', path: writeImage('list.png') }, client);

    expect(hashOf(create.mock.calls[0][0])).toBe(IMAGE_REQUEST_HASH);
  });
});

describe('analyze with corrections: the result, the retry and the fallback (AC5)', () => {
  it('returns the tasks of a valid reply', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL }, [fix]);

    expect(result).toStrictEqual({ tasks: [milk], fallback: false });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('returns the 005 fallback after two invalid replies', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(textReply('not JSON')).mockResolvedValueOnce(textReply('not JSON'));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL }, [fix]);

    expect(result).toStrictEqual({
      tasks: [
        {
          title: 'Untitled task',
          description: text,
          category: 'other',
          estimated_minutes: 30,
          urgency: 'medium',
          confidence: 0,
        },
      ],
      fallback: true,
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('returns the tasks of the second call after a call that rejects', async () => {
    const { client, create } = stubClient();
    create.mockRejectedValueOnce(new Error('529 overloaded')).mockResolvedValueOnce(reply({ tasks: [milk] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL }, [fix]);

    expect(result).toStrictEqual({ tasks: [milk], fallback: false });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('refuses a blank text before any call', async () => {
    const { client, create } = stubClient();

    const error = await rejectionOf(analyze({ kind: 'text', text: '  ' }, { client, model: MODEL }, [fix]));

    expect(error).toBeInstanceOf(AnalyzerInputError);
    expect(create).not.toHaveBeenCalled();
  });
});
