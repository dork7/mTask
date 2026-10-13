import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from '../db/database.ts';
import { getSetting, setSetting } from '../db/settings.ts';
import { createTask, getTask, listTasks, type NewTask, type Task } from '../db/tasks.ts';
import { isTimestamp } from '../db/timestamps.ts';
import { placeTasks, storeSchedule, type Placement, type Schedule } from './scheduler.ts';

/*
 * The scheduler, on a database in memory with the seeded settings: working hours 09:00
 * to 22:00, `morning` 09:00 to 11:00 and `night` 20:00 to 22:00, on the Dubai clock.
 * Every call is handed its time.
 *
 * The expected times are written here as Dubai clock times and turned into timestamps by
 * `dubai()`, which is this file's own arithmetic: nothing of `src/dubai.ts` is used to
 * say what the scheduler should have found. The machine these tests were written on is
 * itself on the Dubai clock, so the tests of the zone set `TZ` themselves.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = new Date('2026-10-12T09:36:00.000Z');

/** When the rows of a test that compares `updated_at` are stored, and when the schedule is. */
const STORED = '2026-10-12T05:00:00.000Z';
const WRITTEN = '2026-10-12T09:36:30.000Z';

let db: Database;
const zone = process.env.TZ;

beforeEach(() => {
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

/** A Dubai clock time, `HH:MM`, of 12 Oct 2026 or of a day after it, as a stored timestamp. */
function dubai(time: string, daysAhead = 0): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12 + daysAhead, hours - 4, minutes)).toISOString();
}

/** That time as the `now` of a call. */
function at(time: string, daysAhead = 0): Date {
  return new Date(dubai(time, daysAhead));
}

/** A task to place: pending, with no time. */
function todo(minutes: number | null, extra: Partial<NewTask> = {}): Task {
  return createTask(db, { title: 'To do', status: 'pending', estimated_minutes: minutes, ...extra });
}

/** A task that has a time today, pending and `medium` unless `extra` says otherwise. */
function booked(start: string, end: string, extra: Partial<NewTask> = {}): Task {
  return createTask(db, {
    title: 'Booked',
    status: 'pending',
    priority: 'medium',
    estimated_minutes: (Date.parse(dubai(end)) - Date.parse(dubai(start))) / 60_000,
    scheduled_start: dubai(start),
    scheduled_end: dubai(end),
    ...extra,
  });
}

function place(tasks: Task[], now: Date = NOW): Schedule {
  return placeTasks(db, tasks, now);
}

/** Places and stores, as a confirm does. */
function commit(tasks: Task[], now: Date = NOW): Schedule {
  const schedule = place(tasks, now);
  storeSchedule(db, schedule);
  return schedule;
}

function slot(id: number, start: string, end: string): Placement {
  return { id, scheduled_start: start, scheduled_end: end };
}

/** The row of a task as it is stored now. Throws when it is gone. */
function row(task: Task): Task {
  const found = getTask(db, task.id);
  if (found === undefined) throw new Error(`Task ${task.id} is gone`);
  return found;
}

/** The seeded rules, read back, so a test can add to them or change one. */
function seededRules(): NonNullable<ReturnType<typeof getSetting<'slot_rules'>>> {
  const rules = getSetting(db, 'slot_rules');
  if (rules === undefined) throw new Error('The slot_rules setting is missing');
  return rules;
}

/** Fakes `Date` only, and sets it. The scheduler is never handed this time. */
function setClock(time: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(time));
}

