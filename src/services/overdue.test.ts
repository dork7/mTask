import { describe, expect, it } from 'vitest';
import type { Task } from '../db/tasks.ts';
import { isOverdue, overdueGroups, pickedTimes, readPickedStart } from './overdue.ts';

/*
 * Which tasks are overdue, the group each is shown in, and the time a user picks for
 * one. `NOW` is 1:36 PM on 12 Oct 2026 in Dubai.
 */

const NOW = new Date('2026-10-12T09:36:00.000Z');

/** A pending task row with only what the view reads set to something real. */
function row(id: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    image_path: null,
    category: null,
    estimated_minutes: 30,
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
    created_at: '2026-10-11T05:00:00.000Z',
    updated_at: '2026-10-11T05:00:00.000Z',
    ...extra,
  };
}

/** The groups as `[id, task ids]`. */
function shape(tasks: readonly Task[]): [string, number[]][] {
  return overdueGroups(tasks, NOW).map((group) => [group.id, group.tasks.map((task) => task.id)]);
}

describe('isOverdue (AC1)', () => {
  it('is true for a pending task that ended a millisecond before now', () => {
    expect(isOverdue(row(1, { scheduled_end: '2026-10-12T09:35:59.999Z' }), NOW)).toBe(true);
  });

  it.each([
    ['ends exactly at now', { scheduled_end: '2026-10-12T09:36:00.000Z' }],
    ['ends a millisecond after now', { scheduled_end: '2026-10-12T09:36:00.001Z' }],
    ['has no end', { scheduled_end: null }],
    ['is a draft', { status: 'draft', scheduled_end: '2026-10-11T05:30:00.000Z' }],
    ['is in progress', { status: 'in_progress', scheduled_end: '2026-10-11T05:30:00.000Z' }],
    ['is done', { status: 'done', scheduled_end: '2026-10-11T05:30:00.000Z' }],
  ] as const)('is false for a task that %s', (_name, extra) => {
    expect(isOverdue(row(1, extra), NOW)).toBe(false);
  });
});

describe('overdueGroups (AC2)', () => {
  it('puts the spec examples in Today, Yesterday and Earlier, in that order, and leaves out one ending at now', () => {
    const tasks = [
      row(1, { scheduled_start: '2026-10-09T05:00:00.000Z', scheduled_end: '2026-10-09T05:30:00.000Z' }),
      row(2, { scheduled_start: '2026-10-11T05:00:00.000Z', scheduled_end: '2026-10-11T05:30:00.000Z' }),
      row(3, { scheduled_start: '2026-10-12T05:00:00.000Z', scheduled_end: '2026-10-12T05:30:00.000Z' }),
      row(4, { scheduled_start: '2026-10-12T09:00:00.000Z', scheduled_end: '2026-10-12T09:36:00.000Z' }),
    ];

    expect(overdueGroups(tasks, NOW).map((group) => group.label)).toEqual(['Today', 'Yesterday', 'Earlier']);
    expect(shape(tasks)).toEqual([
      ['today', [3]],
      ['yesterday', [2]],
      ['earlier', [1]],
    ]);
  });

  it('leaves out the groups without a task', () => {
    const tasks = [
      row(1, { scheduled_start: '2026-10-09T05:00:00.000Z', scheduled_end: '2026-10-09T05:30:00.000Z' }),
      row(2, { scheduled_start: '2026-10-08T05:00:00.000Z', scheduled_end: '2026-10-08T05:30:00.000Z' }),
    ];

    expect(shape(tasks)).toEqual([['earlier', [2, 1]]]);
    expect(shape([])).toEqual([]);
  });

  it('groups by the Dubai day of the end, not the UTC day', () => {
    const tasks = [
      row(1, { scheduled_end: '2026-10-11T20:00:00.000Z' }),
      row(2, { scheduled_end: '2026-10-11T19:55:00.000Z' }),
      row(3, { scheduled_end: '2026-10-10T19:55:00.000Z' }),
      row(4, { scheduled_end: '2026-10-10T20:00:00.000Z' }),
    ];

    expect(shape(tasks)).toEqual([
      ['today', [1]],
      ['yesterday', [2, 4]],
      ['earlier', [3]],
    ]);
  });

  it('orders a group by start, ties by id, a task without a start last, and leaves the input as it was', () => {
    const tasks = [
      row(1, { scheduled_end: '2026-10-11T07:30:00.000Z' }),
      row(2, { scheduled_start: '2026-10-11T07:00:00.000Z', scheduled_end: '2026-10-11T07:30:00.000Z' }),
      row(3, { scheduled_start: '2026-10-11T05:00:00.000Z', scheduled_end: '2026-10-11T05:30:00.000Z' }),
      row(4, { scheduled_start: '2026-10-11T06:00:00.000Z', scheduled_end: '2026-10-11T06:30:00.000Z' }),
      row(5, { scheduled_start: '2026-10-11T05:00:00.000Z', scheduled_end: '2026-10-11T05:30:00.000Z' }),
    ];
    const copy = structuredClone(tasks);

    expect(shape(tasks)).toEqual([['yesterday', [3, 5, 4, 2, 1]]]);
    expect(tasks).toEqual(copy);
  });
});

