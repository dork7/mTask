# 016-recurring: plan

Decision numbers (D1, D2, …) refer to `design.md`. Every code block the steps name is in
`design.md` under Files; copy it as written. The module `src/services/recurrence.ts` is
given whole there: create it from that block, do not retype it from memory.

Run each check once, with the default reporter. The route test files use supertest; in a
loop they run out of ports (`docs/errors/repeated-test-runs-run-out-of-ports.md`). No
check may leave a reporter's file in the repo
(`docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md`). The starter test
uses fake timers and stops them, so no real interval outlives a test
(`docs/errors/spawnsync-without-timeout-hangs-suite.md`).

## Steps

1. **The recurrence module.** Files: `src/services/recurrence.ts` (new). Serves AC1,
   AC2, AC3, AC5, AC6, AC7.
   - Create the file from the block in Files of `design.md`: the lists `weekdays` and
     `repeats`, `readRule`/`repeatRule`/`repeatOf`/`daysOf` (D3), `nextDay` and its two
     helpers (D2), `makeNextInstance` (D4), `runRecurrence` (D6), `startRecurrence` (D7).
   - Check: `yarn build` is clean.

2. **The two reads, `postedStrings` and `markDone`.** Files:
   `src/services/drafts.ts`, `src/services/task-actions.ts`. Serves AC4, AC9, AC10.
   - `src/services/drafts.ts`: the import, `postedStrings` (D10), `DraftFieldName` gains
     `'repeat'` and `'repeat-days'`, `DraftEdit` gains `recurrence_rule?`,
     `DraftProblems` gains `repeat`, the `readDraftEdits` problems literal and its new
     repeat block (D13), `hasProblems` includes `repeat`.
   - `src/services/task-actions.ts`: the two imports, `SheetEdit` gains
     `recurrence_rule?`, `readSheetEdit` as in D12, `markDone` as in D5 (its
     `inTransaction`), and `readTaskEdit`'s problems literal gains `repeat: false`.
   - Check: `yarn build` is clean and
     `yarn -s vitest run src/tasks-actions.test.ts src/tasks-edit.test.ts src/task-sheet-edit.test.ts src/task-start-done.test.ts src/review-actions.test.ts`
     passes with none of those files edited. A tasks-actions test that compares whole
     rows fails if `markDone` now writes a rule-less task anywhere else (D5).

3. **The sheet's picker and the app locals.** Files: `src/routes/tasks.ts`,
   `src/views/partials/task-sheet-body.ejs`, `src/app.ts`. Serves AC8, AC9.
   - `src/routes/tasks.ts`: the imports, `BAD_REPEAT`, `SheetForm` gains `repeat`/`days`,
     `sheetMessages` appends it last (D16), `shownRepeat` (D14, after `shownOptional`),
     `renderSheet`'s form spreads `...shownRepeat(task.recurrence_rule, body)`.
   - `src/views/partials/task-sheet-body.ejs`: the picker of D14, after the Time slot
     fieldset.
   - `src/app.ts`: the import, and `app.locals.recurrence = { repeats, weekdays };` after
     `app.locals.ui = ui;` (D11).
   - Check: `yarn build` is clean.

4. **The review card's picker.** Files: `src/routes/review.ts`,
   `src/views/pages/review.ejs`. Serves AC10.
   - `src/routes/review.ts`: the imports, `BAD_REPEAT`, `DraftCard` gains
     `repeat`/`days`, `cardOf`'s `fields` and returned object gain the two controls (D13),
     `messagesOf` appends `BAD_REPEAT` last (D16).
   - `src/views/pages/review.ejs`: the controls of D14 after the slot select of each
     card, and the header-comment sentence.
   - Check: `yarn build` is clean.

5. **The starter in the server.** Files: `src/server.ts`, `src/server.test.ts`. Serves
   AC7, AC11.
   - `src/server.ts`: the import, and `startRecurrence(db);` after `openDatabase` (D7).
   - `src/server.test.ts`: `const startRecurrence = vi.fn();`,
     `vi.doMock('./services/recurrence.ts', () => ({ startRecurrence }));` in
     `beforeEach`, `vi.doUnmock('./services/recurrence.ts');` in `afterEach`, and the one
     new test below (D9).
   - Check: `yarn -s vitest run src/server.test.ts` passes, with one more test than
     before and no existing assertion changed.