describe('placeTasks is handed the time (AC1)', () => {
  it('follows the argument when the system clock is on another day', () => {
    const task = todo(15);
    setClock('2031-01-01T00:00:00.000Z');

    expect(place([task]).placed).toEqual([slot(task.id, '2026-10-12T09:40:00.000Z', '2026-10-12T09:55:00.000Z')]);
  });

  it('gives the same result at two times of the system clock', () => {
    const tasks = [todo(15), todo(90, { time_slot: 'morning' }), todo(30, { priority: 'urgent' })];

    setClock('2026-03-04T03:00:00.000Z');
    const early = place(tasks);
    vi.setSystemTime(new Date('2027-08-09T19:30:00.000Z'));
    const late = place(tasks);

    expect(early.placed).toHaveLength(3);
    expect(late).toEqual(early);
  });

  it.each(['America/New_York', 'Pacific/Kiritimati', 'UTC'])(
    'reads the hours on the Dubai clock with TZ=%s',
    (name) => {
      process.env.TZ = name;
      const plain = todo(30);
      const night = todo(40, { time_slot: 'night' });

      expect(place([plain, night], new Date('2026-10-12T19:30:00.000Z')).placed).toEqual([
        slot(plain.id, '2026-10-13T05:00:00.000Z', '2026-10-13T05:30:00.000Z'),
        slot(night.id, '2026-10-13T16:00:00.000Z', '2026-10-13T16:40:00.000Z'),
      ]);
    },
  );

  // When this fails, the three tests above have stopped testing anything.
  it('changes the zone of the process when TZ is set', () => {
    process.env.TZ = 'America/New_York';
    expect(new Date('2026-10-12T19:30:00.000Z').getHours()).toBe(15);

    process.env.TZ = 'Pacific/Kiritimati';
    expect(new Date('2026-10-12T19:30:00.000Z').getHours()).toBe(9);
  });

  it('returns stored timestamps', () => {
    const { placed } = place([todo(15), todo(600), todo(600)]);

    expect(placed).toHaveLength(3);
    for (const placement of placed) {
      expect(isTimestamp(placement.scheduled_start)).toBe(true);
      expect(isTimestamp(placement.scheduled_end)).toBe(true);
    }
  });

  it('writes nothing', () => {
    booked('13:40', '14:40');
    const tasks = [todo(30), todo(30, { priority: 'urgent' })];
    const before = listTasks(db);

    const schedule = place(tasks);

    expect(schedule.placed).toHaveLength(2);
    expect(schedule.moved).toHaveLength(1);
    expect(listTasks(db)).toEqual(before);
  });

  it('reads nothing and returns an empty schedule for no task', () => {
    db.exec('DELETE FROM settings');

    expect(place([])).toEqual({ placed: [], moved: [], unplaced: [] });
  });

  it('throws when there is no working_hours setting', () => {
    db.exec("DELETE FROM settings WHERE key = 'working_hours'");
    const task = todo(15);

    expect(() => place([task])).toThrow('The working_hours setting is missing');
  });

  it('places by the working hours alone when there is no slot_rules setting', () => {
    db.exec("DELETE FROM settings WHERE key = 'slot_rules'");
    const task = todo(40, { time_slot: 'night' });

    expect(place([task]).placed).toEqual([slot(task.id, dubai('13:40'), dubai('14:20'))]);
  });
});

describe('the start and the end of a placed task (AC2)', () => {
  it('gives a 15-minute task with no slot the next 5-minute mark and an end 15 minutes later', () => {
    const task = todo(15);

    expect(place([task])).toEqual({
      placed: [slot(task.id, '2026-10-12T09:40:00.000Z', '2026-10-12T09:55:00.000Z')],
      moved: [],
      unplaced: [],
    });
  });

  it.each([
    ['2026-10-12T09:40:00.000Z', '2026-10-12T09:40:00.000Z'],
    ['2026-10-12T09:40:00.001Z', '2026-10-12T09:45:00.000Z'],
    ['2026-10-12T09:39:59.999Z', '2026-10-12T09:40:00.000Z'],
    ['2026-10-12T09:44:00.000Z', '2026-10-12T09:45:00.000Z'],
    ['2026-10-12T09:58:30.000Z', '2026-10-12T10:00:00.000Z'],
  ])('at %s it starts at %s', (now, start) => {
    const [placement] = place([todo(15)], new Date(now)).placed;

    expect(placement.scheduled_start).toBe(start);
  });

  it('ends a task at the end of the working hours, and takes one that is 5 minutes longer to the next day', () => {
    const fits = todo(20);
    const over = todo(25);

    expect(place([fits], at('21:40')).placed).toEqual([slot(fits.id, dubai('21:40'), dubai('22:00'))]);
    expect(place([over], at('21:40')).placed).toEqual([slot(over.id, dubai('09:00', 1), dubai('09:25', 1))]);
  });

  it('does not start before the working hours', () => {
    const task = todo(15);

    expect(place([task], at('07:00')).placed).toEqual([slot(task.id, dubai('09:00'), dubai('09:15'))]);
  });

  it('places a task as long as the working day from its first minute to its last', () => {
    const task = todo(780);

    expect(place([task]).placed).toEqual([slot(task.id, dubai('09:00', 1), dubai('22:00', 1))]);
  });
});

