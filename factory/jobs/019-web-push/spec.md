# 019-web-push: push notifications with the tab closed

## Goal

018 gave the app an alarm, but only while a page is open and polling `/reminders`. This job
adds Web Push, so an urgent reminder reaches a device whose tab is closed: the VAPID keys the
app signs with, a `push_subscriptions` table, the two endpoints a page subscribes and
unsubscribes through, a push sender that is called once for every reminder the job fires, and
the service worker's `push` handler, which shows the notification and opens the task when it
is tapped.

It sits on what is there already: the marking rule of `src/services/reminders.ts` (018 AC1)
and its interval job (018 AC6), the `AppDeps` of `src/app.ts`, the `/sw.js` and the layout of
017, the `config.ts` / `.env.example` pair that holds the Anthropic key, and the migrations of
`src/db/migrations.ts` (018 is migration 3). The plan names no routes, columns, elements or
texts for this, and `docs/mockUps.html` has no push screen, so every name and text below is
this spec's choice. The backlog's default for users (decision 4: one user, no accounts) is
assumed, so the two endpoints carry no authentication.

## Acceptance criteria

- **AC1**: VAPID keys. `src/config.ts` exports `getVapidKeys(env)`, which returns
  `{ publicKey, privateKey, subject }` when `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
  `VAPID_SUBJECT` are all non-blank (trimmed) and `undefined` when any of the three is unset
  or blank. It never throws, so a server without the three starts and simply cannot push.
  `.env.example` lists all three with empty values (`src/config.ts` is the only file that
  reads the environment, and `src/project.test.ts` requires every name read there to be
  listed).

- **AC2**: The table and its helpers. Migration 4 of `src/db/migrations.ts` creates
  `push_subscriptions` `STRICT` with the columns `id INTEGER PRIMARY KEY AUTOINCREMENT`,
  `endpoint TEXT NOT NULL UNIQUE`, `p256dh TEXT NOT NULL`, `auth TEXT NOT NULL`,
  `created_at TEXT NOT NULL`, and a `push_subscriptions_created_at` CHECK with the same
  `????-??-??T??:??:??.???Z` GLOB as the other timestamps. `src/db/push.ts` exports
  `PushSubscription` (the row) and:
  - `saveSubscription(db, { endpoint, p256dh, auth })` stores a row and returns it, setting
    `created_at` from `nowTimestamp()`. A second save with the same `endpoint` changes that
    row's `p256dh` and `auth` — same `id`, unchanged `created_at` — so the table keeps one
    row per endpoint.
  - `listSubscriptions(db)` returns every row in `id` order.
  - `deleteSubscription(db, endpoint)` removes the row and answers `true`; with no such
    endpoint it answers `false` and writes nothing.

- **AC3**: Subscribe and unsubscribe. `src/routes/push.ts` mounts two form posts, on the
  urlencoded parser the tasks router uses:
  - `POST /push/subscribe` with the fields `endpoint`, `p256dh` and `auth`, all three
    non-blank: AC2's save runs and the answer is 303 to `/`. Any of the three missing, blank
    or given twice: 400 and no row is written. Posting an `endpoint` already stored leaves
    one row, with the new `p256dh` and `auth`.
  - `POST /push/unsubscribe` with the field `endpoint`: AC2's delete runs and the answer is
    303 to `/`, whether or not a row matched. A missing, blank or repeated `endpoint`: 400
    and no row changes.

- **AC4**: The public key in the page. `AppDeps` of `src/app.ts` gains an optional
  `vapidPublicKey?: string | null` (the callers that have none leave it out), and `createApp`
  puts it in `app.locals`. The layout `src/views/layout.ejs` writes these two into `<head>`
  when the key is a non-empty string, and neither when it is absent or empty:
  - `<meta name="vapid-public-key" content="<the key>">`
  - `<script src="/js/push.js" defer></script>`
  `GET /js/push.js` answers 200 with a JavaScript content type.

- **AC5**: The client subscribes. `public/js/push.js`, on the page of AC4, reads the key from
  the meta and, when `Notification.permission` is `granted` and `navigator.serviceWorker`
  exists, waits for `navigator.serviceWorker.ready` and calls that registration's
  `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <the key> })`. With
  the subscription back, it posts `endpoint`, `p256dh` and `auth` — read from the
  subscription's `endpoint` and `toJSON().keys` — to `/push/subscribe` as a form. When the
  permission is not `granted`, the meta is absent, or `navigator.serviceWorker` does not
  exist, it posts nothing and throws nothing. (A jsdom test stubs the two APIs and `fetch`;
  the real permission and a real key pair are the hand check below.) The permission prompt
  itself stays 018's: this job subscribes only once the permission is already granted.

- **AC6**: A push per due reminder, through a sender the test stubs. `src/services/push.ts`
  exports:
  - `type PushSender = (subscription: PushSubscription, payload: string) => void`, the seam
    a test replaces.
  - `pushDueReminders(db, now, send)`: marks the reminders that come due at `now` under 018
    AC1's rule (so `GET /reminders` lists them), and for each task so marked and each row of
    `push_subscriptions` calls `send(subscription, payload)` once, where `payload` is
    `JSON.stringify({ title: <task title>, href: "/tasks/<id>" })`. It returns the number of
    tasks marked. A second call at the same or an earlier `now` marks nothing and calls
    `send` no further. With no subscription it still marks and calls `send` not at all, so
    the in-page alarm keeps working.
  So that only the tasks marked by this call are pushed, `src/db/reminders.ts` gains
  `markDueReminderTasks(db, now)`, which runs 018's UPDATE and returns the changed rows' `id`
  and `title` in `reminder_at` then `id` order; 018's `markDueReminders` returns its length
  as before, so `fireDueReminders` keeps answering a number and 018's tests stand.

- **AC7**: The job and the server. `src/services/push.ts` also exports
  `startPushJob(db, send, everyMs = 60_000)`, which calls `pushDueReminders(db, new Date(),
  send)` every `everyMs`, the first time one interval after the start, and returns the
  function that stops it. `src/server.ts` starts exactly one job after `createApp` and before
  `listen`: `startPushJob(db, send)` with the sender it builds from AC1's keys when they are
  there, and 018's `startReminderJob(db)` when they are not, so reminders are marked either
  way. `createApp` starts neither. The one real sender is built only in `src/server.ts`; no
  test calls it.

- **AC8**: The service worker. `public/sw.js` gains `self.addEventListener("push", …)` and
  `self.addEventListener("notificationclick", …)`. The push handler reads `event.data.json()`
  and calls `self.registration.showNotification(<the payload's title>, …)`; the click handler
  reads the payload's `href` from the notification's data and opens it. 017's install,
  activate and fetch handlers and their cached list stay as they are.

- **AC9**: Build and tests. `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` and
  the three `VAPID_*` unset; tests use an in-memory or temporary database and leave nothing
  under `data/`. The existing assertions of two test files change:
  `src/db/migrations.test.ts` (the count is four and its titles say so) and
  `src/server.test.ts` (the `createApp` deps gain `vapidPublicKey`). No other existing test
  changes. New tests cover AC1 to AC8: the four key cases; the table and its three helpers;
  the two endpoints and their refusals; the meta, the script link and the missing key; the
  client's one post and its three silent cases; `pushDueReminders` with a stubbed sender
  (one call per subscription per marked task, the exact payload, the second call, the no
  subscription case) and `startPushJob` on fake timers; and the two lines of `sw.js` source.

## Out of scope

- The in-page alarm, its 30-second poll of `/reminders`, Snooze and Dismiss (018).
- The permission dialog: 018's alarm owns it. This job subscribes only once the permission is
  already granted.
- The settings page's notification and sound controls, the Unsubscribe button and the install
  prompt (022), which will call AC3's endpoints and load AC5's script.
- The morning digest and its push (020). Recurring tasks (016). The calendar feed (021).
- Generating a VAPID key pair: the app reads the three values from the environment; the
  operator makes them (for example `npx web-push generate-vapid-keys`).
- The library the real sender sends through: the architect picks it, and the suite never calls
  it. Only AC6's `PushSender` seam is tested.
- Escalating repeat alerts, Telegram and WhatsApp notifications (the plan's Left out).
- **Checked by hand** (needs a device, a real key pair and an HTTPS origin): with the tab
  closed, an urgent task whose `reminder_at` passes arrives as a notification on time, and
  tapping it opens the task (the backlog's 019 line; plan task 13's "Done when"). The suite
  cannot assert a real push, the OS notification or the closed tab.
