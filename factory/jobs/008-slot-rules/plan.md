# 008-slot-rules: plan

Decision numbers (D1, D2, …) refer to `design.md`.

## Steps

After each step `yarn build` and `yarn test` must pass, the tests of earlier jobs
included (1235 in 35 files before this job). Existing test files change only as the
table in D8 says. No package is installed. No step sends a request to the Anthropic API,
and no step opens the developer's `data/app.db`: every start of the server by hand sets
`DATABASE_PATH=:memory:`. Run each check once; do not run test files in a loop
(`docs/errors/repeated-test-runs-run-out-of-ports.md`).

1. **The setting.** Files: `src/db/migrations.ts`, `src/db/settings.ts`,
   `src/db/settings.test.ts`, `src/db/schema.test.ts`, `src/db/database.test.ts`,
   `src/db/migrations.test.ts`. Serves AC1, AC2.
   - Append migration 2 as in D1: four lines, inside the array, after migration 1.
     Change nothing above them.
   - `SlotRule` and the key `slot_rules` in `src/db/settings.ts`, as in D2.
   - The edits of D8 for `src/db/settings.test.ts`, `src/db/schema.test.ts` and
     `src/db/database.test.ts`.
   - The tests of AC1 in `src/db/settings.test.ts` and of AC2 in the new
     `src/db/migrations.test.ts`, with the hash and `versionOne` of D7.
   - Check: `yarn build` passes; `yarn vitest run src/db` passes;
     `git diff --numstat main -- src/db/migrations.ts` prints
     `4	0	src/db/migrations.ts`. `yarn test` passes: nothing reads the new row yet.

2. **The service.** Files: `src/services/rules.ts`, `src/services/rules.test.ts`.
   Serves AC3 to AC9.
   - `src/services/rules.ts` as in D3, the whole file. The import of `TaskCategory` is
     `import type`.
   - The tests of AC3 to AC9 below.
   - Check: `yarn build` passes; `yarn vitest run src/services/rules.test.ts` passes.

3. **The drafts.** Files: `src/services/drafts.ts`, `src/add-analysis.test.ts`,
   `src/add-text.test.ts`, `src/add-rules.test.ts`. Serves AC10.
   - The import, the sentence in the doc comment and the transaction of D5.
   - Remove `'time_slot',` from `UNSET_COLUMNS` in `src/add-analysis.test.ts` and in
     `src/add-text.test.ts` (D8).
   - The tests of AC10 below, in the new `src/add-rules.test.ts`.
   - Check: `yarn vitest run src/add-rules.test.ts src/add-analysis.test.ts src/add-text.test.ts src/review-page.test.ts src/review-actions.test.ts src/project.test.ts`
     passes, the last three unedited.