describe('gap filling (AC3)', () => {
  it('puts a 30-minute task in the gap between two pending tasks and a 45-minute task after them', () => {
    booked('13:40', '14:30');
    booked('15:00', '16:00');
    const short = todo(30);
    const long = todo(45);

    expect(place([short]).placed).toEqual([slot(short.id, dubai('14:30'), dubai('15:00'))]);
    expect(place([long]).placed).toEqual([slot(long.id, dubai('16:00'), dubai('16:45'))]);
  });

  it('does not move the tasks that are not being placed', () => {
    setClock(STORED);
    const first = booked('13:40', '14:30');
    const second = booked('15:00', '16:00');
    const tasks = [todo(30), todo(45)];
    vi.setSystemTime(new Date(WRITTEN));

    const schedule = commit(tasks);

    expect(schedule.placed).toHaveLength(2);
    expect(schedule.moved).toEqual([]);
    expect(row(first)).toEqual(first);
    expect(row(second)).toEqual(second);
  });

  it('is kept out by an in_progress task', () => {
    booked('13:40', '14:30', { status: 'in_progress' });
    const task = todo(30);

    expect(place([task]).placed).toEqual([slot(task.id, dubai('14:30'), dubai('15:00'))]);
  });

  it.each(['draft', 'done'] as const)('takes the time of a %s task', (status) => {
    booked('13:40', '14:30', { status });
    const task = todo(30);

    expect(place([task]).placed).toEqual([slot(task.id, dubai('13:40'), dubai('14:10'))]);
  });

  it.each([
    ['end', { scheduled_end: null }],
    ['start', { scheduled_start: null }],
  ] satisfies [string, Partial<NewTask>][])('takes the time of a pending task with no %s', (_name, missing) => {
    booked('13:40', '14:30', missing);
    const task = todo(30);

    expect(place([task]).placed).toEqual([slot(task.id, dubai('13:40'), dubai('14:10'))]);
  });

  it('is kept out by a pending task that started before now and has not ended', () => {
    booked('13:00', '14:00');
    const task = todo(30);

    expect(place([task]).placed).toEqual([slot(task.id, dubai('14:00'), dubai('14:30'))]);
  });

  it('starts on the next mark after a task that ends off the marks', () => {
    booked('13:40', '14:02');
    const task = todo(30);

    expect(place([task]).placed).toEqual([slot(task.id, dubai('14:05'), dubai('14:35'))]);
  });

  it('skips a gap that is 5 minutes too short', () => {
    booked('13:40', '14:30');
    booked('14:55', '16:00');
    const task = todo(30);

    expect(place([task]).placed).toEqual([slot(task.id, dubai('16:00'), dubai('16:30'))]);
  });

  it('ignores the time a task that is being placed already has', () => {
    const task = booked('13:40', '14:10');

    expect(place([task])).toEqual({
      placed: [slot(task.id, dubai('13:40'), dubai('14:10'))],
      moved: [],
      unplaced: [],
    });
  });
});

