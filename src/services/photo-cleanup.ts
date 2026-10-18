import type { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Database } from '../db/database.ts';
import { listImagePaths, removeStalePhotoSources } from '../db/sources.ts';
import { photoFile, removePhoto } from './photo-storage.ts';

/*
 * The cleanup of photos no task came from: a Discard on the review page, or the delete
 * of every task of a photo, leaves its source and its file behind. Voice and text
 * sources are kept.
 */

/** How old a photo source with no task, or a file no row names, must be to be removed: 24 hours. */
export const PHOTO_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** How often the starter runs the cleanup: every hour. */
export const CLEANUP_EVERY_MS = 60 * 60 * 1000;

/** What a run removed: the ids of the sources, and the names of the files no row named. */
export interface CleanupResult {
  sources: number[];
  orphans: string[];
}

export type PhotoCleanup = (db: Database, uploadsDir: string, now: Date) => Promise<CleanupResult>;

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

function remove(file: string): Promise<void> {
  return new Promise<void>((resolve) => removePhoto(file, resolve));
}

/**
 * Removes each photo source with no task created more than 24 hours before `now`, with
 * its file, then each file in `uploadsDir` that no source or task names and that was
 * last changed more than 24 hours before `now`. A missing file or folder is no error.
 */
export const runPhotoCleanup: PhotoCleanup = async (db, uploadsDir, now) => {
  const cutoff = now.getTime() - PHOTO_MAX_AGE_MS;

  const removed = removeStalePhotoSources(db, new Date(cutoff).toISOString());
  for (const source of removed) {
    if (source.image_path !== null) await remove(photoFile(uploadsDir, source.image_path));
  }

  const named = new Set(listImagePaths(db).map((imagePath) => path.posix.basename(imagePath)));
  let entries: Dirent[];
  try {
    entries = await readdir(uploadsDir, { withFileTypes: true });
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error;
    entries = [];
  }

  const orphans: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || named.has(entry.name)) continue;
    const file = path.join(uploadsDir, entry.name);
    let modified: number;
    try {
      modified = (await lstat(file)).mtimeMs;
    } catch (error) {
      if (hasCode(error, 'ENOENT')) continue;
      throw error;
    }
    if (modified < cutoff) {
      await remove(file);
      orphans.push(entry.name);
    }
  }

  return { sources: removed.map((source) => source.id), orphans };
};

/**
 * Runs the cleanup once at the time it is called, and again every hour. Returns a
 * function that stops it. `src/server.ts` calls it once after it opens the database;
 * `createApp` does not, so the app's tests are not affected. A failed run is logged.
 */
export function startPhotoCleanup(
  db: Database,
  uploadsDir: string,
  cleanup: PhotoCleanup = runPhotoCleanup,
): () => void {
  const run = (): void => {
    cleanup(db, uploadsDir, new Date()).catch((error: unknown) => {
      console.error('The photo cleanup failed:', error);
    });
  };
  run();
  const timer = setInterval(run, CLEANUP_EVERY_MS);
  return () => clearInterval(timer);
}
