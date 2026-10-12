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

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
