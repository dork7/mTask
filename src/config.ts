import path from 'node:path';
import { rootDir } from './paths.ts';

/*
 * The only file under `src/` that reads an environment variable. Every name read
 * here must also be a key in `.env.example`.
 */

export const DEFAULT_PORT = 3000;

const MAX_PORT = 65535;

/**
 * Loads a `.env` file into `process.env`. A variable that is already set keeps its
 * value, so `PORT=4000 yarn dev` beats the file. A missing file is not an error.
 */
export function loadEnv(file: string = path.join(rootDir, '.env')): void {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if (isMissingFile(error)) return;
    throw error;
  }
}

/**
 * The port to listen on: `PORT` when it is an integer from 1 to 65535, and
 * `DEFAULT_PORT` when it is unset or blank. Any other value throws, so a typo in
 * `.env` is not hidden behind the default.
 */
export function getPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PORT?.trim() ?? '';
  if (raw === '') return DEFAULT_PORT;

  const port = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`PORT must be an integer from 1 to ${MAX_PORT}, got "${env.PORT}"`);
  }
  return port;
}

/** SQLite's name for a database that lives in memory and is gone when it is closed. */
const MEMORY_DATABASE = ':memory:';

/**
 * The file the database lives in: `DATABASE_PATH`, or `data/app.db` when it is unset
 * or blank. A relative value starts at the repo root, never at the working folder.
 * `:memory:` is returned as it is.
 */
export function getDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.DATABASE_PATH?.trim() ?? '';
  if (raw === '') return path.join(rootDir, 'data', 'app.db');
  if (raw === MEMORY_DATABASE) return raw;
  return path.resolve(rootDir, raw);
}

/**
 * The folder uploaded photos are stored in: `UPLOADS_DIR`, or `data/uploads` when it is
 * unset or blank. A relative value starts at the repo root, never at the working folder.
 */
export function getUploadsDir(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.UPLOADS_DIR?.trim() ?? '';
  if (raw === '') return path.join(rootDir, 'data', 'uploads');
  return path.resolve(rootDir, raw);
}

/** The Claude model the analyzer asks when `ANTHROPIC_MODEL` does not name one. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

/**
 * The key the analyzer reaches the Anthropic API with: `ANTHROPIC_API_KEY`, or
 * `undefined` when it is unset or blank. It never throws, so the server starts without a
 * key and the caller decides what a missing key means.
 */
export function getAnthropicApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.ANTHROPIC_API_KEY?.trim() ?? '';
  return raw === '' ? undefined : raw;
}

/** The model the analyzer asks: `ANTHROPIC_MODEL`, or `DEFAULT_ANTHROPIC_MODEL` when it is unset or blank. */
export function getAnthropicModel(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.ANTHROPIC_MODEL?.trim() ?? '';
  return raw === '' ? DEFAULT_ANTHROPIC_MODEL : raw;
}

/** The three values the server signs Web Push with, as `VAPID_*` hold them. */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * The VAPID keys of the environment: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
 * `VAPID_SUBJECT`, trimmed, when all three are non-blank; `undefined` when any is unset
 * or blank. It never throws, so a server without the three starts and cannot push.
 */
export function getVapidKeys(env: NodeJS.ProcessEnv = process.env): VapidKeys | undefined {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? '';
  const subject = env.VAPID_SUBJECT?.trim() ?? '';
  if (publicKey === '' || privateKey === '' || subject === '') return undefined;
  return { publicKey, privateKey, subject };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
