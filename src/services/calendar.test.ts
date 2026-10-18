import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../db/database.ts';
import { getSetting, setSetting } from '../db/settings.ts';
import type { Task } from '../db/tasks.ts';
import { dayOfDate } from '../dubai.ts';
import { parseIcs } from '../testing/ics.ts';
import {
  ensureFeedToken,
  feedTokenMatches,
  icsFromTasks,
  icsTime,
  tasksOnDay,
  upcomingTasks,
} from './calendar.ts';

/*
 * The calendar service on plain task objects: the iCalendar text, the tasks of a day and
 * the upcoming ones, and the feed token. Only `ensureFeedToken` uses a database.
 */

/** 1:36 PM on Monday 12 Oct 2026 in Dubai. */
const NOW = new Date('2026-10-12T09:36:00.000Z');

/** A task with every field not given `null`, titled `Task` and pending. */
function task(fields: Partial<Task> & { id: number }): Task {
  return {
    title: 'Task',
    description: null,
    image_path: null,
    category: null,
    estimated_minutes: null,
    actual_minutes: null,
    priority: null,
    time_slot: null,
    scheduled_start: null,
    scheduled_end: null,
    status: 'pending',
    started_at: null,
    completed_at: null,
    reminder_at: null,
    recurrence_rule: null,
    parent_task_id: null,
    source_id: null,
    confidence: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...fields,
  };
}

/** A task scheduled on 12 Oct 2026 from `HH:MM` UTC, for 30 minutes. */
function at(id: number, time: string, fields: Partial<Task> = {}): Task {
  const start = new Date(`2026-10-12T${time}:00.000Z`);
  return task({
    id,
    scheduled_start: start.toISOString(),
    scheduled_end: new Date(start.getTime() + 30 * 60_000).toISOString(),
    ...fields,
  });
}

