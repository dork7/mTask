# 013-timer-and-detail: plan

Decision numbers (D1, D2, …) refer to `design.md`. Every code block the steps name is in
`design.md` under Files; copy it as written.

## Steps

1. **Dubai date and time.** Files: `src/dubai.ts`. Serves AC3, AC4, AC5.
   - Append `dateTimeValue` and `instantOfDateTime` (D11).
   - Check: `src/dubai-datetime.test.ts` passes; `src/dubai.test.ts` passes unchanged.

2. **Timer service.** Files: `src/services/timer.ts` (new). Serves AC7, AC8, AC9.
   - Create the file as in Files (D5, D6, D8).
   - Check: `src/services/timer.test.ts` passes.

3. **Task paths.** Files: `src/services/task-list.ts`, `src/routes/tasks.ts`. Serves AC2,
   AC7, AC9.
   - Append `taskPath` and `sheetDoneAction` to `task-list.ts`; remove the local
     `taskPath` from `routes/tasks.ts` and import it (D16).
   - Check: `yarn build` is clean; `src/services/task-list.test.ts` and the 010 tests pass.

4. **Actions.** Files: `src/services/task-actions.ts`. Serves AC4, AC5, AC6, AC7.
   - Add `SheetEdit`, `SheetProblems`, `SheetEditReading`, `optionalText`,
     `readSheetEdit`, `startTask`; replace `markDone`; widen `saveTaskEdit`'s parameter
     and doc comment (D7, D8, D12, D13).
   - Check: `src/tasks-actions.test.ts` and `src/tasks-edit.test.ts` pass unchanged.

5. **Mini-bar middleware, partials, layout and script.** Files: `src/routes/mini-bar.ts`
   (new), `src/app.ts`, `src/views/layout.ejs`, `src/views/partials/timer.ejs` (new),
   `src/views/partials/mini-bar.ejs` (new), `public/js/timer.js` (new). Serves AC8, AC9.
   - Create and wire them as in Files (D9, D10, D14). The middleware is mounted after
     the uploads static handler and before `homeRouter`.
   - Check: `src/shell.test.ts`, `src/add-page.test.ts`, `src/add-voice.test.ts` and
     `src/review-page.test.ts` pass unchanged; `src/timer-and-mini-bar.test.ts` passes.

6. **Sheet, its post, Start, Done's redirect.** Files: `src/routes/tasks.ts`,
   `src/views/pages/task-sheet.ejs` (new), `src/views/partials/task-sheet-body.ejs` (new),
   `src/views/partials/task-sheet-actions.ejs` (new). Serves AC1, AC3, AC4, AC5, AC6, AC7,
   AC8, AC10.
   - Add `BAD_REMINDER`, `shownEdit` (and use it in `renderEdit`), `SheetForm`,
     `TaskSheet`, `sheetMessages`, `shownOptional`, `renderSheet`; change the Done
     handler; add the `GET`/`POST /tasks/:taskId` and `POST /tasks/:taskId/start`
     handlers after Delete. All of them read the time with `requestTime(res)` (D1–D4,
     D7, D8, D9, D13).
   - Check: `src/task-sheet.test.ts`, `src/task-sheet-edit.test.ts`,
     `src/task-start-done.test.ts` pass; `src/tasks-edit.test.ts` passes unchanged.

7. **Links to the sheet.** Files: `src/routes/tasks.ts` (`TaskCard.href`),
   `src/views/pages/tasks.ejs`, `src/services/timeline.ts`, `src/views/pages/timeline.ejs`.
   Serves AC2.
   - As in Files (D15).
   - Check: the AC2 tests pass; `src/tasks-page.test.ts`, `src/timeline-page.test.ts` and
     `src/services/timeline.test.ts` pass unchanged.

8. **Styles.** Files: `public/css/base.css`. Serves AC1, AC8, AC9 (look only).
   - The rules of Files, in the two places named there (D17).
   - Check: `src/stylesheet.test.ts` and `src/components.test.ts` pass unchanged.

