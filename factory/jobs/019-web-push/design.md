# 019-web-push: design

No spec problems. Five readings the spec leaves open are fixed below and repeated as
decisions:

- **AC4 and AC9 say different things about `server.ts` and `vapidPublicKey`.** AC4 says
  "the callers that have none leave it out"; AC9 says `src/server.test.ts`'s `createApp`
  deps gain `vapidPublicKey`. Reading: `src/server.ts` always names the field, as
  `vapidPublicKey: vapid?.publicKey` (`undefined` when `getVapidKeys` finds none), so the
  existing deps assertion changes to include `vapidPublicKey: undefined` (D8). The
  callers the AC4 parenthetical is about — `src/testing/app.ts`, `src/app.test.ts`,
  `src/add-photo.test.ts` and `project.test.ts`'s child — still leave it out.
- **AC6 fixes no order for the `send` calls.** Reading: the marked tasks in
  `reminder_at` then `id` order, and for each, the subscriptions in `id` order (D6).
- **AC2/AC3 do not say whether the stored values are trimmed.** Reading: only the
  *check* trims — a field is accepted when `value.trim() !== ''` — and the value is
  stored exactly as posted (D4). A key or an endpoint with a real space is nonsense, but
  the spec asks only for non-blank.
- **AC3's 400 has no page in the spec.** Reading: `res.sendStatus(400)`, the body `Bad
  Request`, as 018's Snooze did (D5).
- **AC1's "non-blank (trimmed)" does not say whether the returned values are trimmed.**
  Reading: `getVapidKeys` returns the trimmed values, like `getAnthropicApiKey` (D1).

Checked in a throwaway folder under `$TMPDIR`, deleted afterwards, on Node 26.8.2 and
yarn 1.22.22 (nothing installed into the repo, nothing written in it):

- Migration 4's `CREATE TABLE push_subscriptions (…) STRICT` is accepted, a bad
  `created_at` is refused with `CHECK constraint failed: push_subscriptions_created_at`,
  and a `STRICT` column still coerces a lossless value (an integer into `TEXT`), so the
  table does not by itself reject `p256dh` that is a number — the route's non-blank check
  and the string type of `PushSubscription` are what keep them text.
- `INSERT … ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth =
  excluded.auth RETURNING *` is accepted; a second save of the same endpoint returns the
  **same `id` and `created_at`** with the new `p256dh` and `auth`, and the table holds one
  row per endpoint.
- `UPDATE tasks … RETURNING id, title, reminder_at` runs through
  `StatementSync.all(...)` and returns **only the rows that call changed**: a second call
  at the same `now`, and one at an earlier `now`, returned `[]`. The rows come back in
  the table's order, **not** `reminder_at` order, so the `reminder_at` then `id` order of
  AC6 is made in JavaScript.
- In a throwaway TypeScript project with `web-push@3.6.7` and `@types/web-push@3.6.4`,
  compiled by this repo's `tsc` under this repo's exact `tsconfig.json` options
  (`module: NodeNext`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, no explicit
  `esModuleInterop`): `import webpush from 'web-push'` compiles, and
  `webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, payload)` type-checks.
  Under plain Node, that default import gives the module's nine members,
  `webpush.setVapidDetails('mailto:…', publicKey, privateKey)` accepts a
  `webpush.generateVAPIDKeys()` pair, and `sendNotification` returns a Promise.
- In this repo's `jsdom` (30.1.1), `navigator` is a plain object and
  `Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value
  })` and a plain `window.navigator.serviceWorker = …` both work, which is how the AC5
  test stubs it.

Not checked: a real push, the OS notification and the closed tab (the spec's hand-check),
and Node 22 and 24.

## Approach

The job is one vertical slice: a table, two endpoints that fill it, a service that sends
one push per due reminder, a job that calls that service, and the page and worker at the
other end.

`src/db/push.ts` owns the new table, migration 4 of `src/db/migrations.ts`. It is a new
module beside `src/db/tasks.ts` and `src/db/reminders.ts`, so `src/db/` stays the only
folder that names the driver and the SQL lives in one place. `saveSubscription` is an
upsert on `endpoint`, so the table keeps one row per endpoint and a device that
subscribes again does not grow it.

`src/db/reminders.ts` grows one function, `markDueReminderTasks`, which runs 018's UPDATE
through `RETURNING` and hands back the rows that call changed. That is the seam AC6
needs: it marks and tells the caller *which* tasks were marked, so `src/services/push.ts`
pushes exactly those and a second run at the same clock pushes nothing. 018's
`markDueReminders` becomes `markDueReminderTasks(db, now).length`, so `fireDueReminders`,
`startReminderJob` and 018's tests are unchanged.

`src/services/push.ts` holds `PushSender` (the seam a test stubs), `pushDueReminders`
(mark, then one `send` per marked task and subscription) and `startPushJob` (the
interval, the shape of 018's `startReminderJob`). It never builds a real sender and never
reads the clock. `src/routes/push.ts` mounts the two form posts on the urlencoded parser
the tasks router uses, and `src/app.ts` mounts it with the rest.

The page and the worker close the loop. The layout writes a
`<meta name="vapid-public-key">` and `/js/push.js` only when the app has a key;
`public/js/push.js` subscribes through the service worker's `pushManager` and posts the
three fields to `/push/subscribe`; `public/sw.js` gains a `push` handler that shows the
notification and a `notificationclick` handler that opens the task. `src/server.ts` is
the one place the real VAPID keys meet `web-push`: with keys it starts `startPushJob`, and
without them it starts 018's `startReminderJob`, so reminders are marked either way.

## Decisions

**D1. `src/config.ts` gains `getVapidKeys`, which returns the three trimmed values or
`undefined`.** Beside `getAnthropicApiKey`:

```ts
/** The three values the server signs Web Push with, as `VAPID_*` hold them. */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * The VAPID keys of the environment: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
 * `VAPID_SUBJECT`, trimmed, when all three are non-blank; `undefined` when any is unset
 * or blank. It never throws, so a server without the three starts and cannot push.
 */
