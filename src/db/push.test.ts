import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from './database.ts';
import { deleteSubscription, listSubscriptions, saveSubscription } from './push.ts';

/*
 * The push_subscriptions table and its three helpers (AC2). The clock is faked so the
 * `created_at` a save writes is one known value, and the table is reached around the
 * helper where the raw SQL matters.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

let db: Database;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

/** A raw insert of one subscription, at this id and `created_at`, around the helper. */
function rawInsert(id: number, endpoint: string, createdAt: string): void {
  db.prepare('INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    endpoint,
    'P',
    'A',
    createdAt,
  );
}

describe('the push_subscriptions table (AC2)', () => {
  it('has the five columns, in order', () => {
    const names = db
      .prepare('PRAGMA table_info(push_subscriptions)')
      .all()
      .map((row) => row.name);

    expect(names).toEqual(['id', 'endpoint', 'p256dh', 'auth', 'created_at']);
  });

  it('refuses a second row for an endpoint that is already stored', () => {
    rawInsert(1, 'https://x', NOW);

    expect(() => rawInsert(2, 'https://x', NOW)).toThrow(/UNIQUE/);
    expect(listSubscriptions(db)).toHaveLength(1);
  });

  it('refuses a created_at that is not a stored timestamp and keeps no row', () => {
    expect(() => rawInsert(1, 'https://x', '2026-10-12 09:36:00')).toThrow(/push_subscriptions_created_at/);
    expect(listSubscriptions(db)).toEqual([]);
  });
});

describe('saveSubscription (AC2)', () => {
  it('stores a row and returns it, with the faked clock as created_at', () => {
    const saved = saveSubscription(db, { endpoint: 'https://x', p256dh: 'P1', auth: 'A1' });

    expect(saved).toStrictEqual({ id: 1, endpoint: 'https://x', p256dh: 'P1', auth: 'A1', created_at: NOW });
    expect(listSubscriptions(db)).toEqual([saved]);
  });

  it('keeps one row when the same endpoint is saved again, with the new keys', () => {
    const first = saveSubscription(db, { endpoint: 'https://x', p256dh: 'P1', auth: 'A1' });
    const second = saveSubscription(db, { endpoint: 'https://x', p256dh: 'P2', auth: 'A2' });

    expect(second).toStrictEqual({ ...first, p256dh: 'P2', auth: 'A2' });
    expect(listSubscriptions(db)).toEqual([second]);
  });
});

describe('listSubscriptions (AC2)', () => {
  it('returns every row in id order, though they were stored in another', () => {
    rawInsert(3, 'https://c', NOW);
    rawInsert(1, 'https://a', NOW);
    rawInsert(2, 'https://b', NOW);

    expect(listSubscriptions(db).map((row) => row.id)).toEqual([1, 2, 3]);
  });
});

describe('deleteSubscription (AC2)', () => {
  it('removes the row and answers true, then false with nothing left', () => {
    saveSubscription(db, { endpoint: 'https://x', p256dh: 'P1', auth: 'A1' });

    expect(deleteSubscription(db, 'https://x')).toBe(true);
    expect(listSubscriptions(db)).toEqual([]);
    expect(deleteSubscription(db, 'https://x')).toBe(false);
    expect(listSubscriptions(db)).toEqual([]);
  });
});
