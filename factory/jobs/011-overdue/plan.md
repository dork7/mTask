# 011-overdue: plan

Decision numbers (D1, D2, …) refer to `design.md`. The code of every created file is
given whole in `design.md`, Files; write it as it is there.

## Steps

1. **The overdue service.** Files: `src/services/overdue.ts`,
   `src/services/overdue.test.ts`. Serves AC1, AC2, AC7, AC8.
   - Create `overdue.ts` as in design (D2, D3, D4, D6).
   - Write the unit tests of `### Unit: src/services/overdue.test.ts` below.
   - Check: `yarn build`; `yarn vitest run src/services/overdue.test.ts` passes.

2. **The write and the export.** Files: `src/services/task-actions.ts`,
   `src/routes/tasks.ts`. Serves AC7, AC9.
   - Add the `TaskTimes` type import and `moveTask` to `task-actions.ts` (D6).
   - `export` on `findListedTask` in `src/routes/tasks.ts` (D9). Nothing else changes in
     either file.
   - Check: `yarn build`; `yarn vitest run src/tasks-actions.test.ts
     src/tasks-edit.test.ts src/tasks-page.test.ts` passes unchanged.

3. **The router, the page and the wiring.** Files: `src/routes/overdue.ts`,
   `src/views/pages/overdue.ejs`, `src/app.ts`, `public/css/base.css`. Serves AC1 to AC9.
   - Create the router and the page as in design (D5, D7, D8, D10).
   - Mount `createOverdueRouter(deps)` right after `createTasksRouter(deps)` in
     `src/app.ts`, with its import after `./routes/home.ts`.
   - Insert the CSS block before `/* ---------- Style guide ---------- */`.
   - Check: `yarn build`; with `yarn dev` running, `curl -s localhost:3000/overdue`
     shows `Nothing overdue` on an empty database (then stop the server; do not leave a
     task in `data/`).

4. **The route tests.** Files: `src/overdue-page.test.ts`, `src/overdue-actions.test.ts`.
   Serves AC1 to AC10.
   - Write the tests below.
   - For each test, make the break named in its line once (one at a time, wait 1.5 s
     between runs, `docs/errors/repeated-test-runs-run-out-of-ports.md`), see it fail,
     restore.
   - Check: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset;
     `git status --short` shows only the files of this plan; nothing new in `data/`.

## Tests

Shared setup of both route test files, as in `src/tasks-actions.test.ts`:

- `vi.useFakeTimers({ toFake: ['Date'] })`, `vi.setSystemTime(new Date(STORED))` with
  `STORED = '2026-10-11T05:00:00.000Z'`, `testApp = createTestApp({ analyze:
  vi.fn<Analyze>() })` in `beforeEach`; `testApp.close()` and `vi.useRealTimers()` in
  `afterEach`.
- `NOW = '2026-10-12T09:36:00.000Z'`.
- `task(extra)`: `createTask(testApp.db, { title: 'A task', status: 'pending', priority:
  'medium', estimated_minutes: 30, ...extra })`.
- `draftTask(extra)`: a `createSource` of kind `text`, then a `draft` task of it.
- `rows()`: `listTasks(testApp.db)`, then `vi.setSystemTime(new Date(NOW))`; returns the
  rows from before, so any later write shows in `updated_at`.
- `YESTERDAY = { scheduled_start: '2026-10-11T05:00:00.000Z', scheduled_end:
  '2026-10-11T05:30:00.000Z' }` (9:00 to 9:30 AM on 11 Oct in Dubai).
- `page()`: `GET /overdue`, asserts 200, returns `parseHtml(response.text)`.
- `groupsOf(document)`: for each `.overdue-group`, `[textOf(h2), ids of its li]`.
- `ADDRESS = '/overdue/<id>/<action>'`; posts with `request(testApp.app).post(...)`, the
  pick with `.type('form').send({ start })`.
- Compare rows with `toEqual` on whole rows from `rows()`, `updated_at` included.

### Unit: `src/services/overdue.test.ts`

Rows built as plain `Task` objects (a `row(extra)` helper with every column).
- `isOverdue`: true for pending ending one ms before `now`; false at exactly `now`, one
  ms after, with `scheduled_end` null, and for `draft`, `in_progress`, `done` ending
  before `now`. Fails with `<=` or without the status check.