describe('several tasks in one call (AC4)', () => {
  it('places them by priority and then by id, each after the one before', () => {
    const tasks = [
      todo(30, { priority: 'low' }),
      todo(30),
      todo(30, { priority: 'medium' }),
      todo(30, { priority: 'high' }),
      todo(30, { priority: 'urgent' }),
      todo(30, { priority: 'high' }),
    ];

    expect(place(tasks)).toEqual({
      placed: [
        slot(tasks[0].id, dubai('15:40'), dubai('16:10')),
        slot(tasks[1].id, dubai('16:10'), dubai('16:40')),
        slot(tasks[2].id, dubai('15:10'), dubai('15:40')),
        slot(tasks[3].id, dubai('14:10'), dubai('14:40')),
        slot(tasks[4].id, dubai('13:40'), dubai('14:10')),
        slot(tasks[5].id, dubai('14:40'), dubai('15:10')),
      ],
      moved: [],
      unplaced: [],
    });
  });

  it('goes by id, not by the order the tasks are handed in', () => {
    const first = todo(30);
    const second = todo(30);

    expect(place([second, first]).placed).toEqual([
      slot(second.id, dubai('14:10'), dubai('14:40')),
      slot(first.id, dubai('13:40'), dubai('14:10')),
    ]);
  });

  it('lets no two of them overlap, around the tasks that are there', () => {
    booked('14:00', '14:30');
    booked('15:00', '15:10');
    const tasks = [todo(20), todo(20), todo(30), todo(45), todo(10)];

    const placed = place(tasks).placed.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));

    expect(placed).toEqual([
      slot(tasks[0].id, dubai('13:40'), dubai('14:00')),
      slot(tasks[1].id, dubai('14:30'), dubai('14:50')),
      slot(tasks[4].id, dubai('14:50'), dubai('15:00')),
      slot(tasks[2].id, dubai('15:10'), dubai('15:40')),
      slot(tasks[3].id, dubai('15:40'), dubai('16:25')),
    ]);
  });
});

describe('the slot window (AC5)', () => {
  it('puts a 40-minute night task at 8:00 PM today', () => {
    const task = todo(40, { time_slot: 'night' });

    expect(place([task]).placed).toEqual([slot(task.id, '2026-10-12T16:00:00.000Z', '2026-10-12T16:40:00.000Z')]);
  });

  it('puts a 90-minute morning task at 9:00 AM tomorrow, and a second one the day after', () => {
    const first = todo(90, { time_slot: 'morning' });
    const second = todo(90, { time_slot: 'morning' });

    expect(commit([first]).placed).toEqual([
      slot(first.id, '2026-10-13T05:00:00.000Z', '2026-10-13T06:30:00.000Z'),
    ]);
    expect(place([second]).placed).toEqual([
      slot(second.id, '2026-10-14T05:00:00.000Z', '2026-10-14T06:30:00.000Z'),
    ]);
  });

  it('places two morning tasks of one call on two days when the window holds only one', () => {
    const first = todo(90, { time_slot: 'morning' });
    const second = todo(90, { time_slot: 'morning' });

    expect(place([first, second]).placed).toEqual([
      slot(first.id, dubai('09:00', 1), dubai('10:30', 1)),
      slot(second.id, dubai('09:00', 2), dubai('10:30', 2)),
    ]);
  });

  it('fills a gap inside the window', () => {
    booked('20:00', '20:30');
    booked('21:10', '21:30');
    const task = todo(40, { time_slot: 'night' });

    expect(place([task]).placed).toEqual([slot(task.id, dubai('20:30'), dubai('21:10'))]);
  });

  it('starts at now inside the window, and goes to the next day when the rest of it is too short', () => {
    const fits = todo(40, { time_slot: 'night' });
    const over = todo(45, { time_slot: 'night' });

    expect(place([fits], at('21:18')).placed).toEqual([slot(fits.id, dubai('21:20'), dubai('22:00'))]);
    expect(place([over], at('21:18')).placed).toEqual([slot(over.id, dubai('20:00', 1), dubai('20:45', 1))]);
  });

  it.each(['afternoon', 'evening'] as const)(
    'places an %s task, whose slot no rule names, as one with no slot',
    (time_slot) => {
      const task = todo(40, { time_slot });

      expect(place([task]).placed).toEqual([slot(task.id, dubai('13:40'), dubai('14:20'))]);
    },
  );

  it('places a task that is longer than its window as one with no slot', () => {
    const fits = todo(120, { time_slot: 'night' });
    const over = todo(125, { time_slot: 'night' });

    expect(place([fits]).placed).toEqual([slot(fits.id, dubai('20:00'), dubai('22:00'))]);
    expect(place([over]).placed).toEqual([slot(over.id, dubai('13:40'), dubai('15:45'))]);
  });

  it('takes the window of the first rule that names the slot', () => {
    setSetting(db, 'slot_rules', [
      ...seededRules(),
      { category: 'errand', time_slot: 'night', start: '18:00', end: '19:00' },
    ]);
    const task = todo(40, { time_slot: 'night' });

    expect(place([task]).placed).toEqual([slot(task.id, dubai('20:00'), dubai('20:40'))]);
  });

  it('goes by the slot of the task, not by its category', () => {
    const task = todo(40, { category: 'shopping', time_slot: 'morning' });

    expect(place([task]).placed).toEqual([slot(task.id, dubai('09:00', 1), dubai('09:40', 1))]);
  });

  it('cuts a window to the working hours, and drops one that lies outside them', () => {
    setSetting(db, 'working_hours', { start: '10:00', end: '21:00' });
    const fits = todo(60, { time_slot: 'morning' });
    const over = todo(90, { time_slot: 'morning' });

    expect(place([fits], at('07:00')).placed).toEqual([slot(fits.id, dubai('10:00'), dubai('11:00'))]);
    expect(place([over], at('07:00')).placed).toEqual([slot(over.id, dubai('10:00'), dubai('11:30'))]);

    setSetting(db, 'working_hours', { start: '09:00', end: '18:00' });
    const night = todo(40, { time_slot: 'night' });

    expect(place([night]).placed).toEqual([slot(night.id, dubai('13:40'), dubai('14:20'))]);
  });
});

