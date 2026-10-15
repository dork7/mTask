# 014-today-dashboard: plan

Decision numbers (D1, D2, …) refer to `design.md`. Every code block the steps name is in
`design.md` under Files. Copy it as written.

## Steps

1. **The weekday date line.** Files: `src/dubai.ts`. Serves AC1.
   - Add `WEEKDAY_NAMES` after `MONTHS` and `weekdayDateLabel` after `clockLabel` (D3).
   - Check: `src/dubai-weekday.test.ts` passes, and `src/dubai.test.ts` passes
     unchanged.

2. **The dashboard service.** Files: `src/services/today.ts` (new). Serves AC2 and AC4
   to AC8.
   - Create the file as given under Files (D2, D4, D5, D8, D10).
   - Check: `src/services/today.test.ts` passes, and `yarn build` is clean.

3. **The route.** Files: `src/routes/home.ts`, `src/app.ts`. Serves AC1 and AC9.
   - Replace `home.ts` with `createHomeRouter(deps)`. In `app.ts`, change the import and
     the `app.use` line in place (D1).
   - Check: `yarn build` is clean, and `src/app.test.ts` passes unchanged.

4. **The page.** Files: `src/views/pages/home.ejs`. Serves AC1 to AC8.
   - Replace it with the template given under Files (D6 to D10).
   - Check: `src/today-page.test.ts` passes. `src/shell.test.ts` and `src/app.test.ts`
     pass unchanged.

