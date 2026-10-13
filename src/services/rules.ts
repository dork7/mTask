import type { Database } from '../db/database.ts';
import { getSetting, type SlotRule } from '../db/settings.ts';
import type { Priority, Slot } from '../ui.ts';
import type { TaskCategory } from './analyzer.ts';

/*
 * The rules that give a task its priority and the part of the day it belongs to, from
 * the category and the urgency the analyzer found.
 *
 * The category rules are data: the `slot_rules` setting. The urgent rule is code. Nothing
 * here reads the clock or asks a model, so the same input and the same setting always
 * give the same result. Finding the time a task is done at is not done here.
 */

/** What the rules decide for one task. `time_slot` is `null` when the task belongs to no part of the day. */
export interface RuleResult {
  priority: Priority;
  time_slot: Slot | null;
}

/** The category rules of this database, in the order they apply. None when the setting is missing. */
export function readSlotRules(db: Database): SlotRule[] {
  return getSetting(db, 'slot_rules') ?? [];
}

/**
 * The priority and the slot of a task of this category and urgency under these rules.
 * The priority is the urgency, unchanged. The slot is that of the first rule that names
 * the category, or `null` when none does. An urgent task has no slot, whatever its
 * category and whatever the rules: it is not held back for one.
 */
export function applyRules(rules: readonly SlotRule[], category: TaskCategory, urgency: Priority): RuleResult {
  // Before the category rules, so no rule can hold an urgent task back.
  if (urgency === 'urgent') return { priority: urgency, time_slot: null };

  const rule = rules.find((item) => item.category === category);
  return { priority: urgency, time_slot: rule?.time_slot ?? null };
}
