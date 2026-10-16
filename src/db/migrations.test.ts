import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './database.ts';
import { migrate, migrations } from './migrations.ts';
import { getSetting, setSetting, type SlotRule } from './settings.ts';
import { createTask, getTask } from './tasks.ts';

/** SHA-256 of the text of migration 1 as it was merged by 003. It never changes. */
const MIGRATION_1_SHA256 = 'b9c464e43fd295f55123aacd8dd23c72b6375f3a6631168d745b3add10c5a934';

/** The rules a new database has, written out here and not read from the code. */
const SEEDED = [
  { category: 'coding', time_slot: 'morning', start: '09:00', end: '11:00' },
  { category: 'shopping', time_slot: 'night', start: '20:00', end: '22:00' },
];

let dir: string;
let opened: Database[];

/** Opens a migrated database that `afterEach` closes. */
function open(file: string): Database {
  const db = openDatabase(file);
  opened.push(db);
  return db;
}

/** A database file as the code before this job left it: migration 1 and no other. */
function versionOne(file: string): Database {
  const db = new DatabaseSync(file);
  opened.push(db);
  migrate(db, migrations.slice(0, 1));
  return db;
}

function userVersion(db: Database): unknown {
  return db.prepare('PRAGMA user_version').get()?.user_version;
}

function settingKeys(db: Database): unknown[] {
  return db
    .prepare('SELECT key FROM settings ORDER BY key')
    .all()
    .map((row) => row.key);
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

describe('the migration that adds the slot rules (008 AC2)', () => {
  it('leaves migration 1 as it was merged', () => {
    expect(createHash('sha256').update(migrations[0]).digest('hex')).toBe(MIGRATION_1_SHA256);
  });

  it('is one of three migrations', () => {
    expect(migrations).toHaveLength(3);
  });

  it('is not part of migration 1: a database with migration 1 only has no slot rules', () => {
    const db = versionOne(path.join(dir, 'app.db'));

    expect(userVersion(db)).toBe(1);
    expect(getSetting(db, 'slot_rules')).toBeUndefined();
    expect(settingKeys(db)).toEqual(['working_hours']);
  });

  it('gives a version 1 database the rules and keeps its working hours and its tasks', () => {
    const file = path.join(dir, 'app.db');
    const before = versionOne(file);
    setSetting(before, 'working_hours', { start: '08:00', end: '20:00' });
    const task = createTask(before, { title: 'Buy milk', time_slot: 'evening' });
    before.close();

    const db = open(file);

    expect(userVersion(db)).toBe(3);
    expect(getSetting(db, 'slot_rules')).toStrictEqual(SEEDED);
    expect(getSetting(db, 'working_hours')).toStrictEqual({ start: '08:00', end: '20:00' });
    expect(getTask(db, task.id)).toStrictEqual(task);
    expect(settingKeys(db)).toEqual(['slot_rules', 'working_hours']);
  });

  it('does not overwrite rules that were changed when the database is opened again', () => {
    const file = path.join(dir, 'app.db');
    const changed: SlotRule[] = [{ category: 'coding', time_slot: 'afternoon', start: '13:00', end: '15:00' }];
    const first = open(file);
    setSetting(first, 'slot_rules', changed);
    first.close();

    const second = open(file);

    expect(getSetting(second, 'slot_rules')).toStrictEqual(changed);
    expect(userVersion(second)).toBe(3);
  });

  it('does not bring back rules that were emptied or deleted when the database is opened again', () => {
    const file = path.join(dir, 'app.db');
    const first = open(file);
    setSetting(first, 'slot_rules', []);
    first.close();

    const second = open(file);
    expect(getSetting(second, 'slot_rules')).toStrictEqual([]);
    second.prepare("DELETE FROM settings WHERE key = 'slot_rules'").run();
    second.close();

    const third = open(file);
    expect(getSetting(third, 'slot_rules')).toBeUndefined();
    expect(settingKeys(third)).toEqual(['working_hours']);
  });
});
