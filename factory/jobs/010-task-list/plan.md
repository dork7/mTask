# 010-task-list: plan

Decision numbers (D1, D2, …) refer to `design.md`. Code given in full there is copied as
it is.

## Steps

1. **The list service.** Files: `src/services/task-list.ts`. Serves AC3, AC4, AC5.
   - Create the file of `design.md` (D2 to D5).
   - Write `src/services/task-list.test.ts` (Tests, AC3 to AC5 unit part).
   - Check: `yarn build`; `yarn vitest run src/services/task-list.test.ts`.

2. **The two exports.** Files: `src/routes/review.ts`, `src/services/drafts.ts`. Serves
   AC12, AC14.
   - `export function readId(` (D13) and `export function readMinutes(` (D9). No other
     change.
   - Check: `yarn build`.

3. **The action service.** Files: `src/services/task-actions.ts`. Serves AC8, AC9, AC11,
   AC12.
   - Create the file of `design.md` (D9, D10).
   - Check: `yarn build`.

4. **The chip partial.** Files: `src/views/partials/chip.ejs`. Serves AC5, AC6.
   - Replace it with the file of `design.md` (D6).
   - Check: `yarn vitest run src/components.test.ts` passes unedited.

5. **The router, the pages and the wiring.** Files: `src/routes/tasks.ts`,
   `src/views/pages/tasks.ejs`, `src/views/pages/task-edit.ejs`, `src/app.ts`. Serves
   AC1 to AC14.
   - Create the three files of `design.md` (D8, D11, D12, D13, D15) and add the two lines
     to `src/app.ts`.
   - Check: `yarn build`.

6. **The stylesheet.** Files: `public/css/base.css`. Serves AC5 (the bar), U5's look.
   - The two insertions of `design.md` (D7, D11).
   - Check: `yarn vitest run src/stylesheet.test.ts src/app.test.ts` passes unedited.

7. **The one test line.** Files: `src/shell.test.ts`. Serves AC1, AC15.
   - D14: remove `'/tasks', ` from the `it.each` list of "answers with the not-found page
     until its job builds it". Nothing else in the file.
   - Check: `yarn vitest run src/shell.test.ts`.

8. **The tests.** Files: `src/tasks-page.test.ts`, `src/tasks-actions.test.ts`,
   `src/tasks-edit.test.ts`. Serves AC1 to AC15.
   - Write them as listed under Tests.
   - For at least these breaks, make each once, see a test fail, and put the code back:
     `isListed` returns `true`; `newest` ignores `created_at`; `queryPairs` writes
     `sort=start`; `markDone` writes a `done` task; `rescheduleTask` without its status
     check; `saveTaskEdit` always reschedules; the Done redirect without the query.
     Record them in `build.md`.
   - Check: `git diff --stat` shows no existing test file but `src/shell.test.ts`, with
     one line changed.

9. **The whole run.** Serves AC15.
   - `env -u ANTHROPIC_API_KEY yarn build` and `env -u ANTHROPIC_API_KEY yarn test`, once
     each (not in a loop; `docs/errors/repeated-test-runs-run-out-of-ports.md`).
   - `git status --short` shows nothing under `data/` and no `.vitest/`.

## Tests

Shared setup, in each of the three route test files (the way `src/review-schedule.test.ts`
does it):

- `const NOW = '2026-10-12T09:36:00.000Z';` (1:36 PM in Dubai). In `beforeEach`:
  `vi.useFakeTimers({ toFake: ['Date'] })`, `vi.setSystemTime(new Date(STORED))` where
  `STORED` is a time before `NOW` (the actions and edit files use
  `'2026-10-11T05:00:00.000Z'`; the page file may use `NOW` itself), and
  `testApp = createTestApp({ analyze: vi.fn<Analyze>() })`. In `afterEach`:
  `testApp.close()`, `vi.useRealTimers()`.
- `dubai(time, daysAhead = 0)`: `new Date(Date.UTC(2026, 9, 12 + daysAhead, hours - 4,
  minutes)).toISOString()`, written in the test file; `src/dubai.ts` is not imported for
  expected values (009 D17).