4. **The whole job.** Serves AC11.
   - Before the run, when `data/app.db` exists: `shasum data/app.db`, and keep the line.
   - `yarn build`, then `env -u ANTHROPIC_API_KEY yarn test`, once, the whole suite.
   - After the run: `shasum data/app.db` prints the same line, or there is still no
     `data` folder; `git status --short` shows this job's files only; there is no `.env`
     in the repo; `ls "$(node -p 'os.tmpdir()')" | grep '^mtask-'` prints nothing.
   - `git diff --stat main -- package.json yarn.lock src/db/database.ts src/db/tasks.ts src/db/sources.ts src/db/transaction.ts src/db/timestamps.ts src/services/analyzer.ts src/routes src/views public src/app.ts src/server.ts src/config.ts src/ui.ts src/testing src/review-page.test.ts src/review-actions.test.ts src/project.test.ts tsconfig.json vitest.config.ts .env.example .gitignore CLAUDE.md README.md`
     prints nothing (the design's Not touched list).
   - By hand, a database of before this job. Only when `data/app.db` exists; otherwise
     list it under Not done. Copy the file into a new folder under `$TMPDIR`, and from
     the repo root run
     `node --input-type=module -e "const { openDatabase } = await import('./src/db/database.ts'); const { getSetting } = await import('./src/db/settings.ts'); const db = openDatabase(process.argv[1]); console.log(db.prepare('PRAGMA user_version').get().user_version, getSetting(db, 'working_hours'), getSetting(db, 'slot_rules')); db.close();" <the copy>`.
     It prints `2`, the working hours the file had and the two rules of AC1. Delete the
     folder. Write into `build.md` what was printed.
   - By hand, the review page in plain Node. A short script in a folder under `$TMPDIR`
     that builds the app as the tests do: `createApp({ db: openDatabase(':memory:'),
     uploadsDir: <a new folder under the system's temporary folder>/uploads, analyze })`
     with an `analyze` that resolves to four tasks (`coding` `high`, `shopping` `medium`,
     `personal` `low`, `shopping` `urgent`), listening on a port nobody holds
     (`lsof -nP -iTCP:<port> -sTCP:LISTEN` first). `curl -i -d 'text=the list' http://127.0.0.1:<port>/add/text`
     answers 303 to `/review/1`; `curl -s http://127.0.0.1:<port>/review/1 | grep -n 'selected\|checked'`
     shows `high`, `Morning`, `medium`, `Night`, `low`, `No slot`, `urgent`, `No slot`,
     in that order. Stop the script and delete both folders. Write into `build.md` what
     was seen.

## Tests

Shared setup.

- **The seeded rules.** `SEEDED`, written out in each file that needs it and never
  imported from the code:
  `[{ category: 'coding', time_slot: 'morning', start: '09:00', end: '11:00' }, { category: 'shopping', time_slot: 'night', start: '20:00', end: '22:00' }]`.
- **A database in `src/db/` tests.** As `src/db/settings.test.ts` does it: `dir` is
  `mkdtempSync(path.join(tmpdir(), 'mtask-db-'))` in `beforeEach`; every database a test
  opens is pushed to `opened`; `afterEach` closes the open ones and removes `dir`. A
  file database is `path.join(dir, 'app.db')`.
- **A version 1 database.** `versionOne(file)` of D7. `userVersion(db)` is
  `db.prepare('PRAGMA user_version').get()?.user_version`.
- **The rules tests.** `src/services/rules.test.ts` opens `db = openDatabase(':memory:')`
  in `beforeEach`; `afterEach` closes it and calls `vi.useRealTimers()` and
  `vi.unstubAllGlobals()`. `ruled(category, urgency)` is
  `applyRules(readSlotRules(db), category, urgency)`: every rule test goes through the
  setting of that database. `urgencies` is `priorities.map((item) => item.id)`.
  `NOT_URGENT` is `['high', 'medium', 'low']`. `everyInput()` is every one of
  `taskCategories` with every one of `urgencies`, 24 pairs.
- **The app.** `src/add-rules.test.ts` builds `testApp = createTestApp({ analyze })` in
  `beforeEach`, with `analyze = vi.fn<Analyze>()`, and closes it in `afterEach`, which
  also calls `vi.restoreAllMocks()`.
- **Four tasks**, written out in `src/add-rules.test.ts`: `bug` (`Finish login bug fix`,
  `coding`, `high`), `milk` (`Buy milk`, `shopping`, `medium`), `bank` (`Call the bank`,
  `personal`, `low`) and `pills` (`Buy the medicine today`, `shopping`, `urgent`), each
  with a confidence of 0.5 or more. `found(...tasks)` is `{ tasks, fallback: false }`.
- **The three ways to add.** `WAYS` is three pairs of a name and a function that posts:
  a photo (`POST /add/photo` with three bytes attached as `list.png`, `image/png`), a
  spoken text (`POST /add/voice`, form field `text`) and a typed text (`POST /add/text`).
  "For all three ways" below is a `describe.each` over it. Each is the first post of its
  test app, so the source is 1 and the drafts are tasks 1 to 4.
- **Rows.** `stored()` is `listTasks(testApp.db)` as
  `[title, priority, time_slot, status]` per task.
- **The review page.** `review()` is `GET /review/1`, 200, parsed with `parseHtml`.
  `selectedSlots(document)` is, per `[data-draft] select`, the texts of its
  `option[selected]`. `checkedPriorities(document)` is, per `[data-draft]`, the `value`s
  of its `input[type="radio"][checked]`.

### AC1: `src/db/settings.test.ts`, `src/db/schema.test.ts`

- A new database in memory: `const rules: SlotRule[] | undefined = getSetting(db, 'slot_rules')`,
  with no cast, is `toStrictEqual(SEEDED)`. Fails when a field, a value or the order of
  the two rules differs; `yarn build` fails when the key is not in `Settings`.
- A new database in a file has the same, and the one row with the key `slot_rules` holds
  exactly `JSON.stringify(SEEDED)`. Fails when the migration writes another text.
- `setSetting(db, 'slot_rules', [one rule])` replaces the value, and `working_hours` is
  still `{ start: '09:00', end: '22:00' }`.
- Typed: three `setSetting(db, 'slot_rules', …)` calls, each under a
  `// @ts-expect-error` line: an object that is no list, a rule whose `time_slot` is
  `'dawn'`, a rule without `start` and `end`. `yarn build` fails when any of the three
  compiles. The test asserts that `settings` still has two rows.
- `src/db/schema.test.ts`, edited (D8): a new database has the keys `slot_rules` and
  `working_hours` and no other, and the hours are 09:00 to 22:00.

### AC2: `src/db/migrations.test.ts`

- Migration 1 is the text that was merged: the SHA-256 of `migrations[0]` is
  `MIGRATION_1_SHA256`. Fails when one character of migration 1 changes.
- There are two migrations: `migrations` has length 2.
- A database with migration 1 only has no slot rules: `versionOne(file)` is at version
  1, `getSetting(db, 'slot_rules')` is `undefined`, and the keys of `settings` are
  `working_hours` alone. Fails when the rules are seeded inside migration 1.
- A version 1 database gets the rules and keeps what it had: on `versionOne(file)`,
  `setSetting(db, 'working_hours', { start: '08:00', end: '20:00' })` and
  `createTask(db, { title: 'Buy milk', time_slot: 'evening' })`, close;
  `openDatabase(file)` is at version 2, `slot_rules` is `SEEDED`, `working_hours` is the
  changed value, `getTask` returns the task `toStrictEqual` to the one created, and the
  keys in order are `slot_rules`, `working_hours`.
- Opening again keeps changed rules: in a file, `setSetting(db, 'slot_rules', [{ category: 'coding', time_slot: 'afternoon', start: '13:00', end: '15:00' }])`,
  close, open: `getSetting` returns that list. Fails when the rules are seeded on every
  open.
- Opening again keeps emptied and deleted rules: set to `[]`, close, open: `[]`. Then
  delete the row, close, open: `undefined`. Fails when a missing row is seeded again.
- `src/db/settings.test.ts`, edited (D8): after `working_hours` is changed and the file
  is opened again, the value is kept and the keys are `slot_rules`, `working_hours`.
- `src/db/database.test.ts`, edited (D8) and unedited: a later open adds no row to
  `settings` (2 rows), and "changes nothing in the file when it is opened again" still
  compares the bytes.

### AC3: `src/services/rules.test.ts`

- `readSlotRules` returns `SEEDED` for a new database (`toStrictEqual`).
- `readSlotRules` returns the list that was set with `setSetting`.
- `readSlotRules` returns `[]` when the row is deleted.
- The result has exactly the two fields: `ruled('coding', 'high')` is
  `toStrictEqual({ priority: 'high', time_slot: 'morning' })`, and the sorted keys of
  `ruled('work', 'low')` are `['priority', 'time_slot']`.
- `everyInput()` has 24 pairs, so no test below runs over an empty list.
- The same at any time of day, and no request: with `fetch` stubbed by a `vi.fn()` and
  `vi.useFakeTimers({ toFake: ['Date'] })`, the results of all 24 inputs at
  `2026-03-04T03:00:00.000Z` are `toStrictEqual` to those at `2026-03-04T19:30:00.000Z`,
  and `fetch` was not called. Fails when the function reads the clock.
- The rules handed in are not changed: a `structuredClone` of `readSlotRules(db)` taken
  before all 24 calls equals the list after them.
- The seeded rules name only what exists: every `category` of `readSlotRules(db)` is one
  of `taskCategories` and every `time_slot` an id of `slots`, and the list is not empty.

### AC4: `src/services/rules.test.ts`

- `it.each(everyInput())`: `ruled(category, urgency).priority` is `toBe(urgency)`, for
  all 24. Fails when any rule changes a priority.

### AC5: `src/services/rules.test.ts`

- `it.each(NOT_URGENT)`: `ruled('coding', urgency).time_slot` is `'morning'`.

### AC6: `src/services/rules.test.ts`

- `it.each(NOT_URGENT)`: `ruled('shopping', urgency).time_slot` is `'night'`.

### AC7: `src/services/rules.test.ts`

- `it.each(taskCategories)`: `ruled(category, 'urgent')` is
  `toStrictEqual({ priority: 'urgent', time_slot: null })`. Fails for `coding` and
  `shopping` when the urgent rule is gone.
- It wins over a rule for every category: with the setting set to one rule per category
  of `taskCategories`, each with `time_slot: 'evening'`, every category gives `'evening'`
  for `'high'` and `null` for `'urgent'`. The first half shows the rules were in force.

### AC8: `src/services/rules.test.ts`

- `it.each` over `work`, `home`, `personal`, `other` with each of `NOT_URGENT`, 12
  pairs: `time_slot` is `null`.

### AC9: `src/services/rules.test.ts`

- A changed setting changes the result: after
  `setSetting(db, 'slot_rules', [{ category: 'coding', time_slot: 'afternoon', start: '13:00', end: '15:00' }])`,
  `ruled('coding', 'medium').time_slot` is `'afternoon'` and
  `ruled('shopping', 'medium').time_slot` is `null`.
- `it.each` over the four slot ids: a single rule for `other` with that slot gives that
  slot for `ruled('other', 'low')`. Fails when a slot is written into the service.
- The empty list: with the setting `[]`, all 24 inputs give
  `{ priority: urgency, time_slot: null }` and nothing throws.
- No row: with the row deleted, the same for all 24. Fails when the service falls back
  to rules of its own.
- The first of two rules wins: `coding` to `evening`, then `coding` to `afternoon`,
  gives `'evening'`.
- The first of two wins with another rule before them: `home` to `night`, `coding` to
  `evening`, `coding` to `afternoon` gives `'evening'` for `coding` and `'night'` for
  `home`. Fails when the first rule of the list is taken whatever its category.

### AC10: `src/add-rules.test.ts`, `src/add-analysis.test.ts`, `src/add-text.test.ts`

- For all three ways, the seeded rules: the analyzer resolves to
  `found(bug, milk, bank, pills)`; the post answers 303 and `stored()` is
  `[bug.title, 'high', 'morning', 'draft']`, `[milk.title, 'medium', 'night', 'draft']`,
  `[bank.title, 'low', null, 'draft']`, `[pills.title, 'urgent', null, 'draft']`. Fails
  when the drafts service does not apply the rules.
- For all three ways, the setting of that database: with `slot_rules` set to the one
  `coding` to `afternoon` rule before the post, `found(bug, milk)` is stored with the
  slots `'afternoon'` and `null`.
- For all three ways, no row: with the row deleted before the post, the post answers
  303 and `found(bug, milk)` is stored as `['high', null]` and `['medium', null]`.
- For all three ways, the review page: after `found(bug, milk, bank, pills)`,
  `selectedSlots` is `[['Morning'], ['Night'], ['No slot'], ['No slot']]` and
  `checkedPriorities` is `[['high'], ['medium'], ['low'], ['urgent']]`.
- For all three ways, a confirm of the form as served: `formFields` of the review form
  has `slot-1` `morning`, `slot-2` `night`, `slot-3` and `slot-4` empty; posted to
  `/review/1/confirm` it answers 303, and `stored()` is the four rows of the first test
  with `'pending'`.
- For all three ways, a confirm with edits stores what was posted: the served fields
  with `slot-1` `''` and `priority-1` `low`, `slot-2` `evening`, `slot-3` `morning` and
  `priority-3` `urgent`, `slot-4` `night`; `stored()` is `['low', null]`,
  `['medium', 'evening']`, `['urgent', 'morning']`, `['urgent', 'night']`, all
  `'pending'`. Fails when the rules run again on confirm.
- The retry: a photo whose first analysis is the fallback (`console.error` replaced
  with a spy) stores nothing; then `slot_rules` is set to one `shopping` to `evening`
  rule and `POST /review/1/analyze` resolves to `found(bug, milk)`: 303, and the stored
  slots are `null` and `'evening'`. Fails when the retry skips the rules or the rules
  are read before the setting changed.
- `src/add-analysis.test.ts` and `src/add-text.test.ts`, edited (D8): the nine other
  columns of `UNSET_COLUMNS` are still `null` for every draft, and `priority` is still
  the urgency.

### AC11

- No test of its own: step 4 runs `yarn build` and the whole suite with the key unset,
  and checks that `data/` and the system's temporary folder are as they were. The rule
  tests of AC4 to AC8 are the unit tests the criterion asks for, one `describe` per rule,
  and every database in them is in memory or under `dir`.
