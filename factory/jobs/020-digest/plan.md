# 020-digest: plan

Decision numbers (D1, D2, …) refer to `design.md`. Every code block the steps name is in
`design.md` under Files (or the decision that shows it); copy it as written.

## Steps

1. **The digest builder.** Files: `src/services/digest.ts` (new). Serves AC7, and provides
   the data of AC1 to AC5.
   - Create the file's imports, the module comment, `DIGEST_PATH`, `ADD_PATH`,
     `DIGEST_MINUTE_OF_DAY`, the `DigestFirst`, `DigestOverdueItem` and `Digest` interfaces,
     `minutesOf`, `firstOf`, `byStart`, `overdueItemOf` and `buildDigest` (D1–D4). Do not
     add the job yet.
   - Check: `yarn build` is clean.

2. **The daily job.** Files: `src/services/digest.ts`. Serves AC8, AC9.
   - Add `nextDigestAt`, `summaryOf`, `pushDigest` and `startDigestJob` (D7–D9). Nothing
     else changes.
   - Check: `yarn build` is clean.

3. **The route, the page and its styles.** Files: `src/routes/digest.ts` (new),
   `src/views/pages/digest.ejs` (new), `src/app.ts`, `public/css/base.css`. Serves AC1,
   AC6.
   - Create `createDigestRouter` (D11) and the view (D5, D6); add the import and the mount
     to `src/app.ts`; add the `.digest__*` block to `base.css` before the style guide
     section (D12).
   - Check: `yarn build` is clean and `yarn test src/app.test.ts src/shell.test.ts
     src/components.test.ts src/stylesheet.test.ts src/today-page.test.ts` passes (the
     diff touches no existing page).

4. **The server wiring.** Files: `src/server.ts`, `src/server.test.ts`. Serves AC10.
   - Add the import and D10's `else` branch to `src/server.ts`; add the digest mock, spy,
     assertion and unmock to `src/server.test.ts` (Files).
   - Check: `yarn test src/server.test.ts src/reminder-job.test.ts src/push-job.test.ts`
     passes and the runner exits.

5. **The tests.** Files: `src/digest-page.test.ts` (new),
   `src/services/digest.test.ts` (new), `src/digest-job.test.ts` (new). Serves AC1 to AC9.
   - Write every test listed under Tests. For each, break the code the test's line names
     once, see it fail, and put the code back; run each file once per break
     (`docs/errors/repeated-test-runs-run-out-of-ports.md`), with the default reporter.
   - Check: `yarn test src/digest-page.test.ts src/services/digest.test.ts
     src/digest-job.test.ts src/server.test.ts` passes.

6. **The whole suite and the build.** Serves AC11.
   - Check: `ANTHROPIC_API_KEY= VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= VAPID_SUBJECT=
     yarn build` and the same `yarn test` pass and the runner exits;
     `git diff --stat main -- '*.test.ts'` lists only `src/server.test.ts` changed, plus
     the three new files; `git diff --stat main -- src/db` is empty; and
     `git status --porcelain data/` is empty.

## Tests

Shared setup, as in `src/today-page.test.ts` and `src/push-job.test.ts`:

- `NOW = '2026-10-12T09:36:00.000Z'` (1:36 PM in Dubai) and
  `STORED = '2026-10-11T05:00:00.000Z'`.
- `src/digest-page.test.ts` uses `vi.useFakeTimers({ toFake: ['Date'] })` and
  `vi.setSystemTime(new Date(STORED))` in `beforeEach`, `createTestApp({ analyze:
  vi.fn<Analyze>() })` (closed in `afterEach`), `vi.useRealTimers()` in `afterEach`; helpers
  `at(time, date = '2026-10-12') = new Date(`${date}T${time}:00.000+04:00`).toISOString()`,
  `times(start, end, date?)`, `task(extra)` (pending `medium` 30 min titled `A task`),
  `draftTask(extra)`, `rows()` (snapshot `listTasks`, then `vi.setSystemTime(new Date(NOW))`),
  and `digest()` (`request(testApp.app).get('/digest')`, expect 200, `parseHtml`), plus
  `mainOf(html)` from `src/today-page.test.ts`.
- `src/services/digest.test.ts` uses `NOW = new Date('2026-10-12T09:36:00.000Z')` and a
  hand-built `row(id, extra)` exactly like `src/services/today.test.ts`'s (no database).
