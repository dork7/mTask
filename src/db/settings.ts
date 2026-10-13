import type { Slot } from '../ui.ts';
import type { Database } from './database.ts';

/**
 * One slot rule: a task of this category belongs to this part of the day. `start` and
 * `end` are the rule's own window, `HH:MM` on a 24-hour clock, on the user's clock.
 * `category` is a category as the analyzer names it; a rule for a name no task has
 * applies to nothing.
 */
export interface SlotRule {
  category: string;
  time_slot: Slot;
  start: string;
  end: string;
}

/**
 * Every setting and the type of its value. A value is stored as JSON under its key.
 * A job that adds a setting adds its key here.
 */
export interface Settings {
  /** The hours tasks may be scheduled in: `HH:MM` on a 24-hour clock, on the user's clock. */
  working_hours: { start: string; end: string };
  /** The category rules, in the order they apply: the first rule that names a category is the one used. */
  slot_rules: SlotRule[];
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