describe('icsFromTasks (AC1)', () => {
  it('writes an instant as a UTC date-time', () => {
    expect(icsTime(new Date('2026-10-12T09:36:00.000Z'))).toBe('20261012T093600Z');
  });

  it('writes an empty calendar with its header when there is no task', () => {
    const text = icsFromTasks([], NOW);

    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    const { lines, events } = parseIcs(text);
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('CALSCALE:GREGORIAN');
    expect(lines).toContain('METHOD:PUBLISH');
    expect(lines.some((line) => line.startsWith('PRODID:'))).toBe(true);
    expect(events).toEqual([]);
  });

  it('ends every line with CRLF', () => {
    const text = icsFromTasks([at(1, '10:00'), at(2, '11:00')], NOW);

    expect(() => parseIcs(text)).not.toThrow();
    const pieces = text.split('\r\n');
    expect(pieces.at(-1)).toBe('');
    expect(pieces.filter((piece) => piece === '')).toHaveLength(1);
    expect(pieces.some((piece) => piece.includes('\n') || piece.includes('\r'))).toBe(false);
  });

  it('writes one event with its UID, stamp, times and title for a scheduled task', () => {
    const text = icsFromTasks(
      [task({ id: 7, title: 'Buy groceries', scheduled_start: '2026-10-12T16:00:00.000Z', scheduled_end: '2026-10-12T16:40:00.000Z' })],
      NOW,
    );

    expect(parseIcs(text).events).toEqual([
      {
        UID: 'task-7@mtask',
        DTSTAMP: '20261012T093600Z',
        DTSTART: '20261012T160000Z',
        DTEND: '20261012T164000Z',
        SUMMARY: 'Buy groceries',
      },
    ]);
  });

  it('stamps the events with the now it is given', () => {
    const { events } = parseIcs(icsFromTasks([at(1, '10:00')], new Date('2027-01-02T03:04:05.000Z')));

    expect(events[0].DTSTAMP).toBe('20270102T030405Z');
  });

  it('writes no event for a task without both scheduled times', () => {
    const unscheduled = [
      task({ id: 1 }),
      task({ id: 2, scheduled_start: '2026-10-12T10:00:00.000Z' }),
      task({ id: 3, scheduled_end: '2026-10-12T10:30:00.000Z' }),
    ];

    expect(parseIcs(icsFromTasks(unscheduled, NOW)).events).toEqual([]);
    const { events } = parseIcs(icsFromTasks([...unscheduled, at(4, '10:00')], NOW));
    expect(events.map((event) => event.UID)).toEqual(['task-4@mtask']);
  });

  it('orders the events by start and leaves the list as it was', () => {
    const tasks = [at(1, '18:00'), at(2, '09:00'), at(3, '12:00')];

    const { events } = parseIcs(icsFromTasks(tasks, NOW));

    expect(events.map((event) => event.UID)).toEqual(['task-2@mtask', 'task-3@mtask', 'task-1@mtask']);
    expect(tasks.map((each) => each.id)).toEqual([1, 2, 3]);
  });

  it('escapes the title', () => {
    const { events } = parseIcs(icsFromTasks([at(1, '10:00', { title: 'Milk, eggs; bread \\ jam\nmore' })], NOW));

    expect(events[0].SUMMARY).toBe('Milk\\, eggs\\; bread \\\\ jam\\nmore');
  });

  it('folds a long title at 75 octets', () => {
    const title = 'abcdefghij'.repeat(20);
    const text = icsFromTasks([at(1, '10:00', { title })], NOW);

    const raw = text.split('\r\n').slice(0, -1);
    expect(raw.every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    const summary = raw.findIndex((line) => line.startsWith('SUMMARY:'));
    expect(raw[summary + 1].startsWith(' ')).toBe(true);
    expect(raw[summary + 1].startsWith('  ')).toBe(false);
    expect(parseIcs(text).events[0].SUMMARY).toBe(title);
  });

  it('folds an Arabic title without splitting a letter', () => {
    const title = 'م'.repeat(60);
    const text = icsFromTasks([at(1, '10:00', { title })], NOW);

    const raw = text.split('\r\n').slice(0, -1);
    expect(raw.every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(parseIcs(text).events[0].SUMMARY).toBe(title);
  });
});

describe('tasksOnDay (AC3)', () => {
  it('keeps the tasks of the day of any status and drops one without an end', () => {
    const day = dayOfDate('2026-10-12');
    if (day === undefined) throw new Error('2026-10-12 is a date');
    const tasks = [
      at(1, '10:00', { status: 'draft' }),
      at(2, '11:00', { status: 'done' }),
      task({ id: 3, scheduled_start: '2026-10-12T12:00:00.000Z' }),
      at(4, '20:00'),
    ];

    expect(tasksOnDay(tasks, day).map((each) => each.id)).toEqual([1, 2]);
  });
});

describe('upcomingTasks (AC4)', () => {
  it('keeps pending and in-progress tasks and drops done and draft ones', () => {
    const tasks = [
      at(1, '12:00', { status: 'pending' }),
      at(2, '12:00', { status: 'in_progress' }),
      at(3, '12:00', { status: 'done' }),
      at(4, '12:00', { status: 'draft' }),
    ];

    expect(upcomingTasks(tasks, NOW).map((each) => each.id)).toEqual([1, 2]);
  });

  it('keeps a task starting at now and drops one starting a millisecond before', () => {
    const tasks = [
      task({ id: 1, scheduled_start: '2026-10-12T09:36:00.000Z', scheduled_end: '2026-10-12T10:00:00.000Z' }),
      task({ id: 2, scheduled_start: '2026-10-12T09:35:59.999Z', scheduled_end: '2026-10-12T10:00:00.000Z' }),
    ];

    expect(upcomingTasks(tasks, NOW).map((each) => each.id)).toEqual([1]);
  });

  it('drops a pending task with no start', () => {
    expect(upcomingTasks([task({ id: 1 })], NOW)).toEqual([]);
  });

  it('orders by start and leaves the list as it was', () => {
    const tasks = [at(1, '18:00'), at(2, '12:00')];

    expect(upcomingTasks(tasks, NOW).map((each) => each.id)).toEqual([2, 1]);
    expect(tasks.map((each) => each.id)).toEqual([1, 2]);
  });
});

describe('feedTokenMatches (AC5)', () => {
  it('is true only for the stored token', () => {
    expect(feedTokenMatches('abc', 'abc')).toBe(true);
  });

  it.each([
    ['another token', 'abc', 'abd'],
    ['a shorter token', 'abc', 'ab'],
    ['no token', 'abc', undefined],
    ['a repeated key', 'abc', ['abc']],
    ['an empty token against an empty stored one', '', ''],
    ['any token when none is stored', undefined, 'abc'],
  ])('is false for %s', (_name, stored, given) => {
    expect(feedTokenMatches(stored, given)).toBe(false);
  });
});

describe('ensureFeedToken (AC5)', () => {
  const opened: Database[] = [];

  function newDatabase(): Database {
    const db = openDatabase(':memory:');
    opened.push(db);
    return db;
  }

  afterEach(() => {
    for (const db of opened.splice(0)) db.close();
  });

  it('stores a random URL-safe token on a new database and returns it', () => {
    const db = newDatabase();

    const token = ensureFeedToken(db);

    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(getSetting(db, 'feed_token')).toBe(token);
  });

  it('keeps the token it stored', () => {
    const db = newDatabase();

    expect(ensureFeedToken(db)).toBe(ensureFeedToken(db));
  });

  it('keeps a token that was there', () => {
    const db = newDatabase();
    setSetting(db, 'feed_token', 'kept');

    expect(ensureFeedToken(db)).toBe('kept');
    expect(getSetting(db, 'feed_token')).toBe('kept');
  });

  it('replaces an empty token', () => {
    const db = newDatabase();
    setSetting(db, 'feed_token', '');

    const token = ensureFeedToken(db);

    expect(token).toHaveLength(43);
    expect(getSetting(db, 'feed_token')).toBe(token);
  });

  it('gives two databases different tokens', () => {
    expect(ensureFeedToken(newDatabase())).not.toBe(ensureFeedToken(newDatabase()));
  });
});