- `overdueGroups`: the spec's four tasks of AC2 give `[today: [3], yesterday: [2],
  earlier: [1]]` (ids as stored), the fourth left out; only non-empty groups, in the
  order Today, Yesterday, Earlier, when the input lists them Earlier first. Fails when
  the groups are not filtered or are ordered by input.
- `overdueGroups` boundary: ends `2026-10-11T20:00:00.000Z` → `today`,
  `2026-10-11T19:55:00.000Z` → `yesterday`, `2026-10-10T19:55:00.000Z` → `earlier`,
  `2026-10-10T20:00:00.000Z` → `yesterday`. Fails when grouped by the UTC day.
- `overdueGroups` order: within one group, starts given out of id order, two with the
  same start, one with a null start, come back by start, ties by id, null last; the
  input array is not changed (`toEqual` a copy taken before). Fails without the sort.
- `readPickedStart` accepts: `2026-10-12T18:00` → `2026-10-12T14:00:00.000Z`;
  `2026-10-12T13:36` → `NOW`; `2026-10-13T00:00` → `2026-10-12T20:00:00.000Z`;
  `2028-02-29T00:00` → `2028-02-28T20:00:00.000Z`. Fails without the Dubai offset.
- `readPickedStart` refuses (`undefined`): `undefined`, `null`, `''`,
  `2026-02-30T10:00`, `2027-02-29T00:00`, `2026-10-12T24:00`, `2026-10-12T23:60`,
  `2026-10-12T13:30`, `2026-10-12T13:35`, `2026-10-12T18:00:00`, `2026-10-12 18:00`,
  `' 2026-10-12T18:00'`, `'2026-10-12T18:00\n'`, `٢٠٢٦-10-12T18:00`, `0099-10-12T18:00`.
  With `now` = `2026-10-12T09:36:30.000Z`, `2026-10-12T13:36` is refused. Fails without
  the round-trip check, without `start < now`, or with a `m` flag / `\s*` in the shape.
- `pickedTimes`: a 30-minute task yesterday moved to `14:00Z` ends `14:30Z`; a task with
  only an end and 45 `estimated_minutes` gets 45 minutes; one with only an end and null
  minutes gets start = end; a 5-hour task at the instant of `9999-12-31T23:59` Dubai is
  `undefined`. Fails without the `isTimestamp` guard or when length is taken from
  `estimated_minutes` for a task that has both times (give it 30 minutes and a 60-minute
  window).

### AC1: `src/overdue-page.test.ts`
- Serves 200; `textOf(one(document, 'title'))` is `Overdue - Task Image AI`;
  `textOf(one(document, 'main h1'))` is `Overdue`; the nav is there
  (`one(document, 'nav.app-nav')`) and `all(document, '[aria-current="page"]')` is
  empty. Fails with `nav: 'tasks'`.
- Shows exactly `task-1` (pending, YESTERDAY) of: 1, a pending task ending exactly at
  `NOW` (`09:00Z`–`09:36Z`), a pending task ending at `09:37Z`, a pending task with no
  times, and `draft`, `in_progress`, `done` tasks with YESTERDAY's times. The ids of
  every `li.card.task` equal `['task-1']`. Fails with `<=`, without the status check, or
  with `isListed` in place of it.

### AC2: `src/overdue-page.test.ts`
- The spec's four tasks (stored as ids 1 Earlier, 2 Yesterday, 3 Today, 4 ending at
  `NOW`): `groupsOf` is `[['Today', ['task-3']], ['Yesterday', ['task-2']], ['Earlier',
  ['task-1']]]`. Fails when the groups are in input order.
- Grouped by the end: one pending task from `2026-10-11T19:50:00.000Z` to
  `2026-10-11T20:30:00.000Z` (11:50 PM on 11 Oct to 12:30 AM on 12 Oct in Dubai) is
  under `Today`. Fails when grouped by `scheduled_start`.
- Only Yesterday tasks: one group, `Yesterday`; no `Today` or `Earlier` heading. Fails
  when empty groups are rendered.
- Order within Yesterday: tasks stored as 1 at `06:00Z`, 2 at `05:00Z`, 3 at `05:00Z`
  (all ending before `NOW` on 11 Oct) give `task-2, task-3, task-1`. Fails without the
  sort or with ties by id reversed.

### AC3: `src/overdue-page.test.ts`
- A card for a `high` 25-minute task titled `<b>x</b>` at Today `05:00Z`–`05:30Z`:
  `textOf(h3.task__title)` is `<b>x</b>` and the card has no `b` element; `.task__minutes`
  is `25 min`; one `.badge.badge--high` with visible text `High`; `.task__due` is
  `Today 9:00 AM`. Fails with `<%-` for the title.
- A card with null minutes and null priority at YESTERDAY: `.task__minutes` is
  `No estimate`, no `.badge`, `.task__due` is `11 Oct 9:00 AM`. Fails when the due label
  is from `scheduled_end` (it would say `9:30 AM`) or the raw timestamp.

### AC4: `src/overdue-page.test.ts`
- With only a `done` and a future pending task: `.empty-state h2` is `Nothing overdue`;
  the one `.empty-state a` has `href="/tasks"`; no `.overdue-group`, no `h2` other than
  the empty state's. Fails when the empty state is decided by all tasks instead of the
  overdue ones.
- With an overdue task: no `.empty-state`.

### AC5: `src/overdue-actions.test.ts`
- Each card has exactly one form whose submit button says `Mark done`, with
  `method="post"` and `action="/overdue/<id>/done"`.
- Task 1 at YESTERDAY with `actual_minutes: 7` and task 2 at YESTERDAY; posting Mark
  done for task 1: 303, `location` `/overdue`, task 1's row equals `{ ...before[0],
  status: 'done', completed_at: NOW, updated_at: NOW }` and task 2's equals `before[1]`. Fails with `completed_at` unset or a fragment in
  the redirect.

### AC6: `src/overdue-actions.test.ts`
- Each card has exactly one form whose submit says `Reschedule`, posting to
  `/overdue/<id>/reschedule`.
- The spec example: a 30-minute medium task, no slot, at YESTERDAY: 303 to `/overdue`;
  the row equals `{ ...before, scheduled_start: '2026-10-12T09:40:00.000Z',
  scheduled_end: '2026-10-12T10:10:00.000Z', updated_at: NOW }`; then `GET /overdue` has
  no `#task-1`. Fails when the guard is inverted.
