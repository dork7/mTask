# 019-web-push: plan

Decision numbers (D1, D2, …) refer to `design.md`. Every code block the steps name is in
`design.md` under Files (or the decision that shows it); copy it as written.

## Steps

1. **The VAPID config.** Files: `src/config.ts`, `.env.example`. Serves AC1.
   - Add `VapidKeys` and `getVapidKeys` (D1) after `getAnthropicModel`; add the three
     empty names and their comment to `.env.example`.
   - Check: `yarn test src/config.vapid.test.ts src/project.test.ts` passes (the second
     one proves `.env.example` lists all three).

2. **The migration and the table helpers.** Files: `src/db/migrations.ts`,
   `src/db/migrations.test.ts`, `src/db/push.ts` (new). Serves AC2.
   - Append migration 4 (D2); change the three count assertions and the one title of
     `migrations.test.ts`; create `src/db/push.ts` (D3).
   - Check: `yarn test src/db/migrations.test.ts src/db/push.test.ts` passes.

3. **The new reminders helper.** Files: `src/db/reminders.ts`. Serves AC6.
   - Add `markDueReminderTasks` and make `markDueReminders` return its length (D7).
     Nothing else in the file.
   - Check: `yarn test src/services/reminders.test.ts src/reminders.test.ts` passes
     unchanged.

4. **The push service.** Files: `src/services/push.ts` (new). Serves AC6, AC7.
   - Create the file as in Files (D6, D8).
   - Check: `yarn build` is clean.

5. **The dependency.** Files: `package.json`, `yarn.lock`. Serves AC7.
   - `yarn add web-push@3.6.7` and `yarn add -D @types/web-push@3.6.4` (D13). Leave both
     pinned exactly; do not loosen to a range.
   - Check: `yarn build` is clean (it does not import the package yet, but the pin is
     resolved and locked).

6. **The two endpoints.** Files: `src/routes/push.ts` (new), `src/app.ts`. Serves AC3,
   AC4.
   - Create `createPushRouter` (D5); in `src/app.ts` add the `vapidPublicKey` field to
     `AppDeps`, set `app.locals.vapidPublicKey`, import and mount the router after
     `createTasksRouter`.
   - Check: `yarn test src/push.test.ts` passes.

7. **The key in the page and the client.** Files: `src/views/layout.ejs`,
   `public/js/push.js` (new), `src/testing/app.ts`, `src/testing/jsdom.d.ts`. Serves AC4,
   AC5.
   - Add D10's three lines to the layout; create `public/js/push.js` (D11); add the test
     app option and the jsdom interfaces (D13).
   - Check: `yarn test src/push.test.ts src/push-client.test.ts src/add-page.test.ts
     src/add-voice.test.ts src/review-page.test.ts src/pwa.test.ts` passes and
     `yarn build` is clean.

8. **The job and the server.** Files: `src/push-job.test.ts` (new), `src/server.ts`,
   `src/server.test.ts`. Serves AC7.
   - Add the imports, the `vapid` const, the `createApp` call with `vapidPublicKey` and
     the `if (vapid === undefined)` choice plus `createPushSender` to `src/server.ts`
     (D9); change `src/server.test.ts` as D13 and the Steps say; write
     `src/push-job.test.ts`.
   - Check: `yarn test src/push-job.test.ts src/server.test.ts src/reminder-job.test.ts`
     passes and the runner exits.

9. **The service worker.** Files: `public/sw.js`, `src/push-sw.test.ts` (new). Serves
   AC8.
   - Add the `push` and `notificationclick` handlers after the fetch handler (D12); write
     `src/push-sw.test.ts`.
   - Check: `yarn test src/push-sw.test.ts src/pwa.test.ts` passes.

10. **The tests, then the whole suite.** Serves AC1 to AC9.
    - Write every test listed under Tests. For each, break the code the way its line
      says once, see it fail, and put the code back; run each file once per break
      (`docs/errors/repeated-test-runs-run-out-of-ports.md`), with the default reporter.
    - Check: `ANTHROPIC_API_KEY= VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= VAPID_SUBJECT=
      yarn build` and the same `yarn test` pass; `git diff --stat main -- '*.test.ts'`
      lists only `src/db/migrations.test.ts` and `src/server.test.ts` changed, plus the
      seven new files; `git status --porcelain data/` is empty.

## Tests

Shared setup, as in `src/tasks-actions.test.ts` and `src/reminder-job.test.ts`:

- `NOW = '2026-10-12T09:36:00.000Z'` (1:36 PM in Dubai), `STORED = '2026-10-11T05:00:00.000Z'`.
- `src/db/push.test.ts` and `src/services/push.test.ts` use `vi.useFakeTimers({ toFake:
  ['Date'] })` and `vi.setSystemTime(new Date(NOW))` in `beforeEach`, `vi.useRealTimers()`
  in `afterEach`, and `openDatabase(':memory:')` (closed in `afterEach`). `src/push-job.test.ts`
  uses `vi.useFakeTimers()` (all timers).
