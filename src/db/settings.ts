import type { Database } from './database.ts';

/**
 * Every setting and the type of its value. A value is stored as JSON under its key.
 * A job that adds a setting adds its key here.
 */
export interface Settings {
  /** The hours tasks may be scheduled in: `HH:MM` on a 24-hour clock, on the user's clock. */
  working_hours: { start: string; end: string };
}

export type SettingKey = keyof Settings;

/** The value stored under this key, or `undefined` when there is none. */
export function getSetting<K extends SettingKey>(db: Database, key: K): Settings[K] | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row === undefined) return undefined;
  return JSON.parse(String(row.value)) as Settings[K];
}

/** Stores the value under this key, in place of the one that was there. */
export function setSetting<K extends SettingKey>(db: Database, key: K, value: Settings[K]): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value));
}