- An urgent YESTERDAY task and a low pending task at `09:40Z`–`10:10Z`: both rows change
  as in `src/tasks-actions.test.ts` "stores the new times of a task an urgent one moves"
  (urgent to `09:40Z`–`10:10Z`, low to `10:10Z`–`10:40Z`). Fails when `moved` is dropped.
- A YESTERDAY task with null `estimated_minutes`: 303, rows as they were, and the page
  still has `#task-1`.

### AC7: `src/overdue-actions.test.ts`
- Each card has one form posting to `/overdue/<id>/reschedule-at` holding one
  `input[type="datetime-local"][name="start"]` with a `label[for]` matching its `id`, and
  one `button[type="submit"]`.
- The spec example: task 1 at YESTERDAY and task 2 at `14:00Z`–`15:00Z` today; posting
  `start=2026-10-12T18:00` for task 1: 303 to `/overdue`; `listTasks` equals
  `[{ ...before[0], scheduled_start: '2026-10-12T14:00:00.000Z', scheduled_end:
  '2026-10-12T14:30:00.000Z', updated_at: NOW }, before[1]]` (an overlap is stored, task
  2 is not moved). Fails when the scheduler is called or the time read as UTC.
- `start=2026-10-12T13:36`: 303, task 1 stored at `09:36Z`–`10:06Z`. Fails with `<=` in
  `readPickedStart`.
- A 90-minute window (YESTERDAY start, end `06:30Z`) with `estimated_minutes: 30`, at
  `2026-10-12T22:00`: stored `18:00Z`–`19:30Z`, outside the seeded working hours. Fails
  when the length is taken from `estimated_minutes`.

### AC8: `src/overdue-actions.test.ts`
- `it.each` over: no field (`.type('form').send('')`), `start=` blank, `start` posted
  twice (`.send('start=2026-10-12T18:00&start=2026-10-12T18:00')`), `2026-10-12 18:00`,
  `2026-02-30T10:00`, `2026-10-12T13:30`. Two overdue tasks; posting for task 2: 400,
  `content-type` HTML, `response.text.split(MESSAGE)` has length 2 (the message once),
  `textOf(one(document, '#task-2 [role="alert"]'))` is the message, `#task-1` has no
  `[role="alert"]`, `#task-2 input[name="start"]` has `aria-invalid="true"`, the page is
  the overdue page (`main h1` `Overdue`), and `listTasks` equals the rows from before.
  Fails when the message is on every card, when a repeated field is read as its first
  value (`extended: true`), or when a refusal writes.
- A 5-hour overdue task at `9999-12-31T23:59`: 400 with the message, rows unchanged.
  Fails (500) without the `isTimestamp` guard.

### AC9: `src/overdue-actions.test.ts`
- `it.each` over ids `2` (a draft with YESTERDAY times), `99`, `01`, `1e0`, `abc`: each
  of the three posts (the pick with `start=2026-10-12T18:00`) answers 404 with `main h1`
  `Page not found`, and `listTasks` equals the rows from before. Fails with `isListed`
  returning `true` or with a route of its own that does not call `next()`.
- `it.each` over an `in_progress` task at YESTERDAY, a `done` task at YESTERDAY, and a
  pending task ending exactly at `NOW`: each of the three posts (the pick with
  `start=bogus`) answers 303 to `/overdue` and the rows equal those from before. Fails
  without any one of the three `isOverdue` guards, or when the pick checks `start`
  before the guard (it would answer 400).

### AC10
- No test of its own: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset;
  every test uses `createTestApp` (in-memory database, temporary folder); `git status
  --short` after `yarn test` shows nothing in `data/`; no existing test file is in the
  diff (`git diff --stat main -- 'src/**/*.test.ts'` lists only the three new files).