- `task(extra)`: `createTask(testApp.db, { title: 'A task', status: 'pending', ...extra })`
  (the actions and edit files also default `priority: 'medium'`,
  `estimated_minutes: 30`).
- `rows()`: reads `listTasks(testApp.db)`, then `vi.setSystemTime(new Date(NOW))`, and
  returns what it read; a later write then shows in `updated_at`, so "unchanged" means
  not even that changed.
- `list(query = '')`: `GET /tasks${query}`, expects 200, returns the parsed document.
- `ids(document)`: the `id` of every `.task-list > li`, in order.
- `barChip(document, label)`: the one `.filter-bar a.chip` whose `visibleText` is
  `label`.
- A draft needs a source: `createSource(testApp.db, { kind: 'text', transcript: 'x' })`.

### AC3, AC4, AC5: `src/services/task-list.test.ts`

- `readListQuery({ priority: ['high', 'urgent', 'high', 'loud'], slot: 'night' })` is
  `{ priorities: ['urgent', 'high'], slots: ['night'], sort: 'start' }` (ui order, once
  each, unknown dropped).
- `readListQuery` of `undefined`, `{}`, `{ priority: 5 }`, `{ 'priority[]': 'high' }` has
  no filter and sort `start`.
- `sort`: `'priority'` and `'newest'` are kept; `'bogus'`, `''`, `['priority',
  'priority']` give `start`.
- `queryString({ priorities: ['high', 'urgent'], slots: ['night', 'morning'], sort:
  'newest' })` is `priority=urgent&priority=high&slot=morning&slot=night&sort=newest`
  (arrays out of order on purpose).
- `queryString` with sort `start` and no filter is `''`; `withQuery('/tasks', that)` is
  `/tasks`; with `priority: ['low']` it is `/tasks?priority=low`.
- `togglePriority` turns a value on and off and leaves `slots` and `sort`; `toggleSlot`
  the same.
- `shownTasks` does not reorder the array handed in (compare it with a copy after the
  call).

### AC1: `src/tasks-page.test.ts`

- With a draft, a pending, an `in_progress` and a `done` task: 200, `<title>` is
  `Tasks - Task Image AI`, the one `a[aria-current="page"]` has `href="/tasks"`, `main h1`
  is `Tasks`, and `ids` are those of the three non-drafts, as `task-<id>`.

### AC2: `src/tasks-page.test.ts`

- A pending task `<b>x</b>`, 25 minutes, `high`, `morning`, starting `dubai('14:30')`:
  no `b` element in the card, `.task__title` text `<b>x</b>`, `.task__minutes`
  `25 min`, one `.badge.badge--high` with `visibleText` `High`, `.task__slot`
  `Morning`, `.task__status` `Pending`, `.task__start` `Today 2:30 PM`.
- An `in_progress` task with nothing set: `No estimate`, no `.badge`, `No slot`,
  `In progress`, `Not scheduled`.