- `src/digest-job.test.ts` uses `vi.useFakeTimers()` (all timers), `vi.setSystemTime(...)`,
  `openDatabase(':memory:')` (closed in `afterEach`), `vi.useRealTimers()`, a
  `subscription(db, n) = saveSubscription(db, { endpoint: `https://push.example/${n}`,
  p256dh: 'P', auth: 'A' })`, `at(...)`/`times(...)` as above with `createTask`, and
  `const send = vi.fn<PushSender>()`.
- `src/server.test.ts` keeps its `KEYS` pair, `database`, `createApp` and the two job spies,
  and gains `startDigestJob` (Files).

### AC1: `src/digest-page.test.ts`

- 200 in the layout: `title` is `Digest - Task Image AI`, `textOf(one(document, 'main h1'))`
  is `Digest`, `mainOf(response.text)` contains `<h1>Digest</h1>`, and `.page-header__sub`
  is `Monday, 12 Oct`. (Fails when the header is not the page-header partial or the date is
  wrong.)
- marks no nav link current: `all(document, '[aria-current="page"]')` is `[]`. (Fails when
  the route passes a `nav` local.)
- writes the date of the request's Dubai day: `vi.setSystemTime(new Date(
  '2026-10-12T20:30:00.000Z'))` gives `Tuesday, 13 Oct`. (Fails when the route reads the
  clock instead of `requestTime(res)`.)
- escapes the task text: a first task titled `<b>x</b>` and an overdue task titled `<b>y</b>`
  give `all(one(document, 'main'), 'b')` `[]` and the literal strings as the link texts.
  (Fails when a title is written with `<%- %>`.)

### AC2: `src/digest-page.test.ts`

- the spec example: a `done` 45 min 08:00–08:45, a `pending` 45 min 14:00–14:45, a `pending`
  60 min 16:00–17:00 and a `pending` 60 min 18:00–19:00, plus a left-out `done` yesterday, a
  left-out `draft` today and a left-out `pending` with no `scheduled_start`:
  `textOf(one(document, '#digest-count'))` is `4 tasks today` and
  `textOf(one(document, '#digest-planned'))` is `210 min planned`. (Fails when a `draft`, a
  no-start or another day's task is counted, or the sum is wrong.)
- one element each: `all(document, '#digest-count')` and `all(document, '#digest-planned')`
  have length 1. (Fails when either is written twice.)
- the singular: one today task gives `1 task today`. (Fails when the plural rule is skipped.)
- nothing today gives `0 tasks today` and `0 min planned`. (Fails when an empty day is
  mishandled.)
- a null estimate counts as 0: one today task with `estimated_minutes: null` gives
  `0 min planned`. (Fails when `?? 0` is dropped and `null` is summed.)

### AC3: `src/digest-page.test.ts`

- the spec example: overdue `pending` 09:00–09:30, `pending` 14:00–14:45 and `pending`
  16:00–17:00: `#digest-first` holds one link with `href` `/tasks/2` and text
  `A task`, and `.digest__time` is `2:00 PM`. (Fails when the overdue 9:00 AM task is
  first.)
- never in progress, done or overdue: an `in_progress` 13:00–14:00, a `done` 15:00–15:30, an
  overdue `pending` 09:00–09:30 and a `pending` 16:00–16:30 make the 16:00 task
  (`/tasks/4`) first. (Fails when a non-pending or missed task is taken.)
- ties by `id`: two `pending` tasks with the same `scheduled_start`, the larger id created
  first, make the smaller id first. (Fails when the tie-break is missing.)
