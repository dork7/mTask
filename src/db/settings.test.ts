import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './database.ts';
import { getSetting, setSetting, type SettingKey } from './settings.ts';

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
    expect(second.prepare('SELECT key FROM settings').all()).toEqual([{ key: 'working_hours' }]);
  });
});
