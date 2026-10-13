import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rootDir } from '../paths.ts';
import { openDatabase, type Database } from './database.ts';
import { migrate, migrations } from './migrations.ts';
import { createSource, getSource } from './sources.ts';
import { createTask, getTask } from './tasks.ts';

const tables = ['settings', 'sources', 'tasks'];

let dir: string;
let opened: Database[];

/** Opens a migrated database that `afterEach` closes. */
function open(file: string): Database {
  const db = openDatabase(file);
  opened.push(db);
  return db;
}

/** Opens a database with no schema, at version 0, that `afterEach` closes. */
function openBlank(): Database {
  const db = new DatabaseSync(':memory:');
  opened.push(db);
  return db;
}

function tableNames(db: Database): unknown[] {
  return db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function userVersion(db: Database): unknown {
  return db.prepare('PRAGMA user_version').get()?.user_version;
}

function count(db: Database, table: string): unknown {
  return db.prepare(`SELECT COUNT(*) AS rows FROM ${table}`).get()?.rows;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mtask-db-'));
  opened = [];
});

afterEach(() => {
  for (const db of opened) {
    if (db.isOpen) db.close();
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('openDatabase (AC1)', () => {
  it('creates the folders, the file and the schema when they are missing', () => {
    const file = path.join(dir, 'not', 'there', 'app.db');

    const db = open(file);

    expect(existsSync(file)).toBe(true);
    expect(tableNames(db)).toEqual(tables);
    expect(migrations.length).toBeGreaterThan(0);
    expect(userVersion(db)).toBe(migrations.length);
  });

  it('creates the schema in a file that exists and is empty', () => {
    const file = path.join(dir, 'app.db');
    writeFileSync(file, '');

    const db = open(file);

    expect(tableNames(db)).toEqual(tables);
    expect(userVersion(db)).toBe(migrations.length);
  });

  it('changes nothing in the file when it is opened again', () => {
    const file = path.join(dir, 'app.db');
    open(file).close();
    const before = readFileSync(file);

    open(file).close();

    expect(before.length).toBeGreaterThan(0);
    expect(readFileSync(file).equals(before)).toBe(true);
    expect(readdirSync(dir)).toEqual(['app.db']);
  });

  it('keeps the rows of an earlier open, and a later open adds none', () => {
    const file = path.join(dir, 'app.db');
    const first = open(file);
    const source = createSource(first, { kind: 'photo', image_path: 'uploads/a.jpg' });
    const task = createTask(first, { title: 'Buy milk', source_id: source.id });
    first.close();

    const second = open(file);

    expect(getSource(second, source.id)).toStrictEqual(source);
    expect(getTask(second, task.id)).toStrictEqual(task);
    expect(count(second, 'tasks')).toBe(1);
    expect(count(second, 'sources')).toBe(1);
    expect(count(second, 'settings')).toBe(2);
  });

  it('opens a database in memory with the schema', () => {
    const db = open(':memory:');

    expect(tableNames(db)).toEqual(tables);
    expect(userVersion(db)).toBe(migrations.length);
  });

  it('refuses a file written by newer code and leaves it as it is', () => {
    const file = path.join(dir, 'app.db');
    const db = open(file);
    db.exec(`PRAGMA user_version = ${migrations.length + 1}`);
    db.close();
    const before = readFileSync(file);

    expect(() => open(file)).toThrow(/newer/);

    expect(readFileSync(file).equals(before)).toBe(true);
  });
});

describe('openDatabase refuses a path that depends on the working folder (AC1, AC8)', () => {
  // A relative path would be opened in the working folder, which is the repo when the
  // tests run. If the refusal is ever lost, the file it made is removed again.
  const stray = path.resolve('relative.db');
  let strayExisted: boolean;

  beforeEach(() => {
    strayExisted = existsSync(stray);
  });

  afterEach(() => {
    if (!strayExisted) rmSync(stray, { force: true });
  });

  it('throws for a relative path and creates no file', () => {
    expect(strayExisted).toBe(false);

    expect(() => open('relative.db')).toThrow('relative.db');

    expect(existsSync(stray)).toBe(false);
  });

  it('throws for an empty path', () => {
    expect(() => open('')).toThrow(/absolute/);
  });
});

describe('migrate (AC1)', () => {
  const first = 'CREATE TABLE one (id INTEGER PRIMARY KEY, name TEXT)';
  const second = "CREATE TABLE two (id INTEGER PRIMARY KEY); INSERT INTO one (name) VALUES ('from the second')";

  it('applies every migration of a new database, in order, and counts them', () => {
    const db = openBlank();
    expect(userVersion(db)).toBe(0);

    migrate(db, [first, second]);

    expect(tableNames(db)).toEqual(['one', 'two']);
    expect(db.prepare('SELECT name FROM one').all()).toEqual([{ name: 'from the second' }]);
    expect(userVersion(db)).toBe(2);
  });

  it('runs nothing when the database is up to date', () => {
    const db = openBlank();
    migrate(db, [first, second]);

    // Running either again would fail: both tables exist.
    migrate(db, [first, second]);

    expect(db.prepare('SELECT name FROM one').all()).toEqual([{ name: 'from the second' }]);
    expect(userVersion(db)).toBe(2);
  });

  it('runs only the migrations the database does not have yet', () => {
    const db = openBlank();
    migrate(db, [first]);
    expect(userVersion(db)).toBe(1);

    // The first entry is not SQL, so this throws if the runner starts from the top.
    migrate(db, ['this was applied already and must not run again', second]);

    expect(tableNames(db)).toEqual(['one', 'two']);
    expect(userVersion(db)).toBe(2);
  });

  it('undoes a migration that fails, and leaves no transaction open', () => {
    const db = openBlank();
    const failing = 'CREATE TABLE two (id INTEGER PRIMARY KEY); INSERT INTO no_such_table (id) VALUES (1)';

    expect(() => migrate(db, [first, failing])).toThrow('no_such_table');

    expect(userVersion(db)).toBe(1);
    expect(tableNames(db)).toEqual(['one']);
    expect(() => db.exec('BEGIN')).not.toThrow();
    db.exec('ROLLBACK');
  });

  it('throws when the database has more migrations than the list', () => {
    const db = openBlank();
    migrate(db, [first, second]);

    expect(() => migrate(db, [first])).toThrow(/newer/);

    expect(userVersion(db)).toBe(2);
  });
});

/** How long the plain-Node child may take to load the modules and exit. */
const LOAD_TIMEOUT_MS = 10_000;

/** Why a child process did not exit with code 0: it was stopped, or what it wrote to stderr. */
function describeFailure(result: SpawnSyncReturns<string>): string {
  if (result.error) return `the child process did not finish: ${result.error.message}`;
  if (result.signal) return `the child process was stopped by ${result.signal}`;
  return result.stderr;
}

describe('the database modules in plain Node (AC8)', () => {
  // Vitest transforms TypeScript; Node, the runtime of the dev command, only strips the
  // types. The database is left open on purpose: an open handle must not keep the
  // process alive. Stderr is not asserted, it holds Node's warning about node:sqlite.
  it(
    'plain Node can load them, use a database and exit',
    () => {
      const script = `
        const { openDatabase } = await import('./src/db/database.ts');
        const { createTask } = await import('./src/db/tasks.ts');
        const { createSource } = await import('./src/db/sources.ts');
        const { getSetting } = await import('./src/db/settings.ts');

        const db = openDatabase(':memory:');
        const source = createSource(db, { kind: 'text', transcript: 'Buy milk' });
        const task = createTask(db, { title: 'Buy milk', source_id: source.id });
        const hours = getSetting(db, 'working_hours');
        if (task.status !== 'draft' || task.source_id !== source.id || hours.start !== '09:00') {
          throw new Error('unexpected rows: ' + JSON.stringify({ source, task, hours }));
        }
      `;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: rootDir,
        encoding: 'utf8',
        timeout: LOAD_TIMEOUT_MS,
      });

      expect(result.status, describeFailure(result)).toBe(0);
    },
    LOAD_TIMEOUT_MS + 5_000,
  );
});
