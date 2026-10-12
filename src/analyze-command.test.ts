import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_API_KEY, runAnalyzeCommand, USAGE, type AnalyzeCommandDeps } from './analyze-command.ts';
import type { AnalyzedTask, Analysis, AnalyzerClient, AnalyzerReply } from './services/analyzer.ts';

/*
 * The command runs with a stubbed client. A test that reaches `fetch` fails in
 * `afterEach`.
 */

type Create = AnalyzerClient['messages']['create'];

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

/** Not valid UTF-8, so a file read as text does not give these bytes back. */
const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10, 0x80, 0xfe]);

function reply(value: unknown): AnalyzerReply {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
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

let folder = '';
let expectedFetchCalls = 0;
const fetchSpy = vi.fn<typeof fetch>();
const create = vi.fn<Create>();

function writeFile(name: string, bytes: Buffer = imageBytes): string {
  const file = path.join(folder, name);
  writeFileSync(file, bytes);
  return file;
}

/** Runs the command with a key, the test model and the stubbed client, unless `overrides` says otherwise. */
async function run(args: string[], overrides: Partial<AnalyzeCommandDeps> = {}) {
  const client: AnalyzerClient = { messages: { create } };
  const createClient = vi.fn<AnalyzeCommandDeps['createClient']>(() => client);
  const output = { stdout: '', stderr: '' };

  const code = await runAnalyzeCommand(args, {
    apiKey: 'test-key',
    model: 'claude-test-model',
    createClient,
    write: (text) => {
      output.stdout += text;
    },
    writeError: (text) => {
      output.stderr += text;
    },
    ...overrides,
  });

  return { code, ...output, createClient };
}

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'mtask-analyzer-'));
  expectedFetchCalls = 0;
  fetchSpy.mockRejectedValue(new Error('A test tried to reach the network'));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
  create.mockReset();

  const fetchCalls = fetchSpy.mock.calls.length;
  vi.unstubAllGlobals();
  fetchSpy.mockReset();
  expect(fetchCalls).toBe(expectedFetchCalls);
});

describe('runAnalyzeCommand: the result (AC11)', () => {
  it('analyzes an image file and prints the result as JSON on stdout', async () => {
    create.mockResolvedValueOnce(reply({ tasks: [milk, bug] }));
    const file = writeFile('list.png');

    const { code, stdout, stderr, createClient } = await run([file]);

    expect(code).toBe(0);
    expect(stdout).toBe(JSON.stringify({ tasks: [milk, bug], fallback: false }, null, 2) + '\n');
    expect(stderr).toBe('');
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient.mock.calls[0]).toEqual(['test-key']);

    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0][0];
    expect(request.model).toBe('claude-test-model');

    const { content } = request.messages[0];
    if (!Array.isArray(content)) throw new Error('The content of the message is not an array');
    const images = content.filter((block) => block.type === 'image');
    expect(images).toHaveLength(1);
    expect(images[0].source).toStrictEqual({
      type: 'base64',
      media_type: 'image/png',
      data: imageBytes.toString('base64'),
    });
  });

  it.each([
    ['--text and the text', ['--text', 'buy milk']],
    ['--text=<text>', ['--text=buy milk']],
  ])('analyzes a text given as %s', async (_name, args) => {
    create.mockResolvedValueOnce(reply({ tasks: [milk] }));

    const { code, stdout, stderr } = await run(args);

    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toStrictEqual({ tasks: [milk], fallback: false });
    expect(stderr).toBe('');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].messages[0].content).toStrictEqual([{ type: 'text', text: 'buy milk' }]);
  });

  it('prints the fallback, and exits with 0, when both attempts fail', async () => {
    create.mockRejectedValueOnce(new Error('500')).mockRejectedValueOnce(new Error('500'));

    const { code, stdout, stderr } = await run(['--text', 'buy milk']);

    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toStrictEqual(fallbackOf('buy milk'));
    expect(stderr).toBe('');
  });
});

describe('runAnalyzeCommand: without a key (AC11)', () => {
  it.each([
    ['a text', () => ['--text', 'buy milk']],
    ['an image file', () => [writeFile('list.png')]],
    ['no arguments', () => []],
    ['an unknown option', () => ['--nope']],
  ])('exits with 1 and makes no client, for %s', async (_name, args) => {
    const { code, stdout, stderr, createClient } = await run(args(), { apiKey: undefined });

    expect(code).toBe(1);
    expect(stderr).toBe('ANTHROPIC_API_KEY is not set.\n');
    expect(stdout).toBe('');
    expect(createClient).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('NO_API_KEY is that message', () => {
    expect(NO_API_KEY).toBe('ANTHROPIC_API_KEY is not set.');
  });
});

describe('runAnalyzeCommand: the arguments (AC11)', () => {
  it.each([
    ['no arguments', []],
    ['two files', ['a.png', 'b.png']],
    ['a text and a file', ['--text', 'buy milk', 'a.png']],
    ['--text with no value', ['--text']],
    ['an unknown option', ['--nope']],
  ])('exits with 1 and the usage for %s', async (_name, args) => {
    const { code, stdout, stderr, createClient } = await run(args);

    expect(code).toBe(1);
    expect(stderr).toBe(USAGE + '\n');
    expect(stdout).toBe('');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('the usage names both forms', () => {
    expect(USAGE).toContain('yarn analyze <image file>');
    expect(USAGE).toContain('yarn analyze --text "<text>"');
  });

  it.each([
    ['a blank text', () => ['--text', '   '], () => 'The text to analyze is blank.'],
    [
      'an image file that does not exist',
      () => [path.join(folder, 'nothing.png')],
      () => `The image file "${path.join(folder, 'nothing.png')}" cannot be read.`,
    ],
    [
      'a file that is no image',
      () => [writeFile('notes.txt')],
      () => `"${path.join(folder, 'notes.txt')}" is not a .jpg, .png, .webp or .gif file.`,
    ],
  ])('exits with 1 and the reason for %s', async (_name, args, message) => {
    const { code, stdout, stderr } = await run(args());

    expect(code).toBe(1);
    expect(stderr).toBe(message() + '\n');
    expect(stdout).toBe('');
    expect(create).not.toHaveBeenCalled();
  });

  it('does not catch an error that is no refused input', async () => {
    const boom = new Error('boom');
    const output = { stdout: '' };

    const running = run(['--text', 'buy milk'], {
      createClient: () => {
        throw boom;
      },
      write: (text) => {
        output.stdout += text;
      },
    });

    await expect(running).rejects.toBe(boom);
    expect(output.stdout).toBe('');
  });
});