9. **Test helpers.** Files: `src/testing/dom.ts`, `src/testing/jsdom.d.ts`. Serves AC8.
   - Append `StubClock` and `stubClock`; add `Date` and `setInterval` to `DomWindow`
     (D14).
   - Check: `yarn build` is clean.

10. **Tests, then the whole suite.** Files: the six new test files below. Serves AC11.
    - Write them as listed under Tests. For each, break the code the way its line says
      once, see it fail, and put the code back; run each file once per break
      (`docs/errors/repeated-test-runs-run-out-of-ports.md`).
    - Check: `ANTHROPIC_API_KEY= yarn build` and `ANTHROPIC_API_KEY= yarn test` pass, with
      no existing test file changed (`git diff --stat main -- '*.test.ts'` lists only the
      six new files) and nothing new under `data/` (`git status --porcelain data/` is
      empty).

## Tests

Shared setup for every route test file, as in `src/tasks-actions.test.ts`:
`vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(new Date(NOW))` in
`beforeEach`, with `NOW = '2026-10-12T09:36:00.000Z'` (1:36 PM in Dubai);
`createTestApp({ analyze: vi.fn<Analyze>() })`; `testApp.close()` and
`vi.useRealTimers()` in `afterEach`. A local `task(extra)` makes a `pending` `medium`
task of 30 minutes titled `A task` with `createTask`; `dubai(time, daysAhead = 0)` is the
helper of `src/tasks-actions.test.ts`. A file whose test compares rows after a write
stores the tasks at `STORED = '2026-10-11T05:00:00.000Z'` and moves the clock to `NOW`
before the request (the `rows()` helper of `src/tasks-actions.test.ts`), so a write shows
in `updated_at`. `sheet(id)` is `GET /tasks/<id>` parsed with `parseHtml`, after
asserting status 200. The ids of the 404 cases are always
`['2', '99', '01', '1e0', 'abc']`, with task 1 pending and task 2 a draft of a text
source.

### AC1: `src/task-sheet.test.ts`

- `GET /tasks/1` of a task titled `<b>x</b>`: 200; `title` is `<b>x</b> - Task Image AI`;
  the one `a[aria-current="page"]` has `href="/tasks"`; `#task-sheet` exists, has class
  `overlay overlay--sheet` and no `hidden`; it holds `.sheet[role="dialog"]` whose
  `#task-sheet-title` text is `<b>x</b>`; no `b` element in `#task-sheet`. (Fails with
  the sheet not open, another id, or `<%-` for the title.)
- `it.each` over `pending`/`Pending`, `in_progress`/`In progress`, `done`/`Done`:
  `.task-sheet__status` has that text. (Fails with a fixed label.)
- The sheet has one link with text `Close` and `href="/tasks#task-1"`.
- For each 404 id, `GET /tasks/<id>` answers 404 with `main h1` `Page not found`. (Fails
  when the draft check of `findListedTask` is dropped, for `2`.)

### AC2: `src/task-sheet.test.ts`

- `/tasks` with tasks 1 and 2: `#task-1 .task__title a` has `href="/tasks/1"` and the
  card's title text; `#task-2 .task__title a` has `/tasks/2`. (Fails without the link or
  with a fixed id.)
- `/timeline` with a task 9:00–10:00 AM today and an urgent one 11:00 AM–12:00 PM:
  `#block-1` holds exactly one `a` with `href="/tasks/1"`, `#block-2` one with
  `/tasks/2`; `#block-2`'s text still starts with `▲`, and both blocks keep classes `blk`
  and `k-<priority>`. (Fails without the link, or with the glyph moved after the title.)

### AC3: `src/task-sheet.test.ts`

