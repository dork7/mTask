import type { Database } from './database.ts';

/*
 * The schema, as a list of steps. `PRAGMA user_version` in the database file holds the
 * number of steps already applied to it.
 *
 * A migration that has been merged is never edited: a database created next month
 * must get the same tables as one created today. To change the schema, append a
 * migration. This is also why the allowed values below are written out and not built
 * from `src/ui.ts`; `schema.test.ts` fails when the two drift apart.
 *
 * Every constraint has a name, and SQLite puts that name in its error message.
 * A timestamp column holds what `Date.prototype.toISOString()` returns; the GLOB
 * checks that shape (see `timestamps.ts`).
 */
export const migrations: readonly string[] = [
  // 1: tasks, the sources they were extracted from, settings, and the working hours.
  `
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  image_path TEXT,
  transcript TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT sources_kind CHECK (kind IN ('photo', 'voice', 'text')),
  CONSTRAINT sources_content CHECK (
    (kind = 'photo' AND image_path IS NOT NULL) OR (kind <> 'photo' AND transcript IS NOT NULL)
  ),
  CONSTRAINT sources_created_at CHECK (created_at GLOB '????-??-??T??:??:??.???Z')
) STRICT;

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  image_path TEXT,
  category TEXT,
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  priority TEXT,
  time_slot TEXT,
  scheduled_start TEXT,
  scheduled_end TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  started_at TEXT,
  completed_at TEXT,
  reminder_at TEXT,
  recurrence_rule TEXT,
  parent_task_id INTEGER REFERENCES tasks (id) ON DELETE SET NULL,
  source_id INTEGER REFERENCES sources (id) ON DELETE RESTRICT,
  confidence REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT tasks_status CHECK (status IN ('draft', 'pending', 'in_progress', 'done')),
  CONSTRAINT tasks_priority CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  CONSTRAINT tasks_time_slot CHECK (time_slot IN ('morning', 'afternoon', 'evening', 'night')),
  CONSTRAINT tasks_confidence CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT tasks_scheduled_start CHECK (scheduled_start GLOB '????-??-??T??:??:??.???Z'),
  CONSTRAINT tasks_scheduled_end CHECK (scheduled_end GLOB '????-??-??T??:??:??.???Z'),
  CONSTRAINT tasks_started_at CHECK (started_at GLOB '????-??-??T??:??:??.???Z'),
  CONSTRAINT tasks_completed_at CHECK (completed_at GLOB '????-??-??T??:??:??.???Z'),
  CONSTRAINT tasks_reminder_at CHECK (reminder_at GLOB '????-??-??T??:??:??.???Z'),
  CONSTRAINT tasks_created_at CHECK (created_at GLOB '????-??-??T??:??:??.???Z'),
  CONSTRAINT tasks_updated_at CHECK (updated_at GLOB '????-??-??T??:??:??.???Z')
) STRICT;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  CONSTRAINT settings_value CHECK (json_valid(value))
) STRICT;

INSERT INTO settings (key, value) VALUES ('working_hours', '{"start":"09:00","end":"22:00"}');
`,
  // 2: the slot rules: the part of the day a category of task belongs to.
  `
INSERT INTO settings (key, value) VALUES ('slot_rules', '[{"category":"coding","time_slot":"morning","start":"09:00","end":"11:00"},{"category":"shopping","time_slot":"night","start":"20:00","end":"22:00"}]');
`,
  // 3: when a reminder was fired, so the job does not fire it twice (018).
  `
ALTER TABLE tasks ADD COLUMN reminded_at TEXT CONSTRAINT tasks_reminded_at CHECK (reminded_at GLOB '????-??-??T??:??:??.???Z');
`,
];

/**
 * Brings the schema up to date: applies the migrations the database does not have
 * yet, in order, each in its own transaction. A database that is up to date is only
 * read, never written. Throws when the database was written by newer code, and when
 * a migration fails; a failed migration leaves the database as it was before it.
 */
export function migrate(db: Database, list: readonly string[] = migrations): void {
  const applied = readVersion(db);
  if (applied > list.length) {
    throw new Error(
      `The database is at schema version ${applied}, but this code knows only ${list.length}. It was written by a newer version of the app.`,
    );
  }

  for (let index = applied; index < list.length; index += 1) {
    db.exec('BEGIN');
    try {
      db.exec(list[index]);
      // A PRAGMA takes no bound parameter. The value is a loop counter, never input.
      db.exec(`PRAGMA user_version = ${index + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      rollBack(db);
      throw error;
    }
  }
}

/** The number of migrations already applied. A new file has 0. */
function readVersion(db: Database): number {
  const row = db.prepare('PRAGMA user_version').get();
  return Number(row?.user_version ?? 0);
}

/**
 * Ends the transaction a failed migration left open. SQLite has already ended it
 * itself after some errors; then ROLLBACK fails, and the migration's own error is the
 * one worth reporting.
 */
function rollBack(db: Database): void {
  try {
    db.exec('ROLLBACK');
  } catch {
    // No transaction is open any more, which is the state this function is for.
  }
}
