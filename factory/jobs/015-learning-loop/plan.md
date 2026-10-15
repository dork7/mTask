# 015-learning-loop: plan

Decision numbers (D1, D2, …) refer to `design.md`.

## Steps

1. **Pin the 005 request before anything changes.** Files:
   `src/services/analyzer-corrections.test.ts`. Serves AC5.
   - Create the file with the shared setup below and only the AC5 hash tests whose call
     passes no third argument (`analyze(input, deps)`). The calls with `[]` and
     `undefined` do not compile yet, so add them in step 2.
   - Check: `yarn vitest run src/services/analyzer-corrections.test.ts` passes against
     the unchanged `src/services/analyzer.ts`. If a hash differs, stop: the pinned value
     or the test input is wrong, not the analyzer.

2. **Corrections in the analyzer.** Files: `src/services/analyzer.ts`,
   `src/services/analyzer-corrections.test.ts`. Serves AC4, AC5.
   - Add `Correction` (D1), `CORRECTIONS_INTRO`, `systemPrompt` and `correctionLine`
     (D6). Give `analyze` the third parameter `corrections: readonly Correction[] = []`
     and set `system: systemPrompt(corrections)` without moving any key of the request
     literal (D7). Change `Analyze` and `createAnalyze` (D8). Update the doc comments
     named in design.md, Files.
   - Add the rest of the AC4 and AC5 tests below, including the `createAnalyze`
     pass-through.
   - Check: `yarn vitest run src/services/analyzer-corrections.test.ts src/services/analyzer.test.ts src/services/create-analyze.test.ts src/analyze-command.test.ts`
     passes, and `yarn build` passes.

3. **The corrections service.** Files: `src/services/corrections.ts`,
   `src/services/corrections.test.ts`. Serves AC1, AC2, AC3.
   - Write `readCorrections` and `CORRECTIONS_PER_CATEGORY` as in D2 to D5. Use no
     `toSorted` and no `Object.groupBy`.
   - Check: `yarn vitest run src/services/corrections.test.ts` passes.

4. **The app passes them.** Files: `src/services/drafts.ts`,
   `src/add-corrections.test.ts`. Serves AC6.
   - In `analyzeSource`, read `readCorrections(deps.db)` after `inputOf` and before the
     `try`, and call `deps.analyze(input, corrections)` only when the list has entries,
     else `deps.analyze(input)` (D9). Update its doc comment.
   - Check: `yarn vitest run src/add-corrections.test.ts src/add-text.test.ts src/add-analysis.test.ts`
     passes.

5. **Whole suite.** Serves AC7.
   - `ANTHROPIC_API_KEY= yarn build` and `ANTHROPIC_API_KEY= yarn test` pass.
   - `git diff --stat main -- src` lists only the three new test files, the new
     `src/services/corrections.ts`, `src/services/analyzer.ts` and
     `src/services/drafts.ts`. No existing `*.test.ts` file appears.
   - `ls -la data/` is the same before and after `yarn test`, and
     `git status --short` shows nothing outside the files above.

## Tests

Shared setup.

`src/services/corrections.test.ts`: `let db: Database`. In `beforeEach`,
`db = openDatabase(':memory:')`; in `afterEach`, `db.close()`. Helper
`addTask(fields: Partial<NewTask> = {}): Task` calls `createTask(db, { title: 'Fix the login bug', category: 'coding', status: 'done', estimated_minutes: 30, actual_minutes: 75, completed_at: '2026-10-01T09:00:00.000Z', ...fields })`.
Helper `at(minute: number)` gives `2026-10-01T09:<mm>:00.000Z`. The base task counts.
Each exclusion test changes one field of it, so removing that one check makes the test
fail.

`src/services/analyzer-corrections.test.ts`: the `fetch` spy, `expectedFetchCalls`,
temp `folder` and `afterEach` call-count check, `stubClient()`, `reply()`,
`textReply()` and `writeImage()` work as in `src/services/analyzer.test.ts`. Copy them,
because that file is not edited. Constants: `milk`, the `AnalyzedTask` of `analyzer.test.ts`, `MODEL = 'claude-test-model'`,
`text = 'buy milk and fix the login bug'`, and image bytes `ff d8 ff 00 10 80 fe`
written as `list.png`. Also
`fix = { category: 'coding', title: 'Fix the login bug', estimated_minutes: 30, actual_minutes: 75 }`
with `FIX_LINE = '- coding: "Fix the login bug", estimated 30 min, actual 75 min'`,
`milkFix = { category: 'shopping', title: 'Buy milk', estimated_minutes: 10, actual_minutes: 40 }`
with `'- shopping: "Buy milk", estimated 10 min, actual 40 min'`, and
`bankFix = { category: 'personal', title: 'Call the bank', estimated_minutes: 60, actual_minutes: 25 }`
with `'- personal: "Call the bank", estimated 60 min, actual 25 min'`.
`hashOf(request) = createHash('sha256').update(JSON.stringify(request)).digest('hex')`.
`systemLines(create, call = 0) = String(create.mock.calls[call][0].system).split('\n')`.
`expectLines(lines, expected)`: the index of `expected[0]` is at least 0,
`lines.slice(index, index + expected.length)` `toEqual(expected)`, and each expected
line occurs exactly once in `lines`.

