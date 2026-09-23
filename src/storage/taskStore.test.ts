import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from './types';

describe('taskStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty array when nothing is stored', async () => {
    const { loadTasks } = await import('./taskStore');
    expect(loadTasks()).toEqual([]);
  });

  it('returns an empty array when localStorage holds invalid JSON', async () => {
    localStorage.setItem('tasks', '{not json');
    const { loadTasks } = await import('./taskStore');
    expect(loadTasks()).toEqual([]);
  });

  it('round-trips tasks through saveTasks/loadTasks', async () => {
    const { loadTasks, saveTasks } = await import('./taskStore');
    const tasks: Task[] = [
      { id: '1', title: 'Buy milk', description: '', createdAt: '2026-01-01T00:00:00.000Z', done: false },
    ];
    saveTasks(tasks);
    expect(loadTasks()).toEqual(tasks);
  });

  it('creates a task with a generated id, timestamp, done=false, and pending priority', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00.000Z'));
    const { createTask } = await import('./taskStore');

    const task = createTask('Buy milk', 'Whole milk, 2%');

    expect(task.title).toBe('Buy milk');
    expect(task.description).toBe('Whole milk, 2%');
    expect(task.done).toBe(false);
    expect(task.createdAt).toBe('2026-09-23T10:00:00.000Z');
    expect(task.id).toEqual(expect.any(String));
    expect(task.id.length).toBeGreaterThan(0);
    expect(task.priority).toEqual({ label: '', score: 0, confidence: 0, status: 'pending' });
    vi.useRealTimers();
  });
});
