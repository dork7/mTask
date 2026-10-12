import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyze,
  AnalyzerInputError,
  createAnalyzerClient,
  type AnalyzedTask,
  type Analysis,
  type AnalyzerClient,
  type AnalyzerReply,
} from './analyzer.ts';
import { photoExtension } from './photo-storage.ts';

/*
 * The client is a stub in every test but three. Those three hand `analyze` the SDK's real
 * client and say so by setting `expectedFetchCalls`: the SDK's request then ends in the
 * `fetch` spy below, so nothing leaves the process. Any other test that reaches `fetch`
 * fails in `afterEach`.
 */

type Create = AnalyzerClient['messages']['create'];

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

const bug: AnalyzedTask = {
  title: 'Fix the login bug',
  description: '',
  category: 'coding',
  estimated_minutes: 60,
  urgency: 'high',
  confidence: 0.7,
};

const dentist: AnalyzedTask = {
  title: 'Call the dentist',
  description: '',
  category: 'personal',
  estimated_minutes: 10,
  urgency: 'low',
  confidence: 0.4,
};

/** The four extensions an image file may have, each with the media type it is sent as. */
const photoTypes = [
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
] as const;

const TASK_KEYS = ['title', 'description', 'category', 'estimated_minutes', 'urgency', 'confidence'];

/** Not valid UTF-8, so a file read as text does not give these bytes back. */
const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10, 0x80, 0xfe]);

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

/** A reply the type does not allow. */
function oddReply(value: unknown): AnalyzerReply {
  return value as AnalyzerReply;
}

function fallbackOf(description: string): Analysis {
  return {
    tasks: [
      {
        title: 'Untitled task',
        description,
        category: 'other',
        estimated_minutes: 30,
        urgency: 'medium',
        confidence: 0,
      },
    ],
    fallback: true,
  };
}

/** `milk` without one of its fields. */
function milkWithout(key: keyof AnalyzedTask): Record<string, unknown> {
  const item: Record<string, unknown> = { ...milk };
  delete item[key];
  return item;
}

/** A message as the API sends it, with a thinking block before the text. */
function message(messageText: string): Response {
  return Response.json({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'text', text: messageText },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}

/** The content of the one user message of the request of this call. */
function sentContent(create: ReturnType<typeof vi.fn<Create>>, call = 0) {
  const { messages } = create.mock.calls[call][0];
  expect(messages).toHaveLength(1);
  expect(messages[0].role).toBe('user');

  const { content } = messages[0];
  if (!Array.isArray(content)) throw new Error('The content of the message is not an array');
  return content;
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

let folder = '';
let expectedFetchCalls = 0;
const fetchSpy = vi.fn<typeof fetch>();

function writeImage(name: string, bytes: Buffer = imageBytes): string {
  const file = path.join(folder, name);
  writeFileSync(file, bytes);
  return file;
}

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'mtask-analyzer-'));
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

describe('analyze: the result (AC1)', () => {
  it('is an object with a tasks array and a fallback boolean, for a text', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(Object.keys(result).sort()).toEqual(['fallback', 'tasks']);
    expect(Array.isArray(result.tasks)).toBe(true);
    expect(typeof result.fallback).toBe('boolean');
  });

  it('is an object with a tasks array and a fallback boolean, for an image', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    const result = await analyze({ kind: 'image', path: writeImage('list.jpg') }, { client, model: MODEL });

    expect(Object.keys(result).sort()).toEqual(['fallback', 'tasks']);
    expect(Array.isArray(result.tasks)).toBe(true);
    expect(typeof result.fallback).toBe('boolean');
  });

  it('sends the request through the real client and reads the message it gets back', async () => {
    expectedFetchCalls = 1;
    fetchSpy.mockResolvedValueOnce(message(JSON.stringify({ tasks: [milk] })));

    const result = await analyze(
      { kind: 'text', text },
      { client: createAnalyzerClient('test-key'), model: 'claude-opus-5-5' },
    );

    expect(result).toStrictEqual({ tasks: [milk], fallback: false });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/messages$/);
    expect(init?.method?.toUpperCase()).toBe('POST');
    expect(new Headers(init?.headers).get('x-api-key')).toBe('test-key');

    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.messages).toStrictEqual([{ role: 'user', content: [{ type: 'text', text }] }]);
    expect(body.output_config.format.type).toBe('json_schema');
  });
});