- `src/push.test.ts` uses `createTestApp({ vapidPublicKey: KEY })` where `KEY` is a
  base64url string, and `createTestApp({ vapidPublicKey: '' })` and `createTestApp()` for
  the missing cases; `testApp.close()` in `afterEach`.
- `src/push-client.test.ts` uses `createTestApp({ vapidPublicKey: KEY })`, `openPage`,
  `runLinkedScripts`, a `fetch` stub that records calls, a `Notification` stub, a
  `serviceWorker` stub, and `flush = () => new Promise((resolve) => setTimeout(resolve, 0))`;
  it asserts `scriptErrors(window)` for every window it opens
  (`docs/errors/jsdom-page-script-error-does-not-fail-test.md`).
- `task(db, extra)` makes a pending urgent task with a `reminder_at` before `NOW` and
  `title: 'A task'`; `subscription(db, n)` makes one `saveSubscription` row; the sender is
  `vi.fn<PushSender>()`. `src/server.test.ts`'s `KEYS` is the checked pair
  `{ publicKey: 'BHBjqXnNyMq3hDqYFob0fy-yoSWYlE8d2wXfWRx9qUgXY2L1oQ8_sHxKnUP3RVCWFjJmqHKU88i-EWyYulEtI2U',
  privateKey: 'qCQ9VuEsy-NTlptIqrY-O8KMGIc7HPuXj-DH2pt-cR0', subject: 'mailto:push@example.test' }`.

### AC1: `src/config.vapid.test.ts`

- All three set, each with surrounding spaces: `getVapidKeys({ VAPID_PUBLIC_KEY: ' pub ',
  VAPID_PRIVATE_KEY: ' priv ', VAPID_SUBJECT: ' mailto:a@b.c ' })` is exactly
  `{ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:a@b.c' }`. (Fails when a
  value is not trimmed or a field is dropped.)
- `it.each` of the three names, each left out while the others are set: `undefined`.
  (Fails when a missing name is not checked.)
- `it.each` of the three names, each `''` and each `'   '` while the others are set:
  `undefined`. (Fails when a blank is accepted.)
- Nothing set (`getVapidKeys({})`) and a full `process.env`-shaped object with all three:
  `undefined` for the first, no throw either time. (Fails when a missing set throws.)

### AC2: `src/db/push.test.ts`

- `PRAGMA table_info(push_subscriptions)` names `['id', 'endpoint', 'p256dh', 'auth',
  'created_at']`, and a raw insert of an endpoint already stored throws `UNIQUE`. (Fails
  when migration 4 is missing or `endpoint` is not unique.)
- A raw insert with `created_at = datetime('now')` throws `push_subscriptions_created_at`
  and the table keeps no row. (Fails when the CHECK is missing or has another name.)
- `saveSubscription(db, { endpoint: 'https://x', p256dh: 'P1', auth: 'A1' })` returns the
  row with a numeric `id`, that endpoint, both keys and `created_at === NOW` (the faked
  clock); `listSubscriptions(db)` is `[that row]`. (Fails when `created_at` is not
  `nowTimestamp()`, or the wrong columns are returned.)
- A second `saveSubscription` with a new `p256dh`/`auth`: the returned `id` and
  `created_at` equal the first, the keys are the new ones, and `listSubscriptions` has
  one row. (Fails when the upsert inserts a second row or rewrites `created_at`/`id`.)
- `listSubscriptions` with rows saved in a different order than their ids returns them in
  `id` order. (Fails with no `ORDER BY`.)
- `deleteSubscription(db, 'https://x')` is `true` and `listSubscriptions` is empty; a
  second call is `false` and the table is still empty. (Fails when the count is not read,
  or a missing row answers "true".)

### AC3: `src/push.test.ts`

- `POST /push/subscribe` with `endpoint`, `p256dh` and `auth` is 303 with `Location: /`,
  and `listSubscriptions` is one row with exactly those three values. (Fails when the
  route does not save, answers another status, or redirects elsewhere.)
- Posting the same `endpoint` with new `p256dh`/`auth` is 303 and leaves one row with the
  first `id` and `created_at` and the new keys. (Fails when the route deletes and inserts,
  or the upsert is not reached.)
- `it.each` of the refusals: `endpoint`, `p256dh` and `auth` each left out; each posted
  as `'   '`; and each posted twice (`endpoint=a&endpoint=b&…`): 400 and
  `listSubscriptions` is unchanged. (Fails when a missing, blank or repeated field is
  accepted or a row is written.)
- `POST /push/unsubscribe` with a stored endpoint is 303 with `Location: /` and the row
  is gone. (Fails when the delete is not called or the status/location is wrong.)
- The same post with an endpoint that is not stored is 303 to `/` and every row is
  unchanged. (Fails when a miss is an error.)
- The unsubscribe with `endpoint` left out, `'   '`, or twice: 400 and every row is
  unchanged. (Fails when the check is dropped.)

### AC4: `src/push.test.ts`

- `GET /` on `createTestApp({ vapidPublicKey: KEY })`: one `meta[name="vapid-public-key"]`
  whose `content` is `KEY`, and one `script[src="/js/push.js"]` with `defer`. (Fails when
  the layout writes neither, or drops the `defer`.)