export function getVapidKeys(env: NodeJS.ProcessEnv = process.env): VapidKeys | undefined {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? '';
  const subject = env.VAPID_SUBJECT?.trim() ?? '';
  if (publicKey === '' || privateKey === '' || subject === '') return undefined;
  return { publicKey, privateKey, subject };
}
```

`.env.example` lists all three, empty. `src/config.ts` stays the only file under `src/`
that reads the environment, and `src/project.test.ts` finds `env.VAPID_PUBLIC_KEY` and
its two siblings and requires them in the file. Rejected: a `getVapidKeys` that throws on
a partial set, which AC1 forbids.

**D2. The migration is a fourth entry that creates `push_subscriptions`.** Appended to
`migrations` after migration 3:

```sql
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT push_subscriptions_created_at CHECK (created_at GLOB '????-??-??T??:??:??.???Z')
) STRICT;
```

`endpoint` is `UNIQUE`, which is also the conflict target D3 needs. Migrations 1 to 3 are
untouched. Rejected: a `tasks` column, which would be the wrong place for a per-endpoint
row; and rebuilding the table later, which a `STRICT` `CREATE TABLE` avoids.

**D3. `src/db/push.ts` owns the table, and `saveSubscription` is an upsert.** `PushSubscription`
is the whole row; `saveSubscription` runs (checked):

```sql
INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
RETURNING *
```

so `created_at` is set once, the second save keeps the first `id` and `created_at` and
replaces the two keys. `listSubscriptions` is `SELECT * … ORDER BY id`. `deleteSubscription`
is `DELETE … WHERE endpoint = ?` and answers `Number(…changes) > 0`. Rejected: a
`SELECT` then `INSERT`/`UPDATE`, which is two statements where SQLite has one.

**D4. The route's field reader trims only to decide, and stores what was posted.**
`postedValue` (from `src/services/drafts.ts`) gives a `string`, `undefined` for a missing
field and `null` for a repeated one. A field is accepted with `value.trim() !== ''`; the
accepted string is stored as it was posted. Rejected: storing the trimmed value, which
the spec does not ask for and a test would have to pin.

**D5. `src/routes/push.ts` answers 303 to `/` or `res.sendStatus(400)`.** On the
`express.urlencoded({ extended: false })` parser, the same one `src/routes/tasks.ts`
uses:

```ts
  router.post('/push/subscribe', form, (req, res) => {
    const endpoint = readField(req.body, 'endpoint');
    const p256dh = readField(req.body, 'p256dh');
    const auth = readField(req.body, 'auth');
    if (endpoint === undefined || p256dh === undefined || auth === undefined) {
      res.sendStatus(400);
      return;
    }
    saveSubscription(deps.db, { endpoint, p256dh, auth });
    res.redirect(303, '/');
  });

  router.post('/push/unsubscribe', form, (req, res) => {
    const endpoint = readField(req.body, 'endpoint');
    if (endpoint === undefined) {
      res.sendStatus(400);
      return;
    }
    deleteSubscription(deps.db, endpoint);
    res.redirect(303, '/');
  });
