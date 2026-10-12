import { parseArgs } from 'node:util';
import { analyze, AnalyzerInputError, type AnalyzerClient, type AnalyzerInput } from './services/analyzer.ts';

/*
 * `yarn analyze`: runs the analyzer on one image file or one text and prints the result
 * as JSON. Everything it needs is handed in, so a test runs it with a stubbed client;
 * `analyze.ts` is the entry that hands it the real ones.
 */

export const NO_API_KEY = 'ANTHROPIC_API_KEY is not set.';
export const USAGE = 'Usage: yarn analyze <image file>\n       yarn analyze --text "<text>"';

export interface AnalyzeCommandDeps {
  apiKey: string | undefined;
  model: string;
  createClient(apiKey: string): AnalyzerClient;
  /** Writes to stdout. */
  write(text: string): void;
  /** Writes to stderr. */
  writeError(text: string): void;
}

/**
 * Runs the command with these arguments and resolves to its exit code. The key is
 * checked before the arguments, so without a key no client is made and no request sent,
 * however the command is typed. An error that is not an `AnalyzerInputError` is not
 * caught.
 */
export async function runAnalyzeCommand(args: readonly string[], deps: AnalyzeCommandDeps): Promise<number> {
  if (deps.apiKey === undefined) {
    deps.writeError(`${NO_API_KEY}\n`);
    return 1;
  }

  const input = readArguments(args);
  if (input === undefined) {
    deps.writeError(`${USAGE}\n`);
    return 1;
  }

  const client = deps.createClient(deps.apiKey);
  try {
    const result = await analyze(input, { client, model: deps.model });
    deps.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (!(error instanceof AnalyzerInputError)) throw error;
    deps.writeError(`${error.message}\n`);
    return 1;
  }
}

/** The input the arguments name: one image file, or one `--text`. `undefined` for anything else. */
function readArguments(args: readonly string[]): AnalyzerInput | undefined {
  let parsed;
  try {
    parsed = parseArgs({ args: [...args], options: { text: { type: 'string' } }, allowPositionals: true });
  } catch {
    return undefined;
  }

  const { text } = parsed.values;
  const { positionals } = parsed;
  if (text !== undefined && positionals.length === 0) return { kind: 'text', text };
  if (text === undefined && positionals.length === 1) return { kind: 'image', path: positionals[0] };
  return undefined;
}
