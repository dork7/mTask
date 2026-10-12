import type { SQLOutputValue } from 'node:sqlite';
import type { Database } from './database.ts';
import { listTasks, type Task } from './tasks.ts';
import { nowTimestamp } from './timestamps.ts';

/** What a task can be extracted from. The table allows no other kind. */
export const sourceKinds = ['photo', 'voice', 'text'] as const;

export type SourceKind = (typeof sourceKinds)[number];

/** A row of `sources`: the photo or the transcript that tasks were extracted from. */
export interface Source {
  id: number;
  kind: SourceKind;
  image_path: string | null;
  transcript: string | null;
  /** A UTC ISO timestamp. */
  created_at: string;
}

/** A photo comes with its image path, a voice or text source with its transcript. */
export type NewSource = { kind: 'photo'; image_path: string } | { kind: 'voice' | 'text'; transcript: string };

/**
 * Stores a new source and returns it. Reads `kind`, `image_path` and `transcript` and
 * nothing else, and sets `created_at` from the clock. Throws the SQLite error when the
 * kind is not allowed or the content its kind needs is missing; nothing is stored then.
 */
export function createSource(db: Database, input: NewSource): Source {
  const given: { kind: SourceKind; image_path?: string; transcript?: string } = input;

  const row = db
    .prepare('INSERT INTO sources (kind, image_path, transcript, created_at) VALUES (?, ?, ?, ?) RETURNING *')
    .get(given.kind ?? null, given.image_path ?? null, given.transcript ?? null, nowTimestamp());
  if (row === undefined) throw new Error('The new source was not stored');
  return toSource(row);
}

/** The source with this id, or `undefined` when there is none. */
export function getSource(db: Database, id: number): Source | undefined {
  const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
  return row === undefined ? undefined : toSource(row);
}

/** The tasks extracted from this source, in `id` order. Empty when the id is no source. */
export function listSourceTasks(db: Database, sourceId: number): Task[] {
  return listTasks(db, { source_id: sourceId });
}

/**
 * The driver's row, which has no prototype, as a plain object. The table is STRICT, so
 * each column holds the type `Source` declares; the compiler cannot see that.
 */
function toSource(row: Record<string, SQLOutputValue>): Source {
  return { ...row } as unknown as Source;
}
