import { describe, expect, it } from 'vitest';
import type { Task } from '../storage/types';
import { applyView, DEFAULT_VIEW, UNSCORED } from './taskView';

const LEVELS = ['low', 'medium', 'high', 'critical'];

function task(id: string, createdAt: string, extra: Partial<Task> = {}): Task {
  return { id, title: `Task ${id}`, description: '', createdAt, done: false, ...extra };
}
const scored = (label: string) => ({ priority: { label, score: 0, confidence: 0.9, status: 'done' as const } });

const TASKS = [
  task('a', '2026-09-01T00:00:00Z', { ...scored('low'), title: 'Buy milk' }),
  task('b', '2026-09-03T00:00:00Z', { ...scored('critical'), description: 'Server is DOWN', done: true }),
  task('c', '2026-09-02T00:00:00Z', scored('high')),
  task('d', '2026-09-04T00:00:00Z', { priority: { label: '', score: 0, confidence: 0, status: 'pending' } }),
];
const ids = (tasks: Task[]) => tasks.map((t) => t.id);

describe('applyView', () => {
  it('shows every task newest first by default', () => {
    expect(ids(applyView(TASKS, DEFAULT_VIEW, LEVELS))).toEqual(['d', 'b', 'c', 'a']);
  });

  it('sorts oldest first', () => {
    expect(ids(applyView(TASKS, { ...DEFAULT_VIEW, sort: 'oldest' }, LEVELS))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('sorts by priority, most urgent first, unscored last', () => {
    expect(ids(applyView(TASKS, { ...DEFAULT_VIEW, sort: 'priority' }, LEVELS))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('ranks labels the questions no longer list below known ones', () => {
    const tasks = [task('x', '2026-09-05T00:00:00Z', scored('someday')), ...TASKS];
    expect(ids(applyView(tasks, { ...DEFAULT_VIEW, sort: 'priority' }, LEVELS))).toEqual(['b', 'c', 'a', 'x', 'd']);
  });

  it('searches title and description, ignoring case', () => {
    expect(ids(applyView(TASKS, { ...DEFAULT_VIEW, search: 'milk' }, LEVELS))).toEqual(['a']);
    expect(ids(applyView(TASKS, { ...DEFAULT_VIEW, search: '  down ' }, LEVELS))).toEqual(['b']);
  });

  it('filters by status', () => {
    expect(ids(applyView(TASKS, { ...DEFAULT_VIEW, status: 'done' }, LEVELS))).toEqual(['b']);
    expect(ids(applyView(TASKS, { ...DEFAULT_VIEW, status: 'open' }, LEVELS))).toEqual(['d', 'c', 'a']);
  });

  it('filters by priority, or to tasks with none', () => {
    expect(ids(applyView(TASKS, { ...DEFAULT_VIEW, priority: 'high' }, LEVELS))).toEqual(['c']);
    expect(ids(applyView(TASKS, { ...DEFAULT_VIEW, priority: UNSCORED }, LEVELS))).toEqual(['d']);
  });

  it('does not reorder the input array', () => {
    const input = [...TASKS];
    applyView(input, { ...DEFAULT_VIEW, sort: 'priority' }, LEVELS);
    expect(ids(input)).toEqual(['a', 'b', 'c', 'd']);
  });
});