describe('analyze: the fields of a task (AC2)', () => {
  it('drops a field the reply adds beyond the six', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [{ ...milk, time_slot: 'night', id: 7 }] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toStrictEqual(milk);
    expect(Object.keys(result.tasks[0])).toEqual(TASK_KEYS);
    expect(result.fallback).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('accepts a reply with a key beside tasks', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk], note: 'x' }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks: [milk], fallback: false });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each(['coding', 'shopping', 'work', 'home', 'personal', 'other'])(
    'returns the category %s',
    async (category) => {
      const { client, create } = stubClient();
      create.mockResolvedValueOnce(reply({ tasks: [{ ...milk, category }] }));

      const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

      expect(result).toStrictEqual({ tasks: [{ ...milk, category }], fallback: false });
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['urgent', 'high', 'medium', 'low'])('returns the urgency %s', async (urgency) => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [{ ...milk, urgency }] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks: [{ ...milk, urgency }], fallback: false });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['estimated_minutes 1', { estimated_minutes: 1 }],
    ['estimated_minutes 1440', { estimated_minutes: 1440 }],
    ['confidence 0', { confidence: 0 }],
    ['confidence 1', { confidence: 1 }],
    ['an empty description', { description: '' }],
  ])('accepts %s', async (_name, change) => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [{ ...milk, ...change }] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks: [{ ...milk, ...change }], fallback: false });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('returns a title with the spaces the reply gave it', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [{ ...milk, title: '  Buy milk ' }] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result.tasks[0].title).toBe('  Buy milk ');
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('analyze: one task (AC3)', () => {
  it('returns the one task of the reply, after one call', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks: [milk], fallback: false });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('reads the text block of a reply that begins with a thinking block', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce({
      content: [{ type: 'thinking' }, { type: 'text', text: JSON.stringify({ tasks: [milk] }) }],
    });

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks: [milk], fallback: false });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('analyze: several tasks (AC4)', () => {
  it.each([
    ['milk, bug, dentist', [milk, bug, dentist]],
    ['dentist, milk, bug', [dentist, milk, bug]],
  ])('returns all tasks of the reply in its order: %s', async (_name, tasks) => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks, fallback: false });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('returns no tasks, and no fallback, for a reply with an empty array', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks: [], fallback: false });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('analyze: the request (AC5)', () => {
  it.each(['claude-test-model', 'claude-other-model'])('asks the model it was handed: %s', async (model) => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'text', text }, { client, model });

    expect(create.mock.calls[0][0].model).toBe(model);
  });

  it('sends a text exactly as given, in one text block and with no image', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));
    const given = '  buy milk\nfix the login bug ';

    await analyze({ kind: 'text', text: given }, { client, model: MODEL });

    expect(sentContent(create)).toStrictEqual([{ type: 'text', text: given }]);
  });

  it.each([
    ...photoTypes.map(([extension, mediaType]) => [`list${extension}`, mediaType]),
    ['IMG_0412.JPG', 'image/jpeg'],
    ['Board.Png', 'image/png'],
  ])('sends %s as one image block of type %s with the bytes of the file', async (name, mediaType) => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'image', path: writeImage(name) }, { client, model: MODEL });

    const images = sentContent(create).filter((block) => block.type === 'image');
    expect(images).toHaveLength(1);

    const data = imageBytes.toString('base64');
    expect(images[0].source).toStrictEqual({ type: 'base64', media_type: mediaType, data });
    expect(Buffer.from(data, 'base64').equals(imageBytes)).toBe(true);
  });

  // The same four rows as the test above: what the analyzer sends a file as is the type
  // 004 stored it under.
  it.each(photoTypes)('reads %s as the type whose stored photos get that extension: %s', (extension, mediaType) => {
    expect(photoExtension(mediaType)).toBe(extension);
  });

  it('puts the image before the text', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'image', path: writeImage('list.png') }, { client, model: MODEL });

    const content = sentContent(create);
    expect(content.map((block) => block.type)).toEqual(['image', 'text']);
  });

  it('has a system prompt and a token limit, and names no setting a model may refuse', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'text', text }, { client, model: MODEL });

    const request = create.mock.calls[0][0];
    expect(typeof request.system).toBe('string');
    expect(String(request.system).trim()).not.toBe('');
    expect(Number.isInteger(request.max_tokens)).toBe(true);
    expect(request.max_tokens).toBeGreaterThan(0);
    for (const key of ['thinking', 'temperature', 'top_p', 'top_k', 'tools', 'tool_choice']) {
      expect(request, key).not.toHaveProperty(key);
    }
  });

  it('asks for a structured output: an object with a tasks array of the six fields', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'text', text }, { client, model: MODEL });

    const format = create.mock.calls[0][0].output_config?.format;
    expect(format?.type).toBe('json_schema');

    // Read as plain data, the way the API reads it.
    const schema = JSON.parse(JSON.stringify(format?.schema));
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties)).toEqual(['tasks']);
    expect(schema.required).toEqual(['tasks']);
    expect(schema.properties.tasks.type).toBe('array');

    const item = schema.properties.tasks.items;
    expect(item.type).toBe('object');
    expect(Object.keys(item.properties).sort()).toEqual([...TASK_KEYS].sort());
    expect([...item.required].sort()).toEqual([...TASK_KEYS].sort());
    expect(item.properties.category.enum).toEqual(['coding', 'shopping', 'work', 'home', 'personal', 'other']);
    expect(item.properties.urgency.enum).toEqual(['urgent', 'high', 'medium', 'low']);
  });

  it('sends a schema with no limit the API answers with a 400, and no open object', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'text', text }, { client, model: MODEL });

    const refused = [
      'minimum',
      'maximum',
      'exclusiveMinimum',
      'exclusiveMaximum',
      'multipleOf',
      'minLength',
      'maxLength',
      'maxItems',
    ];
    let objects = 0;
    const walk = (node: unknown, where: string): void => {
      if (Array.isArray(node)) {
        node.forEach((entry, index) => walk(entry, `${where}[${index}]`));
        return;
      }
      if (typeof node !== 'object' || node === null) return;

      const record = node as Record<string, unknown>;
      for (const key of refused) expect(record, `${key} at ${where}`).not.toHaveProperty(key);
      if (record.type === 'object') {
        objects += 1;
        expect(record.additionalProperties, `additionalProperties at ${where}`).toBe(false);
      }
      for (const [key, value] of Object.entries(record)) walk(value, `${where}.${key}`);
    };

    walk(JSON.parse(JSON.stringify(create.mock.calls[0][0].output_config?.format?.schema)), 'schema');

    // The root and the item, so the walk cannot pass on a schema it did not enter.
    expect(objects).toBe(2);
  });

  it('sends the same request again after an invalid reply', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(textReply('not JSON')).mockResolvedValueOnce(reply({ tasks: [milk] }));

    await analyze({ kind: 'image', path: writeImage('list.gif') }, { client, model: MODEL });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0]).toStrictEqual(create.mock.calls[0][0]);
  });
});