- `GET /js/push.js` is 200 with a content type matching `/javascript/`. (Fails when the
  static file is missing.)
- `GET /` on `createTestApp({ vapidPublicKey: '' })` and on `createTestApp()`: no
  `meta[name="vapid-public-key"]` and no `script[src="/js/push.js"]`. (Fails when the
  truthiness check or the `?? null` is wrong.)

### AC5: `src/push-client.test.ts`

- Permission `granted`, `serviceWorker.ready` a resolved registration: after
  `runLinkedScripts` and `flush`, `subscribe` was called once with exactly
  `{ userVisibleOnly: true, applicationServerKey: KEY }`, and `fetch` was called once
  with `POST /push/subscribe` and the body
  `endpoint=<enc(subscription.endpoint)>&p256dh=<enc(keys.p256dh)>&auth=<enc(keys.auth)>`,
  where the stub's `subscription.endpoint` differs from its `toJSON().endpoint`; nothing
  threw. (Fails when the option is wrong, the payload reads `toJSON().endpoint`, or the
  body is malformed.)
- Permission `default`: no `subscribe`, no `fetch`, `scriptErrors(window)` empty. (Fails
  when the permission check is missing or inverted.)
- The meta absent (a hand-written page with only `<script src="/js/push.js" defer>`):
  no `fetch`, `scriptErrors(window)` empty. (Fails when the meta check is dropped — the
  script would then read `Notification`.)
- The meta present and permission `granted`, but no `serviceWorker` on `navigator`: no
  `fetch`, `scriptErrors(window)` empty. (Fails when the `serviceWorker` guard is
  dropped.)

### AC6: `src/services/push.test.ts`

- Two urgent pending tasks due before `NOW` (the earlier `reminder_at`, `09:00`, on the
  task with the larger id, so task order is not id order) and two subscriptions:
  `pushDueReminders(db, new Date(NOW), send)` is 2 and `send.mock.calls` is exactly
  `[[s1, pA], [s2, pA], [s1, pB], [s2, pB]]` with `pA`/`pB` the tasks in `reminder_at`
  order and each payload `JSON.stringify({ title, href: '/tasks/<id>' })`. (Fails when a
  task is pushed twice, a subscription is skipped, the order is id order, or the payload
  differs.)
- A second `pushDueReminders(db, new Date(NOW), send)` is 0 and `send` has no new call.
  (Fails when `markDueReminderTasks` selects `reminded_at = now` instead of returning the
  changed rows.)
- The same call at an earlier `now` is 0 with no new call. (Fails when an earlier clock
  re-marks.)
- One due task and no subscription: `pushDueReminders` is 1, `send` was not called, and
  `listAlarms(db, new Date(NOW))` has that task, so `GET /reminders` lists it. (Fails when
  the mark is skipped with no subscription, or no row is left marked.)

### AC7: `src/push-job.test.ts` and `src/server.test.ts`

- `src/push-job.test.ts`, one due task and one subscription, `const stop =
  startPushJob(db, send, 1_000)`: `send` was not called at once. (Fails when the job fires
  at the start.)
- `vi.advanceTimersByTime(1_000)`: `send` was called once, with the subscription and the
  payload of the task. (Fails when no interval is made or the period is not `everyMs`.)
- A second due task added, `stop()`, `vi.advanceTimersByTime(10_000)`: `send` has no new
  call. (Fails when the returned function does not clear the interval.)
- `createTestApp({ analyze: vi.fn() })` with a due task and a subscription,
  `vi.advanceTimersByTime(120_000)`: the task's `reminded_at` (raw `SELECT`) is null, so
  `createApp` starts no job. (Fails when `createApp` starts a push or a reminder job.)
- `src/server.test.ts`, `getVapidKeys` returning `undefined`: importing the server calls
  `startReminderJob` once with `[database]`, `startPushJob` not at all, both after
  `createApp` and before `listen`. (Fails when the choice is inverted or both start.)
- `src/server.test.ts`, `getVapidKeys` returning `KEYS`: `startPushJob` is called once
  with `database` first and a function second, `startReminderJob` not at all, and the
  `createApp` deps carry `vapidPublicKey: KEYS.publicKey`. (Fails when the sender is not
  built, the wrong job starts, or the key is not handed on.)

### AC8: `src/push-sw.test.ts`

- `GET /sw.js` is 200 with a content type matching `/javascript/`, and the source
  contains `self.addEventListener("push"`, `event.data.json()`,
  `self.registration.showNotification(`, `self.addEventListener("notificationclick"`,
  `notification.data.href` and `clients.openWindow(`. (Fails when either listener is
  missing, or the handlers do not read the payload or open the href.)

### AC9: the build, the two changed files, the seven new ones

- `ANTHROPIC_API_KEY= VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= VAPID_SUBJECT= yarn build` and
  the same `yarn test` pass and the runner exits; `src/db/migrations.test.ts` and
  `src/server.test.ts` are the only existing test files that change; the seven new test
  files cover AC1 to AC8; `git status --porcelain data/` is empty.