6. **The test helper and the four named edits.** Files: `src/testing/dom.ts`,
   `src/task-sheet.test.ts`, `src/review-page.test.ts`, `src/add-rules.test.ts`. Serves
   AC8, AC10, AC11.
   - `src/testing/dom.ts`: `formFields` skips a checkbox that is not checked, and its
     comment names both (D15).
   - `src/task-sheet.test.ts:161`: the exact `formFields` object gains `repeat: ''`.
   - `src/review-page.test.ts:378` and `:394`: `one(cardOf(…), 'select')` becomes
     `one(cardOf(…), 'select[name^="slot-"]')`.
   - `src/review-page.test.ts:432`: the exact `formFields` object gains `repeat-<id>: ''`
     for each of the three drafts.
   - `src/add-rules.test.ts:118`: `selectedSlots` reads
     `all(document, '[data-draft] select[name^="slot-"]')`; its assertion at `:182` is
     untouched.
   - Check: `yarn -s vitest run src/task-sheet.test.ts src/review-page.test.ts src/add-rules.test.ts`
     passes; `src/add-rules.test.ts` and `src/review-page.test.ts` would fail at `:182`
     and at `:378` before the helper and selector edits.

7. **The unit tests of the module.** Files: `src/services/recurrence.test.ts` (new).
   Serves AC1, AC2, AC3, AC5, AC6, AC7.
   - Write the file under Tests, "AC1", "AC2", "AC3", "AC5", "AC6" and "AC7 (the
     starter)".
   - Check: `yarn -s vitest run src/services/recurrence.test.ts` passes.

8. **The route tests.** Files: `src/recurrence-done.test.ts`,
   `src/recurrence-sheet.test.ts`, `src/recurrence-review.test.ts` (new). Serves AC4,
   AC8, AC9, AC10.
   - Write the files under Tests, one section per criterion. For each line, break the
     code the way its parenthesis says once, see the named test fail, and put the code
     back; run each file once per break.
   - Check: `yarn -s vitest run src/recurrence-done.test.ts src/recurrence-sheet.test.ts src/recurrence-review.test.ts`
     passes.

9. **The whole.** Serves AC11.
   - Check: `yarn build` is clean.
   - Check: `ANTHROPIC_API_KEY= yarn test` passes, with no existing assertion changed
     beyond the four named edits and the `src/server.test.ts` mock.
   - Check: `git status --porcelain data/` is empty, and
     `git status --porcelain` lists only `src/services/recurrence.ts`, the four new test
     files, `src/services/drafts.ts`, `src/services/task-actions.ts`,
     `src/routes/tasks.ts`, `src/routes/review.ts`,
     `src/views/partials/task-sheet-body.ejs`, `src/views/pages/review.ejs`,
     `src/app.ts`, `src/server.ts`, `src/server.test.ts`, `src/testing/dom.ts`, the three
     edited test files, and this job's `build.md`: no `data/`, no `.vitest/`, no
     `package.json`, no `yarn.lock`.

## Tests

### Shared setup

`src/services/recurrence.test.ts`, on a database of its own, with no app, as in the
scheduler tests:

```ts
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = new Date('2026-10-12T09:36:00.000Z');

let db: Database;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

/** The Dubai day of a calendar date, `YYYY-MM-DD`. */
function day(date: string): number {
  const found = dayOfDate(date);
  if (found === undefined) throw new Error(`Not a date: ${date}`);
  return found;
}

/** The calendar date of a Dubai day. */
function date(dayNumber: number): string {
  return dateOfDay(dayNumber);
}

/** A task to run the job over: pending, with no rule, unless `extra` says otherwise. */
function task(extra: Partial<NewTask> = {}): Task {
  return createTask(db, { title: 'A task', status: 'pending', estimated_minutes: 30, ...extra });
}
```

`nextDay` is called as `nextDay(rule, from, notBefore)` with `rule` from
`readRule(stored)` and the last two as `day(…)`; the result is compared with `date(…)`,
so the tests never name a weekday.

The three route files are set up as in `src/tasks-actions.test.ts`: only `Date` is
faked; `createTestApp({ analyze: vi.fn<Analyze>() })`; `testApp.close()` and
`vi.useRealTimers()` in `afterEach`. `src/recurrence-done.test.ts` sets the clock to
`DONE = '2026-10-12T17:00:00.000Z'` (9:00 PM in Dubai); `src/recurrence-sheet.test.ts`
and `src/recurrence-review.test.ts` set it to `NOW = '2026-10-12T09:36:00.000Z'`. Each
defines `dubai(time, daysAhead)` as those files do, and reads the page with a helper
that asserts status 200 and `parseHtml`.

