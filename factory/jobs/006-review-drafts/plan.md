# 006-review-drafts: plan

Decision numbers (D1, D2, …) refer to `design.md`.

## Steps

After each step `yarn build` and `yarn test` must pass, the tests of earlier jobs
included (823 before this job). Existing test files change only as the table in D23
says. No package is installed. No step sends a request to the Anthropic API, and no key
is written into a file of the repo, a test or `build.md`.

1. **The transaction helper.** Files: `src/db/transaction.ts`,
   `src/db/transaction.test.ts`. Serves AC2, AC12, AC13, AC14, AC15.
   - `inTransaction` exactly as in D4. The `ROLLBACK` sits in its own `try`.
   - Check: `yarn vitest run src/db/transaction.test.ts` passes.

2. **The analyzer for the app.** Files: `src/services/analyzer.ts`,
   `src/services/photo-storage.ts`, `src/services/create-analyze.test.ts`. Serves AC1,
   AC2.
   - Append `Analyze`, `AnalyzerKeyError` and `createAnalyze` to the analyzer (D1, D2).
     Change nothing above them.
   - Add `photoFile` to the photo storage (D5).
   - Check: `yarn vitest run src/services` passes, `src/services/analyzer.test.ts`
     unedited.

3. **The app is handed the analyzer.** Files: `src/app.ts`, `src/server.ts`,
   `src/testing/app.ts`, `src/app.test.ts`, `src/project.test.ts`, `src/server.test.ts`,
   `src/testing/app.test.ts`, and the one `createApp` call in `src/add-photo.test.ts`.
   Serves AC1, AC19.
   - `AppDeps.analyze` (D1), the two lines in `server.ts` (D2), `createTestApp` (D20).
     No route uses the analyzer yet.
   - The edits of D23 for the four test files named there, and
     `analyze: testApp.analyze` in the `createApp` call of `src/add-photo.test.ts`.
   - Check: `yarn build` passes; `yarn test` passes with every upload still answering
     201. Then by hand:
     `ANTHROPIC_API_KEY= PORT=3999 DATABASE_PATH=:memory: node src/server.ts` prints the
     "running at" line; stop it.

4. **The drafts service.** Files: `src/services/drafts.ts`. Serves AC2 to AC5, AC9,
   AC12 to AC15.
   - Everything listed for the file under Files in the design: D5, D10, D14.
   - Only the analyzer call is inside the `try` of `analyzePhotoSource`. The eight
     fields of a draft are written out one by one; the task is never spread.
   - Check: `yarn build` passes. The service is tested through the routes in steps 5
     and 6.

5. **An upload is analyzed.** Files: `src/routes/add.ts`, `src/views/pages/add.ejs`,
   `src/add-photo.test.ts`, `src/add-page.test.ts`, `src/add-analysis.test.ts`. Serves
   AC2, AC3, AC4, AC18.
   - `AddPage`, `renderAdd`, the two messages, `reviewPath`, `answerAnalysis` and row 6
     (D6, D7). `.then(…).catch(next)`, as written there.
   - The view: the three blocks of D7 in place of the `savedPhoto` block. Not yet the
     element of D12 or the second script tag.
   - `src/add-photo.test.ts` as in D23. `src/add-page.test.ts` as in D23, except the
     three script and class edits, which are step 7.
   - In `src/add-analysis.test.ts`: the tests of AC2, AC3, AC4 and the first test of
     AC18 below.
   - Check: `yarn vitest run src/add-photo.test.ts src/add-page.test.ts src/add-analysis.test.ts`
     passes.

6. **The review routes and the page.** Files: `src/routes/review.ts`, `src/app.ts`,
   `src/views/pages/review.ejs`, `public/css/base.css`, `src/testing/dom.ts`,
   `src/testing/jsdom.d.ts`, `src/review-page.test.ts`, `src/review-actions.test.ts`,
   `src/add-analysis.test.ts`. Serves AC1, AC5, AC7, AC8, AC9, AC11 to AC18.
   - The router of D11 with D8, D9, D14, D15 and D16, mounted after the Add router.
   - The view of D17 and D18, character for character where the design gives markup.
     The script tag is written now; `public/js/review.js` is created in this step as a
     file with its header comment and an empty function that calls itself, and filled in
     step 8.
   - The CSS of D21, both parts.
   - `isShown`, `formFields` and the typings of D22.
   - The tests of AC1 (the app without a key), AC5, AC7, AC8, AC9, AC11 to AC17 and the
     second test of AC18 below.
   - Check: `yarn vitest run src/review-page.test.ts src/review-actions.test.ts src/add-analysis.test.ts src/stylesheet.test.ts src/components.test.ts`
     passes, the last two unedited.