- A `done` task shows `Done`.
- A task starting `dubai('09:00', 1)` shows `Tomorrow 9:00 AM` (the label goes through
  `dayTimeLabel` with the request's time).

### AC3: `src/tasks-page.test.ts`

Seed six pending tasks: 1 `urgent`/`night`, 2 `high`/`night`, 3 `high`/`morning`,
4 `low`/`night`, 5 no priority/`night`, 6 `urgent`/no slot.

- `?priority=urgent` gives 1, 6; `?slot=night` gives 1, 2, 4, 5 (each alone; a null
  never matches).
- `?priority=urgent&priority=high&slot=night` gives 1, 2.
- `?priority=high&priority=high` gives 2, 3 (a repeated value).
- `?priority=bogus` answers 200 with all six; `?slot=night&slot=bogus` gives 1, 2, 4, 5.

### AC4: `src/tasks-page.test.ts`

- `start`: tasks created in this order: A at `dubai('15:00')`; B with no start, stored
  at an earlier `created_at` (`vi.setSystemTime` before creating it); C at
  `dubai('14:00')`; D with no start. No `sort`, `?sort=start` and `?sort=bogus` all give
  C, A, B, D.
- A tie: two tasks with the same start come in `id` order.
- `priority`: with the six of AC3, `?sort=priority` gives 1, 6, 2, 3, 4, 5; then give
  task 6 a start before task 1's and see 6, 1 first (within a priority, as `start`).
- `newest`: with the A to D above, `?sort=newest` gives D, C, A, B (`created_at`
  descending, then `id` descending; B is oldest although its id is 2).

### AC5: `src/tasks-page.test.ts`

- On `?slot=night&sort=newest&priority=high&priority=bogus` (out of order on purpose)
  with a `high`/`night` task: the bar's chip labels are `Urgent`, `High`, `Medium`,
  `Low`, `Morning`, `Afternoon`, `Evening`, `Night`, each an `a` with the class `chip`.
- `Urgent`'s href is `/tasks?priority=urgent&priority=high&slot=night&sort=newest`
  (added, in ui order); `High`'s is `/tasks?slot=night&sort=newest` (removed); `Night`'s
  is `/tasks?priority=high&sort=newest`; `Morning`'s is
  `/tasks?priority=high&slot=morning&slot=night&sort=newest`.
- `High` and `Night` have `chip--on` and `aria-current="true"`; `Urgent` and `Morning`
  have neither. `High` also has `chip--high`.
- On `/tasks` alone, `Low`'s href is `/tasks?priority=low` (no `sort=start`).
- The chip partial: `renderView('partials/chip', { chip: { label: 'Night', href:
  '/tasks?slot=night', current: true } })` is one `a` with that `href` and
  `aria-current="true"`; with `removable: true` its `visibleText` is still `Night`.
- The stylesheet: `.chip[href]` has `min-height: var(--touch-target)`; `.filter-bar` has
  `overflow-x: auto`.

### AC6: `src/tasks-page.test.ts`

- On the same query: `.active-filters a` are `[High, /tasks?slot=night&sort=newest]` and
  `[Night, /tasks?priority=high&sort=newest]` (label by `visibleText`, then `href`).
- On `/tasks` there is no `.active-filters`.
- The sort form: `form.sort-form` has `method="get"` and `action="/tasks"`; its hidden
  inputs are `priority=high` then `slot=night`; its `select[name=sort]` has the options
  `start`/`Time`, `priority`/`Priority`, `newest`/`Newest`; the one `selected` is
  `newest`; it has a `button[type=submit]`. On `/tasks` the selected one is `start` and
  there are no hidden inputs.

### AC7: `src/tasks-page.test.ts`

- No task at all (`?priority=high` too, and with only a draft): `.empty-state h2` is
  `No tasks yet`, and it holds a link to `/add`; there is no `.task-list`.
- One `low` task and `?priority=high`: `No tasks match these filters`, with an `a` whose
  text is `Clear filters` and `href="/tasks"`.

### AC8: `src/tasks-actions.test.ts`

- The list's card of a pending task on `?priority=medium&sort=priority` has a form
  `method="post"` whose `action` is `/tasks/1/done?priority=medium&sort=priority`, with a
  `Done` submit; a `done` task's card has no Done form; an `in_progress` card has one.
- Post `/tasks/1/done?slot=bogus&priority=medium&sort=priority` on a pending task with
  times yesterday and `actual_minutes: 7`: 303 to
  `/tasks?priority=medium&sort=priority#task-1`; the row equals the row before with
  `status: 'done'`, `completed_at: NOW`, `updated_at: NOW` and nothing else changed.
- An `in_progress` task: the same change.
- A `done` task: 303 to `/tasks#task-1`, and every row equals `rows()` (not even
  `updated_at`).

### AC9: `src/tasks-actions.test.ts`

- Only a `pending` card has a Reschedule form, its `action` built as in AC8.
- The spec's example: a 30-minute pending task, no slot, at `dubai('09:00', -1)` to
  `dubai('09:30', -1)`: after the post, the row is the one before with
  `scheduled_start: '2026-10-12T09:40:00.000Z'`, `scheduled_end:
  '2026-10-12T10:10:00.000Z'`, `updated_at: NOW`; the answer is 303 with AC8's location.
- Own times: the task already at `09:40Z`–`10:10Z` keeps exactly those times (it is
  not pushed past itself).
- Urgent: an urgent task yesterday and a `low` task at `09:40Z`–`10:10Z`; rescheduling
  the urgent one gives it `09:40Z` and the `low` one `10:10Z`–`10:40Z`.
- Cannot be placed (no `estimated_minutes`), `in_progress`, and `done`: every row
  equals `rows()`, and each answers 303 to `/tasks#task-<id>`.

### AC10: `src/tasks-edit.test.ts`

- The list's card has an `a` `Edit` with `href="/tasks/1/edit"`, with or without a list
  query.
- `GET /tasks/1/edit` for `Call`, 20 minutes, `high`, no slot: 200; `form.edit-form` has
  `method="post"` and `action="/tasks/1/edit"`; `formFields` is
  `{ title: 'Call', minutes: '20', priority: 'high', slot: '' }`; four priority radios
  with the ids of `src/ui.ts` in order; five slot radios, `''` then the four slots; a
  form posting to `/tasks/1/delete` with a `Delete` submit; an `a` to `/tasks`.
- With a slot stored (`evening`), the `evening` radio is the checked one.

### AC11: `src/tasks-edit.test.ts`

- A pending task with `category`, `description`, `source_id`, `confidence`, times
  yesterday: post `title='  New  '`, `minutes=45`, `priority=low`, `slot=''`: 303 to
  `/tasks#task-1`; the row is the one before with `title: 'New'`,
  `estimated_minutes: 45`, `priority: 'low'`, `time_slot: null`,
  `scheduled_start: '2026-10-12T09:40:00.000Z'`, `scheduled_end:
  '2026-10-12T10:25:00.000Z'`, `updated_at: NOW`.
- Only the title changed: the row is the one before with the new title and `updated_at`;
  the times are as they were.
- Each of minutes, priority and slot changed alone reschedules (three cases: the times
  become today's).
- An `in_progress` and a `done` task with changed minutes keep their times and their
  status.
- A form as served (`formFields` of the edit page) posted back gives 303 and leaves the
  times.

### AC12: `src/tasks-edit.test.ts`

- `title=%20&minutes=0&priority=loud&slot=dawn`: 400; `[role=alert] p` texts are the
  three messages in order, once each; `formFields` is `{ title: ' ', minutes: '0',
  priority: <stored>, slot: <stored or ''> }`; every row equals `rows()`.
- One case per problem alone (`title=''`; `minutes=1441`, `minutes=2.5`,
  `minutes=abc`; `priority` missing; `slot=dawn`; `slot` missing): only its message.
- A repeated `title` (`title=a&title=b`) gives the title message.
- A post with no body at all: 400 with all three messages.
- A refused post that posts a valid priority shows that radio checked (posted values).

### AC13: `src/tasks-edit.test.ts` (or `src/tasks-actions.test.ts`)

- The card's Delete form `action` is `/tasks/1/delete?priority=medium` on
  `?priority=medium`.
- Post it: 303 to `/tasks?priority=medium`; the task is gone; its source row is still
  there; another task is unchanged.
- From the edit page: post `/tasks/1/delete` gives 303 to `/tasks`.
- A task whose photo was stored in `testApp.uploadsDir` (write a file there and set the
  task's `image_path` and source): the file still exists after the delete.

### AC14: `src/tasks-actions.test.ts`

- For a draft id, an id with no task (`99`), `01`, `1e0` and `abc`: `GET
  /tasks/<id>/edit` and posts to `/done`, `/reschedule`, `/edit` (with a valid body) and
  `/delete` all answer 404 with `main h1` `Page not found`; every row equals `rows()`.
- A done post with `?priority=<b>&slot=night&sort=newest&sort=x` redirects to
  `/tasks?slot=night#task-1` (bad and repeated values dropped).
- Every `Location` of the AC8, AC9, AC11 and AC13 tests starts with `/tasks`.

### AC15

- Step 9 runs `yarn build` and `yarn test` with `ANTHROPIC_API_KEY` unset. Every test
  above uses `createTestApp`, whose database is in memory and whose folder is under the
  system's temporary folder.
- Existing tests: only the D14 line of `src/shell.test.ts` changes (step 8's check).
