import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from './database.ts';
import { createSource, getSource, listSourceTasks, type NewSource } from './sources.ts';
import { createTask, getTask, listTasks } from './tasks.ts';

/** The time on the clock in every test. */
const T = '2026-03-04T05:06:07.089Z';

let db: Database;

/** Passes input the types forbid, the way untyped code could. */
function unchecked(input: object): NewSource {
  return input as NewSource;
}

function countSources(): unknown {
  return db.prepare('SELECT COUNT(*) AS rows FROM sources').get()?.rows;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(T));
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

describe('createSource and getSource (AC5)', () => {
  it('stores a photo with its image path, and returns it as a plain object', () => {
    const source = createSource(db, { kind: 'photo', image_path: 'uploads/a.jpg' });

    expect(source).toStrictEqual({
      id: 1,
      kind: 'photo',
      image_path: 'uploads/a.jpg',
      transcript: null,
      created_at: T,
    });
    expect(Object.getPrototypeOf(source)).toBe(Object.prototype);
  });

  it.each(['voice', 'text'] as const)('stores a %s source with its transcript', (kind) => {
    const source = createSource(db, { kind, transcript: 'Buy milk and call the bank' });

    expect(source).toStrictEqual({
      id: 1,
      kind,
      image_path: null,
      transcript: 'Buy milk and call the bank',
      created_at: T,
    });
  });

  it('getSource returns the source that was created', () => {
    const photo = createSource(db, { kind: 'photo', image_path: 'uploads/a.jpg' });
    const voice = createSource(db, { kind: 'voice', transcript: 'Buy milk' });

    expect(getSource(db, photo.id)).toStrictEqual(photo);
    expect(getSource(db, voice.id)).toStrictEqual(voice);
  });

  it('getSource returns undefined for an id that does not exist', () => {
    createSource(db, { kind: 'photo', image_path: 'uploads/a.jpg' });

    expect(getSource(db, 999)).toBeUndefined();
  });
});

describe('listSourceTasks (AC5)', () => {
  it('returns the tasks of the source it is given, in id order', () => {
    const first = createSource(db, { kind: 'photo', image_path: 'uploads/a.jpg' });
    const second = createSource(db, { kind: 'text', transcript: 'Water the plants' });
    createTask(db, { title: 'Buy milk', source_id: first.id });
    createTask(db, { title: 'Call the bank', source_id: first.id, status: 'pending' });
    createTask(db, { title: 'Water the plants', source_id: second.id });
    createTask(db, { title: 'No source' });

    expect(listSourceTasks(db, first.id)).toStrictEqual([getTask(db, 1), getTask(db, 2)]);
    expect(listSourceTasks(db, first.id).map((task) => task.title)).toEqual(['Buy milk', 'Call the bank']);
    expect(listSourceTasks(db, second.id)).toStrictEqual([getTask(db, 3)]);
  });

  it('is empty for a source with no tasks and for an id that is no source', () => {
    const source = createSource(db, { kind: 'photo', image_path: 'uploads/a.jpg' });
    createTask(db, { title: 'No source' });

    expect(listSourceTasks(db, source.id)).toEqual([]);
    expect(listSourceTasks(db, 999)).toEqual([]);
  });

  it('listTasks combines the source with a status', () => {
    const first = createSource(db, { kind: 'photo', image_path: 'uploads/a.jpg' });
    const second = createSource(db, { kind: 'text', transcript: 'Water the plants' });
    const draft = createTask(db, { title: 'Buy milk', source_id: first.id });
    createTask(db, { title: 'Call the bank', source_id: first.id, status: 'pending' });
    createTask(db, { title: 'Water the plants', source_id: second.id });
    createTask(db, { title: 'No source' });

    expect(listTasks(db, { source_id: first.id, status: 'draft' })).toStrictEqual([draft]);
  });
});

describe('a source the table does not allow (AC3)', () => {
  it.each([
    ['a kind that is not allowed, with a transcript', { kind: 'video', transcript: 'Buy milk' }, 'sources_kind'],
    ['a kind that is not allowed, with nothing else', { kind: 'video' }, /sources_kind|sources_content/],
    ['a photo without an image path', { kind: 'photo' }, 'sources_content'],
    ['a photo with a transcript only', { kind: 'photo', transcript: 'Buy milk' }, 'sources_content'],
    ['a voice source without a transcript', { kind: 'voice' }, 'sources_content'],
    ['a voice source with an image path only', { kind: 'voice', image_path: 'uploads/a.jpg' }, 'sources_content'],
    ['a misspelled image path', { kind: 'photo', image_pth: 'uploads/a.jpg' }, 'sources_content'],
    ['no kind', { transcript: 'Buy milk' }, 'NOT NULL constraint failed: sources.kind'],
  ])('createSource throws for %s and stores nothing', (_name, input, error) => {
    expect(() => createSource(db, unchecked(input))).toThrow(error);

    expect(countSources()).toBe(0);
  });
});

describe('the timestamp of a source (AC7)', () => {
  it('createSource sets created_at to the clock, as UTC ISO text', () => {
    const source = createSource(db, { kind: 'text', transcript: 'Buy milk' });

    expect(source.created_at).toBe(T);
    expect(db.prepare('SELECT created_at FROM sources WHERE id = ?').get(source.id)).toEqual({ created_at: T });
  });

  it.each([
    ['another timestamp', '2020-01-01T00:00:00.000Z'],
    ['null', null],
  ])('a caller cannot set created_at: %s is not stored', (_name, created_at) => {
    const source = createSource(db, unchecked({ kind: 'text', transcript: 'Buy milk', created_at }));

    expect(source.created_at).toBe(T);
    expect(getSource(db, source.id)?.created_at).toBe(T);
  });
});