- A task titled `Call`, 45 minutes, `high`, `evening`, category `calls`, description
  `About it`, `reminder_at` `2026-10-12T16:00:00.000Z`: `form.edit-form` has
  `method="post"`, `action="/tasks/1"`; `formFields` gives
  `{ title: 'Call', minutes: '45', priority: 'high', slot: 'evening', category: 'calls', reminder: '2026-10-12T20:00' }`;
  `#sheet-description` is a `textarea` named `description` with text `About it`;
  `#sheet-reminder` has `type="datetime-local"`. (Fails when the reminder is shown in
  UTC, `2026-10-12T16:00`.)
- A task with no slot, no category, no description and no reminder: `formFields` gives
  `slot: ''`, `category: ''`, `reminder: ''`, and the textarea is empty.

### AC4: `src/task-sheet-edit.test.ts`

- An `in_progress` task with `started_at`, `source_id` of a text source,
  `confidence: 0.8`, `actual_minutes: 5`, category `old`, stored at `STORED`; post
  `{ title: '  Call  ', minutes: '45', priority: 'low', slot: 'night', category: '  calls ', description: ' line one\r\nline two ', reminder: '2026-10-12T20:00' }`:
  303 to `/tasks/1`; the row `toEqual`s `before` with only `title: 'Call'`,
  `estimated_minutes: 45`, `priority: 'low'`, `time_slot: 'night'`, `category: 'calls'`,
  `description: 'line one\nline two'`, `reminder_at: '2026-10-12T16:00:00.000Z'`,
  `updated_at: NOW` changed. (Fails when status, a time, `actual_minutes`, `source_id` or
  `confidence` is written, or the reminder is read as UTC.)
- A task with category, description and reminder set; post the four fields with
  `category: ''`, `description: '  '`, `reminder: ''`: all three are stored null.
- `reminder: '2026-10-01T09:00'` (in the past): 303, stored as
  `2026-10-01T05:00:00.000Z`.
- A pending task of yesterday 9:00–9:30 AM; post it with `minutes: '20'` and its own
  priority and slot: its times become those the scheduler finds at `NOW`
  (`2026-10-12T09:40:00.000Z`–`10:00:00.000Z`). With only the title changed instead, the
  times stay. (Fails without the 010 rescheduling rule.)

### AC5: `src/task-sheet-edit.test.ts`

- `it.each` over `2026-02-30T10:00`, `2026-10-12T24:00`, `2026-10-12T20:60`,
  `2026-10-12 20:00`, `2026-10-12T20:00:00`, `tomorrow`, with valid other fields: 400;
  the notice's paragraphs are exactly `['Set the reminder as a date and time, or leave it empty.']`;
  `#sheet-reminder` has the posted value; `listTasks` equals `before`. (Fails without the
  round-trip of `dayOfDate`, for `2026-02-30`, or without the hour and minute bounds.)
- Post `{ title: ' ', minutes: 'x', priority: 'bogus', slot: 'night', category: 'c', description: 'd', reminder: 'nope' }`:
  400 with the four messages in the order title, minutes, choice, reminder; the fields
  show `category: 'c'`, `reminder: 'nope'`, the textarea `d`, `minutes: 'x'`; nothing
  stored.
- A refused post (blank title) with no `category` field on a task whose category is
  `calls`: `#sheet-category` is empty.
- Post only `{ title: 'New', minutes: '45', priority: 'low', slot: '' }`, the fields of the
  010 form, to `/tasks/1` of a task with category `calls`: 303, and category,
  description and reminder are stored null. Then the same body to `/tasks/1/edit` of a
  second task with category `calls`: 303 to `/tasks#task-2`, and its category stays
  `calls`.
- For each 404 id, `POST /tasks/<id>` with a valid body answers 404 and changes no row.

### AC6: `src/task-start-done.test.ts`

- The sheet of a pending task has one form whose submit is `Start`, `method="post"`,
  `action="/tasks/1/start"`. The sheets of an `in_progress` and a `done` task have no
  button `Start`.
- `POST /tasks/1/start` on a pending task: 303 to `/tasks/1`; the row `toEqual`s `before`
  with `status: 'in_progress'`, `started_at: NOW`, `updated_at: NOW`. (Fails when
  `started_at` is not the request time.)
