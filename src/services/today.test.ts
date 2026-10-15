import { describe, expect, it } from 'vitest';
import type { Task } from '../db/tasks.ts';
import { QUICK_ADD, buildToday, progressOf, tasksLeft } from './today.ts';

/*
 * The Today dashboard's rules that the page tests do not reach on their own: the id
 * tie-break, the rounding, nothing planned, the banner's count, an empty category and a
 * Later item's dot. `NOW` is 1:36 PM on 12 Oct 2026 in Dubai.
 */

const NOW = new Date('2026-10-12T09:36:00.000Z');

/** 2:00 to 2:45 PM on 12 Oct in Dubai. */
const AFTERNOON = { scheduled_start: '2026-10-12T10:00:00.000Z', scheduled_end: '2026-10-12T10:45:00.000Z' };

/** 9:00 to 9:30 AM on 12 Oct in Dubai, before `NOW`. */
const MORNING = { scheduled_start: '2026-10-12T05:00:00.000Z', scheduled_end: '2026-10-12T05:30:00.000Z' };

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

describe('tasksLeft', () => {
  it('breaks a tie of start times by id', () => {
    const tasks = [row(5, AFTERNOON), row(3, AFTERNOON)];

    expect(tasksLeft(tasks, NOW).map((task) => task.id)).toEqual([3, 5]);
  });

  it('leaves the list handed in in its order', () => {
    const tasks = [row(5, AFTERNOON), row(3, AFTERNOON)];
    const before = [...tasks];

    tasksLeft(tasks, NOW);

    expect(tasks).toEqual(before);
    expect(tasks[0]).toBe(before[0]);
  });
});

describe('progressOf', () => {
  it('rounds the percent to the nearest whole number', () => {
    const tasks = [
      row(1, { status: 'done', estimated_minutes: 20, ...MORNING }),
      row(2, { estimated_minutes: 10, ...AFTERNOON }),
    ];

    expect(progressOf(tasks, NOW)).toEqual({
      percent: 67,
      minutesText: '20 of 30 min done',
      tasksText: '1 of 2 tasks finished',
    });
  });

  it('gives 0% when nothing is planned', () => {
    const tasks = [row(1, { status: 'done', estimated_minutes: null, ...MORNING })];

    expect(progressOf(tasks, NOW)).toEqual({
      percent: 0,
      minutesText: '0 of 0 min done',
      tasksText: '1 of 1 tasks finished',
    });
  });
});

describe('buildToday', () => {
  it('has no banner when nothing is overdue', () => {
    expect(buildToday([row(1, AFTERNOON)], NOW).overdue).toBeNull();
  });

  it('counts one overdue task in the singular', () => {
    expect(buildToday([row(1, MORNING)], NOW).overdue).toEqual({ href: '/overdue', text: '1 overdue task' });
  });

  it('counts several overdue tasks in the plural', () => {
    const tasks = [row(1, MORNING), row(2, MORNING), row(3, MORNING)];

    expect(buildToday(tasks, NOW).overdue?.text).toBe('3 overdue tasks');
  });

  it('leaves an empty category out of the Next up meta line', () => {
    const today = buildToday([row(1, { category: '', estimated_minutes: 45, ...AFTERNOON })], NOW);

    expect(today.nextUp?.meta).toBe('about 45 min');
  });

  it('names a Later item by its priority, or gives it none', () => {
    const tasks = [row(1, AFTERNOON), row(2, { priority: 'medium', ...AFTERNOON }), row(3, AFTERNOON)];

    const later = buildToday(tasks, NOW).later;

    expect(later.map(({ id, tone, priorityLabel }) => ({ id, tone, priorityLabel }))).toEqual([
      { id: 2, tone: 'medium', priorityLabel: 'Medium priority' },
      { id: 3, tone: 'none', priorityLabel: null },
    ]);
  });

  it('hands on the quick-add links as they are', () => {
    expect(buildToday([], NOW).quickAdd).toBe(QUICK_ADD);
  });
});