### AC1: `src/services/recurrence.test.ts`, "the rule forms (AC1)"

- `it.each(['FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY'])`: `readRule` gives
  `{ frequency: <daily|weekly|monthly>, days: null }`. (Fails when a form is not read,
  or its `days` is not null.)
- `readRule('FREQ=WEEKLY;BYDAY=MO')` is `{ frequency: 'weekly', days: ['MO'] }`;
  `'FREQ=WEEKLY;BYDAY=MO,TH'` has `['MO', 'TH']`; all seven in order has all seven.
  (Fails when `BYDAY` is not split, or the order is not kept.)
- `it.each([null, 'FREQ=YEARLY', 'FREQ=WEEKLY;BYDAY=TH,MO', 'FREQ=WEEKLY;BYDAY=MO,MO',
  'FREQ=WEEKLY;BYDAY=', 'FREQ=DAILY;BYDAY=MO', 'weekly'] as const)`: `readRule` is
  `null`. (Fails when an unknown value, an out-of-order or repeated day, or an unknown
  form is read.)
- `it.each([['', null], ['daily', 'FREQ=DAILY'], ['monthly', 'FREQ=MONTHLY']])`:
  `repeatRule(value, [])` is the stored string. `repeatRule('weekly', [])` is
  `'FREQ=WEEKLY'`; `repeatRule('weekly', ['TH', 'MO'])` is
  `'FREQ=WEEKLY;BYDAY=MO,TH'`; `repeatRule('weekly', ['MO', 'MO', 'TH'])` is the same
  (repeated boxes dropped); `repeatRule('daily', ['MO'])` is `'FREQ=DAILY'` (days
  ignored); `repeatRule('yearly', [])` and `repeatRule('weekly', ['XX'])` are
  `undefined`. (Fails when the mapping, the order, the de-duplication, or the refusal is
  wrong.)
- `repeatOf('FREQ=WEEKLY;BYDAY=MO')` is `'weekly'`; `repeatOf(null)` and
  `repeatOf('FREQ=YEARLY')` are `''`; `daysOf('FREQ=WEEKLY;BYDAY=MO,TH')` is `['MO',
  'TH']`, `daysOf('FREQ=WEEKLY')` and `daysOf(null)` are `[]`. (Fails when the picker's
  view and the reader disagree.)

### AC2: `src/services/recurrence.test.ts`, "the next date (AC2)"

Every line passes `readRule(<the rule>)!` and both `day(…)` arguments; the result is a
`date(…)`.

- Daily: `'FREQ=DAILY'` from 12 Oct, not before 12 Oct, is 13 Oct; from 10 Oct, not
  before 12 Oct, is 12 Oct. (Fails when daily is `day + 1` without the `notBefore`.)
- Weekly on `MO,TH`: from 12 Oct, not before 12 Oct, is 15 Oct; from 15 Oct, not before
  15 Oct, is 19 Oct. (Fails when the first day after the instance is searched from the
  wrong day.)
- Weekly plain: from 12 Oct, not before 12 Oct, is 19 Oct; from 12 Oct, not before
  20 Oct, is 26 Oct. (Fails when the weekly walk forgets `notBefore` or the instance's
  own weekday.)
- Monthly: `'FREQ=MONTHLY'` from 12 Oct 2026, not before its own day, is 12 Nov 2026;
  from 31 Jan 2027, not before its own day, is 28 Feb 2027; from 31 Jan 2027, not before
  1 Mar 2027, is 31 Mar 2027. (Fails when the month's last day is not the cap, or the
  month arithmetic is off.)