```

`readField` is `postedValue` then D4's check. Unsubscribe ignores whether a row matched.
Rejected: rendering a page for the 400, which the spec does not name; and a `303` to
somewhere but `/`, which AC3 fixes.

**D6. `pushDueReminders` marks first, then sends once per marked task and subscription,
tasks outer.** From `src/services/push.ts`:

```ts
export function pushDueReminders(db: Database, now: Date, send: PushSender): number {
  const marked = markDueReminderTasks(db, now.toISOString());
  const subscriptions = listSubscriptions(db);
  for (const task of marked) {
    const payload = JSON.stringify({ title: task.title, href: taskPath(task.id) });
    for (const subscription of subscriptions) send(subscription, payload);
  }
  return marked.length;
}
```

The tasks come in `reminder_at` then `id` order from D7, the subscriptions in `id`
order, and the payload is exactly `{"title":…,"href":"/tasks/<id>"}` with `taskPath` of
`src/services/task-list.ts`. With no subscription the loops still mark and call nothing,
so the in-page alarm keeps working. Rejected: subscriptions outer, which no one needs.

**D7. `src/db/reminders.ts` gains `markDueReminderTasks`, and `markDueReminders` is its
length.** The same UPDATE as 018, with `RETURNING`, and the order made in JavaScript
because `RETURNING` does not order (checked):

```ts
export function markDueReminderTasks(db: Database, now: string): AlarmTask[] {
  return db
    .prepare(
      `UPDATE tasks SET reminded_at = ?
        WHERE priority = 'urgent'
          AND status IN ('pending', 'in_progress')
          AND reminder_at IS NOT NULL
          AND reminder_at <= ?
          AND (reminded_at IS NULL OR reminded_at < reminder_at)
        RETURNING id, title, reminder_at`,
    )
    .all(now, now)
    .map((row) => ({ id: Number(row.id), title: String(row.title), reminder_at: String(row.reminder_at) }))
    .sort((left, right) => (left.reminder_at === right.reminder_at ? left.id - right.id : left.reminder_at < right.reminder_at ? -1 : 1))
    .map(({ id, title }) => ({ id, title }));
}

