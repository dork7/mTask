/*
 * The user's clock. Every time of day the app reads from a setting or shows on a page is
 * on the Asia/Dubai clock, whatever the time zone of the process. Dubai is four hours
 * ahead of UTC all year and has no daylight saving, so its clock is arithmetic on UTC
 * milliseconds. Nothing here asks the system for its time zone or for the time.
 */

export const MINUTE_MS = 60_000;

const DAY_MS = 24 * 60 * MINUTE_MS;

/** How far the Dubai clock is ahead of UTC. */
const DUBAI_OFFSET_MS = 4 * 60 * MINUTE_MS;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

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
  const hours = onClock.getUTCHours();
  const time = `${hours % 12 || 12}:${String(onClock.getUTCMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;

  const days = dubaiDay(at.getTime()) - dubaiDay(now.getTime());
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  return `${onClock.getUTCDate()} ${MONTHS[onClock.getUTCMonth()]} ${time}`;
}