describe('readPickedStart (AC7, AC8)', () => {
  it.each([
    ['2026-10-12T18:00', '2026-10-12T14:00:00.000Z'],
    ['2026-10-12T13:36', '2026-10-12T09:36:00.000Z'],
    ['2026-10-13T00:00', '2026-10-12T20:00:00.000Z'],
    ['2028-02-29T00:00', '2028-02-28T20:00:00.000Z'],
  ])('reads %s on the Dubai clock', (value, instant) => {
    expect(readPickedStart(value, NOW)?.toISOString()).toBe(instant);
  });

  it.each([
    undefined,
    null,
    '',
    '2026-02-30T10:00',
    '2027-02-29T00:00',
    '2026-10-12T24:00',
    '2026-10-12T23:60',
    '2026-10-12T13:30',
    '2026-10-12T13:35',
    '2026-10-12T18:00:00',
    '2026-10-12 18:00',
    ' 2026-10-12T18:00',
    '2026-10-12T18:00\n',
    '٢٠٢٦-10-12T18:00',
    '0099-10-12T18:00',
  ])('refuses %j', (value) => {
    expect(readPickedStart(value, NOW)).toBeUndefined();
  });

  it('refuses the minute of now once now is past it', () => {
    expect(readPickedStart('2026-10-12T13:36', new Date('2026-10-12T09:36:30.000Z'))).toBeUndefined();
  });
});

describe('pickedTimes (AC7)', () => {
  const start = new Date('2026-10-12T14:00:00.000Z');

  it('keeps the length of the scheduled window', () => {
    const task = row(1, { scheduled_start: '2026-10-11T05:00:00.000Z', scheduled_end: '2026-10-11T05:30:00.000Z' });

    expect(pickedTimes(task, start)).toEqual({
      scheduled_start: '2026-10-12T14:00:00.000Z',
      scheduled_end: '2026-10-12T14:30:00.000Z',
    });
  });

  it('takes the window over the estimate when the task has both times', () => {
    const task = row(1, {
      estimated_minutes: 30,
      scheduled_start: '2026-10-11T05:00:00.000Z',
      scheduled_end: '2026-10-11T06:00:00.000Z',
    });

    expect(pickedTimes(task, start)?.scheduled_end).toBe('2026-10-12T15:00:00.000Z');
  });

  it('uses the estimate for a task with an end and no start, or no length without one', () => {
    const end = '2026-10-11T05:30:00.000Z';

    expect(pickedTimes(row(1, { estimated_minutes: 45, scheduled_end: end }), start)).toEqual({
      scheduled_start: '2026-10-12T14:00:00.000Z',
      scheduled_end: '2026-10-12T14:45:00.000Z',
    });
    expect(pickedTimes(row(1, { estimated_minutes: null, scheduled_end: end }), start)).toEqual({
      scheduled_start: '2026-10-12T14:00:00.000Z',
      scheduled_end: '2026-10-12T14:00:00.000Z',
    });
  });

  it('is undefined when the end would be past the year 9999', () => {
    const task = row(1, { scheduled_start: '2026-10-11T05:00:00.000Z', scheduled_end: '2026-10-11T10:00:00.000Z' });
    const latest = readPickedStart('9999-12-31T23:59', NOW);

    expect(latest).toBeDefined();
    expect(pickedTimes(task, latest as Date)).toBeUndefined();
  });
});
