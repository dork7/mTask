# 020-digest: morning digest page and push

## Goal

Tasks carry times, estimates and an overdue state, but nothing greets the user with the shape
of the coming day. This job adds `/digest` (`docs/plan.md`, task 14 and the U10 digest page):
today's task count, the planned minutes, the overdue items and the first task left today,
with a link to the timeline. It also adds the plan's morning job, which at 7:30 AM builds the
same digest and sends it as one Web Push to every subscribed device, so the day arrives on the
phone before the app is opened.

It only reads. It builds on what is there: `todaysTasks` and `tasksLeft` of
`src/services/today.ts` (014), `isOverdue` and `OVERDUE_PATH` of `src/services/overdue.ts`
(011), `taskPath` and `LIST_PATH` of `src/services/task-list.ts`, `TIMELINE_PATH` of
`src/services/timeline.ts`, `weekdayDateLabel`, `clockLabel` and `dayTimeLabel` of
`src/dubai.ts`, and 019's `PushSender`, `listSubscriptions` seam, `{ title, href }` payload and
`public/sw.js` push handler. The page is the page-header and empty-state partials of 002. Plan
task 14 and U10 name no route, field or text, and `docs/mockUps.html` has no digest screen, so
every name and text below is this spec's choice. The backlog's default for users (decision 4:
one user, no accounts) is assumed.

Unless a criterion says otherwise, its examples use `now` = `2026-10-12T09:36:00.000Z`
(1:36 PM on Monday 12 Oct in Asia/Dubai), the seeded settings and Dubai clock times. "Today's
tasks" are the tasks with the status `pending`, `in_progress` or `done` whose
`scheduled_start` is on the Dubai day of `now` — the same rule as a timeline block (012 AC5)
and 014. A `draft` and a task with no `scheduled_start` are never one of them. The route reads
the time once from `requestTime(res)`; the job reads it from `new Date()`.

## Acceptance criteria

- **AC1**: Page. `GET /digest` answers 200 with the app layout and the title `Digest`. The
  page header is the page-header partial, so `main` contains `<h1>Digest</h1>`, and its
  sub-line is the Dubai date of `now` as `Monday, 12 Oct`. The nav has no Digest item, so no
  nav link is marked `aria-current="page"`. All task text on the page is escaped, so a title
  of `<b>x</b>` is rendered as text.
- **AC2**: Count and planned minutes. The page has one element with the id `digest-count`,
  holding `<count> tasks today` (singular `1 task today`), where count is the number of
  today's tasks. It has one element with the id `digest-planned`, holding
  `<plannedMinutes> min planned`, the sum of `estimated_minutes` over today's tasks, a null
  counting as 0. Example: today, a `done` task of 45 min, a `pending` task of 45 min, a
  `pending` task of 60 min and a `pending` task of 60 min; left out, a `done` task scheduled
  yesterday, a `draft` with a `scheduled_start` today and a `pending` task with no
  `scheduled_start`. The page shows `4 tasks today` and `210 min planned`.
- **AC3**: First task. The page has one element with the id `digest-first`. When there is a
  task, it is the first of today's `pending` tasks whose `scheduled_end` is not earlier than
  `now`, in `scheduled_start` order with ties by `id` — 014 AC2's Next up rule. It holds the
  title as a link to `/tasks/<id>` and the time `clockLabel(scheduled_start)`, such as
  `2:00 PM`. When there is none, `#digest-first` is absent and the page renders the
  empty-state partial instead, with the heading `Nothing left today` and a link to `/add`. An
  `in_progress` task and a task whose end has passed are never the first. Example: `pending`
  tasks at 9:00 to 9:30 AM (overdue), 2:00 to 2:45 PM and 4:00 to 5:00 PM, all today. The
  2:00 PM task is first.
- **AC4**: Overdue items. The page has one element with the id `digest-overdue`. When at
  least one task is overdue at `now`, by `isOverdue` of 011 (on any day, not only today), it
  holds one item per overdue task, in `scheduled_start` order with ties by `id`. Each item is
  an element with the id `digest-overdue-<id>`, showing the title as a link to `/tasks/<id>`
  and when it was due as `dayTimeLabel(due, now)`, where `due` is `scheduled_start` when it is
  there and `scheduled_end` otherwise (`Today 9:00 AM`, `11 Oct 9:00 AM`); and one link to
  `/overdue` with the text `Review overdue`. When no task is overdue, `#digest-overdue` holds
  the empty-state partial with the heading `Nothing overdue` and no `Review overdue` link.
  Example: a `pending` task at `2026-10-11T05:00:00.000Z` to `05:30` is listed as
  `11 Oct 9:00 AM`; a `done` task, an `in_progress` task and a `pending` task whose end has
  not passed are not listed.
- **AC5**: Timeline link. The page always has one link with the id `timeline-link` to
  `/timeline`, with the text `View timeline`.
