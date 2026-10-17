import type { SQLOutputValue } from 'node:sqlite';
import type { Database } from './database.ts';
import { nowTimestamp } from './timestamps.ts';

/*
 * The push subscriptions: the endpoint a device subscribes through, and the two keys a
 * payload is encrypted for. One row per endpoint; the table owns the rest.
 */

/** A row of `push_subscriptions`, with the column names as they are. */
export interface PushSubscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

/**
 * Stores a subscription and returns it, with `created_at` from `nowTimestamp()`. An
 * endpoint that is already stored keeps its row: the same `id` and `created_at`, with
 * the new `p256dh` and `auth`.
 */
export function saveSubscription(
  db: Database,
  input: { endpoint: string; p256dh: string; auth: string },
): PushSubscription {
  const row = db
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
        RETURNING *`,
    )
    .get(input.endpoint, input.p256dh, input.auth, nowTimestamp());
  if (row === undefined) throw new Error('The subscription was not stored');
  return toSubscription(row);
}

/** Every subscription, in `id` order. */
export function listSubscriptions(db: Database): PushSubscription[] {
  return db.prepare('SELECT * FROM push_subscriptions ORDER BY id').all().map(toSubscription);
}

/** Removes the subscription of this endpoint. Returns `false` when there was none. */
export function deleteSubscription(db: Database, endpoint: string): boolean {
  return Number(db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint).changes) > 0;
}

/** The driver's row, which has no prototype, as a plain object. The table is STRICT. */
function toSubscription(row: Record<string, SQLOutputValue>): PushSubscription {
  return {
    id: Number(row.id),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    created_at: String(row.created_at),
  };
}
