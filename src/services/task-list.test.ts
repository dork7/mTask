import { describe, expect, it } from 'vitest';
import type { Task } from '../db/tasks.ts';
import {
  queryString,
  readListQuery,
  shownTasks,
  togglePriority,
  toggleSlot,
  withQuery,
  type ListQuery,
} from './task-list.ts';

/*
 * The query of the task list as a request gives it and as the app writes it back, and
 * the order of the tasks it shows. The objects handed to `readListQuery` are what
 * Express's default query parser gives: a string for a name given once, an array for a
 * repeated one.
 */

const NONE: ListQuery = { priorities: [], slots: [], sort: 'start' };

/** A task row with only what the list reads set to something real. */
function row(id: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
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
    created_at: '2026-10-12T05:00:00.000Z',
    updated_at: '2026-10-12T05:00:00.000Z',
    ...extra,
  };
}

describe('readListQuery (AC3, AC4)', () => {
  it('keeps the known ids of each parameter once, in the order of src/ui.ts, and drops unknown ones', () => {
    expect(readListQuery({ priority: ['high', 'urgent', 'high', 'loud'], slot: 'night' })).toEqual({
      priorities: ['urgent', 'high'],
      slots: ['night'],
      sort: 'start',
    });
  });

  it.each([
    ['no query', undefined],
    ['an empty query', {}],
    ['a value that is not a string', { priority: 5 }],
    ['a bracketed name', { 'priority[]': 'high' }],
  ])('has no filter and sorts by start for %s', (_name, query) => {
    expect(readListQuery(query)).toEqual(NONE);
  });

  it.each(['priority', 'newest'] as const)('keeps sort=%s', (sort) => {
    expect(readListQuery({ sort }).sort).toBe(sort);
  });

  it.each([
    ['an unknown key', 'bogus'],
    ['an empty value', ''],
    ['a repeated key', ['priority', 'priority']],
  ])('sorts by start for %s', (_name, sort) => {
    expect(readListQuery({ sort }).sort).toBe('start');
  });
});

describe('queryString and withQuery (AC5)', () => {
  it('writes the priorities, then the slots, in the order of src/ui.ts, then the sort', () => {
    expect(queryString({ priorities: ['high', 'urgent'], slots: ['night', 'morning'], sort: 'newest' })).toBe(
      'priority=urgent&priority=high&slot=morning&slot=night&sort=newest',
    );
  });

  it('leaves out sort=start, and the ? when the query is empty', () => {
    expect(queryString(NONE)).toBe('');
    expect(withQuery('/tasks', NONE)).toBe('/tasks');
    expect(withQuery('/tasks', { ...NONE, priorities: ['low'] })).toBe('/tasks?priority=low');
  });
});

describe('togglePriority and toggleSlot (AC5)', () => {
  const list: ListQuery = { priorities: ['high'], slots: ['night'], sort: 'newest' };

  it('turns a priority on and off and leaves the slots and the sort', () => {
    expect(togglePriority(list, 'urgent')).toEqual({ priorities: ['high', 'urgent'], slots: ['night'], sort: 'newest' });
    expect(togglePriority(list, 'high')).toEqual({ priorities: [], slots: ['night'], sort: 'newest' });
  });

  it('turns a slot on and off and leaves the priorities and the sort', () => {
    expect(toggleSlot(list, 'morning')).toEqual({ priorities: ['high'], slots: ['night', 'morning'], sort: 'newest' });
    expect(toggleSlot(list, 'night')).toEqual({ priorities: ['high'], slots: [], sort: 'newest' });
  });
});

describe('shownTasks (AC3, AC4)', () => {
  it('does not reorder the list handed in', () => {
    const tasks = [
      row(1, { scheduled_start: '2026-10-12T11:00:00.000Z' }),
      row(2),
      row(3, { scheduled_start: '2026-10-12T10:00:00.000Z' }),
    ];
    const copy = [...tasks];

    expect(shownTasks(tasks, NONE).map((task) => task.id)).toEqual([3, 1, 2]);
    expect(tasks).toEqual(copy);
  });
});