- Task 1 `in_progress` with `started_at: STORED`, task 2 pending; start task 2: task 1
  `toEqual`s its `before`.
- `it.each` over `in_progress` (with `started_at`) and `done`: `POST /tasks/1/start` is 303
  to `/tasks/1` and `listTasks` equals `before`, `updated_at` included. (Fails without the
  status guard of `startTask`.)
- For each 404 id, `POST /tasks/<id>/start` answers 404 and `listTasks` equals `before`.

### AC7: `src/task-start-done.test.ts`

- The sheets of a pending and an `in_progress` task have one form with submit `Done` and
  `action="/tasks/1/done?from=sheet"`; a done task's sheet has no `Done` button.
- `in_progress` task, `started_at: '2026-10-12T08:21:00.000Z'`: `POST
  /tasks/1/done?from=sheet` is 303 to `/tasks/1`; the row `toEqual`s `before` with
  `status: 'done'`, `completed_at: NOW`, `actual_minutes: 75`, `updated_at: NOW`.
- Started at `2026-10-12T09:35:40.000Z` (20 seconds before `NOW`): `actual_minutes` is
  `1`. (Fails without the floor of 1.)
- A pending task with `actual_minutes` null: Done from the sheet gives `status: 'done'`,
  `completed_at: NOW`, `actual_minutes: null`. (Fails when a pending task gets minutes.)
- Without `from`: an `in_progress` task started at 08:21, `POST
  /tasks/1/done?priority=high` is 303 to `/tasks?priority=high#task-1` and stores 75.
- `POST /tasks/1/done?from=x&priority=high` is 303 to `/tasks?priority=high#task-1`.

### AC8: `src/timer-and-mini-bar.test.ts`

- `it.each` over `2026-10-12T09:23:55.000Z`/`12:05`, `2026-10-12T08:33:55.000Z`/`1:02:05`,
  `2026-10-12T08:36:01.000Z`/`59:59`, `2026-10-12T08:36:00.000Z`/`1:00:00`: the sheet of
  an `in_progress` task with that `started_at` has `.task-sheet__timer .timer` with
  `data-started-at` equal to it and that text. (Fails with `mm:ss` past an hour or a
  padded hour.)
- Started at `09:23:55Z`: `.task-sheet__started` reads `Started Today 1:23 PM`.
- The sheets of a pending and a done task have no `.timer` and no `.task-sheet__started`.
- The in-progress sheet has one `script[src="/js/timer.js"]` with `defer`, and
  `GET /js/timer.js` answers 200 with a JavaScript content type.
- jsdom: with tasks started at `09:23:55Z` (the sheet's) and, for the second case,
  `08:36:01Z`, open the served sheet with `openPage`, set every `[data-started-at]`
  element's text to `''`, `stubClock(window, Date.parse(NOW))`, `runLinkedScripts` (it
  returns `['/js/timer.js']`): both timers on the page (sheet and bar) read `12:05`;
  `advance(1000)`: `12:06`. Second case: `59:59`, then `1:00:00`. `scriptErrors(window)`
  is `[]` and the window is closed in `afterEach`. (Fails when the script writes only
  on the tick, only on load, or reads `new Date()`.)

### AC9: `src/timer-and-mini-bar.test.ts`

- `it.each(['/', '/tasks', '/timeline', '/add', '/no-such-page'])` with task 1
  `in_progress` titled `<b>x</b>` started at `09:23:55Z`: exactly one `#mini-bar`, not
  inside `main`; its `a.mini-bar__title` has text `<b>x</b>` (no `b` element) and
  `href="/tasks/1"`; its `.timer` has `data-started-at="2026-10-12T09:23:55.000Z"` and
  text `12:05`; its one form has `method="post"`, `action="/tasks/1/done?from=sheet"` and
  a submit `Done`. (Fails when the middleware is mounted after a router, or the bar is
  in `pages/` instead of the layout.)
