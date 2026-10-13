import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { priorities, slots } from '../ui.ts';
import { openDatabase, type Database } from './database.ts';
import { sourceKinds } from './sources.ts';
import { taskStatuses } from './tasks.ts';

/*
 * The rules of the tables themselves, tested with SQL and no helper: what holds for
 * any code that writes to the database.
 */

type Row = Record<string, SQLInputValue>;

/** A valid stored timestamp. */
const T = '2026-03-04T05:06:07.089Z';

/** The columns of a task that may not be empty and have no default. */
const validTask: Row = { title: 'Buy milk', created_at: T, updated_at: T };

/** A source with both kinds of content, so a test can vary one column at a time. */
const validSource: Row = { kind: 'photo', image_path: 'uploads/a.jpg', transcript: 'Buy milk', created_at: T };

let dir: string;
let opened: Database[];
let db: Database;

/** Opens a database that `afterEach` closes. */
function open(file: string): Database {
  const database = openDatabase(file);
  opened.push(database);
  return database;
}

/** Inserts the row with raw SQL and returns its id. */
function insert(database: Database, table: string, row: Row): number {
  const names = Object.keys(row);
  const sql = `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`;
  return Number(database.prepare(sql).run(...Object.values(row)).lastInsertRowid);
}

function count(database: Database, table: string): unknown {
  return database.prepare(`SELECT COUNT(*) AS rows FROM ${table}`).get()?.rows;
}

function columnNames(table: string): unknown[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((column) => column.name);
}

function readTask(id: number): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

/** The insert throws an error that names the constraint, and the table has no new row. */
function expectInsertRejected(database: Database, table: string, row: Row, constraint: string): void {
  const before = count(database, table);

  expect(() => insert(database, table, row)).toThrow(constraint);

  expect(count(database, table)).toBe(before);
}

/** A value and every id of the list, once each. */
function candidates(values: string[], ids: readonly string[]): string[] {
  return [...new Set([...values, ...ids])];
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mtask-db-'));
  opened = [];
  db = open(':memory:');
});

