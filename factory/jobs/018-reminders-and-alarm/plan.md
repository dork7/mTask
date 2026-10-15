# 018-reminders-and-alarm: plan

Decision numbers (D1, D2, …) refer to `design.md`. Every code block the steps name is in
`design.md` under Files; copy it as written.

## Steps

1. **The migration.** Files: `src/db/migrations.ts`, `src/db/migrations.test.ts`,
   `src/db/schema.test.ts`. Serves AC11.
   - Append migration 3 (D1); in `migrations.test.ts` change the three count assertions
     and the one test title; in `schema.test.ts` add `reminded_at` to the tasks column
     list (last) and to the timestamp-column list.
   - Check: `yarn test src/db/migrations.test.ts src/db/schema.test.ts` passes.

2. **The reminders SQL.** Files: `src/db/reminders.ts` (new). Serves AC1, AC2.
   - Create the file as in Files (D2).
   - Check: `yarn build` is clean.

3. **`toTask` drops the marker.** Files: `src/db/tasks.ts`. Serves AC11.
   - Replace `toTask` with D3's version and extend its doc comment. Nothing else.
   - Check: `yarn test src/db/tasks.test.ts` passes unchanged.

4. **The reminder service.** Files: `src/services/reminders.ts` (new). Serves AC1, AC2,
   AC3, AC4, AC6.
   - Create the file as in Files (D4, D9).
   - Check: `yarn build` is clean.

5. **The middleware and the list route.** Files: `src/routes/mini-bar.ts`,
   `src/routes/reminders.ts` (new), `src/app.ts`. Serves AC2, AC7.
   - Add the `alarm` getter and the `anyReminder` import (D7); create
     `createRemindersRouter` (D5) and mount it after `createTasksRouter`.
   - Check: `src/timer-and-mini-bar.test.ts`, `src/shell.test.ts` and
     `src/add-photo.test.ts` pass unchanged.

6. **Snooze and Dismiss.** Files: `src/routes/tasks.ts`. Serves AC3, AC4, AC5.
   - Add the two handlers after Delete, with the imports (D6).
   - Check: `src/tasks-actions.test.ts`, `src/tasks-edit.test.ts` and
     `src/task-sheet.test.ts` pass unchanged.

7. **The alarm markup and script.** Files: `src/views/partials/alarm.ejs` (new),
   `src/views/layout.ejs`, `public/js/alarm.js` (new). Serves AC7, AC8, AC9, AC10.
   - Create the partial and the script (D8, D10, D11) and the two `locals.alarm` blocks
     of the layout (D7).
   - Check: `yarn build` is clean; `src/components.test.ts` and `src/stylesheet.test.ts`
     pass unchanged.

