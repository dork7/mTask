import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Database } from '../db/database.ts';
import { getSetting, setSetting } from '../db/settings.ts';
import type { Task } from '../db/tasks.ts';
import { dubaiDay } from '../dubai.ts';

/*
 * Tasks as iCalendar (RFC 5545) text, the tasks a download or the feed holds, and the
 * feed's token. Nothing here reads the clock: `now` is always an argument. Times are
 * written from the stored UTC timestamps as UTC, so no time zone is consulted and the
 * events land on the Dubai clock whatever the process `TZ`.
 */

/** The subscribable feed of upcoming tasks, guarded by `?token=`. */
export const FEED_PATH = '/calendar.ics';

/** The download of every upcoming task. */
export const UPCOMING_ICS_PATH = '/upcoming/ics';

/** The download of one task. */
export function taskIcsPath(id: number): string {
  return `/task/${id}/ics`;
}

/** The download of one Dubai day, `date` written `YYYY-MM-DD`. */
export function dayIcsPath(date: string): string {
  return `/day/${date}/ics`;
}

/** An instant as an iCalendar UTC date-time: `20261012T093600Z`. */
export function icsTime(at: Date): string {
  return at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** A value as iCalendar TEXT: backslash, semicolon and comma escaped, line breaks as `\n`. */
function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/** The longest a content line may be, in UTF-8 octets, before it is folded. */
const LINE_OCTETS = 75;

/**
 * A content line folded at 75 octets: each later segment starts with one space, which
 * counts towards its 75. It splits between code points, never inside one.
 */
function foldLine(line: string): string {
  if (Buffer.byteLength(line) <= LINE_OCTETS) return line;
  const segments: string[] = [];
  let segment = '';
  let octets = 0;
  for (const point of line) {
    const size = Buffer.byteLength(point);
    const limit = segments.length === 0 ? LINE_OCTETS : LINE_OCTETS - 1;
    if (octets + size > limit) {
      segments.push(segment);
      segment = '';
      octets = 0;
    }
    segment += point;
    octets += size;
  }
  segments.push(segment);
  return segments.join('\r\n ');
}

/** A task that has both scheduled times, with the two narrowed to strings. */
type ScheduledTask = Task & { scheduled_start: string; scheduled_end: string };

function isScheduled(task: Task): task is ScheduledTask {
  return task.scheduled_start !== null && task.scheduled_end !== null;
}

/** Orders by `scheduled_start`, then `id`. The stored format sorts as text in time order. */
function byStart(a: Task, b: Task): number {
  const left = a.scheduled_start ?? '';
  const right = b.scheduled_start ?? '';
  if (left !== right) return left < right ? -1 : 1;
  return a.id - b.id;
}

/**
 * An iCalendar of these tasks: one event for each task with both scheduled times, in
 * order of start, stamped with `now`. Every line ends in CRLF. The input is not sorted.
 */
export function icsFromTasks(tasks: readonly Task[], now: Date): string {
  const stamp = icsTime(now);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//mTask//Task Image AI//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const task of tasks.filter(isScheduled).sort(byStart)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:task-${task.id}@mtask`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(new Date(task.scheduled_start))}`,
      `DTEND:${icsTime(new Date(task.scheduled_end))}`,
      `SUMMARY:${icsText(task.title)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map((line) => `${foldLine(line)}\r\n`).join('');
}

/** The tasks with both scheduled times that start on this Dubai day, of any status. */
export function tasksOnDay(tasks: readonly Task[], day: number): Task[] {
  return tasks.filter((task) => isScheduled(task) && dubaiDay(Date.parse(task.scheduled_start)) === day);
}

/** The pending and in-progress tasks that start at or after `now`, in order of start. */
export function upcomingTasks(tasks: readonly Task[], now: Date): Task[] {
  return tasks
    .filter(
      (task) =>
        (task.status === 'pending' || task.status === 'in_progress') &&
        task.scheduled_start !== null &&
        Date.parse(task.scheduled_start) >= now.getTime(),
    )
    .sort(byStart);
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Whether the token a request gave is the stored one. False when none is stored, and
 * when the given one is not a non-empty string. The digests are compared, so both sides
 * are the same length and the comparison takes the same time whatever they hold.
 */
export function feedTokenMatches(stored: string | undefined, given: unknown): boolean {
  if (stored === undefined || stored === '') return false;
  if (typeof given !== 'string' || given === '') return false;
  return timingSafeEqual(sha256(stored), sha256(given));
}

/** The stored feed token, made and stored first when there is none. */
export function ensureFeedToken(db: Database): string {
  const stored = getSetting(db, 'feed_token');
  if (typeof stored === 'string' && stored !== '') return stored;
  const token = randomBytes(32).toString('base64url');
  setSetting(db, 'feed_token', token);
  return token;
}