describe('overflow (AC6)', () => {
  it.each([
    ['9:40 PM', '2026-10-12T17:40:00.000Z'],
    ['11:30 PM', '2026-10-12T19:30:00.000Z'],
  ])('takes a 30-minute task at %s to 9:00 AM tomorrow', (_name, now) => {
    const task = todo(30);

    expect(place([task], new Date(now)).placed).toEqual([
      slot(task.id, '2026-10-13T05:00:00.000Z', '2026-10-13T05:30:00.000Z'),
    ]);
  });

  it('takes a task at 2:00 AM to 9:00 AM of the same Dubai day', () => {
    const task = todo(30);

    expect(place([task], new Date('2026-10-12T22:00:00.000Z')).placed).toEqual([
      slot(task.id, '2026-10-13T05:00:00.000Z', '2026-10-13T05:30:00.000Z'),
    ]);
  });

  it('takes a task to the first gap of tomorrow when today is full until 10:00 PM', () => {
    booked('13:40', '22:00');
    booked('09:00', '10:00', { scheduled_start: dubai('09:00', 1), scheduled_end: dubai('10:00', 1) });
    const task = todo(30);

    expect(place([task]).placed).toEqual([slot(task.id, dubai('10:00', 1), dubai('10:30', 1))]);
  });

  it('passes over a full day to the day after it', () => {
    booked('13:40', '22:00');
    booked('09:00', '22:00', { scheduled_start: dubai('09:00', 1), scheduled_end: dubai('22:00', 1) });
    const task = todo(30);

    expect(place([task]).placed).toEqual([slot(task.id, dubai('09:00', 2), dubai('09:30', 2))]);
  });

  it('rolls the tasks of one call that do not fit today over, in their order', () => {
    const tasks = [todo(300), todo(300), todo(300)];

    expect(place(tasks).placed).toEqual([
      slot(tasks[0].id, dubai('13:40'), dubai('18:40')),
      slot(tasks[1].id, dubai('09:00', 1), dubai('14:00', 1)),
      slot(tasks[2].id, dubai('14:00', 1), dubai('19:00', 1)),
    ]);
  });
});