/** The number of rows `markDueReminderTasks` changed. */
export function markDueReminders(db: Database, now: string): number {
  return markDueReminderTasks(db, now).length;
}
```

`RETURNING` returns only the rows this call changed, so a second call at the same or an
earlier `now` returns `[]` and AC6's "no further `send`" holds without a second query.
`AlarmTask` (`{ id, title }`) is reused; the middle row type carries `reminder_at` and is
dropped by the last `map`. `fireDueReminders`, `listAlarms` and 018's tests are unchanged.
Rejected: selecting `WHERE reminded_at = ?` after the UPDATE, which would also return the
rows an earlier call marked at the same `now` and would send again.

**D8. `src/services/push.ts` exports the seam, the push and the job.** Signatures in
Files. `startPushJob` is D7's consumer and the twin of `startReminderJob`:

```ts
export function startPushJob(db: Database, send: PushSender, everyMs = 60_000): () => void {
  const timer = setInterval(() => pushDueReminders(db, new Date(), send), everyMs);
  if (typeof (timer as { unref?: unknown }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
  return () => clearInterval(timer);
}
```

The first fire is one interval from the start and the interval is unref'd, so the suite
exits. Rejected: a cron library, which the plan's words once named but 018 already
rejected for the twin job.

**D9. `src/server.ts` builds the one real sender and starts exactly one job.**
`src/server.ts` always passes `vapidPublicKey` to `createApp` (the reading at the top) and
chooses the job from `getVapidKeys`:

```ts
const vapid = getVapidKeys();
const app = createApp({ db, uploadsDir: getUploadsDir(), analyze, vapidPublicKey: vapid?.publicKey });
// Exactly one job watches `reminder_at` while the server runs: the push job when the
// VAPID keys are there, the in-page alarm's marker when they are not.
if (vapid === undefined) {
  startReminderJob(db);
} else {
  startPushJob(db, createPushSender(vapid));
}
```

`createPushSender` is a function declaration in `src/server.ts` and the only place
`web-push` is used:

```ts
/**
 * The real sender: `web-push` signs with the VAPID keys and encrypts the payload. Built
 * only here, so the suite never loads the library into a test and never sends a push. A
 * failing push is logged, not thrown, so one dead endpoint does not stop the job.
 */
function createPushSender(vapid: VapidKeys): PushSender {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return (subscription, payload) => {
    webpush
      .sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
      )
      .catch((error: unknown) => {
        console.error(`The push to subscription ${subscription.id} failed:`, error);
      });
  };
}
```

`createApp` starts no job. Rejected: building the sender in `src/services/push.ts`, which
would pull `web-push` into that module's tests; and `await import('web-push')`, which
would need a top-level await for no gain.

**D10. The layout writes the key and the script only for a non-empty string.**
`src/app.ts` sets `app.locals.vapidPublicKey = deps.vapidPublicKey ?? null;` beside
`appName`, so a caller with none gets `null` and the layout writes neither. In `<head>`,
after the `locals.alarm` script block:

```ejs
<% if (locals.vapidPublicKey) { -%>
  <meta name="vapid-public-key" content="<%= vapidPublicKey %>">
  <script src="/js/push.js" defer></script>
<% } -%>
```

`getVapidKeys` and the operator both give base64url, so `<%= %>` escaping is a no-op. The
default test app has no key, so every existing page is byte-for-byte what it was and the
script-count assertions of `src/add-page.test.ts`, `src/add-voice.test.ts` and
`src/review-page.test.ts` stand. `GET /js/push.js` is served by the existing
`express.static(publicDir)`, no route. Rejected: a route for the script, which the static
mount already answers.

**D11. `public/js/push.js` subscribes only when the permission is already granted.**
An ES5 IIFE, loaded `defer`:

```js
(function () {
  var meta = document.querySelector('meta[name="vapid-public-key"]');
  if (!meta) return;
  var key = meta.getAttribute('content');
  if (!key) return;

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!navigator.serviceWorker) return;

  navigator.serviceWorker.ready
    .then(function (registration) {
      return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    })
    .then(function (subscription) {
      var keys = subscription.toJSON().keys;
      var body =
        'endpoint=' + encodeURIComponent(subscription.endpoint) +
        '&p256dh=' + encodeURIComponent(keys.p256dh) +
        '&auth=' + encodeURIComponent(keys.auth);
      return fetch('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body,
      });
    })
    .catch(function () {});
})();
```

The endpoint comes from `subscription.endpoint` and the two keys from `toJSON().keys`,
and a rejected `ready`, `subscribe` or `fetch` is swallowed, so the script never throws.
It never asks for permission: the prompt stays 018's. Rejected: `URLSearchParams`, which
would encode the same body with more code.

**D12. `public/sw.js` gains two handlers and keeps the three it has.** After the fetch
handler:

```js
self.addEventListener("push", (event) => {
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title, { data: { href: payload.href } })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.href));
});
```

The payload is AC6's, so it carries `title` and `href` only. Install, activate, fetch and
`APP_SHELL` are unchanged, so `src/pwa.test.ts` stands. Rejected: a `body` line, which the
payload does not have.

**D13. The three new web-push packages are added exactly pinned, and the test app and
jsdom types take the new fields.** `dependencies` gains `"web-push": "3.6.7"` and
`devDependencies` gains `"@types/web-push": "3.6.4"` (checked that the two compile under
this repo's `tsconfig.json`). `src/testing/app.ts`'s `TestAppOptions` gains
`vapidPublicKey?: string | null` and passes it to `createApp`, so a test can build the
page of AC4 without the key, with an empty one, and with a real one.
`src/testing/jsdom.d.ts` gains the Push/Service Worker interfaces and `navigator` on
`DomWindow`. Rejected: a hand-built `createApp` in the AC4 test, which would repeat the
helper.

## Files

Created:

- `src/db/push.ts`:

```ts
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
```

- `src/routes/push.ts`:

```ts
import express, { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { deleteSubscription, saveSubscription } from '../db/push.ts';
import { postedValue } from '../services/drafts.ts';

/*
 * The two form posts a page subscribes and unsubscribes through. A field is read with
 * `postedValue`, so one that is missing or repeated is refused, and it must be non-blank.
 * There is no authentication: the app has one user and no accounts (the backlog's
 * decision 4).
 */

/** Reads a posted field that must be a non-blank string, or `undefined`. */
function readField(body: unknown, name: string): string | undefined {
  const value = postedValue(body, name);
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Subscribes and unsubscribes an endpoint. Both answer 303 to `/` or 400. */
export function createPushRouter(deps: AppDeps): Router {
  const router = Router();
  // The forms post flat fields, so the simple parser is enough.
  const form = express.urlencoded({ extended: false });

  router.post('/push/subscribe', form, (req, res) => {
    const endpoint = readField(req.body, 'endpoint');
    const p256dh = readField(req.body, 'p256dh');
    const auth = readField(req.body, 'auth');
    if (endpoint === undefined || p256dh === undefined || auth === undefined) {
      res.sendStatus(400);
      return;
    }
    saveSubscription(deps.db, { endpoint, p256dh, auth });
    res.redirect(303, '/');
  });

  router.post('/push/unsubscribe', form, (req, res) => {
    const endpoint = readField(req.body, 'endpoint');
    if (endpoint === undefined) {
      res.sendStatus(400);
      return;
    }
    deleteSubscription(deps.db, endpoint);
    res.redirect(303, '/');
  });

  return router;
}
```

- `src/services/push.ts`:

```ts
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
```

- `public/js/push.js`: D11, as written.

- Tests (see `plan.md`): `src/config.vapid.test.ts`, `src/db/push.test.ts`,
  `src/push.test.ts`, `src/push-client.test.ts`, `src/services/push.test.ts`,
  `src/push-job.test.ts`, `src/push-sw.test.ts`.

Changed:

- `src/config.ts`: D1's `VapidKeys` and `getVapidKeys` after `getAnthropicModel`, before
  `isMissingFile`. Nothing else.

- `.env.example`: three lines after `ANTHROPIC_MODEL`, each empty, with a comment that
  the operator makes them with `npx web-push generate-vapid-keys`:

```
# The Web Push keys the server signs notifications with. Make them once with
# `npx web-push generate-vapid-keys`. Without all three the app cannot push.
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

- `src/db/migrations.ts`: append migration 4 (D2) after migration 3, with the comment
  `// 4: the push subscriptions an endpoint subscribes and unsubscribes through (019).`

- `src/db/reminders.ts`: add `markDueReminderTasks` (D7) above `markDueReminders`,
  replace `markDueReminders`' body with `return markDueReminderTasks(db, now).length;`,
  and extend the two doc comments. `AlarmTask`, `listAlarmTasks` and the module comment
  are otherwise unchanged.

- `src/db/migrations.test.ts` (AC9): in "is one of three migrations" the title becomes
  "is one of four migrations" and `expect(migrations).toHaveLength(3)` becomes
  `toHaveLength(4)`; in "gives a version 1 database …" `expect(userVersion(db)).toBe(3)`
  becomes `toBe(4)`; in "does not overwrite rules …" `expect(userVersion(second)).toBe(3)`
  becomes `toBe(4)`. Nothing else: the migration-1 hash and `versionOne`'s `toBe(1)` stay.
  There are exactly these three count assertions.

- `src/app.ts`: `import { createPushRouter } from './routes/push.ts';` in import order
  (after `./routes/overdue.ts`); `AppDeps` gains

```ts
  /** The VAPID public key the page subscribes with, or `null` when the server has none. */
  vapidPublicKey?: string | null;
```

  `app.locals.vapidPublicKey = deps.vapidPublicKey ?? null;` after `app.locals.ui`; and
  `app.use(createPushRouter(deps));` after `app.use(createTasksRouter(deps));`, before
  `createRemindersRouter`.

- `src/views/layout.ejs`: D10's three lines in `<head>`, after the `locals.alarm` script
  block.

- `src/server.ts`: D9's imports (`getVapidKeys`, `type VapidKeys`, `startPushJob`,
  `type PushSender`, `import webpush from 'web-push'`), the `vapid` const and the
  `createApp` call with `vapidPublicKey`, the `if (vapid === undefined)` job choice
  replacing the bare `startReminderJob(db);`, and the `createPushSender` declaration above
  the choice. The `listen` block is unchanged.

- `src/server.test.ts` (AC9, and AC7's wiring): the type of the `createApp` mock's
  argument gains `vapidPublicKey?: string | null`; the `config.ts` doMock also returns a
  `getVapidKeys` spy; new doMocks for `./services/push.ts` (`{ startPushJob }`) and
  `./services/reminders.ts` (`{ startReminderJob }`); `getVapidKeys.mockReturnValue(undefined)`
  in `beforeEach`; the "builds the app …" assertion gains `vapidPublicKey: undefined`; and
  a new `describe('server: the reminder and push jobs (AC7)')` with the two tests of
  `plan.md`. `afterEach` unmocks the two new modules. A `KEYS` constant holds the checked
  VAPID pair.

- `src/testing/app.ts`: `TestAppOptions` gains `vapidPublicKey?: string | null` and
  `createTestApp` passes `vapidPublicKey: options.vapidPublicKey` to `createApp` (D13).

- `src/testing/jsdom.d.ts`: the four new interfaces and the `navigator` member of D13
  (in Files below).

- `public/sw.js`: D12's two handlers after the fetch handler. Install, activate, fetch and
  `APP_SHELL` unchanged.

- `package.json` and `yarn.lock`: `web-push` `3.6.7` and `@types/web-push` `3.6.4`, added
  with `yarn add` (D13).

`src/testing/jsdom.d.ts` additions (from D13):

```ts
  /** The Push API's subscription, as `public/js/push.js` reads it. */
  export interface DomPushSubscription {
    readonly endpoint: string;
    toJSON(): { readonly endpoint: string; readonly keys: { readonly p256dh: string; readonly auth: string } };
  }

  /** The registration's push manager. jsdom has none; a test puts a stub here. */
  export interface DomPushManager {
    subscribe(options: { userVisibleOnly: boolean; applicationServerKey: string }): Promise<DomPushSubscription>;
  }

  /** A service worker registration, as the page's `ready` answers it. */
  export interface DomServiceWorkerRegistration {
    readonly pushManager: DomPushManager;
  }

  /** The Service Worker API's container. jsdom has none; a test puts a stub here. */
  export interface DomServiceWorkerContainer {
    readonly ready: Promise<DomServiceWorkerRegistration>;
  }
```

and, in `DomWindow`:

```ts
    /** The Service Worker API. jsdom has none; a test puts `serviceWorker` on it. */
    readonly navigator: { serviceWorker?: DomServiceWorkerContainer };
```

Not touched:

- `src/services/reminders.ts`: used by `src/server.ts` and the AC6 test, not changed.
- `src/db/tasks.ts`, `src/db/schema.test.ts`, `src/db/database.ts`: no `tasks` column is
  added, so the column and timestamp lists stay as they are.
- `public/sw.js`'s install, activate and fetch handlers and `APP_SHELL`; `src/pwa.test.ts`.
- `src/views/partials/alarm.ejs`, `public/js/alarm.js`, `src/routes/reminders.ts`,
  `src/routes/tasks.ts`, `src/routes/mini-bar.ts`: 018's alarm and its permission dialog
  are the page's only prompt; the push script never asks.
- `src/app.test.ts`, `src/add-photo.test.ts`, `src/project.test.ts`,
  `src/reminder-job.test.ts` and every other existing `*.test.ts` but the two above: their
  `createApp` calls leave `vapidPublicKey` out and their apps have no key.
- `vitest.config.ts`: the three `VAPID_*` are simply unset, so nothing must be added.
- `src/services/drafts.ts` (`postedValue` imported as it is), `src/services/task-list.ts`
  (`taskPath` imported as it is), `src/ui.ts`, `src/render.ts`, `src/paths.ts`,
  `docs/mockUps.html` (no push screen), `docs/plan.md`.
- `docs/` unless the builder logs an error; everything under `factory/` but this job's
  `build.md`; `data/`.

## Risks

- **A real push is never exercised.** The suite stubs `PushSender` (AC6) and never calls
  `createPushSender` except in the one server test that only checks the keys are handed
  to `web-push`. The spec's hand-check (a device, a key pair, HTTPS, a closed tab) is the
  only proof of delivery; nothing here tries to fake it.
- **`import webpush from 'web-push'` in `src/server.ts` loads the library whenever
  `src/server.test.ts` imports the server.** Checked: the default import compiles under
  this repo's `tsconfig.json` and gives the module on Node 26.8.2. A load failure would
  fail `src/server.test.ts` first, before any push runs.
- **The push-branch server test calls the real `setVapidDetails`.** It embeds a
  `generateVAPIDKeys()` pair (checked to be accepted); a wrong pair or a changed
  `web-push` would throw there. Both packages are pinned exactly, and only that one test
  reaches the call.
- **A second `pushDueReminders` at the same `now` sends again.** `markDueReminderTasks`
  uses `RETURNING` and returns only the rows the call changed (checked: a second call
  returns `[]`), so the AC6 test's second call asserts 0 marks and no new `send`.
- **The `RETURNING` rows are not in `reminder_at` order.** Checked: they come in the
  table's order, and D7's JavaScript sort fixes it. The AC6 test uses two tasks whose
  `reminder_at` order is not their `id` order, so a missing sort fails it.
- **A repeated form field is accepted.** `postedValue` answers `null` for a repeated
  field, and `readField` refuses anything that is not a string; the AC3 test posts
  `endpoint=a&endpoint=b` and expects 400 and no row.
- **A blank field is accepted.** `readField` trims before it decides; the AC3 test posts
  `'  '` for each field and expects 400.
- **The layout writes the push script onto pages that an existing test counts.** The
  default test app has no key (D10), so no page changes; `src/add-page.test.ts` and
  `src/add-voice.test.ts` count `script[src]` and must stay green.
- **A page that renders the meta breaks on a key with markup.** The key is base64url;
  `<%= %>` escapes it anyway, and the AC4 test uses a plain key.
- **`public/js/push.js` throws before it posts.** Every AC5 test asserts
  `scriptErrors(window)` is empty (`docs/errors/jsdom-page-script-error-does-not-fail-test.md`),
  the missing-`Notification` and missing-`serviceWorker` cases included. The permission
  case stubs `Notification`; the meta-absent case loads the script on a hand-written page.
- **The client posts the wrong fields.** The AC5 test's subscription stub returns an
  `endpoint` different from its `toJSON().endpoint`, and asserts the body carries the
  former; a script that reads `toJSON().endpoint` fails.
- **The migration count assertions.** There are exactly three in
  `src/db/migrations.test.ts` (`toHaveLength(3)` and two `toBe(3)`), all become 4; the
  `versionOne` assertions stay 1. `src/db/database.test.ts` uses its own migration lists.
- **The server picks two jobs or none.** The AC7 server tests assert `startReminderJob`
  is called once with no keys and `startPushJob` once with keys, never both, and both
  after `createApp` and before `listen`; `src/reminder-job.test.ts` already shows
  `createApp` starts no reminder job, and `src/push-job.test.ts` adds the push twin.
- **A plain interval keeps the suite alive.** `startPushJob` unrefs its interval, guarded
  (D8). The runner exiting is the check.
- **Ports run out when a test file is run in a loop**
  (`docs/errors/repeated-test-runs-run-out-of-ports.md`). Run each check once.
- **A reporter writes into the repo**
  (`docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md`). Default reporter
  only; `src/db/push.test.ts` uses `:memory:` and the rest `createTestApp`, so nothing is
  left under `data/`.