7. **The "Analyzing..." state.** Files: `src/views/pages/add.ejs`,
   `public/js/add-analyzing.js`, `src/add-page.test.ts`, `src/add-analyzing.test.ts`.
   Serves AC6.
   - The element of D12 and the second script tag; the script of D13.
   - The rest of the `src/add-page.test.ts` edits of D23: shown statuses, the two new
     class names, the two scripts.
   - Check: `yarn vitest run src/add-page.test.ts src/add-analyzing.test.ts src/add-photo.test.ts`
     passes.

8. **The stepper.** Files: `public/js/review.js`, `src/review-page.test.ts`. Serves
   AC10.
   - The script of D19. The AC10 tests below.
   - Check: `yarn vitest run src/review-page.test.ts` passes.

9. **The whole job.** Serves AC19.
   - `yarn build`, then `env -u ANTHROPIC_API_KEY yarn test`, once, the whole suite.
   - After the run: `git status --short` shows this job's files only; there is no `.env`
     and no `data` folder in the repo; `ls "$(node -p 'os.tmpdir()')" | grep '^mtask-'`
     prints nothing.
   - `git diff --stat main -- package.json yarn.lock src/config.ts src/db/tasks.ts src/db/sources.ts src/db/migrations.ts src/db/database.ts src/ui.ts src/render.ts src/views/layout.ejs src/views/partials public/js/add-photo.js src/services/analyzer.test.ts src/shell.test.ts src/stylesheet.test.ts src/components.test.ts tsconfig.json .gitignore CLAUDE.md`
     prints nothing (the design's Not touched list).
   - By hand, without a key: start the server with `ANTHROPIC_API_KEY=` in front, upload
     a small PNG with `curl -F 'photo=@<file>;type=image/png'`, and see 502, the message
     and the `Try again` form in the answer, and the line of D3 on the server's stderr.
   - By hand, the page. Seed a source and three drafts (a short script that calls
     `createApp` with a stub analyzer, as the tests do), open `/review/<id>` in a
     browser and write into `build.md` what was seen of each: (a) Enter in a title field
     confirms and does not remove the first card (D18); (b) `−` and `+` are there and
     step by 5; (c) at a narrow width the bar sits on the tab bar with no card showing
     under it, and at a wide width at the bottom of the window (D21); (d) both themes.
     For a narrow page and a theme in headless Chrome, follow
     `docs/errors/headless-chrome-screenshot-hangs-and-crops-narrow-windows.md`.
   - By hand, with a key (the spec's check). Only when a key is already in the shell or
     in `.env`; do not ask for one and do not create `.env`. Upload a photo of a
     handwritten list from a phone or a browser: the "Analyzing..." state shows, then
     several cards; edit one, `Confirm all`, and see `N tasks saved`. With no key at
     hand, list this under Not done and say that no request reached the live API.

## Tests

Shared setup.

- **The app.** Each file below builds `testApp = createTestApp({ analyze })` in
  `beforeEach`, with `analyze = vi.fn<Analyze>()`, and closes it in `afterEach`, which
  also calls `vi.restoreAllMocks()`.
- **Three tasks**, written out in each file that needs them: `bug` (`Finish login bug fix`,
  `Before Friday`, `coding`, 90, `high`, 0.9), `milk` (`Buy milk, eggs, bread`, `''`,
  `shopping`, 40, `medium`, 0.5) and `bank` (`Call the bank`, `''`, `personal`, 15,
  `low`, 0.49). `found(...tasks)` is `{ tasks, fallback: false }`.
- **An upload.** `upload()` posts three bytes as `image/png` to `/add/photo`, as
  `src/add-photo.test.ts` does.
- **Seeded drafts**, in the two review files: `seed()` calls
  `createSource(db, { kind: 'photo', image_path: '/uploads/list.png' })` and `createTask`
  three times with the six values of `bug`, `milk` and `bank` (`priority` from the
  urgency), `status: 'draft'` and the source id, and returns the source and the three
  tasks. The review tests do not go through the analyzer.
- **Rows.** `tasks()` is `listTasks(testApp.db)`. "Unchanged" below means
  `expect(tasks()).toEqual(before)` with `before` read at the start of the test, which
  includes `updated_at`.
- **Posting the form.** `.type('form').send(fields)` with supertest. `served(sourceId)`
  requests `/review/<id>`, parses it with scripts off and returns the document;
  `formFields(one(document, 'main form'))` is what the browser would post (D22).
- **The not-found page** is status 404 and `main h1` with the text `Page not found`.
- **A rejecting analyzer.** A test that makes the stub reject first replaces
  `console.error` with `vi.spyOn(console, 'error').mockImplementation(() => {})`.
- **The network guard** (D22), in `src/services/create-analyze.test.ts` and in the
  no-key describe of `src/add-analysis.test.ts`: `beforeEach` installs a `fetch` spy
  that rejects with `new Error('A test tried to reach the network')` and sets
  `expectedFetchCalls = 0`; `afterEach` reads the number of calls, calls
  `vi.unstubAllGlobals()`, and asserts the number.
- **Pages with scripts.** `openPage` and `runLinkedScripts`, every window pushed to
  `opened`; `afterEach` asserts `scriptErrors(window)` is `[]` for each and closes it.

### The transaction helper: `src/db/transaction.test.ts`

- Returns what `run` returns, and the two rows `run` created are there afterwards.
- When `run` creates one task and then throws, the same error is thrown (`toBe`) and no
  task is stored.
- When the second `createTask` in `run` is refused by the table (`priority: 'nope'`),
  the SQLite error is thrown and the first task is not stored.
- After a failed call the database takes a new transaction: a second `inTransaction`
  that creates a task succeeds. Fails when the `ROLLBACK` is missing.

### AC1

`src/services/create-analyze.test.ts`

- Without a key: `createAnalyze(undefined, 'm')` returns a function; calling it with a
  text input rejects with an `AnalyzerKeyError` whose `name` is `AnalyzerKeyError`; and
  with an image input whose file does not exist it rejects with the same class, not an
  `AnalyzerInputError`. `fetch` is not called.
- With a key: `expectedFetchCalls = 1`, the spy resolves to a message of the API (as in
  005's plan) whose text is `{"tasks":[milk]}`.
  `createAnalyze('test-key', 'claude-test-model')({ kind: 'text', text: 'buy milk' })`
  resolves to `found(milk)`; the one call is a `POST` to a URL ending in `/v1/messages`
  with the header `x-api-key: test-key` and a JSON body whose `model` is
  `claude-test-model`.
- Two calls of the function made with a key use one client: nothing to assert on the
  client itself; the test makes two calls and expects two `fetch` calls with the same
  key header.

`src/server.test.ts` (added `describe`, "server: the analyzer (006 AC1)")

- With `ANTHROPIC_API_KEY=test-key` and `ANTHROPIC_MODEL=claude-test-model` stubbed:
  `createAnalyze.mock.calls` equals `[['test-key', 'claude-test-model']]`, and
  `createApp.mock.calls[0][0].analyze` is, with `toBe`, the value `createAnalyze`
  returned.
- With both unset: `createAnalyze.mock.calls` equals `[[undefined, 'claude-opus-5-5']]`,
  and `listen` was called once.
- The edited test "builds the app on that database and the configured uploads folder"
  holds the exact argument with `toStrictEqual`.
- The 005 tests "starts when ANTHROPIC_API_KEY is %s" stay as they are.

`src/testing/app.test.ts` (added)

- `createTestApp()` has an `analyze` that resolves to one task with `fallback: false`,
  and two calls return two different objects.
- `createTestApp({ analyze })` has that very function (`toBe`), and an upload to its app
  calls it once.

`src/add-analysis.test.ts`, describe "an app without an API key", with the network guard

- The app is `createTestApp({ analyze: createAnalyze(undefined, 'm') })`. `GET` of `/`,
  `/add` and `/_styleguide` answers 200.
- An upload answers 502 with the alert `The photo could not be analyzed.` and the
  `Try again` form; the file and the source are stored; no task is stored;
  `console.error` was called once with an `AnalyzerKeyError` as its second argument;
  `fetch` was not called.

### AC2: `src/add-analysis.test.ts`

- With `found(bug, milk, bank)`: the answer is 303 with `Location: /review/1` (the id of
  the one source row); there is one stored file and one source, as in 004.
- The analyzer was called once, with exactly
  `{ kind: 'image', path: path.join(testApp.uploadsDir, <the stored name>) }`. The stub
  reads the file at that path when it is called and the test compares the bytes with the
  upload: the file is there before the analyzer runs.
- Three tasks are stored, in the order `bug`, `milk`, `bank` by `id`. Each has
  `status: 'draft'`, `source_id: 1`, the five values as returned (`description: ''`
  stays `''`, `confidence: 0.49` stays 0.49) and `priority` equal to the urgency.
- Every other column of each is `null`: `image_path`, `time_slot`, `actual_minutes`,
  `scheduled_start`, `scheduled_end`, `started_at`, `completed_at`, `reminder_at`,
  `recurrence_rule`, `parent_task_id`. Fails when the task is spread into the insert or
  the photo path is copied onto the task.
- With one task: one draft, 303.
- A list whose second task the table refuses (`confidence: 2`) answers 500 and stores no
  task; the source and the file stay. Fails without the transaction.
- A rejected upload does not call the analyzer: asserted in `expectRejected` of
  `src/add-photo.test.ts` for every 415, 413 and 400 test there (D23).

### AC3: `src/add-analysis.test.ts`

- With `found()`: 200; the Add page in the layout (`main h1` is `Add task`, the Add link
  is current); exactly one shown `[role="status"]`, with the text
  `No tasks were found in that photo.`; no `[role="alert"]`; one form, the upload form
  (`action="/add/photo"`, the file input); no task stored; the source and the file kept.

### AC4: `src/add-analysis.test.ts`

- With `{ tasks: [milk], fallback: true }`: 502; the Add page in the layout; one
  `[role="alert"]` with `The photo could not be analyzed.`; no shown `[role="status"]`;
  a form with `method="post"` and `action="/review/1/analyze"` whose one submit button
  reads `Try again`; the upload form; **no task stored**; one source and one file kept.
- With a stub that rejects with `new Error('the model is down')`: the same answer and
  the same rows; `console.error` was called once with that error (`toBe`) as its second
  argument.
- With a stub that throws before it returns a promise: the same answer.
- Every button of the 502 page has the `btn` class (the edited test in
  `src/add-page.test.ts` covers the four states).

### AC5: `src/add-analysis.test.ts`

Each test first uploads with a `fallback: true` result (502), so source 1 exists with
its file and no task, and then resets the stub's calls.

- `POST /review/1/analyze` with `found(bug, milk)`: 303 to `/review/1`; the analyzer was
  called once with the path of the stored file, equal to the path of the first call; two
  drafts under source 1; still one source row and one file.
- With `found()`: 200 and the `No tasks…` status. With `fallback: true` and with a
  rejection: 502, the alert and the form to `/review/1/analyze` again. No task in all
  three, and still one source and one file.
- On a source with a draft, and on a source whose only task is `done`: 303 to
  `/review/<id>`, the analyzer is not called, the tasks are unchanged.
- On a `text` source without tasks: 303 to `/review/<id>`, the analyzer is not called
  (D8).
- A stub that creates a task under source 1 before it resolves to `found(bug, milk)`:
  303, and the source has that one task only (D5, step 5).

### AC6: `src/add-analyzing.test.ts`

- The served page (`GET /add`, scripts off) has one `[data-analyzing]` element: it has
  `role="status"` and `hidden`, its text contains `Analyzing...`, it holds one
  `.skeleton` with a `.skeleton__line`, and it is inside the tab panel.
- The same holds for the page after a 502 and after a "no tasks" answer.
- The page links `/js/add-analyzing.js` with `defer`, and the app serves it as
  JavaScript.
- With the scripts run on the `GET /add` page: nothing changes on load (the status is
  hidden, the `Upload photo` button is not disabled).
- Dispatching `submit` on the upload form returns `true` (not stopped), the status is
  shown, and `Upload photo` is disabled; the file input and Retake are not disabled.
- On the 502 page, dispatching `submit` on the `Try again` form returns `true`, shows
  the status, and disables both `Try again` and `Upload photo`.
- After that, `pageshow` on the window hides the status and enables both buttons.
- A click anywhere and a `change` on the file input do not show the status.
- The request waits for the analyzer: with a stub whose promise the test resolves, the
  upload has not been answered after `vi.waitFor` saw the stub called and two turns of
  `setImmediate`; after the test resolves it with `found(milk)`, the answer is 303.
- `public/js/add-analyzing.js` contains none of `setInterval`, `setTimeout`, `fetch(`
  and `XMLHttpRequest`.

### AC7: `src/review-page.test.ts`

- For the seeded source: 200, `text/html`, one `<html`, the title
  `Review tasks - Task Image AI`, five navigation links, exactly one `[aria-current]`
  and it is the `/add` link.
- The one `main h1` reads `Review 3 tasks`; the page contains the text
  `Nothing saved yet`. With one draft the heading is `Review 1 task`.
- One `details` element, without `open`, before the form in the document and outside it;
  it has a `summary`; its one `img` has `src="/uploads/list.png"` and an `alt` that is
  not blank.
- For a `text` source and for a `voice` source with a draft: the `details` has no `img`
  and contains the transcript as text. With the transcript `buy <b>milk</b>` the page
  has no `b` element inside the `details`.
- No element of the page has a `style` attribute.

### AC8: `src/review-page.test.ts`

- One `[data-draft]` card per draft, with the ids in `id` order. With a pending and a
  done task under the same source and a draft under another source added, the cards are
  the same three.
- One `form` in `main`; every card is inside it; it has `method="post"`,
  `action="/review/<id>/confirm"`, no `enctype` and no `onsubmit`.
- The form's first `button[type="submit"]` in document order has `hidden` and no
  `formaction` (D18). Fails when the hidden button is removed or moved.
- Per card, for all three: one `input[type="text"]` with `aria-label="Task title"`, the
  name `title-<id>` and the draft's title as `value`.
- One `input[type="number"]` with `min="1"`, `max="1440"`, the name `minutes-<id>` and
  the minutes as `value`; its previous element sibling is a `button[type="button"]`
  with the text `−` (U+2212) and its next one with the text `+`.
- Radios named `priority-<id>`: their values are the ids of `priorities` from
  `src/ui.ts` in order, each inside a `label` whose text contains the priority's label;
  exactly one is `checked`, the draft's. A draft without a priority has none checked.
- One `select` named `slot-<id>` whose options are `''` with the text `No slot`, then
  the four ids of `slots` with their labels; the one `option[selected]` is `No slot`.
  With `time_slot: 'evening'` stored it is `evening`.
- One `button[type="submit"]` with the text `Remove`, `formaction="/review/<sid>/remove/<id>"`
  and `formnovalidate`.
- A title of `"><script>x</script>` is the input's value and the page has no `script`
  element without `src` in `main`.
- `formFields` of the form has exactly the keys `title-`, `minutes-`, `priority-` and
  `slot-` for the three ids, with the stored values.

### AC9: `src/review-page.test.ts`

- With confidences 0.9, 0.5 and 0.49 (the seed): only the third card contains the text
  `Low confidence`.
- A draft with a confidence of 0 shows it; one with `null` and one with 1 do not.

### AC10: `src/review-page.test.ts`

- Served with scripts off, the `−` and `+` buttons of every card have `hidden`.
- The page links one script, `/js/review.js`, with `defer`; the app serves it as
  JavaScript; `runLinkedScripts` resolves to `['/js/review.js']`.
- After the script ran no `−` or `+` button has `hidden`.
- `+` on 90 gives `95`, then `−` twice gives `85`. Only that card's input changes.
- `−` on 3 gives `1`; `−` on 1 stays `1`; `+` on 1438 gives `1440`; `+` on 1440 stays
  `1440`.
- `+` on an emptied input gives `5`; `−` on an emptied input gives `1`.
- A click on `−` or `+` does not submit: a `submit` listener the test puts on the form
  is not called.
- No script error (the `afterEach`).

### AC11: `src/review-page.test.ts`

- The form's last element child has the class `review-bar` and holds exactly two
  buttons: `Discard` (`type="submit"`, `formaction="/review/<id>/discard"`,
  `formnovalidate`) and `Confirm all (3)` (`type="submit"`, no `formaction`). With one
  draft it reads `Confirm all (1)`.
- In the stylesheet, the rule `.review-bar` outside any at-rule has `position: sticky`
  and a `bottom` that contains `var(--nav-height)`; inside
  `@media (min-width: 900px)` its `bottom` is `0`.
- Every `button` of the page has the `btn` class, in each of the three states of AC16
  and on the 400 page of AC13.
- Each of the classes `analyzing`, `field`, `source`, `source__summary`, `review-form`,
  `drafts`, `draft`, `draft__row`, `draft__flag`, `stepper`, `stepper__input`,
  `stepper__unit`, `choices`, `choice`, `review-bar` is used in a served page (the Add
  page or the review page with a low-confidence draft) and has a rule in the
  stylesheet. `source__text` is checked on a text source.

### AC12: `src/review-actions.test.ts`

- Posting `formFields` of the served form unchanged: 303 with
  `Location: /review/<id>`; all three tasks are `pending` with the title, minutes and
  priority they had and `time_slot: null`; `description`, `category`, `confidence` and
  `source_id` are as before; `scheduled_start` is `null`.
- With edits (`title-1: '  Fix the login bug  '`, `minutes-1: '95'`,
  `priority-1: 'urgent'`, `slot-1: 'morning'`): task 1 has `Fix the login bug`, 95,
  `urgent`, `morning`; the other two have their stored values; all are `pending`.
- A draft stored with `time_slot: 'evening'` and posted with `slot-<id>: ''` ends with
  `time_slot: null`.
- A body with fields for task 1 only: tasks 2 and 3 are `pending` with their stored
  values. A body with only `title-1`: task 1 keeps its stored minutes, priority and
  slot. A post with no body at all: all three `pending` as stored.
- Fields named after a pending task of this source and after a draft of another source
  (`title-<id>: 'changed'`) leave both rows unchanged; the other source's draft is
  still a draft.
- `minutes` of `'1'`, `'1440'`, `' 45 '` and `'030'` are stored as 1, 1440, 45 and 30.

### AC13: `src/review-actions.test.ts`

Each test posts `formFields` with one or more fields replaced and asserts 400, the rows
unchanged, and the page.

- `title-2: '   '`: one `[role="alert"]` that contains `Give every task a title.` and
  neither of the other two messages; the form is rendered with the heading
  `Review 3 tasks`.
- `it.each` over `minutes-2` of `''`, `'0'`, `'1441'`, `'-5'`, `'12.5'`, `'30.0'`,
  `'3e1'`, `'abc'`, `'99999'`: the alert contains
  `Set every duration to a whole number of minutes from 1 to 1440.` and not the title
  message.
- `priority-2: 'nope'`, and `slot-2: 'tonight'`: 400; the alert contains
  `Choose every priority and every slot from the ones offered.`.
- A blank title on one card and bad minutes on another: the alert contains both
  messages, the title one first.
- A field posted twice (`title-1=a&title-1=b`, sent as a string): 400 with the title
  message.
- The posted values are in the cards: with `title-1: 'Edited'`, `minutes-1: '95'`,
  `priority-1: 'urgent'`, `slot-1: 'night'`, `title-2: ''` and `minutes-3: 'abc'`,
  `formFields` of the 400 page has `Edited`, `95`, `urgent` and `night` for card 1, `''`
  for `title-2`, and for `minutes-3` whatever jsdom reads from `value="abc"` as an
  attribute, which is `abc`. Task 1 is still a draft with its stored title.
- With `priority-2: 'nope'` the 400 page has the stored priority of card 2 checked.
- A good card beside a bad one is not saved: with `title-1: 'Edited'` and `title-2: ''`,
  task 1 still has its stored title.

### AC14: `src/review-actions.test.ts`

- `POST /review/<id>/remove/2` with `formFields` unchanged: 303 with
  `Location: /review/<id>`; task 2 is gone; tasks 1 and 3 are drafts with their stored
  values; the next `GET` shows `Review 2 tasks` and two cards.
- With edits on the others (`title-1: ' Edited '`, `minutes-1: '95'`, `slot-3: 'night'`):
  task 1 has `Edited` and 95, task 3 has `night`, both are still `draft`.
- One bad and one good field on another card (`title-1: ''`, `minutes-1: '95'`): 303;
  task 1 keeps its stored title and has 95.
- The removed card's own fields are not checked: `title-2: ''` and `minutes-2: 'abc'`
  in the body still remove task 2 with 303.
- With no body: task 2 is gone, the others unchanged.
- `it.each` over a `taskId` of a pending task of this source, a draft of another source,
  `999`, `abc` and `0`: the not-found page, and every row unchanged, also with edits for
  the other cards in the body.
- Removing the last draft: 303, and the next `GET` shows `Nothing to review`.

### AC15: `src/review-actions.test.ts`

- After a real upload (so there is a file) with `found(bug, milk, bank)`, plus a
  `pending` and a `done` task created under that source and a draft under another
  source: `POST /review/1/discard` answers 303 with `Location: /add`; the three drafts
  are gone; the pending task, the done task and the other source's draft are unchanged;
  the source row is there; the file is in the uploads folder with its bytes.
- On a source without drafts: 303 to `/add`, nothing changed.

### AC16

`src/review-page.test.ts`

- A source whose tasks are two `pending` and one `done`: 200; no `form` in `main`; the
  text `3 tasks saved`; one link with the text `Add another` and `href="/add"`; no
  `details`; no `script[src]`. With one task: `1 task saved`.
- A source with no task: 200; no `form`; an `.empty-state` whose heading reads
  `Nothing to review` and which holds a link with `href="/add"`; one `main h1`.
- Both pages mark the Add link as current.

`src/review-actions.test.ts`

- After a confirm, `GET` of the `Location` shows `3 tasks saved` and `Add another`.
- A second confirm with `title-1: 'changed'` in the body answers 303 to `/review/<id>`
  and leaves every row unchanged.

### AC17

`src/review-page.test.ts`

- `it.each` over `GET` of `/review/999`, `/review/abc`, `/review/0`, `/review/01`,
  `/review/1.5`, `/review/-1` and `/review/1abc`, with source 1 seeded: the not-found
  page.

`src/review-actions.test.ts`

- `it.each` over `POST` to `/review/999/analyze`, `/review/abc/analyze`,
  `/review/999/confirm`, `/review/abc/confirm`, `/review/999/remove/1`,
  `/review/abc/remove/1`, `/review/999/discard` and `/review/abc/discard`, with source 1
  seeded and its `formFields` as the body: the not-found page, the analyzer not called,
  every row unchanged.

### AC18

`src/add-analysis.test.ts`

- After an upload with `found(bug, milk, bank)`: `GET` of `/`, `/add` and `/_styleguide`
  contains none of the three titles; `GET /review/1` contains all three.

`src/review-actions.test.ts`

- Before the confirm, `listTasks(db, { status: 'pending' })` is empty and
  `listTasks(db, { status: 'draft' })` has the three ids. After it,
  `listTasks(db, { status: 'pending' })` has the three ids and
  `listTasks(db, { status: 'draft' })` is empty.

### AC19

- Step 9: `yarn build` and `env -u ANTHROPIC_API_KEY yarn test`, the repo and the
  temporary folder clean afterwards.
- No new test builds an app except through `createTestApp`, whose database is in memory
  and whose uploads folder is temporary (the unedited tests of `src/testing/app.test.ts`
  hold that), and the two added tests there hold that its analyzer is a stub.
- The network guard holds the two files that build a real analyzer to zero requests, or
  to the one answered by the spy.
- The unedited 005 test "is blank, so no test gets a key from getAnthropicApiKey()"
  still passes.