describe('bumping (AC7)', () => {
  it('gives an urgent task the nearest gap and moves the medium task it lies on, not the low one after it', () => {
    setClock(STORED);
    const medium = booked('13:40', '14:40');
    const low = booked('14:40', '15:10', { priority: 'low' });
    const urgent = todo(30, { priority: 'urgent' });
    const second = todo(30, { priority: 'urgent' });
    vi.setSystemTime(new Date(WRITTEN));

    expect(commit([urgent])).toEqual({
      placed: [slot(urgent.id, dubai('13:40'), dubai('14:10'))],
      moved: [slot(medium.id, dubai('15:10'), dubai('16:10'))],
      unplaced: [],
    });
    expect(row(medium)).toEqual({
      ...medium,
      scheduled_start: dubai('15:10'),
      scheduled_end: dubai('16:10'),
      updated_at: WRITTEN,
    });
    expect(row(low)).toEqual(low);

    expect(commit([second])).toEqual({
      placed: [slot(second.id, dubai('14:10'), dubai('14:40'))],
      moved: [],
      unplaced: [],
    });
  });

  it('is kept out by an urgent task and by an in_progress task', () => {
    booked('13:40', '14:00', { priority: 'urgent' });
    booked('14:00', '14:20', { priority: 'low', status: 'in_progress' });
    const urgent = todo(30, { priority: 'urgent' });

    expect(place([urgent])).toEqual({
      placed: [slot(urgent.id, dubai('14:20'), dubai('14:50'))],
      moved: [],
      unplaced: [],
    });
  });

  it('places an urgent task without regard to its slot', () => {
    const urgent = todo(30, { priority: 'urgent', time_slot: 'night' });

    expect(place([urgent]).placed).toEqual([slot(urgent.id, dubai('13:40'), dubai('14:10'))]);
  });

  it.each(['high', 'medium', 'low'] as const)('does not bump for a %s task', (priority) => {
    booked('13:40', '14:40', { priority: 'low' });
    const task = todo(30, { priority });

    expect(place([task])).toEqual({
      placed: [slot(task.id, dubai('14:40'), dubai('15:10'))],
      moved: [],
      unplaced: [],
    });
  });

  it('moves a task with no priority', () => {
    const plain = booked('13:40', '14:40', { priority: null });
    const urgent = todo(30, { priority: 'urgent' });

    expect(place([urgent])).toEqual({
      placed: [slot(urgent.id, dubai('13:40'), dubai('14:10'))],
      moved: [slot(plain.id, dubai('14:10'), dubai('15:10'))],
      unplaced: [],
    });
  });

  it('places a bumped task again inside its slot window', () => {
    const first = booked('20:00', '20:40', { time_slot: 'night' });
    booked('20:40', '21:30', { time_slot: 'night' });
    const urgent = todo(30, { priority: 'urgent' });

    expect(place([urgent], at('19:58'))).toEqual({
      placed: [slot(urgent.id, dubai('20:00'), dubai('20:30'))],
      moved: [slot(first.id, dubai('20:00', 1), dubai('20:40', 1))],
      unplaced: [],
    });
  });

  it('places the bumped tasks again by priority, then by their old start, then by id', () => {
    const lateLow = booked('14:00', '14:20', { priority: 'low' });
    const earlyLow = booked('13:40', '14:00', { priority: 'low' });
    const firstHigh = booked('14:20', '14:40', { priority: 'high' });
    const secondHigh = booked('14:20', '14:40', { priority: 'high' });
    const urgent = todo(60, { priority: 'urgent' });

    expect(place([urgent])).toEqual({
      placed: [slot(urgent.id, dubai('13:40'), dubai('14:40'))],
      moved: [
        slot(lateLow.id, dubai('15:40'), dubai('16:00')),
        slot(earlyLow.id, dubai('15:20'), dubai('15:40')),
        slot(firstHigh.id, dubai('14:40'), dubai('15:00')),
        slot(secondHigh.id, dubai('15:00'), dubai('15:20')),
      ],
      unplaced: [],
    });
  });

  it('lets no bumped task stand in the way of another', () => {
    const high = booked('13:40', '14:00', { priority: 'high' });
    const low = booked('14:00', '15:00', { priority: 'low' });
    const urgent = todo(30, { priority: 'urgent' });

    expect(place([urgent]).moved).toEqual([
      slot(high.id, dubai('14:10'), dubai('14:30')),
      slot(low.id, dubai('14:30'), dubai('15:30')),
    ]);
  });

  it('places a bumped task around the tasks that stay', () => {
    const medium = booked('13:40', '14:40');
    booked('14:20', '15:00', { priority: 'high', status: 'in_progress' });
    booked('15:00', '15:30', { priority: 'urgent' });
    const urgent = todo(30, { priority: 'urgent' });

    expect(place([urgent])).toEqual({
      placed: [slot(urgent.id, dubai('13:40'), dubai('14:10'))],
      moved: [slot(medium.id, dubai('15:30'), dubai('16:30'))],
      unplaced: [],
    });
  });

  it('places a bumped task at or after the end of the urgent task, not in a gap before it', () => {
    booked('13:50', '14:20', { priority: 'high', status: 'in_progress' });
    const low = booked('14:20', '14:30', { priority: 'low' });
    const urgent = todo(30, { priority: 'urgent' });

    // 13:40 to 13:50 is free, and the low task is 10 minutes long.
    expect(place([urgent])).toEqual({
      placed: [slot(urgent.id, dubai('14:20'), dubai('14:50'))],
      moved: [slot(low.id, dubai('14:50'), dubai('15:00'))],
      unplaced: [],
    });
  });

  it.each([
    ['no minutes', null],
    ['more minutes than the working day', 781],
  ])('places a bumped task around a task with %s, which cannot be placed again', (_name, minutes) => {
    const high = booked('13:40', '14:00', { priority: 'high' });
    booked('14:00', '15:00', { priority: 'low', estimated_minutes: minutes });
    const urgent = todo(30, { priority: 'urgent' });

    expect(place([urgent])).toEqual({
      placed: [slot(urgent.id, dubai('13:40'), dubai('14:10'))],
      moved: [slot(high.id, dubai('15:00'), dubai('15:20'))],
      unplaced: [],
    });
  });

  it('places two urgent tasks of one call one after the other, and moves a task they both reach twice', () => {
    const medium = booked('13:40', '14:00');
    const tasks = [todo(30, { priority: 'urgent' }), todo(30, { priority: 'urgent' }), todo(30, { priority: 'high' })];

    expect(place(tasks)).toEqual({
      placed: [
        slot(tasks[0].id, dubai('13:40'), dubai('14:10')),
        slot(tasks[1].id, dubai('14:10'), dubai('14:40')),
        slot(tasks[2].id, dubai('15:00'), dubai('15:30')),
      ],
      moved: [slot(medium.id, dubai('14:40'), dubai('15:00'))],
      unplaced: [],
    });
  });

  it('moves a bumped task to the next day when today has no room after the urgent task', () => {
    const medium = booked('21:00', '22:00');
    const urgent = todo(30, { priority: 'urgent' });

    expect(place([urgent], at('21:00'))).toEqual({
      placed: [slot(urgent.id, dubai('21:00'), dubai('21:30'))],
      moved: [slot(medium.id, dubai('09:00', 1), dubai('10:00', 1))],
      unplaced: [],
    });
  });

  it('leaves a task it cannot place again where it is', () => {
    setClock(STORED);
    const stuck = booked('13:40', '14:40', { estimated_minutes: null });
    const urgent = todo(30, { priority: 'urgent' });
    vi.setSystemTime(new Date(WRITTEN));

    expect(commit([urgent])).toEqual({
      placed: [slot(urgent.id, dubai('13:40'), dubai('14:10'))],
      moved: [],
      unplaced: [],
    });
    expect(row(stuck)).toEqual(stuck);
  });
});