`src/add-corrections.test.ts`: `analyze = vi.fn<Analyze>()`,
`analyze.mockResolvedValue(found(milk))` and `testApp = createTestApp({ analyze })` in
`beforeEach`, so every test's stub answers `found(milk)` unless it sets a
`mockResolvedValueOnce`. `milk` is the `AnalyzedTask` `Buy milk`, `shopping`, 15,
`medium`, confidence 0.9. `testApp.close()` and
`vi.restoreAllMocks()` run in `afterEach`. Helpers `postText(route, text)`, `upload()`
(three PNG bytes to `/add/photo`) and `retry(sourceId = 1)` work as in
`src/add-text.test.ts` and `src/add-analysis.test.ts`. `found(...tasks)` and
`failed()` work as there too. `addDone(fields = {})` calls `createTask(testApp.db, …)`
with the same defaults as `addTask` above, and no source. The expected correction is
`fix` as above.

### AC1: `src/services/corrections.test.ts`
- The base task gives exactly
  `[{ category: 'coding', title: 'Fix the login bug', estimated_minutes: 30, actual_minutes: 75 }]`
  (`toStrictEqual`). This fails if the whole `Task` or any extra key is returned.
- A done `personal` task `Call the bank`, 60/25, gives exactly its own four values. This
  fails if a value is hard-coded or taken from the wrong column.
- `it.each` over `coding, shopping, work, home, personal, other`: a task of that
  category gives one correction with that `category`.
- `it.each(['pending', 'in_progress', 'draft'])`: the base task with that status gives
  `[]`.
- The base task with `completed_at: null` gives `[]`.
- The base task with `estimated_minutes: null` gives `[]`.
- The base task with `actual_minutes: null` (Done without Start) gives `[]`.
- `it.each(['Groceries', null, '', 'Coding', ' coding', 'coding '])`: the base task with
  that category gives `[]`. The last three show there is no case folding and no trim.
- An empty database gives `[]`.

### AC2: `src/services/corrections.test.ts`
- `it.each` over `[30, 75, 1]`, `[30, 45, 1]`, `[30, 15, 1]`, `[30, 44, 0]`,
  `[30, 30, 0]`, `[30, 16, 0]`, `[60, 25, 1]`, `[60, 31, 0]`: the base task with
  `estimated_minutes` and `actual_minutes` set gives a list of that length. `>` instead
  of `>=` fails 30/45 and 30/15. Counting only overruns fails 30/15 and 60/25. A wrong
  factor fails 30/44 or 60/31.

### AC3: `src/services/corrections.test.ts`
- Five matching `coding` tasks and two matching `shopping` tasks. Insert first the
  `shopping` tasks `Shop 6` at `at(6)` and `Shop 7` at `at(7)`, then the `coding` tasks
  in the order `Code 3`, `Code 1`, `Code 5`, `Code 2`, `Code 4`, each at its
  `at(n)`. The result's titles are exactly
  `['Code 5', 'Code 4', 'Code 3', 'Shop 7', 'Shop 6']`. This fails with a global limit
  of 3, with id order instead of `completed_at`, with oldest first, or with `shopping`
  before `coding`.
- Ties: four matching `coding` tasks `Tie 1` to `Tie 4`, inserted in that order, all at
  `at(0)`, give exactly `['Tie 4', 'Tie 3', 'Tie 2']`. This fails if the lower id wins
  a tie.
- Category order: one matching task per category, inserted as `home`, `other`,
  `coding`, `personal`, `shopping`, `work` at `at(1)` to `at(6)`, gives the categories
  `['coding', 'shopping', 'work', 'home', 'personal', 'other']`. This fails with id
  order and with time order.
- Filters before the limit: two matching `coding` tasks `Old 1` at `at(1)` and `Old 2`
  at `at(2)`, then three done `coding` tasks at `at(5)` to `at(7)` with
  `actual_minutes: 31` (no large gap), and one `in_progress` `coding` task, 30/75, at
  `at(9)`. The result is exactly `['Old 2', 'Old 1']`. This fails if the limit is
  applied before the gap or status filter.
- `CORRECTIONS_PER_CATEGORY` is `3`.

### AC4: `src/services/analyzer-corrections.test.ts`
- Text input with `[fix, milkFix, bankFix]`: `expectLines(systemLines(create), [the three lines in that order])`.
- Text input with `[bankFix, fix]`: the bank line comes right before the fix line. This
  fails if the analyzer sorts or groups the list.
