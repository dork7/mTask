# 018-reminders-and-alarm: urgent reminders with the in-page alarm

## Goal

Tasks already carry a `reminder_at`, set on the detail sheet (013), but nothing watches it.
This job adds the watcher and the alarm: a repeating job "marks" the *urgent* tasks whose
`reminder_at` has passed (`docs/plan.md`, task 13, the in-page half), and an open page shows
a full-screen alarm for a marked task, with a looping sound, Snooze (5, 10, 15), Dismiss, a
notification-permission prompt and an in-page fallback (U9). It stores one new thing: when
a reminder was fired, so the job does not fire it twice and a page can tell a fired reminder
from a past one.

It fits what is there: the `reminder_at` column and helpers of `src/db/tasks.ts` (003, 013),
the migrations of `src/db/migrations.ts`, the cron-free `src/server.ts`, the always-mounted
middleware and deferred `res.locals` getter of `src/routes/mini-bar.ts` (013, and the rule in
`docs/errors/app-middleware-reads-db-before-every-router.md`), the layout
`src/views/layout.ejs`, the small vanilla script `public/js/timer.js`, and the `overlay`
partial `src/views/partials/modal.ejs` (002). The plan names no routes, columns, elements or
texts for this, so every name and text below is this spec's choice. Web Push for closed tabs
is 019; the settings controls are 022.

Unless a criterion says otherwise, examples use `now = 2026-10-12T09:36:00.000Z` (1:36 PM on
12 Oct in Asia/Dubai), the seeded settings, and the times of `src/dubai.ts`.

## Acceptance criteria

- **AC1**: Fire rule. `src/services/reminders.ts` exports `fireDueReminders(db, now)`, which
  the job of AC6 calls. At `now` it marks every task that is `urgent`, whose `status` is
  `pending` or `in_progress`, whose `reminder_at` is not null and at or before `now`, and
  which it has not marked for this `reminder_at` (its `reminded_at` is null or earlier than
  `reminder_at`). The mark is the new nullable UTC-timestamp column `reminded_at` on `tasks`,
  set to `now` (AC11). Every other task is left alone: not `urgent`, no `reminder_at`, a
  `reminder_at` after `now`, `draft`, `done`, or already marked for this `reminder_at`. A
  second call at the same or a later `now`, before a snooze or a dismiss, changes no row.

- **AC2**: The alarm list. `GET /reminders` answers 200 with `Content-Type: application/json`
  and a body `{"alarms":[…]}`: one entry per marked, not-yet-snoozed or dismissed task, in
  `reminder_at` order then `id` order. A task is listed when `reminded_at` is not null,
  `reminder_at` is not null and at or before `now`, and `priority` is `urgent` with `status`
  `pending` or `in_progress`. An entry is
  `{"id":<task id>,"title":<title>,"href":"/tasks/<id>","snooze":"/tasks/<id>/snooze","dismiss":"/tasks/<id>/dismiss"}`.
  With none, `{"alarms":[]}`. The title is the stored title as it is (the script escapes it
  when it renders). The route reads only the database and works with `ANTHROPIC_API_KEY` unset.

- **AC3**: Snooze. `POST /tasks/<id>/snooze` with a single `minutes` field of `5`, `10` or
  `15` sets `reminder_at` to the request time plus that many minutes, so the task leaves
  `GET /reminders` (AC2) and does not return until an AC1 `fireDueReminders` at or after the
  new `reminder_at` marks it again. It answers 303 to `/`. Any other `minutes` — missing,
  posted twice, `0`, `30`, `five` — answers 400 and writes no row.

- **AC4**: Dismiss. `POST /tasks/<id>/dismiss` sets `reminder_at` to null, so the task leaves
  `GET /reminders` and no later `fireDueReminders` marks it again. It answers 303 to `/`.

- **AC5**: Unknown task. Snooze and dismiss on an id that names no task, names a `draft`, or
  is not written in `ID_SHAPE` form (as 010 AC14 and 013 AC1) answer 404 with the not-found
  page and write no row.

