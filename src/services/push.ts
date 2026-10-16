import type { Database } from '../db/database.ts';
import { listSubscriptions, type PushSubscription } from '../db/push.ts';
import { markDueReminderTasks } from '../db/reminders.ts';
import { taskPath } from './task-list.ts';

/*
 * Web Push: the seam a test replaces, the mark-and-push of the due reminders, and the
 * repeating job. Nothing here builds a real sender or reads the clock; the caller passes
 * both.
 */

/** Sends one payload to one subscription. `src/server.ts` builds the real one; a test stubs it. */
export type PushSender = (subscription: PushSubscription, payload: string) => void;

/**
 * Marks the reminders that come due at `now` under the rule of `src/services/reminders.ts`,
 * then calls `send` once for each marked task and each `push_subscriptions` row: the
 * tasks in `reminder_at` then `id` order, and for each, the subscriptions in `id` order.
 * The payload is `{"title":<task title>,"href":"/tasks/<id>"}`. Returns the number of
 * tasks marked. With no subscription it still marks and calls `send` not at all, so the
 * in-page alarm keeps working.
 */
export function pushDueReminders(db: Database, now: Date, send: PushSender): number {
  const marked = markDueReminderTasks(db, now.toISOString());
  const subscriptions = listSubscriptions(db);
  for (const task of marked) {
    const payload = JSON.stringify({ title: task.title, href: taskPath(task.id) });
    for (const subscription of subscriptions) send(subscription, payload);
  }
  return marked.length;
}

/**
 * Starts the push job: `pushDueReminders` every `everyMs`, the first time one interval
 * from now. Returns the function that stops it. The interval is unref'd, so it does not
 * keep the process alive by itself, which `src/server.ts` needs.
 */
export function startPushJob(db: Database, send: PushSender, everyMs = 60_000): () => void {
  const timer = setInterval(() => pushDueReminders(db, new Date(), send), everyMs);
  if (typeof (timer as { unref?: unknown }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
  return () => clearInterval(timer);
}