- Image input (`list.png`) with `[fix]`: `systemLines` contains `FIX_LINE` once.
- A title with a quote and a line break, `'Fix "the" login\nbug'`: `systemLines`
  contains the one line `'- coding: "Fix \\"the\\" login\\nbug", estimated 30 min, actual 75 min'`
  (JS literal) and no line that equals `'bug", estimated 30 min, actual 75 min'`. This
  fails without `JSON.stringify`.
- Retry: `create` answers `textReply('not JSON')`, then `reply({ tasks: [milk] })`, for a
  text with `[fix]`. `create` is called twice, `systemLines(create, 1)` contains
  `FIX_LINE`, and `create.mock.calls[1][0]` `toStrictEqual(create.mock.calls[0][0])`.
- The same retry for an image input: `systemLines(create, 1)` contains `FIX_LINE`.
- With `[fix]`, the user message is unchanged (D6): for the text input,
  `create.mock.calls[0][0].messages` `toStrictEqual([{ role: 'user', content: [{ type: 'text', text }] }])`.
- `createAnalyze('test-key', MODEL)` called with `({ kind: 'text', text }, [fix])`, with
  `expectedFetchCalls = 1` and `fetch` answering a message whose text is
  `{"tasks":[milk]}` (as `message()` in `create-analyze.test.ts`):
  `JSON.parse(String(init.body)).system.split('\n')` contains `FIX_LINE`. This fails if
  `createAnalyze` drops the second argument.

### AC5: `src/services/analyzer-corrections.test.ts`
- `it.each` over `['no list', 'an empty list', 'undefined']`, for the text input:
  `hashOf(create.mock.calls[0][0])` is
  `d0c2062857457d4635f7c8e0ef909f8553b73e29d86b4ba9f60d681006dbb29f`. The three cases
  call `analyze(input, deps)`, `analyze(input, deps, [])` and
  `analyze(input, deps, undefined)`. Write a comment above the constant: the hash of
  the request the 005 analyzer built at commit `2d2d1cf`, for this input and model.
- The same three cases for the image input `list.png` with the pinned bytes: the hash is
  `888b8a81da6edff3c0b4dcc617681b8300c440c1930e98909813e93b6cacf34a`.
- With `[fix]`, a valid reply `{ tasks: [milk] }` gives `toStrictEqual({ tasks: [milk], fallback: false })`.
- With `[fix]`, two invalid replies give the 005 fallback for the text, with
  `description: text`, and `create` is called exactly twice.
- With `[fix]`, a rejected first call and a valid second give the tasks of the second.
- With `[fix]`, a blank text rejects with an `AnalyzerInputError`, and `create` is not
  called.
- The existing `src/services/analyzer.test.ts` and `src/analyze-command.test.ts` pass
  unchanged. This is checked by step 5. No new test is needed.

### AC6: `src/add-corrections.test.ts`
- `it.each(['/add/text', '/add/voice'])`, with `addDone()` and the stub answering
  `found(milk)`: posting `buy milk` answers 303, and `analyze.mock.calls`
  `toStrictEqual([[{ kind: 'text', text: 'buy milk' }, [fix]]])`.
- `/add/photo` with `addDone()`: `analyze` is called once, `mock.calls[0]` has length
  2, `mock.calls[0][0].kind` is `'image'`, and `mock.calls[0][1]` `toStrictEqual([fix])`.
- `it.each(['/add/text', '/add/voice'])`, with an empty database: `mock.calls[0]`
  `toHaveLength(1)` and `toStrictEqual([{ kind: 'text', text: 'buy milk' }])`. This
  fails if `[]` or `undefined` is passed.
- `/add/photo` with an empty database: `mock.calls[0]` `toHaveLength(1)`.
- Only tasks that do not count: `addDone({ actual_minutes: 44 })`,
  `addDone({ status: 'pending' })` and `addDone({ category: 'Groceries' })`. A post to
  `/add/text` calls the stub with `mock.calls[0]` of length 1.
- Retry reads at that moment (text): the stub answers `failed()` and posting
  `buy milk` to `/add/text` answers 502 with `mock.calls[0]` of length 1. Then
  `addDone()`, the stub answers `found(milk)`, and `retry(1)` answers 303 with
  `mock.calls[1]` `toStrictEqual([{ kind: 'text', text: 'buy milk' }, [fix]])`. This
  fails if the corrections are read once and cached.
- Retry reads at that moment (photo): the same with `upload()`. `mock.calls[1][0].kind`
  is `'image'` and `mock.calls[1][1]` `toStrictEqual([fix])`.
- Retry with no qualifying task: after a failed text post on an empty database,
  `retry(1)` calls the stub with `mock.calls[1]` of length 1.

### AC7
- Covered by step 5: `yarn build` and `yarn test` with `ANTHROPIC_API_KEY` unset, no
  existing test file in the diff, and `data/` unchanged. The analyzer file fails in
  `afterEach` if `fetch` is called more often than `expectedFetchCalls`. The other two
  files use an in-memory database and a stub `analyze`.