- **AC6**: The job. `src/services/reminders.ts` also exports `startReminderJob(db, everyMs =
  60_000)`, returning a function that stops the job. It calls `fireDueReminders(db, new
  Date())` every `everyMs` (the plan's `node-cron` job; the spec only requires the interval).
  `src/server.ts` starts it when the server starts, and `createApp` does not, so an app a test
  builds never runs it. A vitest fake-timer test with a due task sees it marked after `everyMs`,
  and sees no further mark after the returned stop function runs.

- **AC7**: The alarm markup. On a page where at least one task has a `reminder_at` and is not
  `done`, the layout loads `/js/alarm.js` with `defer` and renders `partials/alarm` once; on a
  page with no such task, it renders neither. `/js/alarm.js` is served with a JavaScript content
  type. The fragment is one hidden overlay `#alarm` (classes `overlay overlay--alarm`,
  `role="alertdialog"`) holding: an empty `.alarm__title`; an `audio.alarm__sound` with `loop`;
  three buttons with `data-minutes` of `5`, `10` and `15`, labelled `Snooze 5 min`,
  `Snooze 10 min`, `Snooze 15 min`; a `Dismiss` button; a permission prompt whose text is
  `Allow alerts so urgent tasks can wake you` with a button to ask for permission; and a hidden
  `.alarm__blocked` fallback. A page without a reminder has no `#alarm`.

- **AC8**: Showing an alarm. In a jsdom page opened from the page of AC7, with `fetch` stubbed
  so `GET /reminders` answers one alarm and `HTMLMediaElement.prototype.play` stubbed, loading
  `/js/alarm.js` shows the alarm: `#alarm` has no `hidden`, `.alarm__title` is the alarm's
  `title` as text (a title `<b>x</b>` leaves no `b` element), and `play` was called on
  `.alarm__sound`. When `/reminders` answers `{"alarms":[]}`, `#alarm` stays hidden and `play`
  is not called. The script requests `/reminders` again every 30 seconds: with the first answer
  empty and the second holding an alarm, advancing the page's stubbed clock by 30 000 ms shows
  the modal. The script makes no other request (the stub is called once per interval).

- **AC9**: Snooze and dismiss from the modal. On the page of AC8 with an alarm shown, clicking
  the `Snooze 10 min` button posts `minutes=10` to `/tasks/1/snooze`, and clicking `Dismiss`
  posts to `/tasks/1/dismiss` (the `fetch` stub records method `POST`, the URL and the body).
  After either, `#alarm` is hidden and `pause` was called on `.alarm__sound`.

- **AC10**: Permission and fallback. On the page of AC8 with the alarm shown, when
  `Notification` exists: permission `granted` makes one `new Notification(<title>)`; permission
  `default` shows `.alarm__permission` and clicking its button calls
  `Notification.requestPermission()`; permission `denied` shows `.alarm__blocked`, makes no
  notification, and keeps `#alarm` shown. When `Notification` does not exist, the script does
  not throw and `#alarm` still shows (the in-page fallback). The script reads
  `Notification.permission` only after checking the API exists.

- **AC11**: Build and tests. `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset;
  the tests run against an in-memory or temporary database and leave nothing in `data/`. A new
  migration adds `reminded_at` to `tasks` as a nullable timestamp with the same GLOB check as
  `reminder_at`, so two existing tests change: `src/db/migrations.test.ts` (the migration count)
  and `src/db/schema.test.ts` (the tasks column list and the timestamp-column list add
  `reminded_at`). No other existing test changes. New tests cover AC1 to AC10.

## Out of scope

- Web Push while the tab is closed: VAPID keys, a `push_subscriptions` table, the subscribe and
  unsubscribe endpoints and the service-worker push handler (019). This job's alarm runs only
  while a page is open and polling.
- The morning digest and its push (020).
- The settings page's sound on/off and notification controls (022).
- Setting or editing `reminder_at`: the sheet of 013 owns that. This job only reads it.
- The Next up card's Snooze button in the Today mockup (014 owns Today; the alarm's Snooze is
  in the modal).
- Recurring tasks and the reminder on a recurring instance (016).
- Escalating repeat alerts, Telegram and WhatsApp (the plan's Left out).
- **Checked by hand** (needs a device or a live browser): the permission dialog actually appears
  and is honoured, and an urgent task whose `reminder_at` passes while a tab is open produces the
  looping sound and, where the OS allows it, a system notification on time (plan task 13's
  "Done when"). The backlog lists no device check for 018 yet; this is the one it implies.
