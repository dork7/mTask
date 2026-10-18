import type { SlotRule } from '../db/settings.ts';
import { slots } from '../ui.ts';
import { FEED_PATH } from './calendar.ts';
import { postedValue } from './drafts.ts';

/*
 * The settings page: its paths, the read of the posted working hours, the read-only rows
 * of the slot rules and the feed URL. Nothing here reads the database or the request;
 * the route does.
 */

/** The path of the settings page, which the nav's More item opens. */
export const SETTINGS_PATH = '/settings';

/** Where the working-hours form posts. */
export const WORKING_HOURS_PATH = '/settings/working-hours';

/** A time of day as `HH:MM` on a 24-hour clock, from `00:00` to `23:59`. Nothing is trimmed. */
export const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The working hours a posted form gives: one `start` and one `end`, each `HH:MM`, with
 * `start` earlier than `end`. `undefined` when a field is missing, repeated or malformed,
 * or the two are not in order.
 */
export function readWorkingHours(body: unknown): { start: string; end: string } | undefined {
  const start = postedValue(body, 'start');
  const end = postedValue(body, 'end');
  if (typeof start !== 'string' || typeof end !== 'string') return undefined;
  if (!CLOCK_TIME.test(start) || !CLOCK_TIME.test(end)) return undefined;
  // Zero-padded `HH:MM` strings sort in time order.
  if (start >= end) return undefined;
  return { start, end };
}

/** One slot rule as the page lists it. */
export interface SlotRuleRow {
  category: string;
  /** The label of the rule's slot, or the stored value when it names no slot of `src/ui.ts`. */
  slotLabel: string;
  start: string;
  end: string;
}

/** The rows of the stored slot rules, in stored order. */
export function slotRuleRows(rules: readonly SlotRule[]): SlotRuleRow[] {
  return rules.map((rule) => ({
    category: rule.category,
    slotLabel: slots.find((item) => item.id === rule.time_slot)?.label ?? String(rule.time_slot),
    start: rule.start,
    end: rule.end,
  }));
}

/** The URL a calendar subscribes to, on the protocol and host the page was asked on. */
export function feedUrl(protocol: string, host: string, token: string): string {
  return `${protocol}://${host}${FEED_PATH}?token=${encodeURIComponent(token)}`;
}

/** What the settings view is handed. */
export interface SettingsPage {
  /** The stored value, or two empty strings when none is stored. */
  workingHours: { start: string; end: string };
  /** `WORKING_HOURS_PATH`. */
  workingHoursAction: string;
  slotRules: SlotRuleRow[];
  feedUrl: string;
  upcomingIcsHref: string;
  /** The `.ics` download of the request's Dubai day. */
  todayIcsHref: string;
}
