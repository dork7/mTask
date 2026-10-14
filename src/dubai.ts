/*
 * The user's clock. Every time of day the app reads from a setting or shows on a page is
 * on the Asia/Dubai clock, whatever the time zone of the process. Dubai is four hours
 * ahead of UTC all year and has no daylight saving, so its clock is arithmetic on UTC
 * milliseconds. Nothing here asks the system for its time zone or for the time.
 */

export const MINUTE_MS = 60_000;

export const DAY_MS = 24 * 60 * MINUTE_MS;

/** How far the Dubai clock is ahead of UTC. */
const DUBAI_OFFSET_MS = 4 * 60 * MINUTE_MS;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The Dubai day an instant is in, as a whole number that grows by one at each Dubai midnight. */
export function dubaiDay(at: number): number {
  return Math.floor((at + DUBAI_OFFSET_MS) / DAY_MS);
}

/** The instant at which a Dubai day starts: 00:00 on the Dubai clock. */
export function dubaiDayStart(day: number): number {
  return day * DAY_MS - DUBAI_OFFSET_MS;
}

/** The minutes after midnight of an `HH:MM` time on a 24-hour clock. */
export function clockMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/**
 * An instant as a person reads it at `now`, on the Dubai clock: `Today 8:00 PM` on the
 * Dubai day of `now`, `Tomorrow 9:00 AM` on the next, and `14 Oct 9:00 AM` on any other.
 * The hour has no leading zero and the spaces are plain ones.
 */
export function dayTimeLabel(at: Date, now: Date): string {
  const onClock = new Date(at.getTime() + DUBAI_OFFSET_MS);
  const time = clockLabel(at);

  const days = dubaiDay(at.getTime()) - dubaiDay(now.getTime());
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  return `${onClock.getUTCDate()} ${MONTHS[onClock.getUTCMonth()]} ${time}`;
}

/** An instant's time of day on the Dubai clock, as a person reads it: `9:00 AM`, `12:30 PM`. */
export function clockLabel(at: Date): string {
  const onClock = new Date(at.getTime() + DUBAI_OFFSET_MS);
  const hours = onClock.getUTCHours();
  return `${hours % 12 || 12}:${String(onClock.getUTCMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

/**
 * The Dubai day a calendar date names, written `YYYY-MM-DD`, or `undefined` when the
 * text is not in that form or names no real date (`2026-02-30`, `2026-13-01`).
 */
export function dayOfDate(text: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const at = Date.parse(`${text}T00:00:00.000Z`);
  // Date.parse rolls a day past the month's end into the next month, so the text must come back unchanged.
  if (Number.isNaN(at) || new Date(at).toISOString().slice(0, 10) !== text) return undefined;
  return at / DAY_MS;
}

/** The calendar date of a Dubai day, as `YYYY-MM-DD`. */
export function dateOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