- `it.each(['America/New_York', 'Pacific/Kiritimati', 'UTC'])`: sets `process.env.TZ` and
  repeats the monthly cap cases; the results are the same, and `afterEach` puts the zone
  back. (Fails when the cap reads the process's local month.)

### AC3: `src/services/recurrence.test.ts`, "the next instance (AC3)"

- `makeNextInstance` of a task that carries `title`, `description`, `category`,
  `image_path`, `estimated_minutes`, `priority`, `time_slot` and `FREQ=WEEKLY` returns a
  task whose eight copied fields equal them, whose `parent_task_id` is the instance's
  id, whose `status` is `'pending'`, and whose `source_id`, `confidence`, `started_at`,
  `completed_at`, `actual_minutes` and `reminder_at` are all null; the instance's own
  `recurrence_rule` is `null` afterwards. (Fails when a field is not copied, one of the
  six is copied, `parent_task_id` is left out, or the rule is not cleared.)
- A daily 30-minute task with no slot, dated and done on 12 Oct, at `NOW`: the next
  instance is `2026-10-13T05:00:00.000Z` to `2026-10-13T05:30:00.000Z`. (Fails when the
  placement is from `now` alone, or the next day is off.)
- The same task dated 10 Oct, done at `NOW`: the next instance is
  `2026-10-12T09:40:00.000Z` to `2026-10-12T10:10:00.000Z`. (Fails when `from` is not
  the later of `now` and the next day's midnight, or the mark is not the next 5.)
- A task whose `estimated_minutes` is null: the next instance is still created, pending
  with `scheduled_start` and `scheduled_end` null. (Fails when an unplaceable instance is
  not created.)
- `makeNextInstance` of a task whose rule is `null` or `'FREQ=YEARLY'` is `undefined`
  and writes nothing. (Fails when an unknown rule makes an instance.)

### AC4: `src/recurrence-done.test.ts`, "completing makes the next one (AC4)"

Shared: `groceries()` creates task 1: title `Weekly groceries`, category `shopping`,
priority `medium`, `time_slot` `night`, `estimated_minutes` 40, `recurrence_rule`
`FREQ=WEEKLY`, status `pending`, `scheduled_start` `2026-10-12T16:00:00.000Z`,
`scheduled_end` `2026-10-12T16:40:00.000Z`. `NEXT` is the expected next row:
`{ title: 'Weekly groceries', description: null, image_path: null, category: 'shopping',
estimated_minutes: 40, actual_minutes: null, priority: 'medium', time_slot: 'night',
scheduled_start: '2026-10-19T16:00:00.000Z', scheduled_end: '2026-10-19T16:40:00.000Z',
status: 'pending', started_at: null, completed_at: null, reminder_at: null,
recurrence_rule: 'FREQ=WEEKLY', parent_task_id: 1, source_id: null, confidence: null }`.
For the overdue route the task is overdue at `DONE` (its end is 16:40Z, before 17:00Z).

- `it.each([['/tasks/1/done', '/tasks#task-1'], ['/tasks/1/done?from=sheet', '/tasks/1'],
  ['/overdue/1/done', '/overdue']])`: `groceries()`; post; 303 to that location; two
  tasks: task 1 `toEqual`s its before with `status: 'done'`, `completed_at: 'DONE'`,
  `recurrence_rule: null`, `updated_at: 'DONE'` and its times unchanged; task 2
  `toMatchObject(NEXT)` with `id: 2`, `created_at` and `updated_at` `DONE`. (Fails when a
  route does not go through `markDone`, when the next instance's times are off, or when
  the old task's times move.)
- A done task, a draft, and a task with no rule: each Done creates no task. (Fails when
  `markDone` makes an instance for anything but a task with a rule.)
- A task already `done` with a rule: `POST /tasks/1/done` is 303 and `listTasks` equals
  its before, `updated_at` included. (Fails when the early return is dropped.)
- All or none: `groceries()`; add `CREATE TRIGGER refuse_insert BEFORE INSERT ON tasks
  BEGIN SELECT RAISE(ABORT, 'refused by the test'); END`; `before = listTasks`; post
  `/tasks/1/done`: 500 and `listTasks` equals `before`, so the Done is rolled back with
  the instance. (Fails when `markDone` writes the two outside one transaction.)

### AC5: `src/services/recurrence.test.ts`, "the periodic run (AC5)"

Shared: a `groceries` task as in AC4.

- `runRecurrence(db, new Date('2026-10-12T16:30:00.000Z'))` returns `[]` and makes no
  task: its end has not passed. (Fails when the run does not check `scheduled_end`
  against `now`.)
- `runRecurrence(db, new Date('2026-10-12T18:00:00.000Z'))` returns `[2]`; task 2 is
  AC4's next instance; task 1 `toEqual`s its before with only `recurrence_rule: null` and
  `updated_at` changed (its times unchanged, its status still `pending`). (Fails when the
  run does not make the instance, changes the old task's times, or does not clear the
  rule.)
- A draft with a rule and a passed end, a task with no rule, and a task whose end is
  after `now`: each is left alone and adds no id; the run returns only the ids it
  created, in `id` order. (Fails when the run picks a draft, a rule-less task, or one
  that is not yet due.)

### AC6: `src/services/recurrence.test.ts`, "exactly once (AC6)"

Shared: a `groceries` task with a passed end at `now = new Date('2026-10-12T18:00:00.000Z')`.

- Done then the run: `markDone`, then `runRecurrence`; `listTasks` has two tasks.
  (Fails when the cleared rule does not stop the run.)
- The run then Done: `runRecurrence`, then `markDone(db, task, now)`; two tasks. (Fails
  when the run does not clear the rule of the instance it took.)
- Two runs: `runRecurrence` twice; two tasks, and the second returns `[]`. (Fails when
  the marker is not written, or the same task is taken twice.)
- Delete the newest, then a Done and a run: after the run, `deleteTask(db, 2)`; then
  `markDone` and `runRecurrence`; one task. (Fails when the series is tracked by
  `parent_task_id` alone, which the delete clears, or by a marker the delete leaves
  behind.)
- The next instance carries the rule: after the run, task 2's `recurrence_rule` is
  `FREQ=WEEKLY`; with its `scheduled_end` before a later `now`, a second run makes task
  3. (Fails when the rule is not copied to the instance.)

### AC7 (the starter): `src/services/recurrence.test.ts`

Set up tasks A, B and C at `vi.setSystemTime(new Date('2026-10-12T18:00:00.000Z'))`, all
with a rule and an end: A's end 16:40Z (passed), B's end 18:10Z, C's end 18:40Z. Call
`const stop = startRecurrence(db);`.

- A gets its next instance right after the start: `listTasks` has four tasks, and the
  one with `parent_task_id` A's id is placed. (Fails when `startRecurrence` does not run
  once at once, or reads the clock itself.)
- B gets its next instance within 15 minutes: `vi.advanceTimersByTime(15 * 60_000)`;
  `listTasks` has five tasks. (Fails when the interval is not 15 minutes, or the run
  does not repeat.)
- After the stop, no further run happens: `stop()`; `vi.advanceTimersByTime(60 * 60_000)`
  (C's end has passed by then); `listTasks` still has five tasks. (Fails when the stop
  does not `clearInterval`, or returns a function that does nothing.)

### AC8: `src/recurrence-sheet.test.ts`, "the sheet's picker is shown (AC8)"

`NOW` is 1:36 PM in Dubai. `sheet(id)` is `GET /tasks/<id>`.

- A task with `recurrence_rule` `FREQ=WEEKLY;BYDAY=MO,TH`: `select[name="repeat"]` has
  the options `[['', 'Does not repeat'], ['daily', 'Daily'], ['weekly', 'Weekly'],
  ['monthly', 'Monthly']]` with `weekly` selected; the seven
  `input[name="repeat-days"]` have the values `MO,TU,WE,TH,FR,SA,SU` and the labels
  `Mon,Tue,Wed,Thu,Fri,Sat,Sun`, with `MO` and `TH` checked. (Fails when the options,
  the order, the labels, or the checked days are wrong.)
- `it.each([[null, ''], ['FREQ=DAILY', 'daily'], ['FREQ=MONTHLY', 'monthly']])`: the
  matching option is selected and no day box is checked. (Fails when the picker shows
  the stored rule wrong, or shows a day for a rule without `BYDAY`.)

### AC9: `src/recurrence-sheet.test.ts`, "saving the picker (AC9)"

`base` is the four required fields as a task with the defaults has them. `post(fields)`
posts `{ ...base, ...fields }` to `/tasks/1`; repeated day boxes are sent as an array
(checked: supertest turns one into repeated keys).

- `it.each([['', null], ['daily', 'FREQ=DAILY'], ['monthly', 'FREQ=MONTHLY']])`: a post
  with that `repeat` stores that rule. (Fails when the mapping stores the picker's own
  value, or does not clear on `''`.)
- `repeat: 'weekly'` with no day box stores `FREQ=WEEKLY`; with `['TH', 'MO']` stores
  `FREQ=WEEKLY;BYDAY=MO,TH`; with `['MO', 'MO', 'TH']` stores the same. (Fails when the
  days are not ordered, or a repeated box is stored twice, or `weekly` with no box is not
  the plain form.)
- `repeat: 'daily'` with `['MO', 'TH']` stores `FREQ=DAILY`. (Fails when a day posted
  with anything but `weekly` is looked at.)
- A post with no `repeat` key on a task whose rule is `FREQ=DAILY` leaves `FREQ=DAILY`.
  (Fails when a missing field clears the stored rule.)
- A task with today's times; a post that changes only `repeat`: 303, the rule changes,
  and `scheduled_start` and `scheduled_end` are unchanged. (Fails when a rule change
  reschedules the task.)
- `it.each([['yearly'], ...])` and a `repeat` posted twice: 400; the notice paragraphs
  are exactly `['Choose a repeat from the ones offered.']`; `listTasks` equals its before.
  (Fails when a bad repeat is stored, or a bad one does not refuse.)
- `repeat: 'weekly'` with a day box `'XX'`: 400; the page shows `weekly` selected and any
  real posted day (say `MO`) checked. (Fails when a bad day is stored, or the posted
  values are not shown.)
- A post with a blank `title` and a bad `repeat`: the notice paragraphs are exactly
  `['Give the task a title.', 'Choose a repeat from the ones offered.']`. (Fails when the
  repeat message is not last, or appears twice.)

### AC10: `src/recurrence-review.test.ts`, "the review card's picker (AC10)"

Shared: a photo source with three drafts, task 1 `FREQ=DAILY`, task 2
`FREQ=WEEKLY;BYDAY=MO,TH`, task 3 `null`; `fields()` is `formFields` of the served form;
`post(address, fields)` posts to a route.

- `GET /review/1`: each card has `select[name="repeat-<id>"]` with the four options and
  its rule selected, and the seven `input[name="repeat-days-<id>"]`; cards 1 and 2 check
  the right day boxes. (Fails when a card's picker is missing, named wrong, or shows
  another draft's rule.)
- A confirm with `repeat-1: 'weekly'`, `repeat-days-1: ['TH', 'MO']` and `repeat-2:
  'daily'`: 303; the three tasks are pending with `recurrence_rule`
  `FREQ=WEEKLY;BYDAY=MO,TH`, `FREQ=DAILY` and `null`, each with its placed times; no task
  has a `parent_task_id`, and there are still three tasks. (Fails when a confirm does not
  store the rule, or makes an instance.)
- A draft confirmed with `repeat-<id>: 'weekly'` is a `pending` task with `FREQ=WEEKLY`
  and a stored `scheduled_start`. (Fails when the plain weekly form is not stored.)
- A confirm without `repeat-1` on a draft stored `FREQ=DAILY` leaves `FREQ=DAILY`.
  (Fails when a missing field clears the rule.)
- A Remove with `repeat-1: 'monthly'`: 303; task 1 is `FREQ=MONTHLY`, still a draft.
  (Fails when Remove does not store the others' posted rules.)
- A confirm with `repeat-1: 'yearly'`: 400; the alert text contains
  `Choose every repeat from the ones offered.`; `listTasks` equals its before. (Fails
  when a bad repeat is stored, or does not refuse.)
- A confirm with a blank `title-2` and a bad `repeat-1`: the notice paragraphs are
  exactly `['Give every task a title.', 'Choose every repeat from the ones offered.']`.
  (Fails when the repeat message is not last.)
- A confirm with `repeat-1` posted twice, and one with `repeat-1: 'weekly'` and
  `repeat-days-1: ['XX', 'MO']`: 400; the refused page shows `weekly` selected and `MO`
  checked. (Fails when a repeated field is accepted, or a bad day is stored, or the
  posted values are not shown.)

### AC11: the whole, and `src/server.test.ts`

- Step 5's new test in `src/server.test.ts`: `await startServer();` then
  `expect(startRecurrence).toHaveBeenCalledTimes(1);` and
  `expect(startRecurrence.mock.calls[0][0]).toBe(database);`. (Fails when `src/server.ts`
  does not call the starter, calls it before `openDatabase`, or calls it with a copy of
  the database.)
- Step 6's four edits: `yarn -s vitest run src/task-sheet.test.ts src/review-page.test.ts
  src/add-rules.test.ts` passes; before them it fails at `src/task-sheet.test.ts:161`
  (the new `repeat` field), at `src/review-page.test.ts:378` and `:394` (two selects),
  and at `src/add-rules.test.ts:182` (two selects per card).
- Step 9: `yarn build` is clean; `ANTHROPIC_API_KEY= yarn test` passes; nothing new is
  under `data/` (`git status --porcelain data/` is empty); no network is made (every test
  app's analyzer is a stub, and the analyzer is never called by this job's tests).
