import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from './database.ts';
import { createSource } from './sources.ts';
import { createTask, getTask, restoreTask, takeTask } from './tasks.ts';

/*
 * `takeTask` and `restoreTask` (AC6): a deleted task comes back with the same id and
 * every stored column as it was, its children are linked back, and a task whose source
 * is gone is not restored.
 */

const STORED = '2026-10-11T05:00:00.000Z';
const LATER = '2026-10-12T09:36:00.000Z';

let db: Database;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(STORED));
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

function rawRow(id: number): Record<string, unknown> | undefined {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return row === undefined ? undefined : { ...row };
}

function allRows(): Record<string, unknown>[] {
  return db
    .prepare('SELECT * FROM tasks ORDER BY id')
    .all()
    .map((row) => ({ ...row }));
}

/** A parent, then a task with every field set and `reminded_at` set by SQL, then a child of it. */
function seed(): { parentId: number; id: number; childId: number; sourceId: number } {
  const source = createSource(db, { kind: 'photo', image_path: '/uploads/a.png' });
  const parent = createTask(db, { title: 'Parent', status: 'done' });
  const task = createTask(db, {
    title: 'Every field',
    description: 'A description',
    image_path: '/uploads/a.png',
    category: 'coding',
    estimated_minutes: 30,
    actual_minutes: 25,
    priority: 'high',
    time_slot: 'morning',
    scheduled_start: '2026-10-12T05:00:00.000Z',
    scheduled_end: '2026-10-12T05:30:00.000Z',
    status: 'pending',
    started_at: null,
    completed_at: null,
    reminder_at: '2026-10-12T04:50:00.000Z',
    recurrence_rule: 'FREQ=DAILY',
    parent_task_id: parent.id,
    source_id: source.id,
    confidence: 0.75,
  });
  db.prepare('UPDATE tasks SET reminded_at = ? WHERE id = ?').run('2026-10-12T04:50:00.000Z', task.id);
  const child = createTask(db, { title: 'Child', status: 'pending', parent_task_id: task.id });
  vi.setSystemTime(new Date(LATER));
  return { parentId: parent.id, id: task.id, childId: child.id, sourceId: source.id };
}

describe('takeTask and restoreTask (AC6)', () => {
  it('puts the task back with the same id and every column, reminded_at and updated_at included', () => {
    const { id } = seed();
    const before = rawRow(id);
    expect(before?.reminded_at).toBe('2026-10-12T04:50:00.000Z');

    const taken = takeTask(db, id);
    expect(taken?.task.id).toBe(id);
    expect(rawRow(id)).toBeUndefined();

    const restored = restoreTask(db, taken!);

    expect(restored).toEqual(getTask(db, id));
    expect(rawRow(id)).toEqual(before);
  });

  it('links back the child whose parent_task_id the delete cleared', () => {
    const { id, childId } = seed();

    const taken = takeTask(db, id)!;
    expect(rawRow(childId)?.parent_task_id).toBeNull();
    expect(taken.childIds).toEqual([childId]);
    restoreTask(db, taken);

    expect(rawRow(childId)?.parent_task_id).toBe(id);
  });

  it('does not restore a task whose source is gone', () => {
    const { id, sourceId } = seed();
    const taken = takeTask(db, id)!;
    db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId);
    const rows = allRows();

    expect(restoreTask(db, taken)).toBeUndefined();
    expect(rawRow(id)).toBeUndefined();
    expect(allRows()).toEqual(rows);
  });

  it('restores a task whose parent is gone with no parent', () => {
    const { id, parentId } = seed();
    const before = rawRow(id);
    const taken = takeTask(db, id)!;
    db.prepare('DELETE FROM tasks WHERE id = ?').run(parentId);

    restoreTask(db, taken);

    expect(rawRow(id)).toEqual({ ...before, parent_task_id: null });
  });

  it('restores a taken task once', () => {
    const { id } = seed();
    const taken = takeTask(db, id)!;
    restoreTask(db, taken);
    const rows = allRows();

    expect(restoreTask(db, taken)).toBeUndefined();
    expect(allRows()).toEqual(rows);
  });

  it('takes nothing for an id that names no task', () => {
    seed();
    const rows = allRows();

    expect(takeTask(db, 99)).toBeUndefined();
    expect(allRows()).toEqual(rows);
  });
});
