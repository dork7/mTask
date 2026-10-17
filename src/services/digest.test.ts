import { describe, expect, it } from 'vitest';
import type { Task } from '../db/tasks.ts';
import { DIGEST_PATH, buildDigest } from './digest.ts';

/*
 * The digest builder's rules the page tests do not reach on their own: the exact shape
 * `buildDigest` returns, the overdue order's tie-break and null-last branch, the empty
 * day with a running task, and that it does not touch the list handed in. `NOW` is 1:36
 * PM on 12 Oct 2026 in Dubai.
 */

const NOW = new Date('2026-10-12T09:36:00.000Z');

/** 8:00 to 8:45 AM on 12 Oct in Dubai, before `NOW`. */
const DONE_MORNING = { scheduled_start: '2026-10-12T04:00:00.000Z', scheduled_end: '2026-10-12T04:45:00.000Z' };

/** 9:00 to 9:30 AM on 12 Oct in Dubai, before `NOW` and so overdue. */
const OVERDUE_TODAY = { scheduled_start: '2026-10-12T05:00:00.000Z', scheduled_end: '2026-10-12T05:30:00.000Z' };

/** 9:00 to 9:30 AM on 11 Oct in Dubai, a day before `NOW` and so overdue. */
const OVERDUE_YESTERDAY = { scheduled_start: '2026-10-11T05:00:00.000Z', scheduled_end: '2026-10-11T05:30:00.000Z' };

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

describe('DIGEST_PATH', () => {
  it('is the path of the page the push opens', () => {
    expect(DIGEST_PATH).toBe('/digest');
  });
});

describe('buildDigest', () => {
  /** The tasks of the AC2, AC3 and AC4 examples: four today, one overdue. */
  function exampleRows(): Task[] {
    return [
      row(1, { status: 'done', estimated_minutes: 45, ...DONE_MORNING }),
      row(2, { estimated_minutes: 45, scheduled_start: '2026-10-12T10:00:00.000Z', scheduled_end: '2026-10-12T10:45:00.000Z' }),
      row(3, { estimated_minutes: 60, scheduled_start: '2026-10-12T12:00:00.000Z', scheduled_end: '2026-10-12T13:00:00.000Z' }),
      row(4, { estimated_minutes: 60, scheduled_start: '2026-10-12T14:00:00.000Z', scheduled_end: '2026-10-12T15:00:00.000Z' }),
      row(5, { status: 'done', estimated_minutes: 45, ...OVERDUE_YESTERDAY }),
      row(6, { status: 'draft', estimated_minutes: 30, scheduled_start: '2026-10-12T16:00:00.000Z', scheduled_end: '2026-10-12T16:30:00.000Z' }),
      row(7, { estimated_minutes: 30 }),
      row(8, OVERDUE_YESTERDAY),
    ];
  }

  it('returns the date, the count, the minutes, the first task and the overdue items', () => {
    expect(buildDigest(exampleRows(), NOW)).toEqual({
      date: 'Monday, 12 Oct',
      count: 4,
      countText: '4 tasks today',
      plannedMinutes: 210,
      plannedText: '210 min planned',
      first: { id: 2, title: 'Task 2', href: '/tasks/2', time: '2:00 PM' },
      overdue: [{ id: 8, title: 'Task 8', href: '/tasks/8', due: '11 Oct 9:00 AM' }],
      overdueCount: 1,
      addHref: '/add',
      overdueHref: '/overdue',
      timelineHref: '/timeline',
    });
  });

  it('breaks a tie of overdue start times by id', () => {
    const tasks = [row(5, OVERDUE_TODAY), row(2, OVERDUE_TODAY)];

    expect(buildDigest(tasks, NOW).overdue.map((item) => item.id)).toEqual([2, 5]);
  });

  it('puts an overdue task without a start last and labels it by its end', () => {
    const tasks = [row(1, { scheduled_end: '2026-10-12T06:00:00.000Z' }), row(2, OVERDUE_TODAY)];

    const digest = buildDigest(tasks, NOW);

    expect(digest.overdue.map((item) => item.id)).toEqual([2, 1]);
    expect(digest.overdue[1].due).toBe('Today 10:00 AM');
  });

  it('has no first task and nothing overdue for a day with only a running task, which it counts', () => {
    const tasks = [row(1, { status: 'in_progress', ...OVERDUE_TODAY })];

    const digest = buildDigest(tasks, NOW);

    expect(digest.count).toBe(1);
    expect(digest.first).toBeNull();
    expect(digest.overdue).toEqual([]);
    expect(digest.overdueCount).toBe(0);
  });

  it('leaves the list handed in unchanged', () => {
    const tasks = [row(5, OVERDUE_TODAY), row(2, OVERDUE_TODAY)];
    const before = [...tasks];

    buildDigest(tasks, NOW);

    expect(tasks).toEqual(before);
    expect(tasks[0]).toBe(before[0]);
  });
});