describe('analyze: an invalid reply (AC6)', () => {
  const noArray: [string, AnalyzerReply][] = [
    ['text that is not JSON', textReply('Here are your tasks: buy milk.')],
    ['JSON that is cut off', textReply('{"tasks":[{"title":"Buy')],
    ['JSON inside a code fence', textReply('```json\n' + JSON.stringify({ tasks: [milk] }) + '\n```')],
    ['an empty text', textReply('')],
    ['no content blocks', { content: [] }],
    ['only a thinking block', { content: [{ type: 'thinking' }] }],
    ['a text block with no text', { content: [{ type: 'text' }] }],
    ['a bare array', reply([milk])],
    ['an object with items in place of tasks', reply({ items: [milk] })],
    ['tasks that is an object', reply({ tasks: { 0: milk } })],
    ['the JSON value null', reply(null)],
    ['the JSON value "tasks"', reply('tasks')],
    ['the JSON value 42', reply(42)],
    ['a reply of undefined', oddReply(undefined)],
    ['a reply of {}', oddReply({})],
    ['a reply whose content is a string', oddReply({ content: 'text' })],
  ];

  const badItem: [string, unknown][] = [
    ['urgency asap', { ...milk, urgency: 'asap' }],
    ['confidence 1.5', { ...milk, confidence: 1.5 }],
    ['estimated_minutes 0', { ...milk, estimated_minutes: 0 }],
    ['no title', milkWithout('title')],
    ['an empty title', { ...milk, title: '' }],
    ['a blank title', { ...milk, title: '   ' }],
    ['a title that is a number', { ...milk, title: 7 }],
    ['no description', milkWithout('description')],
    ['a description of null', { ...milk, description: null }],
    ['category groceries', { ...milk, category: 'groceries' }],
    ['category Shopping', { ...milk, category: 'Shopping' }],
    ['no category', milkWithout('category')],
    ['estimated_minutes 1441', { ...milk, estimated_minutes: 1441 }],
    ['estimated_minutes 30.5', { ...milk, estimated_minutes: 30.5 }],
    ['estimated_minutes "30"', { ...milk, estimated_minutes: '30' }],
    ['estimated_minutes -5', { ...milk, estimated_minutes: -5 }],
    ['no estimated_minutes', milkWithout('estimated_minutes')],
    ['urgency URGENT', { ...milk, urgency: 'URGENT' }],
    ['no urgency', milkWithout('urgency')],
    ['confidence -0.1', { ...milk, confidence: -0.1 }],
    ['confidence "0.9"', { ...milk, confidence: '0.9' }],
    ['a confidence of null', { ...milk, confidence: null }],
    ['no confidence', milkWithout('confidence')],
    ['an item of null', null],
    ['an item that is a string', 'Buy milk'],
    ['an item that is an array', [milk]],
  ];

  it.each(noArray)('asks once more after %s, and returns the second reply', async (_name, first) => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(first).mockResolvedValueOnce(reply({ tasks: [bug] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks: [bug], fallback: false });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it.each(badItem)('asks once more after an item with %s, and returns the second reply', async (_name, item) => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(reply({ tasks: [item] })).mockResolvedValueOnce(reply({ tasks: [bug] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks: [bug], fallback: false });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('returns no part of a list with one good and one bad item', async () => {
    const { client, create } = stubClient();
    create
      .mockResolvedValueOnce(reply({ tasks: [milk, { ...bug, urgency: 'asap' }] }))
      .mockResolvedValueOnce(reply({ tasks: [dentist] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks: [dentist], fallback: false });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('returns the fallback, not the good item, when the mixed list comes twice', async () => {
    const { client, create } = stubClient();
    const mixed = reply({ tasks: [milk, { ...bug, urgency: 'asap' }] });
    create.mockResolvedValueOnce(mixed).mockResolvedValueOnce(mixed);

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual(fallbackOf(text));
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('analyze: an API error (AC7)', () => {
  it('calls once more after a call that rejects, and returns the second reply', async () => {
    const { client, create } = stubClient();
    create.mockRejectedValueOnce(new Error('529 overloaded')).mockResolvedValueOnce(reply({ tasks: [milk, bug] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks: [milk, bug], fallback: false });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('calls once more after a call that throws at once', async () => {
    const { client, create } = stubClient();
    create
      .mockImplementationOnce(() => {
        throw new Error('no connection');
      })
      .mockResolvedValueOnce(reply({ tasks: [milk, bug] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual({ tasks: [milk, bug], fallback: false });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('calls the real client once more after the API answers 400', async () => {
    expectedFetchCalls = 2;
    fetchSpy
      .mockResolvedValueOnce(
        Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'no' } }, { status: 400 }),
      )
      .mockResolvedValueOnce(message(JSON.stringify({ tasks: [milk] })));

    const result = await analyze(
      { kind: 'text', text },
      { client: createAnalyzerClient('test-key'), model: 'claude-opus-5-5' },
    );

    expect(result).toStrictEqual({ tasks: [milk], fallback: false });
  });
});

describe('analyze: the fallback (AC8)', () => {
  type Step = 'invalid' | 'error';

  function answer(create: ReturnType<typeof vi.fn<Create>>, step: Step): void {
    if (step === 'invalid') create.mockResolvedValueOnce(textReply('not JSON'));
    else create.mockRejectedValueOnce(new Error('500 internal error'));
  }

  it.each<[Step, Step]>([
    ['invalid', 'invalid'],
    ['error', 'error'],
    ['invalid', 'error'],
    ['error', 'invalid'],
  ])('resolves to the fallback task after %s then %s, with the text as given', async (first, second) => {
    const { client, create } = stubClient();
    answer(create, first);
    answer(create, second);

    const result = await analyze({ kind: 'text', text: '  call mum ' }, { client, model: MODEL });

    expect(result).toStrictEqual(fallbackOf('  call mum '));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('has an empty description for an image', async () => {
    const { client, create } = stubClient();
    answer(create, 'error');
    answer(create, 'error');

    const result = await analyze({ kind: 'image', path: writeImage('list.webp') }, { client, model: MODEL });

    expect(result).toStrictEqual(fallbackOf(''));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not reject when the client resolves to undefined twice', async () => {
    const { client, create } = stubClient();
    create.mockResolvedValueOnce(oddReply(undefined)).mockResolvedValueOnce(oddReply(undefined));

    await expect(analyze({ kind: 'text', text }, { client, model: MODEL })).resolves.toStrictEqual(fallbackOf(text));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not make a third call, even when it would be answered', async () => {
    const { client, create } = stubClient();
    answer(create, 'invalid');
    answer(create, 'invalid');
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    const result = await analyze({ kind: 'text', text }, { client, model: MODEL });

    expect(result).toStrictEqual(fallbackOf(text));
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('analyze: an input it cannot send (AC9)', () => {
  it.each([
    ['an empty text', ''],
    ['spaces', '   '],
    ['a newline and a tab', '\n\t'],
  ])('refuses %s before any call', async (_name, blank) => {
    const { client, create } = stubClient();

    const error = await rejectionOf(analyze({ kind: 'text', text: blank }, { client, model: MODEL }));

    expect(error).toBeInstanceOf(AnalyzerInputError);
    expect((error as Error).message).toBe('The text to analyze is blank.');
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an image path with no file behind it', async () => {
    const { client, create } = stubClient();
    const file = path.join(folder, 'nothing.png');

    const error = await rejectionOf(analyze({ kind: 'image', path: file }, { client, model: MODEL }));

    expect(error).toBeInstanceOf(AnalyzerInputError);
    expect((error as Error).message).toBe(`The image file "${file}" cannot be read.`);
    expect((error as Error).cause).toHaveProperty('code', 'ENOENT');
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a folder with the name of an image', async () => {
    const { client, create } = stubClient();
    const file = path.join(folder, 'shots.png');
    mkdirSync(file);

    const error = await rejectionOf(analyze({ kind: 'image', path: file }, { client, model: MODEL }));

    expect(error).toBeInstanceOf(AnalyzerInputError);
    expect((error as Error).message).toBe(`The image file "${file}" cannot be read.`);
    expect(create).not.toHaveBeenCalled();
  });

  it.each(['list.jpeg', 'list.heic', 'list.txt', 'list', 'list.png.txt'])(
    'refuses the existing file %s, which has none of the four extensions',
    async (name) => {
      const { client, create } = stubClient();
      const file = writeImage(name);

      const error = await rejectionOf(analyze({ kind: 'image', path: file }, { client, model: MODEL }));

      expect(error).toBeInstanceOf(AnalyzerInputError);
      expect((error as Error).message).toBe(`"${file}" is not a .jpg, .png, .webp or .gif file.`);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('checks the extension before it looks for the file', async () => {
    const { client, create } = stubClient();
    const file = path.join(folder, 'nothing.bmp');

    const error = await rejectionOf(analyze({ kind: 'image', path: file }, { client, model: MODEL }));

    expect(error).toBeInstanceOf(AnalyzerInputError);
    expect((error as Error).message).toBe(`"${file}" is not a .jpg, .png, .webp or .gif file.`);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects with an Error named AnalyzerInputError', () => {
    const error = new AnalyzerInputError('The text to analyze is blank.');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AnalyzerInputError');
  });
});

describe('createAnalyzerClient (AC10)', () => {
  it("is the SDK's client, with the key it was handed", () => {
    const client = createAnalyzerClient('test-key');

    expect(client).toBeInstanceOf(Anthropic);
    expect(client).toHaveProperty('apiKey', 'test-key');
  });
});