8. **The job in the server.** Files: `src/server.ts`. Serves AC6.
   - Import `startReminderJob` and call `startReminderJob(db)` after `createApp` (D9).
   - Check: `src/server.test.ts` passes unchanged and the runner exits (the interval is
     unref'd).

9. **The styles.** Files: `public/css/base.css`. Serves AC7 (look only).
   - Add the rules of D12 before the style-guide marker.
   - Check: `src/stylesheet.test.ts` passes.

10. **The jsdom types.** Files: `src/testing/jsdom.d.ts`. Serves AC8, AC9, AC10.
    - Add the interfaces and the three `DomWindow` members of D13.
    - Check: `yarn build` is clean.

11. **Tests, then the whole suite.** Files: `src/services/reminders.test.ts`,
    `src/reminders.test.ts`, `src/reminder-job.test.ts`, `src/alarm.test.ts` (all new).
    Serves AC1 to AC11.
    - Write them as listed under Tests. For each, break the code the way its line says
      once, see it fail, and put the code back; run each file once per break
      (`docs/errors/repeated-test-runs-run-out-of-ports.md`).
    - Check: `ANTHROPIC_API_KEY= yarn build` and `ANTHROPIC_API_KEY= yarn test` pass, with
      `git diff --stat main -- '*.test.ts'` listing only the two changed files and the
      four new ones and nothing new under `data/`
      (`git status --porcelain data/` is empty).

## Tests

Shared setup for `src/services/reminders.test.ts` and `src/reminders.test.ts`, as in
`src/tasks-actions.test.ts`: `vi.useFakeTimers({ toFake: ['Date'] })` and
`vi.setSystemTime(new Date(NOW))` in `beforeEach`, with
`NOW = '2026-10-12T09:36:00.000Z'` (1:36 PM in Dubai) and
`STORED = '2026-10-11T05:00:00.000Z'`; `createTestApp({ analyze: vi.fn<Analyze>() })` for
the route file and `openDatabase(':memory:')` for the unit file; `testApp.close()` and
`vi.useRealTimers()` in `afterEach`. `task(extra)` makes a pending `medium` task of 30
minutes titled `A task` with `createTask`; a file whose test compares a row after a write
stores the tasks at `STORED` and moves the clock to `NOW` before the request. The 404 ids
are `['2', '99', '01', '1e0', 'abc']`, with task 1 pending and task 2 a draft of a text
source. `src/reminder-job.test.ts` uses `vi.useFakeTimers()` (all timers). `src/alarm.test.ts`
uses no fake timers: it gives the page `stubClock`, and a `flush()` helper
(`() => new Promise((resolve) => setTimeout(resolve, 0))`) drains the `fetch` microtasks.

### AC1: `src/services/reminders.test.ts`

- A table of tasks at `reminder_at` in the past or `NOW`: urgent due `pending`, urgent
  due `in_progress`, urgent due pending with `reminder_at` exactly `NOW`, urgent due
  `done`, urgent due `draft`, high due pending, urgent future pending, urgent pending
  with no reminder. `fireDueReminders(db, new Date(NOW))` returns the number of urgent
  due pending/in-progress rows (3, the `NOW` one included); a raw
  `SELECT id, reminded_at, updated_at` shows those three at `reminded_at = NOW` with
  `updated_at` as `createTask` wrote it, and the rest null. (Fails when the status or the
  priority filter is wrong, when a `done` or `draft` task is marked, or when the mark
  also writes `updated_at`.)
- A second `fireDueReminders(db, new Date(NOW))` returns 0 and changes no row — the
  `reminder_at` exactly `NOW` row included. (Fails with `reminded_at <= reminder_at`
  instead of `<`, or without the guard.)
- A task whose `reminded_at` is `2026-10-12T09:00:00.000Z` and whose `reminder_at` is
  `09:30` is marked by a run at `NOW` (`reminded_at` becomes `NOW`). (Fails when a
  marked task is never marked again after its reminder moved on.)
- A task with `reminded_at` equal to its `reminder_at`, both `09:00`, written straight
  into the database, is not marked. (Fails with `<=`.)

### AC2: `src/reminders.test.ts`

- Seven tasks as in AC1 (ids 1 to 7, task 4 done, task 5 high, task 6 future, task 7 has
  no mark), then `fireDueReminders(testApp.db, new Date(NOW))`. `GET /reminders` answers
  200, a content type matching `/^application\/json/`, and `{ alarms: [ … ] }` with one
  entry per marked, due, urgent, pending-or-in-progress task, in `reminder_at` then `id`
  order, each `{ id, title: 'A task', href: '/tasks/<id>', snooze: '/tasks/<id>/snooze',
  dismiss: '/tasks/<id>/dismiss' }`. (Fails when a condition is dropped or added, when
  the order is by id alone, or when a field is missing.)
- With no tasks: `{ alarms: [] }`, still 200 JSON. (Fails when the route needs a page or a
  task.)
- A marked task titled `<b>x</b>` answers with the title `<b>x</b>`, unchanged. (Fails
  when the route escapes the JSON or the script's title, not the route's.)
- Two marked tasks with the same `reminder_at` answer in id order, and an earlier
  `reminder_at` answers first. (Fails with `ORDER BY id` or `ORDER BY reminded_at`.)

### AC3: `src/reminders.test.ts`

- `it.each([5, 10, 15])`: an urgent pending task at `reminder_at` `08:00`, stored at
  `STORED`, marked by `fireDueReminders` before the clock moves to `NOW`; `POST
  /tasks/1/snooze` with `minutes=<n>` is 303 to `/`; the row equals `before` with only
  `reminder_at` = `new Date(Date.parse(NOW) + n * 60_000).toISOString()` and `updated_at:
  NOW` changed (a raw `SELECT` shows `reminded_at` unchanged); `GET /reminders` answers
  `{ alarms: [] }`. (Fails when `minutes` is ignored, when `reminded_at` is cleared, or
  when the redirect is not 303 to `/`.)
- `it.each(['0', '30', 'five', ''])`, a post with no `minutes`, and
  `minutes=5&minutes=10`: 400 and `listTasks` equals `before` (`updated_at` included).
  (Fails when a bad value is accepted or a row is written.)
- After snoozing 10 minutes from `NOW`, `fireDueReminders(db, new Date(NOW))` at `NOW`
  marks nothing and at `NOW + 10 min` marks the task; `GET /reminders` with the clock at
  `NOW + 10 min` lists it again. (Fails when the new `reminder_at` is not the request
  time plus the minutes.)

### AC4: `src/reminders.test.ts`

- An urgent pending task marked at `STORED`, the clock at `NOW`: `POST /tasks/1/dismiss`
  is 303 to `/`; the row equals `before` with only `reminder_at: null` and `updated_at:
  NOW` changed (`reminded_at` unchanged in a raw `SELECT`); `GET /reminders` is
  `{ alarms: [] }`; a later `fireDueReminders(db, new Date(NOW))` returns 0. (Fails when
  `reminder_at` is not nulled, or the job marks a dismissed task again.)

### AC5: `src/reminders.test.ts`

- For each id of `['2', '99', '01', '1e0', 'abc']` (task 1 pending with a reminder, task
  2 a draft): `POST /tasks/<id>/snooze` with `minutes=5` answers 404 with `main h1`
  `Page not found`, `POST /tasks/<id>/dismiss` answers 404, and `listTasks` equals
  `before`. (Fails when the draft check of `findListedTask` is dropped, for `2`, or when
  a write happens before the check.)

### AC6: `src/reminder-job.test.ts`

- An urgent pending task due at `NOW`, the fake clock at `NOW`, `const stop =
  startReminderJob(db, 1_000)`: the task's `reminded_at` is null at once. (Fails when the
  job fires at the start.)
