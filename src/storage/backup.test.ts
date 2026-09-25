import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import { backupFileName, makeBackup, mergeTasks, parseBackup } from './backup';

const task = (id: string, title = `Task ${id}`): Task => ({
  id,
  title,
  description: '',
  createdAt: '2026-09-01T00:00:00.000Z',
  done: false,
});

describe('backup', () => {
  it('round-trips tasks and questions', () => {
    const tasks = [task('1'), { ...task('2'), done: true }];
    const result = parseBackup(makeBackup(tasks, '{"q":1}', new Date('2026-09-24T12:00:00Z')));
    expect(result).toEqual({ ok: true, tasks, questions: '{"q":1}' });
  });

  it('names the file after the app and the date', () => {
    expect(backupFileName(new Date('2026-09-24T12:00:00Z'))).toBe('task-priority-notes-2026-09-24.json');
  });

  it('accepts a bare list of tasks and fills in missing optional fields', () => {
    const result = parseBackup('[{"id":"1","title":"Buy milk"}]');
    expect(result).toEqual({
      ok: true,
      tasks: [{ id: '1', title: 'Buy milk', description: '', createdAt: '1970-01-01T00:00:00.000Z', done: false }],
      questions: undefined,
    });
  });

  it('rejects invalid JSON, a missing task list, and tasks without id or title', () => {
    expect(parseBackup('{')).toEqual({ ok: false, error: 'the file is not valid JSON' });
    expect(parseBackup('{"questions":""}')).toEqual({ ok: false, error: 'no "tasks" list found in the file' });
    expect(parseBackup('[{"title":"x"}]')).toEqual({ ok: false, error: 'task 1 has no "id"' });
    expect(parseBackup('[{"id":"1"},{"id":"2"}]')).toEqual({ ok: false, error: 'task 1 has no "title"' });
  });

  it('merges imported tasks, replacing ones with the same id', () => {
    const merged = mergeTasks([task('1', 'old'), task('2')], [task('1', 'new'), task('3')]);
    expect(merged.map((t) => [t.id, t.title])).toEqual([
      ['2', 'Task 2'],
      ['1', 'new'],
      ['3', 'Task 3'],
    ]);
  });
});
