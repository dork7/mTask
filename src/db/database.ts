import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations.ts';

/*
 * `src/db/` is the only folder that imports the driver. Code outside it imports the
 * type `Database` from here and calls the helpers.
 *
 * Of the driver, use only: `new DatabaseSync(path)`, `exec`, `prepare`, `close` and
 * `isOpen`, and on a statement `run`, `get` and `all`. These exist in every Node
 * version `package.json` allows; the types offer newer calls that do not.
 *
 * Bind parameters by position (`?`), never by name: a named parameter missing from
 * the object is bound as NULL without an error.
 */

/** An open database. Every helper takes one as its first argument. */
export type Database = DatabaseSync;

/** SQLite's name for a database that lives in memory and is gone when it is closed. */
const MEMORY_DATABASE = ':memory:';

/**
 * Opens the database in `file`, creating the file, its folder and the schema when they
 * are missing. `file` is an absolute path or `:memory:`; anything else throws before a
 * file is created, because a relative path would land in whatever folder the process
 * was started from. The path the app uses comes from `getDatabasePath()` in
 * `src/config.ts`.
 *
 * Open the database once at start-up and pass the handle down. The caller closes it.
 */
export function openDatabase(file: string): Database {
  const inMemory = file === MEMORY_DATABASE;
  if (!inMemory && !path.isAbsolute(file)) {
    throw new Error(`The database path must be absolute or "${MEMORY_DATABASE}", got "${file}"`);
  }
  if (!inMemory) mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  try {
    // Foreign keys are enforced per connection, so this runs on every open.
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