describe('a task that cannot be placed (AC8)', () => {
  it.each([
    ['no minutes', null],
    ['781 minutes', 781],
    ['1440 minutes', 1440],
  ])('reports a task with %s as not placed and places the others', (_name, minutes) => {
    const first = todo(15);
    const stuck = todo(minutes, { priority: 'high' });
    const third = todo(15);

    expect(commit([first, stuck, third])).toEqual({
      placed: [
        slot(first.id, dubai('13:40'), dubai('13:55')),
        slot(third.id, dubai('13:55'), dubai('14:10')),
      ],
      moved: [],
      unplaced: [stuck.id],
    });
    expect(row(stuck)).toMatchObject({ scheduled_start: null, scheduled_end: null });
    expect(row(first)).toMatchObject({ scheduled_start: dubai('13:40'), scheduled_end: dubai('13:55') });
    expect(row(third)).toMatchObject({ scheduled_start: dubai('13:55'), scheduled_end: dubai('14:10') });
  });

  it('reports an urgent task that cannot be placed and moves nothing for it', () => {
    booked('13:40', '14:40');
    const urgent = todo(null, { priority: 'urgent' });

    expect(place([urgent])).toEqual({ placed: [], moved: [], unplaced: [urgent.id] });
  });

  it('goes by the working hours of the setting', () => {
    setSetting(db, 'working_hours', { start: '10:00', end: '18:00' });
    const fits = todo(480);
    const over = todo(485);

    expect(place([fits, over])).toEqual({
      placed: [slot(fits.id, dubai('10:00', 1), dubai('18:00', 1))],
      moved: [],
      unplaced: [over.id],
    });
  });
});

