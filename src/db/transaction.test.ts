import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './database.ts';
import { createTask, listTasks } from './tasks.ts';
import { inTransaction } from './transaction.ts';

let db: Database;

beforeEach(() => {
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

function titles(): string[] {
  return listTasks(db).map((task) => task.title);
}

/** What a function throws. Fails when it returns. */
function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('The function returned');
}

describe('inTransaction', () => {
  it('returns what run returns and keeps the rows run created', () => {
    const result = inTransaction(db, () => {
      createTask(db, { title: 'first' });
      createTask(db, { title: 'second' });
      return 'the result';
    });

    expect(result).toBe('the result');
    expect(titles()).toEqual(['first', 'second']);
  });

  it('throws the error of run again and stores nothing run created before it', () => {
    const failure = new Error('run failed');

    const thrown = thrownBy(() =>
      inTransaction(db, () => {
        createTask(db, { title: 'first' });
        throw failure;
      }),
    );

    expect(thrown).toBe(failure);
    expect(titles()).toEqual([]);
  });

  it('stores no task when the table refuses the second of two', () => {
    const thrown = thrownBy(() =>
      inTransaction(db, () => {
        createTask(db, { title: 'first' });
        createTask(db, { title: 'second', priority: 'nope' as never });
      }),
    );

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('tasks_priority');
    expect(titles()).toEqual([]);
  });

  it('leaves the database ready for the next transaction after a failed one', () => {
    expect(() =>
      inTransaction(db, () => {
        createTask(db, { title: 'lost' });
        throw new Error('run failed');
      }),
    ).toThrow('run failed');

    inTransaction(db, () => {
      createTask(db, { title: 'kept' });
    });

    expect(titles()).toEqual(['kept']);
  });
});