- `vi.advanceTimersByTime(1_000)`: `reminded_at` is `new Date().toISOString()`. (Fails
  when no interval is made or the period is not `everyMs`.)
- With a second due task added and `stop()` called, `vi.advanceTimersByTime(10_000)`
  leaves it unmarked. (Fails when the returned function does not clear the interval.)
- `createTestApp` with a due task, `vi.advanceTimersByTime(120_000)`: the task stays
  unmarked, so `createApp` starts no job. (Fails when `createApp` calls
  `startReminderJob`.)

### AC7: `src/reminders.test.ts`

- A pending task with `reminder_at` `08:00`, not fired, `GET /`: exactly one
  `script[src="/js/alarm.js"]` and it has `defer`; exactly one `#alarm` with classes
  `overlay overlay--alarm`, `role="alertdialog"` and `hidden`; its `.alarm__title` is
  empty; `.alarm__sound` has `loop`; the `[data-minutes]` values are `['5', '10', '15']`
  with texts `['Snooze 5 min', 'Snooze 10 min', 'Snooze 15 min']`; one button `Dismiss`;
  `.alarm__permission`'s text contains `Allow alerts so urgent tasks can wake you` and it
  holds one `[data-alarm-permission]`; `.alarm__blocked` has `hidden`. (Fails when the
  layout writes neither, when `anyReminder` ignores the status, or when a control is
  missing.)
