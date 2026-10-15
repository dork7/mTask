import { describe, expect, it } from 'vitest';
import type { Task, TaskStatus } from '../db/tasks.ts';
import { elapsedLabel, runningTask, timerOf, workedMinutes } from './timer.ts';

/*
 * The timer's text, the minutes Done stores, and the task the mini-bar shows. Every
 * expected value is written out.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

/** A whole task row with these fields on top. */
function taskOf(extra: Partial<Task>): Task {
  return {
    id: 1,
    title: 'A task',
    description: null,
    image_path: null,
    category: null,
    estimated_minutes: 30,
    actual_minutes: null,
    priority: 'medium',
    time_slot: null,
    scheduled_start: null,
    scheduled_end: null,
    status: 'in_progress',
    started_at: null,
    completed_at: null,
    reminder_at: null,
    recurrence_rule: null,
    parent_task_id: null,
    source_id: null,
    confidence: null,
    created_at: NOW,
    updated_at: NOW,
    ...extra,
  };
}

function started(id: number, at: string | null, status: TaskStatus = 'in_progress'): Task {
  return taskOf({ id, started_at: at, status });
}

describe('elapsedLabel', () => {
  it.each([
    [0, '0:00'],
    [59_999, '0:59'],
    [725_000, '12:05'],
    [3_599_000, '59:59'],
    [3_600_000, '1:00:00'],
    [3_725_000, '1:02:05'],
    [36_005_000, '10:00:05'],
    [-5_000, '0:00'],
  ])('writes %i ms as %s', (ms, text) => {
    expect(elapsedLabel(0, ms)).toBe(text);
  });
});

describe('workedMinutes', () => {
  it.each([
    ['2026-10-12T08:21:00.000Z', 75],
    ['2026-10-12T09:35:40.000Z', 1],
    ['2026-10-12T09:33:31.000Z', 2],
    ['2026-10-12T09:33:29.000Z', 3],
    ['2026-10-12T09:40:00.000Z', 1],
  ])('from %s to now is %i', (startedAt, minutes) => {
    expect(workedMinutes(startedAt, new Date(NOW))).toBe(minutes);
  });
});

describe('timerOf', () => {
  it('is the start and the elapsed text of a started task', () => {
    expect(timerOf(started(1, '2026-10-12T09:23:55.000Z'), new Date(NOW))).toEqual({
      startedAt: '2026-10-12T09:23:55.000Z',
      text: '12:05',
    });
  });

  it('is null for a task without a start', () => {
    expect(timerOf(started(1, null), new Date(NOW))).toBeNull();
  });
});

describe('runningTask', () => {
  it('is undefined with no task in progress', () => {
    expect(runningTask([])).toBeUndefined();
    expect(runningTask([started(1, null, 'pending'), started(2, '2026-10-12T09:00:00.000Z', 'done')])).toBeUndefined();
  });

  it('is the task started last, whatever the order', () => {
    const early = started(1, '2026-10-12T08:00:00.000Z');
    const late = started(2, '2026-10-12T09:00:00.000Z');
    expect(runningTask([early, late])).toBe(late);
    expect(runningTask([late, early])).toBe(late);
  });

  it('takes the higher id on the same start, whatever the order', () => {
    const low = started(1, '2026-10-12T09:00:00.000Z');
    const high = started(2, '2026-10-12T09:00:00.000Z');
    expect(runningTask([low, high])).toBe(high);
    expect(runningTask([high, low])).toBe(high);
  });

  it('puts a task without a start before one with a start', () => {
    const none = started(2, null);
    const some = started(1, '2026-10-12T08:00:00.000Z');
    expect(runningTask([none, some])).toBe(some);
    expect(runningTask([some, none])).toBe(some);
  });

  it('takes the higher id of two without a start', () => {
    const low = started(1, null);
    const high = started(2, null);
    expect(runningTask([high, low])).toBe(high);
    expect(runningTask([low, high])).toBe(high);
  });

  it('does not choose a done task with the latest start', () => {
    const running = started(1, '2026-10-12T08:00:00.000Z');
    const done = started(2, '2026-10-12T09:00:00.000Z', 'done');
    expect(runningTask([running, done])).toBe(running);
  });
});