- **AC6**: The page writes nothing. After any `GET /digest`, every task and settings row is
  as it was, `updated_at` included.
- **AC7**: The digest builder. `src/services/digest.ts` exports `DIGEST_PATH = '/digest'` and
  `buildDigest(tasks, now)`, which returns everything AC1 to AC4 show — the date, today's
  count, the planned minutes, the first task or null, and the overdue items with their count
  — without reading the database or the clock. The route of AC1 renders
  `buildDigest(listTasks(deps.db), requestTime(res))`.
- **AC8**: The daily job. `src/services/digest.ts` also exports `startDigestJob(db, send)`,
  where `send` is 019's `PushSender`. It builds today's digest at 7:30 AM on the Dubai clock
  (the plan's example) and calls `send` once per `push_subscriptions` row with the payload of
  AC9: the first time at the next Dubai 07:30 at or after the start, not once at the start,
  and then again every 24 hours. It returns the function that stops the job, and its interval
  is unref'd as 019's is, so it does not keep the process alive by itself. With no
  subscription row it pushes nothing and does not throw. Example: started at
  `2026-10-12T02:00:00.000Z` (6:00 AM Dubai), the first push is at
  `2026-10-12T03:30:00.000Z` (7:30 AM Dubai); started at `2026-10-12T04:00:00.000Z` (8:00 AM
  Dubai), the first is `2026-10-13T03:30:00.000Z`. `createApp` starts it neither.
- **AC9**: The push. Each call is `send(subscription, payload)`, one per subscription row in
  `id` order, with `payload` = `JSON.stringify({ title: <summary>, href: '/digest' })` —
  019's shape, so 019 AC8's service-worker handler shows it and opens `/digest`. The
  `<summary>` is `<count> tasks today · <plannedMinutes> min planned` (the count and minutes of
  AC2), with ` · <overdue> overdue task` or ` · <overdue> overdue tasks` appended when at
  least one task is overdue (014 AC5's wording). The first task is on the page, not in the
  notification; that is this spec's choice. Example: 4 tasks today, 210 planned minutes, one
  overdue item gives `4 tasks today · 210 min planned · 1 overdue task`.
- **AC10**: The server. `src/server.ts` starts the digest job after `createApp` and before
  `listen`, with the same `PushSender` it builds for 019 and the database, in the branch where
  the VAPID keys are there. Without the keys there is no sender, so it starts no digest job;
  the reminder job of 018 starts as before. `createApp` starts no job. `src/server.test.ts`
  changes: it gains a mock of the digest job and an assertion that it starts with the database
  and a `PushSender` when the keys are there; its existing reminder and push assertions stand.
- **AC11**: Build and tests. `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` and
  the three `VAPID_*` unset; tests run against a temporary or in-memory database and leave
  nothing under `data/`. New tests cover AC1 to AC10: the header, its date and the absent
  current nav item (AC1); the count and planned minutes of the AC2 example, with the left-out
  tasks (AC2); the first task past an overdue one, and the empty state (AC3); the overdue
  list, its order and text, the `Review overdue` link and the empty state (AC4); the timeline
  link (AC5); the page writing nothing (AC6); `buildDigest` on the data of AC2 to AC4 (AC7);
  `startDigestJob` on fake timers at the two AC8 times, the stop function and the
  no-subscription case (AC8); the payload of AC9 with a stubbed sender (AC9); and the server
  wiring of AC10. `src/server.test.ts` changes; no other existing test changes and no
  migration is added, so the schema and `src/db/migrations.test.ts` stay as they are.

## Out of scope

- Sending the digest only once a day. No table records a sent digest: a process that starts
  before 07:30 schedules the next 07:30, and nothing stops two processes from both pushing.
  A guard is a later job's, not this one's.
- The subscribe and unsubscribe endpoints, the `push_subscriptions` table, the VAPID keys and
  the subscribe script (019), and the settings page's notification controls, sound on/off and
  install prompt (022). This job pushes to whatever subscriptions 019 stored.
- A nav item or a link to `/digest` from Today. The push opens it and it is reached by its
  URL, as `/overdue` was before 014 added its banner. The digest's own link back to
  `/overdue` (011) and Today's overdue banner (014) already exist.
- Acting on the digest: starting, completing, editing or rescheduling from it. The page only
  reads; Done and Reschedule are `/tasks` (010), `/overdue` (011) and the sheet (013).
- The recurring instances that 016 will add to the count, and the calendar feed (021).
- Choosing the 07:30 time or the notification text from `settings`, and a "send a test
  digest" control (022).
- **Checked by hand** (needs a device, a real key pair and an HTTPS origin): the push arrives
  on the phone and tapping it opens `/digest`. The backlog's 019 line already owns "a push
  arrives with the tab closed"; the suite cannot assert a real push, the OS notification or
  the closed tab. Plan task 14's "Done when: the digest appears on schedule with correct
  counts" is met by AC2 to AC4 and AC8.