5. **Styles.** Files: `public/css/base.css`. Serves AC7 (the `.d-*` rules) and the look
   of the page.
   - Insert the rules given under Files after `.mini-bar__title` and before
     `/* ---------- Style guide ---------- */` (D11).
   - Check: the AC7 stylesheet test passes. `src/stylesheet.test.ts` and
     `src/app.test.ts` ("declares on :root every variable it uses", "has no color
     literal outside :root") pass unchanged.

6. **Whole suite.** Serves AC10.
   - Run `yarn build`, then `yarn test`, once each, with `ANTHROPIC_API_KEY` unset.
     Check that nothing new is in `data/` (`git status --short data/` shows nothing).
   - If an existing test fails, the design is wrong, not the test. Report it and do not
     edit the test.

## Tests

Shared setup for `src/today-page.test.ts`, modelled on `src/overdue-page.test.ts`:

- `STORED = '2026-10-11T05:00:00.000Z'` and `NOW = '2026-10-12T09:36:00.000Z'`.
- `beforeEach`: `vi.useFakeTimers({ toFake: ['Date'] })`,
  `vi.setSystemTime(new Date(STORED))`, and
  `testApp = createTestApp({ analyze: vi.fn<Analyze>() })`.
- `afterEach`: `testApp.close()` and `vi.useRealTimers()`.
- `at(time: string, date = '2026-10-12'): string` is
  `new Date(`${date}T${time}:00.000+04:00`).toISOString()`, a Dubai clock time.
- `times(start, end, date?)` gives `{ scheduled_start: at(start, date), scheduled_end: at(end, date) }`.
- `task(extra)` creates a pending `medium` task of 30 min titled `A task`, with `extra`
  spread last.
- `draftTask(extra)` creates a text source and a `draft` task of it, with `extra`.
- `rows()` returns `listTasks(testApp.db)` and then sets the clock to `NOW`.
- `home()` is `GET /`. It expects status 200 and returns `parseHtml(text)`.
- Use the helpers of `src/testing/dom.ts`: `one`, `all`, `textOf` and `visibleText`.

### AC1: `src/today-page.test.ts` "the page (AC1)"

- With no task: the title is `Today - Task Image AI`. `main h1` reads `Today`, and the
  HTML of `main` (the `mainOf` regex of `src/app.test.ts`) contains `<h1>Today</h1>`.
  Exactly one `[aria-current="page"]` exists, with href `/`. `.page-header__sub` reads
  `Monday, 12 Oct`. The text of `main` does not contain `No tasks yet`.
- With the clock at `2026-10-12T20:30:00.000Z` (00:30 on 13 Oct in Dubai), the sub-line
  reads `Tuesday, 13 Oct`. This fails with UTC day arithmetic or a fixed date.
- Escaping. Task 1 is pending 2:00 to 2:45 PM, titled `<b>x</b>`, with the category
  `<i>c</i>`. Task 2 is pending 4:00 to 5:00 PM, titled `<b>y</b>`. `main` has no `b`
  and no `i` element. `#next-up-title a` reads `<b>x</b>` and `.next-up__meta` reads
  `<i>c</i> · about 30 min`. `#later-2 .later__title` reads `<b>y</b>`. This fails when
  `<%=` becomes `<%-`.

### AC2: `src/today-page.test.ts` "Next up (AC2)"

- The spec example. Task 1 is pending 9:00 to 9:30 AM. Task 2 is pending 2:00 to
  2:45 PM: `Submit expense report`, `urgent`, `Admin`, 45 min. Task 3 is pending 4:00 to
  5:00 PM. The page has exactly one `#next-up`. `.next-up__when` reads
  `Next up · 2:00 PM`. `#next-up-title a` reads `Submit expense report` with href
  `/tasks/2`. `#next-up .badge.badge--urgent` exists, and its `visibleText` is `Urgent`.
  `.next-up__meta` reads exactly `Admin · about 45 min`. This fails without the overdue
  filter, which picks task 1, and fails with `join('')`.
- The same tasks plus task 4, pending 1:00 to 2:00 PM, created last. Next up is task 4,
  `Next up · 1:00 PM`. This fails when sorted by id or by end.
- A task ending exactly at `now`: task 1 pending 1:00 to 1:36 PM, task 2 pending 3:00 to
  3:30 PM. Next up is task 1. This fails when `isOverdue` is replaced by `end > now`.
- Never in progress, done or a draft. Task 1 is `in_progress` 1:30 to 2:00 PM. Task 2 is
  `done` 1:40 to 2:00 PM. Task 3 is a draft 1:45 to 2:00 PM. Task 4 is pending 3:00 to
  3:30 PM. Next up is task 4. This fails without the status filter.
- Meta parts. With `category: null`, `.next-up__meta` reads `about 45 min`. With
  `estimated_minutes: null` and `category: 'Admin'`, it reads `Admin`. With both null,
  there is no `.next-up__meta`. Each case is one pending 2:00 to 2:45 PM task.
- No badge for a null priority. One pending task with `priority: null`: `#next-up` has
  no `.badge` and the status is 200. The partial throws on a null id, so a missing guard
  gives 500.

### AC3: `src/today-page.test.ts` "Start (AC3)"

- The form. One pending 2:00 to 2:45 PM task: `#next-up form` has `method="post"` and
  `action="/tasks/1/start"`, and its one `button[type="submit"]` reads `Start`.
- The post starts the task, and the next task becomes Next up. Tasks 1 and 2 are pending
  at 2:00 and 4:00 PM. Call `rows()`, then post the action read from the page's form. The
  answer is 303 with location `/tasks/1`. `getTask(db, 1)` has `status: 'in_progress'`
  and `started_at: NOW`. A new `home()` shows `#next-up-title a` with href `/tasks/2`,
  and has no `#later-1`.
- Starting the last one gives the empty state. One pending task: after the post, the
  next `home()` has no `#next-up` and has one `.empty-state`.

### AC4: `src/today-page.test.ts` "nothing next (AC4)"

- With no task: no `#next-up`. `main .empty-state` has `.empty-state__heading` reading
  `Nothing up next`, and an `a` with href `/add`.
- With only an overdue 9:00 AM task, an `in_progress` task, a `done` task, all today,
  and a pending task tomorrow (`times('14:00', '14:30', '2026-10-13')`): no `#next-up`,
  and the empty state is there. This fails when Next up is taken from tomorrow or from
  an in-progress task.
- With a Next up task, there is no `.empty-state` in `main`.

### AC5: `src/today-page.test.ts` "overdue banner (AC5)"

- The count over any day, pending only:
  - task 1 pending yesterday, 9:00 to 9:30 AM on 11 Oct;
  - task 2 pending today, 9:00 to 9:30 AM;
  - task 3 `in_progress` yesterday;
  - task 4 `done` today, 8:00 to 8:30 AM;
  - task 5 a draft yesterday.

  Exactly one `#overdue-banner`, an `a` with href `/overdue`, whose `visibleText` is
  `2 overdue tasks Review`. This fails when only today's tasks are counted, or when any
  status is.
- One overdue task gives `1 overdue task Review`. This fails when the plural is always
  used.
- With a pending task at 2:00 PM and a done task at 9:00 AM, there is no
  `#overdue-banner`.

### AC6: `src/today-page.test.ts` "progress (AC6)"

- The spec example, all today:
  - done 8:00 to 8:45 AM, 45 min, `actual_minutes: 90`;
  - done 9:00 to 9:30 AM, 30 min, `actual_minutes: 10`;
  - pending 2:00 to 2:45 PM, 45 min;
  - pending 4:00 to 5:00 PM, 60 min;
  - pending 6:00 to 7:00 PM, 60 min.

  Plus a done task yesterday of 30 min, and a draft today of 50 min. Exactly one
  `#progress`. `.progress__minutes` reads `75 of 240 min done`, `.progress__tasks` reads
  `2 of 5 tasks finished`, and `.progress__percent` reads `31%`. The element has
  `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"` and
  `aria-valuenow="31"`. `.progress__fill` has `style="width: 31%"`. This fails when
  `actual_minutes` is counted, the day or draft filter is missing, or the percent is
  ceiled.
- With no task, and with only a done task yesterday: `0 of 0 min done`,
  `0 of 0 tasks finished`, `0%`, and `aria-valuenow="0"`.

### AC7: `src/today-page.test.ts` "later today (AC7)"

- The order, and what is left out:
  - task 1 pending 4:00 PM, `high`, `Coding`, 60 min, `Review PR`;
  - task 2 pending 2:00 PM (Next up);
  - task 3 pending 8:00 PM, `priority: null`, `category: null`;
  - task 4 pending 3:00 PM, `low`;
  - task 5 done 5:00 PM;
  - task 6 `in_progress` 3:30 PM;
  - task 7 a draft 6:00 PM;
  - task 8 pending 9:00 AM (overdue);
  - task 9 pending tomorrow.

  `h2#later-heading` reads `Later today`. The ids of `.later__item` are
  `['later-4', 'later-1', 'later-3']`. There is no `#later-2`.
- One item's parts. In `#later-1`, `.later__title` reads `Review PR` with href
  `/tasks/1`. `.later__meta` reads exactly `Coding · 60 min`. `.later__time` reads
  `4:00 PM`. `.dot` has the classes `dot` and `d-high`. In `#later-3`, the dot has
  `d-none`, and `.later__meta` reads `30 min`.
- Nothing later. With only the Next up task, and with no task, there is no `.later` and
  no element whose text is `Later today`.
- Stylesheet. Using `getStylesheet()` of `src/testing/page.ts`, for each of `urgent`,
  `high`, `medium` and `low`,
  `declarationsOf(findRule(rules, '.d-<p>'))` equals `{ background: 'var(--<p>)' }`.

### AC8: `src/today-page.test.ts` "quick add (AC8)"

- With no task, and again with a Next up task and a Later item:
  `all(one(document, '#quick-add'), 'a')`, mapped to `[visibleText, href]`, equals
  `[['Photo', '/add?tab=photo'], ['Voice', '/add?tab=voice'], ['Type', '/add?tab=text']]`.
  Each link holds one `[aria-hidden="true"]` element. This fails on a wrong order, a
  wrong tab id, or a glyph that is not hidden.

### AC9: `src/today-page.test.ts` "reading only (AC9)"

- Create a source, then these tasks: one overdue yesterday, one pending at 2:00 PM, one
  at 4:00 PM, one `in_progress` with `started_at` (so the mini-bar renders too), one
  done, a draft, and a pending task with no times. Take `listTasks(db)` and
  `SELECT key, value FROM settings ORDER BY key` as before. Move the clock to `NOW` plus
  one hour, then `GET /` twice. Both tables equal their before state, `updated_at`
  included.

### Service: `src/services/today.test.ts`

Uses the `row(id, extra)` helper of `src/services/overdue.test.ts`, copied.
`NOW = new Date('2026-10-12T09:36:00.000Z')`.

- `tasksLeft`, ties by id: rows 5 and 3, pending, same times 2:00 to 2:45 PM, handed in
  as `[row 5, row 3]`, give the ids `[3, 5]`. This fails without the id tie-break,
  because the sort is stable.
- `tasksLeft` leaves the input list in its order (compare a copy taken before).
- `progressOf` rounds: done 20 min and pending 10 min today give `percent` 67, `20 of 30
  min done` and `1 of 2 tasks finished`. This fails with floor.
- `progressOf` with nothing planned: one done task today with a null estimate gives
  percent 0, `0 of 0 min done` and `1 of 1 tasks finished`. This fails with `NaN`.
- `buildToday` banner: 0 overdue gives `overdue: null`. 1 gives
  `{ href: '/overdue', text: '1 overdue task' }`. 3 gives `3 overdue tasks`.
- `buildToday` meta with an empty-string category: `category: ''`, 45 min gives Next up
  meta `about 45 min`.
- `buildToday` Later item: a `medium` row gives `tone: 'medium'` and
  `priorityLabel: 'Medium priority'`. A null priority gives `'none'` and `null`.
- `buildToday` `quickAdd` is `QUICK_ADD`, by `toBe`.

### Date line: `src/dubai-weekday.test.ts`

- `weekdayDateLabel` gives:
  - `2026-10-12T09:36:00.000Z` → `Monday, 12 Oct`;
  - `2026-10-11T20:00:00.000Z` → `Monday, 12 Oct` (Dubai midnight);
  - `2026-10-11T19:59:00.000Z` → `Sunday, 11 Oct`;
  - `2026-10-12T20:30:00.000Z` → `Tuesday, 13 Oct`;
  - `2026-03-01T00:00:00.000Z` → `Sunday, 1 Mar`, with no leading zero.
- Each case runs twice, in the process's own time zone and with
  `process.env.TZ = 'Pacific/Kiritimati'`, restoring `TZ` afterwards, as
  `src/dubai-datetime.test.ts` does. This catches local-time methods.

### AC10

- `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset (step 6). Every test
  above uses `createTestApp` or no app, so nothing lands in `data/`. No existing test
  file is edited.
