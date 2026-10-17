# 019-web-push: build

Branch `factory/019-web-push`. Code commit `3f54477`. Built on Node v26.8.2 and yarn 1.22.22
(the design's throwaway checks were Node 26.8.2 too; Node 22 and 24 were not run).

## What changed

Created:

| File | Why | Decision |
| --- | --- | --- |
| `src/db/push.ts` | `PushSubscription` and the table's three helpers, the upsert on `endpoint` | D3 (AC2) |
| `src/routes/push.ts` | The two urlencoded form posts, 303 to `/` or 400 | D5 (AC3) |
| `src/services/push.ts` | The `PushSender` seam, `pushDueReminders`, `startPushJob` | D6, D8 (AC6, AC7) |
| `public/js/push.js` | Subscribes only when the permission is granted, then posts the three fields | D11 (AC5) |
| `src/config.vapid.test.ts` | The four key cases of AC1 | AC1 |
| `src/db/push.test.ts` | The table, the three helpers, the refusals | AC2 |
| `src/push.test.ts` | The two endpoints and their refusals, the meta and the script | AC3, AC4 |
| `src/push-client.test.ts` | The client's one post and its three silent cases | AC5 |
| `src/services/push.test.ts` | `pushDueReminders` with a stubbed sender | AC6 |
| `src/push-job.test.ts` | `startPushJob` on fake timers, and `createApp` starts no job | AC7 |
| `src/push-sw.test.ts` | The two handlers in the served `sw.js` | AC8 |
| `docs/errors/new-table-breaks-the-hardcoded-table-list.md` | The `database.test.ts` failure below and its fix | — |

Changed:

| File | Why | Decision |
| --- | --- | --- |
| `src/config.ts` | `VapidKeys` and `getVapidKeys` after `getAnthropicModel` | D1 (AC1) |
| `.env.example` | The three empty `VAPID_*` names and their comment | D1 (AC1) |
| `src/db/migrations.ts` | Migration 4, `push_subscriptions`, `STRICT`, after migration 3 | D2 (AC2) |
| `src/db/reminders.ts` | `markDueReminderTasks`, and `markDueReminders` is its length | D7 (AC6) |
| `src/app.ts` | `AppDeps.vapidPublicKey`, `app.locals.vapidPublicKey`, mount the push router | D10 (AC3, AC4) |
| `src/views/layout.ejs` | The `<meta>` and the `/js/push.js` script, only for a non-empty key | D10 (AC4) |
| `src/server.ts` | The one real `web-push` sender and the one job (push, else reminder) | D9 (AC7) |
| `src/testing/app.ts` | `TestAppOptions.vapidPublicKey`, passed to `createApp` | D13 (AC4) |
| `src/testing/jsdom.d.ts` | The Push/Service Worker interfaces and `navigator` | D13 (AC5) |
| `public/sw.js` | The `push` and `notificationclick` handlers after the fetch handler | D12 (AC8) |
| `package.json`, `yarn.lock` | `web-push@3.6.7`, `@types/web-push@3.6.4`, exact | D13 (AC7) |
| `src/db/migrations.test.ts` | The one title and three count assertions, three to four | AC9 |
| `src/server.test.ts` | The `createApp` deps and the two AC7 job tests | AC7, AC9 |
| `src/db/database.test.ts` | Its hardcoded table list gains `push_subscriptions` | see Not done |

## Acceptance criteria

| Criterion | Test | Fails when | Result |
| --- | --- | --- | --- |
| AC1 VAPID keys | `src/config.vapid.test.ts` | I dropped the `.trim()` on `VAPID_PUBLIC_KEY` in `getVapidKeys`: `returns the three values, trimmed…` and `is undefined when VAPID_PUBLIC_KEY is blank` failed | PASS |
| AC2 table and helpers | `src/db/push.test.ts` | I removed the `ON CONFLICT(endpoint) DO UPDATE …` from `saveSubscription`: `keeps one row when the same endpoint is saved again, with the new keys` failed | PASS |
| AC3 subscribe/unsubscribe | `src/push.test.ts` | I dropped `value.trim() !== ''` from `readField`: the four `… blank: 400 …` tests failed | PASS |
| AC4 key in the page | `src/push.test.ts` | I removed `defer` from the `/js/push.js` script in `layout.ejs`: `writes the key and the client script into the head` failed | PASS |
| AC5 client subscribes | `src/push-client.test.ts` | I removed the `Notification.permission !== 'granted'` guard from `public/js/push.js`: `does nothing when the permission is not granted` failed | PASS |
| AC6 push per due reminder | `src/services/push.test.ts` | I removed the `.sort(…)` in `markDueReminderTasks`: `sends once per marked task and subscription, in reminder_at then id order` failed | PASS |
| AC7 job and server | `src/push-job.test.ts`, `src/server.test.ts` | I made `startPushJob` call `pushDueReminders` once before the interval: `fires one interval from the start, not at once` failed | PASS |
| AC8 service worker | `src/push-sw.test.ts` | I removed the `notificationclick` handler from `public/sw.js`: `opens the payload href when the notification is clicked` failed | PASS |
| AC9 build and tests | `yarn build`, `yarn test` | Not a single break: the whole suite is the check. `git status --porcelain data/` is empty | PASS |

Checked by hand:

- `ANTHROPIC_API_KEY= VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= VAPID_SUBJECT= yarn build` and the
  same `yarn test` are clean: the suite passes with the three `VAPID_*` unset (AC9).
- `git status --porcelain data/` and `git status --porcelain` are empty after the run: no
  database or uploads file was left behind.
- `git diff --stat main -- '*.test.ts'` lists the seven new test files and **three** changed
  existing ones, not the two the plan names (see Not done).
- The spec's own hand check — a device, a real key pair, an HTTPS origin, a closed tab, an
  urgent task arriving on time and opening when tapped — was **not** done: there is no such
  device or origin here. The suite cannot assert a real push, the OS notification or the
  closed tab.

## Test run

Build (`yarn build`, `tsc --noEmit`):

```
$ tsc --noEmit
Done in 1.33s.
```

Test (`yarn test`, default reporter):

```
 Test Files  74 passed (74)
      Tests  2030 passed (2030)
```

(0 failed, 0 skipped.) The same commands with `ANTHROPIC_API_KEY=` and the three `VAPID_*`
empty were also clean.

```
VERIFICATION
Build: PASS
Tests: PASS   (2030 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

- **`src/db/database.test.ts` changed, which AC9 said would not happen.** AC9 says only
  `src/db/migrations.test.ts` and `src/server.test.ts` change, and plan task 10 expects
  `git diff --stat main -- '*.test.ts'` to list only those two and the seven new files. This
  file hardcodes the schema's table list (`['settings', 'sources', 'tasks']`) and three of its
  assertions failed once migration 4 created `push_subscriptions`. There is no way to add the
  table without it, so I added `'push_subscriptions'` to that one list and left the rest of the
  file as it is. It is logged as `docs/errors/new-table-breaks-the-hardcoded-table-list.md`.
  Nothing was weakened: the list is the test's fixture for an unchanged claim about the schema.
- **The spec's "Checked by hand" was not done.** No device, key pair or HTTPS origin; the real
  push, the OS notification and the closed tab are out of the suite's reach (the design's risks
  say the same).
- **A real `web-push` send is never exercised.** Only `createPushSender`'s `setVapidDetails` runs,
  in the one `src/server.test.ts` AC7 test with the checked key pair; no push is sent (D9).
- **Node 22 and 24 were not checked.** The design's throwaway checks and this build ran on
  Node 26.8.2 only.

Nothing else in the spec, the design or the plan was skipped.