- The same five paths with a pending and a done task only: no `#mini-bar`, and no
  `script[src="/js/timer.js"]`; on `/`, exactly one `script` element.
- Task 1 `in_progress` started at `08:00Z`, task 2 at `09:00Z`, task 3 pending: the bar
  links `/tasks/2`. Then tasks 1 and 2 both started at `09:00Z`: it links `/tasks/2`.
  (Fails with the earliest start, or the lowest id on a tie.)
- Task 1 `in_progress` with no `started_at`: `/tasks` answers 200, the bar links
  `/tasks/1` and has no `.timer`.

### AC10: `src/task-sheet.test.ts`

- A done task with `estimated_minutes: 30`, `actual_minutes: 75`,
  `completed_at: '2026-10-12T09:36:00.000Z'`: `.task-sheet__summary` reads
  `Estimated 30 min, actual 75 min`, `.task-sheet__completed` reads
  `Completed Today 1:36 PM`, and `form.edit-form` exists.
- With `45` and `20`: `Estimated 45 min, actual 20 min`. (Fails with fixed numbers.)
- `it.each` over `estimated_minutes: null` and `actual_minutes: null`: no
  `.task-sheet__summary`, and the sheet's text contains no `Estimated`.
- A done task with `completed_at` null: no `.task-sheet__completed`.
- A pending task with both minutes set: no `.task-sheet__summary`.
- End to end: start a pending task of 30 minutes at `2026-10-12T08:21:00.000Z`, move the
  clock to `NOW`, post Done from the sheet, follow the 303: the sheet reads
  `Estimated 30 min, actual 75 min`.

### AC11 and the units: `src/dubai-datetime.test.ts`, `src/services/timer.test.ts`

`src/dubai-datetime.test.ts`, every case run twice, with `process.env.TZ` unset and set
to `Pacific/Kiritimati` (restored in `afterEach`, as in `src/timeline-page.test.ts`):

- `dateTimeValue(new Date('2026-10-12T16:00:00.000Z'))` is `2026-10-12T20:00`;
  `2026-10-12T21:30:45.000Z` gives `2026-10-13T01:30` (the next Dubai day, seconds
  dropped).
- `instantOfDateTime('2026-10-12T20:00')?.toISOString()` is `2026-10-12T16:00:00.000Z`;
  `2026-10-13T01:30` gives `2026-10-12T21:30:00.000Z`; `2026-10-12T00:00` gives
  `2026-10-11T20:00:00.000Z`; `2026-10-12T23:59` gives `2026-10-12T19:59:00.000Z`.
- `instantOfDateTime` is `undefined` for `2026-02-30T10:00`, `2026-13-01T10:00`,
  `2026-10-12T24:00`, `2026-10-12T20:60`, `2026-10-12 20:00`, `2026-10-12T20:00:00`,
  `2026-10-12T8:00`, `''`, `tomorrow`.

`src/services/timer.test.ts`:

- `elapsedLabel(0, ms)` for `0` → `0:00`, `59_999` → `0:59`, `725_000` → `12:05`,
  `3_599_000` → `59:59`, `3_600_000` → `1:00:00`, `3_725_000` → `1:02:05`,
  `36_005_000` → `10:00:05`, `-5_000` → `0:00`.
- `workedMinutes` from `2026-10-12T08:21:00.000Z` to `NOW` is 75; 20 s is 1; 149 s is 2;
  151 s is 3; a start after `now` is 1. (Fails with floor, for 151 s, or ceil, for 149
  s.)
- `timerOf` of a task with `started_at` `09:23:55Z` at `NOW` is
  `{ startedAt: '2026-10-12T09:23:55.000Z', text: '12:05' }`; with `started_at` null it
  is `null`.
- `runningTask`: `undefined` for `[]` and for only pending and done tasks; of two in
  progress, the later `started_at` whatever their order in the array; on a tie, the
  higher id whatever the order; a task with a start beats one without; of two without,
  the higher id; a `done` task with the latest `started_at` is not chosen.
