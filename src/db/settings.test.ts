import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './database.ts';
import { getSetting, setSetting, type SettingKey, type SlotRule } from './settings.ts';

let dir: string;
let opened: Database[];

/** Opens a database that `afterEach` closes. */
function open(file: string): Database {
  const db = openDatabase(file);
  opened.push(db);
  return db;
}

function workingHoursRows(db: Database): unknown[] {
  return db.prepare("SELECT value FROM settings WHERE key = 'working_hours'").all();
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

describe('getSetting and setSetting (AC6)', () => {
  it('a new database has the working hours 09:00 to 22:00', () => {
    const db = open(':memory:');

    expect(getSetting(db, 'working_hours')).toStrictEqual({ start: '09:00', end: '22:00' });
  });

  it('setSetting replaces the value under its key', () => {
    const db = open(':memory:');

    setSetting(db, 'working_hours', { start: '08:00', end: '20:00' });

    expect(getSetting(db, 'working_hours')).toStrictEqual({ start: '08:00', end: '20:00' });
    expect(workingHoursRows(db)).toEqual([{ value: '{"start":"08:00","end":"20:00"}' }]);
  });

  it('setSetting stores a key that is not there yet', () => {
    const db = open(':memory:');
    db.exec('DELETE FROM settings');

    setSetting(db, 'working_hours', { start: '07:30', end: '19:00' });

    expect(getSetting(db, 'working_hours')).toStrictEqual({ start: '07:30', end: '19:00' });
    expect(workingHoursRows(db)).toHaveLength(1);
  });

  it('getSetting returns undefined for a key that does not exist', () => {
    const db = open(':memory:');

    expect(getSetting(db, 'no_such_setting' as SettingKey)).toBeUndefined();
  });

  it('opening the database again does not overwrite a value that was changed', () => {
    const file = path.join(dir, 'app.db');
    const first = open(file);
    setSetting(first, 'working_hours', { start: '08:00', end: '20:00' });
    first.close();

    const second = open(file);

    expect(getSetting(second, 'working_hours')).toStrictEqual({ start: '08:00', end: '20:00' });
    expect(second.prepare('SELECT key FROM settings ORDER BY key').all()).toEqual([
      { key: 'slot_rules' },
      { key: 'working_hours' },
    ]);
  });
});

/** The rules a new database has, written out here and not read from the code. */
const SEEDED = [
  { category: 'coding', time_slot: 'morning', start: '09:00', end: '11:00' },
  { category: 'shopping', time_slot: 'night', start: '20:00', end: '22:00' },
];

describe('the slot_rules setting (008 AC1)', () => {
  it('a new database in memory has the two seeded rules, coding first', () => {
    const db = open(':memory:');

    const rules: SlotRule[] | undefined = getSetting(db, 'slot_rules');

    expect(rules).toStrictEqual(SEEDED);
  });

  it('a new database in a file has the same, stored as the JSON of the two rules', () => {
    const db = open(path.join(dir, 'app.db'));

    expect(getSetting(db, 'slot_rules')).toStrictEqual(SEEDED);
    expect(db.prepare("SELECT value FROM settings WHERE key = 'slot_rules'").all()).toEqual([
      { value: JSON.stringify(SEEDED) },
    ]);
  });

  it('setSetting replaces the rules and leaves the working hours as they were', () => {
    const db = open(':memory:');
    const rule: SlotRule = { category: 'coding', time_slot: 'afternoon', start: '13:00', end: '15:00' };

    setSetting(db, 'slot_rules', [rule]);

    expect(getSetting(db, 'slot_rules')).toStrictEqual([rule]);
    expect(getSetting(db, 'working_hours')).toStrictEqual({ start: '09:00', end: '22:00' });
  });

  it('setSetting is typed for the rules: a value of another shape does not compile', () => {
    const db = open(':memory:');

    // @ts-expect-error The value of slot_rules is a list of rules, not one object.
    setSetting(db, 'slot_rules', { category: 'coding', time_slot: 'morning', start: '09:00', end: '11:00' });
    // @ts-expect-error 'dawn' is no slot of src/ui.ts.
    setSetting(db, 'slot_rules', [{ category: 'coding', time_slot: 'dawn', start: '09:00', end: '11:00' }]);
    // @ts-expect-error A rule has a start and an end.
    setSetting(db, 'slot_rules', [{ category: 'coding', time_slot: 'morning' }]);

    expect(db.prepare('SELECT key FROM settings ORDER BY key').all()).toEqual([
      { key: 'slot_rules' },
      { key: 'working_hours' },
    ]);
  });
});