- `GET /js/alarm.js` is 200 with a content type matching `/javascript/`. (Fails when the
  static file is missing.)
- A `done` task with a `reminder_at` and a pending task without one, `GET /`: no
  `script[src="/js/alarm.js"]` and no `#alarm`. (Fails when the status or the null check
  is dropped.)
- A `draft` with a `reminder_at` (written straight into the database), `GET /`: `#alarm`
  is there. (Fails when `anyReminder` uses `isListed` instead of `status !== 'done'`.)

### AC8: `src/alarm.test.ts`

- One alarm: the page of AC7, `openPage`, a `fetch` stub whose answer is one alarm, the
  `play`/`pause` stubs, `stubClock(window, Date.parse(NOW))`,
  `runLinkedScripts(testApp.app, window)` returns `['/js/alarm.js']`, `await flush()`:
  `#alarm` has no `hidden`; `.alarm__title`'s text is `<b>x</b>` and `all(#alarm, 'b')`
  is empty; `play` was called once on `.alarm__sound`; the stub was called once, with
  `/reminders`; `scriptErrors(window)` is empty. (Fails when the script never shows the
  overlay, writes the title as HTML, or calls another URL.)
- `{ alarms: [] }`: `#alarm` has `hidden`, `play` was not called, one call to
  `/reminders`. (Fails when an empty answer shows the alarm.)
- First answer empty, second one alarm: after `runLinkedScripts` and `flush` there is one
  call and `#alarm` has `hidden`; `clock.advance(30_000)` and `flush` show it, with
  exactly two calls, both `/reminders`. (Fails when the interval is not 30 000 ms, when
  the script polls at once again, or when it makes a second kind of request.)

### AC9: `src/alarm.test.ts`

- One alarm shown: clicking `[data-minutes="10"]` makes the stub's last call method
  `POST`, url `/tasks/1/snooze`, body `minutes=10`; `#alarm` has `hidden`; `pause` was
  called on `.alarm__sound`. (Fails when the post uses the wrong path or body, or the
  overlay stays.)
- Clicking the `Dismiss` button makes the last call method `POST`, url
  `/tasks/1/dismiss`; `#alarm` has `hidden`; `pause` was called. (Fails when the dismiss
  posts the snooze path or nothing.)

### AC10: `src/alarm.test.ts`

- `Notification` with `permission: 'granted'`, one alarm shown: `new Notification` was
  called once with `<b>x</b>`; `.alarm__permission` and `.alarm__blocked` keep `hidden`.
  (Fails when no notification is made or the title is not the alarm's.)
- `permission: 'default'`: `.alarm__permission` loses `hidden`, no notification is made,
  and a click on `[data-alarm-permission]` calls `requestPermission()` once. (Fails when
  the prompt is not shown or the button does not ask.)
- `permission: 'denied'`: `.alarm__blocked` loses `hidden`, no notification is made,
  `#alarm` has no `hidden`. (Fails when a denied permission hides the alarm.)
- `window.Notification` left undefined: `#alarm` has no `hidden`, `.alarm__blocked`
  loses `hidden`, and `scriptErrors(window)` is empty — a `Notification.permission` read
  before the existence check would be caught there. (Fails when the guard is missing.)

### AC11: the build, the two changed files, the four new ones

- `src/db/migrations.test.ts` and `src/db/schema.test.ts` are the only existing test files
  that change (the count is three now, the column list and the timestamp list gain
  `reminded_at`); the four new files cover AC1 to AC10; `ANTHROPIC_API_KEY= yarn build`
  and `ANTHROPIC_API_KEY= yarn test` pass and the runner exits; nothing is left under
  `data/`.
