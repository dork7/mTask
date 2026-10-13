import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from '../db/database.ts';
import { setSetting, type SlotRule } from '../db/settings.ts';
import { priorities, slots, type Priority, type Slot } from '../ui.ts';
import { taskCategories, type TaskCategory } from './analyzer.ts';
import { applyRules, readSlotRules, type RuleResult } from './rules.ts';

/*
 * Every rule test goes through the `slot_rules` setting of a database in memory: the
 * rules are read with `readSlotRules` and handed to `applyRules`, as the drafts service
 * does it.
 */

/** The rules a new database has, written out here and not read from the code. */
const SEEDED = [
  { category: 'coding', time_slot: 'morning', start: '09:00', end: '11:00' },
  { category: 'shopping', time_slot: 'night', start: '20:00', end: '22:00' },
];

const urgencies: readonly Priority[] = priorities.map((item) => item.id);
const NOT_URGENT: readonly Priority[] = ['high', 'medium', 'low'];

let db: Database;

/** What the rules of this database give for a task of this category and urgency. */
function ruled(category: TaskCategory, urgency: Priority): RuleResult {
  return applyRules(readSlotRules(db), category, urgency);
}

/** Every category with every urgency. */
function everyInput(): [TaskCategory, Priority][] {
  return taskCategories.flatMap((category) =>
    urgencies.map((urgency): [TaskCategory, Priority] => [category, urgency]),
  );
}

/** A rule that sends this category to this slot. */
function rule(category: string, time_slot: Slot): SlotRule {
  return { category, time_slot, start: '13:00', end: '15:00' };
}

function deleteRules(): void {
  db.prepare("DELETE FROM settings WHERE key = 'slot_rules'").run();
}

beforeEach(() => {
  db = openDatabase(':memory:');
});

afterEach(() => {
  if (db.isOpen) db.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('readSlotRules (AC3)', () => {
  it('returns the seeded rules of a new database', () => {
    expect(readSlotRules(db)).toStrictEqual(SEEDED);
  });

  it('returns the list that was set with setSetting', () => {
    const changed = [rule('home', 'evening'), rule('coding', 'afternoon')];
    setSetting(db, 'slot_rules', changed);

    expect(readSlotRules(db)).toStrictEqual(changed);
  });

  it('returns no rules when the setting is missing', () => {
    deleteRules();

    expect(readSlotRules(db)).toStrictEqual([]);
  });

  it('the seeded rules name only categories of the analyzer and slots of src/ui.ts', () => {
    const rules = readSlotRules(db);
    const slotIds: readonly string[] = slots.map((item) => item.id);

    expect(rules.length).toBeGreaterThan(0);
    for (const item of rules) {
      expect(taskCategories as readonly string[]).toContain(item.category);
      expect(slotIds).toContain(item.time_slot);
    }
  });
});

describe('applyRules (AC3)', () => {
  it('returns a priority and a time slot, and nothing else', () => {
    expect(ruled('coding', 'high')).toStrictEqual({ priority: 'high', time_slot: 'morning' });
    expect(Object.keys(ruled('work', 'low')).sort()).toEqual(['priority', 'time_slot']);
  });

  it('is tested with every category and every urgency, 24 pairs', () => {
    expect(everyInput()).toHaveLength(24);
    expect(new Set(everyInput().map((pair) => pair.join(' '))).size).toBe(24);
  });

  it('gives the same result at any time of day and sends no request', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime(new Date('2026-03-04T03:00:00.000Z'));
    const early = everyInput().map(([category, urgency]) => ruled(category, urgency));
    vi.setSystemTime(new Date('2026-03-04T19:30:00.000Z'));
    const late = everyInput().map(([category, urgency]) => ruled(category, urgency));

    expect(early).toHaveLength(24);
    expect(late).toStrictEqual(early);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not change the rules it is handed', () => {
    const rules = readSlotRules(db);
    const before = structuredClone(rules);

    for (const [category, urgency] of everyInput()) applyRules(rules, category, urgency);

    expect(rules).toStrictEqual(before);
    expect(rules).toStrictEqual(SEEDED);
  });
});

describe('the priority rule (AC4)', () => {
  it.each(everyInput())('a %s task of urgency %s has that urgency as its priority', (category, urgency) => {
    expect(ruled(category, urgency).priority).toBe(urgency);
  });
});

describe('the coding rule (AC5)', () => {
  it.each(NOT_URGENT)('a coding task of urgency %s belongs to the morning', (urgency) => {
    expect(ruled('coding', urgency).time_slot).toBe('morning');
  });
});

describe('the shopping rule (AC6)', () => {
  it.each(NOT_URGENT)('a shopping task of urgency %s belongs to the night slot', (urgency) => {
    expect(ruled('shopping', urgency).time_slot).toBe('night');
  });
});

describe('the urgent rule (AC7)', () => {
  it.each(taskCategories)('an urgent %s task is urgent and has no slot', (category) => {
    expect(ruled(category, 'urgent')).toStrictEqual({ priority: 'urgent', time_slot: null });
  });

  it('wins over a rule for every category', () => {
    setSetting(
      db,
      'slot_rules',
      taskCategories.map((category) => rule(category, 'evening')),
    );

    for (const category of taskCategories) {
      expect(ruled(category, 'high').time_slot, category).toBe('evening');
      expect(ruled(category, 'urgent').time_slot, category).toBeNull();
    }
  });
});

describe('a category with no rule (AC8)', () => {
  const noRule: readonly TaskCategory[] = ['work', 'home', 'personal', 'other'];
  const pairs = noRule.flatMap((category) =>
    NOT_URGENT.map((urgency): [TaskCategory, Priority] => [category, urgency]),
  );

  it.each(pairs)('a %s task of urgency %s has no slot', (category, urgency) => {
    expect(ruled(category, urgency).time_slot).toBeNull();
  });
});

describe('the rules are the setting (AC9)', () => {
  it('a changed setting changes the result', () => {
    setSetting(db, 'slot_rules', [{ category: 'coding', time_slot: 'afternoon', start: '13:00', end: '15:00' }]);

    expect(ruled('coding', 'medium').time_slot).toBe('afternoon');
    expect(ruled('shopping', 'medium').time_slot).toBeNull();
  });

  it.each(slots.map((item) => item.id))('a rule can send a category to the slot %s', (slot) => {
    setSetting(db, 'slot_rules', [rule('other', slot)]);

    expect(ruled('other', 'low').time_slot).toBe(slot);
  });

  it('an empty list gives no category a slot and does not throw', () => {
    setSetting(db, 'slot_rules', []);

    for (const [category, urgency] of everyInput()) {
      expect(ruled(category, urgency), `${category} ${urgency}`).toStrictEqual({ priority: urgency, time_slot: null });
    }
  });

  it('a missing setting gives no category a slot and does not throw', () => {
    deleteRules();

    for (const [category, urgency] of everyInput()) {
      expect(ruled(category, urgency), `${category} ${urgency}`).toStrictEqual({ priority: urgency, time_slot: null });
    }
  });

  it('the first of two rules for a category is the one applied', () => {
    setSetting(db, 'slot_rules', [rule('coding', 'evening'), rule('coding', 'afternoon')]);

    expect(ruled('coding', 'medium').time_slot).toBe('evening');
  });

  it('the first of two rules for a category is the one applied when a rule of another category comes first', () => {
    setSetting(db, 'slot_rules', [rule('home', 'night'), rule('coding', 'evening'), rule('coding', 'afternoon')]);

    expect(ruled('coding', 'medium').time_slot).toBe('evening');
    expect(ruled('home', 'medium').time_slot).toBe('night');
  });
});