describe('the hours and the windows come from the settings (AC9)', () => {
  it('goes by working hours that were changed', () => {
    setSetting(db, 'working_hours', { start: '10:00', end: '18:00' });
    const task = todo(30);

    expect(place([task], at('07:00')).placed).toEqual([slot(task.id, dubai('10:00'), dubai('10:30'))]);
    expect(place([task], at('17:40')).placed).toEqual([slot(task.id, dubai('10:00', 1), dubai('10:30', 1))]);
  });

  it('goes by a window that was changed', () => {
    setSetting(
      db,
      'slot_rules',
      seededRules().map((rule) => (rule.category === 'coding' ? { ...rule, start: '10:00', end: '12:00' } : rule)),
    );
    const task = todo(90, { time_slot: 'morning' });

    expect(place([task], at('07:00')).placed).toEqual([slot(task.id, dubai('10:00'), dubai('11:30'))]);
  });

  it('reads the settings at each call', () => {
    const task = todo(30);

    expect(place([task], at('07:00')).placed).toEqual([slot(task.id, dubai('09:00'), dubai('09:30'))]);

    setSetting(db, 'working_hours', { start: '11:00', end: '18:00' });

    expect(place([task], at('07:00')).placed).toEqual([slot(task.id, dubai('11:00'), dubai('11:30'))]);
  });
});

describe('storeSchedule', () => {
  it('stores the times of the placed and the moved tasks, and nothing else of them', () => {
    setClock(STORED);
    const moved = booked('13:40', '14:40');
    const urgent = todo(30, { priority: 'urgent' });
    const stuck = todo(null);
    vi.setSystemTime(new Date(WRITTEN));

    storeSchedule(db, place([urgent, stuck]));

    expect(row(moved)).toEqual({
      ...moved,
      scheduled_start: dubai('14:10'),
      scheduled_end: dubai('15:10'),
      updated_at: WRITTEN,
    });
    expect(row(urgent)).toEqual({
      ...urgent,
      scheduled_start: dubai('13:40'),
      scheduled_end: dubai('14:10'),
      updated_at: WRITTEN,
    });
    expect(row(stuck)).toEqual(stuck);
  });
});