afterEach(() => {
  for (const database of opened) {
    if (database.isOpen) database.close();
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('the tasks table (AC2)', () => {
  it('has the columns of the plan, then confidence and the two timestamps', () => {
    expect(columnNames('tasks')).toEqual([
      'id',
      'title',
      'description',
      'image_path',
      'category',
      'estimated_minutes',
      'actual_minutes',
      'priority',
      'time_slot',
      'scheduled_start',
      'scheduled_end',
      'status',
      'started_at',
      'completed_at',
      'reminder_at',
      'recurrence_rule',
      'parent_task_id',
      'source_id',
      'confidence',
      'created_at',
      'updated_at',
    ]);
  });

  it('names the four statuses in taskStatuses', () => {
    expect(taskStatuses).toEqual(['draft', 'pending', 'in_progress', 'done']);
  });

  it.each(['draft', 'pending', 'in_progress', 'done'])('accepts the status %s', (status) => {
    const id = insert(db, 'tasks', { ...validTask, status });

    expect(readTask(id)?.status).toBe(status);
  });

  it.each(['nope', 'Draft', ''])('rejects the status "%s"', (status) => {
    expectInsertRejected(db, 'tasks', { ...validTask, status }, 'tasks_status');
  });

  it('rejects a task with no status at all', () => {
    expectInsertRejected(db, 'tasks', { ...validTask, status: null }, 'NOT NULL constraint failed: tasks.status');
  });

  it('gives a task the status draft when the insert leaves it out', () => {
    const id = insert(db, 'tasks', validTask);

    expect(readTask(id)?.status).toBe('draft');
  });

  it('has priorities to check against', () => {
    expect(priorities.length).toBeGreaterThan(0);
    expect(slots.length).toBeGreaterThan(0);
  });

  const priorityIds: readonly string[] = priorities.map((item) => item.id);
  it.each(candidates(['urgent', 'high', 'medium', 'low', 'nope', 'Urgent', ''], priorityIds))(
    'accepts the priority "%s" exactly when src/ui.ts has it',
    (priority) => {
      const row = { ...validTask, priority };

      if (priorityIds.includes(priority)) {
        expect(readTask(insert(db, 'tasks', row))?.priority).toBe(priority);
      } else {
        expectInsertRejected(db, 'tasks', row, 'tasks_priority');
      }
    },
  );

  const slotIds: readonly string[] = slots.map((item) => item.id);
  it.each(candidates(['morning', 'afternoon', 'evening', 'night', 'nope', 'Morning', ''], slotIds))(
    'accepts the time slot "%s" exactly when src/ui.ts has it',
    (time_slot) => {
      const row = { ...validTask, time_slot };

      if (slotIds.includes(time_slot)) {
        expect(readTask(insert(db, 'tasks', row))?.time_slot).toBe(time_slot);
      } else {
        expectInsertRejected(db, 'tasks', row, 'tasks_time_slot');
      }
    },
  );

  it('accepts a task with no priority and no time slot yet', () => {
    const id = insert(db, 'tasks', { ...validTask, priority: null, time_slot: null });

    expect(readTask(id)).toMatchObject({ priority: null, time_slot: null });
  });

  it.each([
    ['text', 'thirty'],
    ['a number that is not whole', 30.5],
  ])('rejects %s in estimated_minutes', (_name, estimated_minutes) => {
    expectInsertRejected(db, 'tasks', { ...validTask, estimated_minutes }, 'tasks.estimated_minutes');
  });

  it('stores a whole number in estimated_minutes as an integer', () => {
    const id = insert(db, 'tasks', { ...validTask, estimated_minutes: 30 });

    const row = db
      .prepare('SELECT estimated_minutes, typeof(estimated_minutes) AS type FROM tasks WHERE id = ?')
      .get(id);
    expect(row).toEqual({ estimated_minutes: 30, type: 'integer' });
  });

  it.each([0, 0.5, 1])('stores the confidence %s', (confidence) => {
    const id = insert(db, 'tasks', { ...validTask, confidence });

    expect(readTask(id)?.confidence).toBe(confidence);
  });

  it.each([1.5, -0.1, 85])('rejects the confidence %s', (confidence) => {
    expectInsertRejected(db, 'tasks', { ...validTask, confidence }, 'tasks_confidence');
  });

  it('accepts a task with no confidence', () => {
    const id = insert(db, 'tasks', { ...validTask, confidence: null });

    expect(readTask(id)?.confidence).toBeNull();
  });

  it('rejects a task with no title', () => {
    expectInsertRejected(db, 'tasks', { ...validTask, title: null }, 'NOT NULL constraint failed: tasks.title');
  });
});

describe('the sources table (AC3)', () => {
  it('has the kind, the image path or the transcript, and when it was created', () => {
    expect(columnNames('sources')).toEqual(['id', 'kind', 'image_path', 'transcript', 'created_at']);
  });

  it('names the three kinds in sourceKinds', () => {
    expect(sourceKinds).toEqual(['photo', 'voice', 'text']);
  });

  it.each([
    ['photo', { image_path: 'uploads/a.jpg', transcript: null }],
    ['voice', { image_path: null, transcript: 'Buy milk' }],
    ['text', { image_path: null, transcript: 'Buy milk' }],
  ])('accepts a %s source with the content its kind needs', (kind, content) => {
    const id = insert(db, 'sources', { ...validSource, kind, ...content });

    expect(db.prepare('SELECT * FROM sources WHERE id = ?').get(id)).toEqual({ id, kind, ...content, created_at: T });
  });

  it.each(['video', 'Photo', ''])('rejects the kind "%s"', (kind) => {
    expectInsertRejected(db, 'sources', { ...validSource, kind }, 'sources_kind');
  });

  it('rejects a photo without an image path', () => {
    expectInsertRejected(db, 'sources', { ...validSource, kind: 'photo', image_path: null }, 'sources_content');
  });

  it.each(['voice', 'text'])('rejects a %s source without a transcript', (kind) => {
    expectInsertRejected(db, 'sources', { ...validSource, kind, transcript: null }, 'sources_content');
  });

  it('rejects a source with no created_at', () => {
    expectInsertRejected(
      db,
      'sources',
      { ...validSource, created_at: null },
      'NOT NULL constraint failed: sources.created_at',
    );
  });
});

describe('foreign keys (AC3)', () => {
  /** A database in memory, a new file, and that file opened a second time. */
  function connections(): [string, Database][] {
    const file = path.join(dir, 'app.db');
    open(file).close();
    return [
      ['in memory', db],
      ['a new file', open(path.join(dir, 'new.db'))],
      ['a second open of a file', open(file)],
    ];
  }

  it('are enforced on every connection', () => {
    for (const [name, database] of connections()) {
      expect(database.prepare('PRAGMA foreign_keys').get(), name).toEqual({ foreign_keys: 1 });
    }
  });

  it('reject a task whose source does not exist', () => {
    for (const [name, database] of connections()) {
      expect(() => insert(database, 'tasks', { ...validTask, source_id: 999 }), name).toThrow(
        'FOREIGN KEY constraint failed',
      );
      expect(count(database, 'tasks'), name).toBe(0);
    }
  });

  it('reject a task whose parent task does not exist', () => {
    for (const [name, database] of connections()) {
      expect(() => insert(database, 'tasks', { ...validTask, parent_task_id: 999 }), name).toThrow(
        'FOREIGN KEY constraint failed',
      );
      expect(count(database, 'tasks'), name).toBe(0);
    }
  });

  it('accept a task whose source and parent task exist', () => {
    const source_id = insert(db, 'sources', validSource);
    const parent_task_id = insert(db, 'tasks', validTask);

    const id = insert(db, 'tasks', { ...validTask, source_id, parent_task_id });

    expect(readTask(id)).toMatchObject({ source_id, parent_task_id });
  });

  it('keep a source that a task points at from being deleted', () => {
    const source_id = insert(db, 'sources', validSource);
    insert(db, 'tasks', { ...validTask, source_id });

    expect(() => db.prepare('DELETE FROM sources WHERE id = ?').run(source_id)).toThrow(
      'FOREIGN KEY constraint failed',
    );

    expect(count(db, 'sources')).toBe(1);
  });

  it('let a source with no tasks be deleted', () => {
    const source_id = insert(db, 'sources', validSource);

    db.prepare('DELETE FROM sources WHERE id = ?').run(source_id);

    expect(count(db, 'sources')).toBe(0);
  });
});

describe('the settings table (AC6)', () => {
  it('stores a value under a key, and the key is the primary key', () => {
    const columns = db.prepare('PRAGMA table_info(settings)').all();

    expect(columns.map((column) => column.name)).toEqual(['key', 'value']);
    expect(columns.map((column) => column.pk)).toEqual([1, 0]);
  });

  it('holds the slot rules and the working hours, 09:00 to 22:00, and nothing else when it is created', () => {
    const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all();

    expect(rows.map((row) => row.key)).toEqual(['slot_rules', 'working_hours']);
    expect(JSON.parse(String(rows[1].value))).toEqual({ start: '09:00', end: '22:00' });
  });

  it('rejects a value that is not JSON', () => {
    expectInsertRejected(db, 'settings', { key: 'theme', value: 'not json' }, 'settings_value');
  });
});

describe('timestamp columns (AC7)', () => {
  it.each(['created_at', 'updated_at'])('reject a task inserted without %s', (column) => {
    const row = { ...validTask };
    delete row[column];

    expectInsertRejected(db, 'tasks', row, `NOT NULL constraint failed: tasks.${column}`);
  });

  it.each(['created_at', 'updated_at'])('reject an update that empties %s', (column) => {
    const id = insert(db, 'tasks', validTask);

    expect(() => db.prepare(`UPDATE tasks SET ${column} = NULL WHERE id = ?`).run(id)).toThrow(
      `NOT NULL constraint failed: tasks.${column}`,
    );

    expect(readTask(id)?.[column]).toBe(T);
  });

  it.each([
    'scheduled_start',
    'scheduled_end',
    'started_at',
    'completed_at',
    'reminder_at',
    'created_at',
    'updated_at',
  ])("%s of a task takes a UTC ISO string and rejects SQLite's own datetime('now')", (column) => {
    const id = insert(db, 'tasks', validTask);
    const before = readTask(id);
    const later = '2026-12-31T23:59:59.999Z';

    expect(() => db.prepare(`UPDATE tasks SET ${column} = datetime('now') WHERE id = ?`).run(id)).toThrow(
      `tasks_${column}`,
    );
    expect(readTask(id)).toEqual(before);

    db.prepare(`UPDATE tasks SET ${column} = ? WHERE id = ?`).run(later, id);
    expect(readTask(id)?.[column]).toBe(later);
  });

  it("created_at of a source rejects SQLite's own datetime('now')", () => {
    const before = count(db, 'sources');

    expect(() =>
      db
        .prepare("INSERT INTO sources (kind, transcript, created_at) VALUES ('text', 'Buy milk', datetime('now'))")
        .run(),
    ).toThrow('sources_created_at');

    expect(count(db, 'sources')).toBe(before);
  });
});