- the empty state: a `pending` task tomorrow and an overdue `pending` only give
  `all(document, '#digest-first')` `[]` and one `.empty-state` whose
  `.empty-state__heading` is `Nothing left today` and whose one link is `/add`. (Fails when
  the empty partial is not rendered or the link is wrong. The empty state is found by
  heading, not as the only one — AC4's may be present too.)

### AC4: `src/digest-page.test.ts`

- the spec example: a `pending` 2026-10-11T05:00:00.000Z–05:30:00.000Z, a `done`
  08:00–08:30, an `in_progress` 09:00–09:30 and a `pending` 14:00–14:45: one
  `#digest-overdue-1` whose link is `/tasks/1` and whose `.digest__time` is
  `11 Oct 9:00 AM`, no other `#digest-overdue-*`, and a link in `#digest-overdue` with
  `href` `/overdue` and text `Review overdue`. (Fails when a non-pending or non-overdue task
  is listed, or the due label is wrong.)
- order: two overdue tasks whose `scheduled_start` order is neither their `id` order nor
  their Dubai-day order, plus one overdue task with a `null` `scheduled_start`, give items
  in `scheduled_start` order with the `null` one last and ties by `id`. (Fails when
  `overdueGroups`' day order or `id` order is used, or a `null` start is first.)
- the empty state: nothing overdue makes `#digest-overdue` hold one `.empty-state` whose
  heading is `Nothing overdue`, no `#digest-overdue-*` item, and no link in `main` whose
  text is `Review overdue`. (Fails when the link is rendered in the empty branch.)

### AC5: `src/digest-page.test.ts`

- one link `#timeline-link`, `href` `/timeline`, text `View timeline`, with tasks and with
  none. (Fails when the link is inside a conditional or the id/text is wrong.)

### AC6: `src/digest-page.test.ts`

- leaves every task and setting as it was: seed an overdue task, a today task, an
  `in_progress` task, a `done` task, a `draft`, a task with no times and a task tomorrow,
  snapshot `listTasks(testApp.db)` and `SELECT key, value FROM settings ORDER BY key`, move
  the clock forward, `GET /digest` twice, and compare both snapshots unchanged. (Fails when
  the route writes a task or a setting, `updated_at` included.)

### AC7: `src/services/digest.test.ts`

- `DIGEST_PATH` is `/digest`. (Fails on a wrong path.)
- `buildDigest(rows, NOW)` on the data of AC2 to AC4 returns `date: 'Monday, 12 Oct'`,
  `count: 4`, `countText: '4 tasks today'`, `plannedMinutes: 210`,
  `plannedText: '210 min planned'`, `first` `{ id, href: '/tasks/<id>', time: '2:00 PM' }`,
  the overdue items with their `href` and `due`, `overdueCount`, `addHref: '/add'`,
  `overdueHref: '/overdue'` and `timelineHref: '/timeline'`. (Fails when a field, a text or
  an href is wrong.)
- the overdue tie-break: two overdue rows with the same `scheduled_start` in reverse `id`
  order come back by `id`. (Fails when the comparator has no tie-break.)
- a `null` `scheduled_start` overdue row is last and is labelled by its `scheduled_end`.
  (Fails when the `null`-last branch is missing or the wrong time is labelled.)
- `first` is `null` and `overdue` empty when only an `in_progress` task is today, and
  `count` still counts it. (Fails when `tasksLeft`'s pending rule is not used.)
- leaves the list handed in unchanged. (Fails when `buildDigest` sorts the caller's array.)

### AC8: `src/digest-job.test.ts`

- fires at the next 07:30, not at the start: at 2026-10-12T02:00:00.000Z with one
  subscription, `startDigestJob(db, send)` calls `send` not at all, and
  `vi.advanceTimersByTime(90 * 60_000)` calls it once. (Fails when the job fires at the
  start or at the wrong delay.)
- a start after 07:30 waits a day: at 2026-10-12T04:00:00.000Z, 90 minutes call nothing and
  1410 minutes call once. (Fails when the "at or after" check is off by one, or a missed
  time is not rolled to the next day.)
- then every 24 hours: at 02:00, 90 minutes call once and a further `DAY_MS` calls twice.
  (Fails when the interval period is wrong.)
- the returned function stops it: at 02:00, 90 minutes call once, `stop()`, a further
  `DAY_MS` calls no more. (Fails when `clearTimeout`/`clearInterval` is not called.)
- no subscription: at 02:00, 90 minutes call `send` not at all and do not throw. (Fails when
  the loops assume a row.)

### AC9: `src/digest-job.test.ts`

- the AC2/AC4 example (4 tasks today, 210 min planned, 1 overdue) with two subscriptions: at
  the fire, `send.mock.calls` is `[[s1, p], [s2, p]]` where `p` is
  `JSON.stringify({ title: '4 tasks today · 210 min planned · 1 overdue task', href: '/digest' })`.
  (Fails when a row is skipped, the order is not `id`, the suffix is missing, or the payload
  differs.)
- no overdue: the title is `4 tasks today · 210 min planned` with no suffix. (Fails when the
  suffix is always written.)
- one task and no overdue: `1 task today · 30 min planned`. (Fails when the summary does not
  reuse AC2's singular text.)
- two overdue: the title ends `· 2 overdue tasks`. (Fails when the plural is wrong.)

### AC10: `src/server.test.ts`

- without VAPID keys: `startDigestJob` is not called, `startReminderJob` once with
  `[database]`, `startPushJob` not at all. (Fails when a digest job starts without a sender.)
- with `getVapidKeys` returning `KEYS`: `startDigestJob` is called once with `database`
  first and, second, the very function `startPushJob` got; `startReminderJob` not at all; and
  `createApp` runs before it, which runs before `listen`. (Fails when the sender is built
  twice, the wrong branch starts it, or it starts outside the window.)
