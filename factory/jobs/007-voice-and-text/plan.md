# 007-voice-and-text: plan

Decision numbers (D1, D2, …) refer to `design.md`.

## Steps

After each step `yarn build` and `yarn test` must pass, the tests of earlier jobs
included (1024 before this job). Existing test files change only as the table in D17
says. No package is installed. No step sends a request to the Anthropic API or opens a
microphone from a test, and no key is written into a file of the repo, a test or
`build.md`.

1. **The analysis takes any source.** Files: `src/services/drafts.ts`,
   `src/routes/add.ts`, `src/routes/review.ts`. Serves AC3, AC7.
   - `analyzeSource` and `inputOf` as in D8. Only the analyzer call is inside the `try`.
   - The two callers import and call `analyzeSource`. Nothing else in them changes yet:
     the retry route keeps its `source.kind !== 'photo'` check until step 3.
   - Check: `yarn build` passes and `yarn test` passes with no test file edited (1024).

2. **Three tabs.** Files: `src/routes/add.ts`, `src/views/pages/add.ejs`,
   `public/css/base.css`, `src/add-page.test.ts`, `src/add-photo.test.ts`,
   `src/add-analysis.test.ts`, `src/add-analyzing.test.ts`, `src/add-tabs.test.ts`.
   Serves AC1, AC2, AC9, AC10, AC14.
   - `AddTab`, `TABS`, `readTab`, `AddPage`, `AddAnswer`, `MAX_TEXT_LENGTH` and
     `renderAdd` with the tab (D1 to D3). `GET /add` reads the tab. The six photo
     answers pass `'photo'`; `answerAnalysis` passes `'photo'` too until step 3.
   - The view of D5, character for character, without the third script tag. The two
     text forms post to routes that step 3 adds.
   - The CSS of D15.
   - The edits of D17 for the four test files, except the script lists (step 5) and the
     removed test (step 3).
   - In `src/add-tabs.test.ts`: the tests of AC1 and AC2 below, and the served-page
     tests of AC10 and AC14.
   - Check: `yarn vitest run src/add-tabs.test.ts src/add-page.test.ts src/add-photo.test.ts src/add-analysis.test.ts src/add-analyzing.test.ts src/stylesheet.test.ts src/components.test.ts`
     passes, the last two unedited.

3. **A text is stored and analyzed.** Files: `src/routes/add.ts`,
   `src/routes/review.ts`, `src/app.ts`, `src/add-analysis.test.ts`,
   `src/add-text.test.ts`. Serves AC3 to AC8.
   - `readText`, the four messages, `postText` and the two routes (D6, D7).
     `answerAnalysis` by kind (D9).
   - The retry route analyzes any source without tasks (D10). The comment edits listed
     under Files for `review.ts`, `drafts.ts` and `app.ts`.
   - Remove the 006 test "does not call the analyzer for a text source without tasks,
     and answers 303" from `src/add-analysis.test.ts`.
   - In `src/add-text.test.ts`: the tests of AC3 to AC8 below.
   - Check: `yarn vitest run src/add-text.test.ts src/add-analysis.test.ts src/review-page.test.ts src/review-actions.test.ts`
     passes, the last two unedited.

4. **"Analyzing..." for the new forms.** Files: `public/js/add-analyzing.js`,
   `src/add-analyzing.test.ts`. Serves AC9.
   - The two comment edits of D14. No statement of the script changes.
   - The AC9 tests below, in a new `describe` of `src/add-analyzing.test.ts`.
   - Check: `yarn vitest run src/add-analyzing.test.ts` passes.

5. **The voice script.** Files: `public/js/add-voice.js`, `src/views/pages/add.ejs`,
   `src/testing/dom.ts`, `src/testing/jsdom.d.ts`, `src/add-page.test.ts`,
   `src/add-analyzing.test.ts`, `src/add-voice.test.ts`. Serves AC10 to AC14.
   - The script of D11 under its header comment, and the third script tag.
   - The helpers and the typings of D16.
   - The script lists of D17 in `src/add-page.test.ts` (two) and
     `src/add-analyzing.test.ts` (one).
   - In `src/add-voice.test.ts`: the tests of AC10 to AC14 below that run the script.
   - Check: `yarn vitest run src/add-voice.test.ts src/add-page.test.ts src/add-analyzing.test.ts src/add-tabs.test.ts`
     passes.

6. **The whole job.** Serves AC15.
   - `yarn build`, then `env -u ANTHROPIC_API_KEY yarn test`, once, the whole suite.
   - After the run: `git status --short` shows this job's files only; there is no `.env`
     and no `data` folder in the repo; `ls "$(node -p 'os.tmpdir()')" | grep '^mtask-'`
     prints nothing.
   - `git diff --stat main -- package.json yarn.lock src/server.ts src/config.ts src/db src/services/analyzer.ts src/services/photo-storage.ts src/ui.ts src/render.ts src/views/layout.ejs src/views/partials src/views/pages/review.ejs public/js/add-photo.js public/js/review.js src/testing/app.ts src/testing/page.ts src/testing/css.ts src/review-page.test.ts src/review-actions.test.ts src/stylesheet.test.ts src/components.test.ts src/shell.test.ts tsconfig.json vitest.config.ts .gitignore CLAUDE.md README.md`
     prints nothing (the design's Not touched list).
   - By hand, without a key. Look first at who holds the port
     (`lsof -nP -iTCP:<port> -sTCP:LISTEN`). Start the server with
     `ANTHROPIC_API_KEY= PORT=<port> DATABASE_PATH=:memory:` in front and `UPLOADS_DIR`
     in a folder outside the repo. `curl -i -d 'text=buy milk' http://localhost:<port>/add/text`
     answers 502 with `The text could not be analyzed.`, the `Try again` form to
     `/review/1/analyze` and `buy milk` in the Type textarea; the server's stderr has
     the line `The analysis of source 1 failed:`. `curl -i -d 'text=' …/add/voice`
     answers 400 with `Describe what you need to do first.`
   - By hand, the page, in Chrome with a profile of its own, against an app with a stub
     analyzer (a short script that calls `createApp`, as the tests do). Write into
     `build.md` what was seen of each:
     (a) `/add?tab=voice`: `Start recording` is there; a click turns it into
     `Stop recording`; without a microphone permission it goes back to
     `Start recording` and the alert of AC13 shows, with the typed text kept.
     (b) With both constructors removed before the page's scripts run
     (`Page.addScriptToEvaluateOnNewDocument`), `/add?tab=voice` shows the Type tab
     selected, no Voice tab, and the status of AC14; `/add` shows Photo and no Voice
     tab.
     (c) A click on each tab loads its address and selects it.
     (d) `Find tasks` on the Type tab with a slow stub shows `Analyzing...` and disables
     the buttons, and the post still goes through. Read the in-between state as
     `docs/errors/chrome-debugging-port-holds-commands-until-navigation-ends.md` says.
     (e) The three tabs at a narrow and at a wide width, in both themes, with no
     sideways scroll. For a narrow page and a theme in headless Chrome, follow
     `docs/errors/headless-chrome-screenshot-hangs-and-crops-narrow-windows.md`, or set
     the viewport and the color scheme through the debugging port.
   - By hand, with a microphone (the spec's check). Only in a browser where a person
     can speak and allow the microphone, and with a key that is already in the shell or
     in `.env`; do not ask for one and do not create `.env`. Tap `Start recording`, say
     "buy milk and finish the login bug", see the transcript appear while speaking,
     press `Find tasks`, and see two drafts. With no microphone or no key at hand, list
     this under Not done and say that no real `result` event was seen and no request
     reached the live API.

## Tests

Shared setup.

- **The app.** Each file below builds `testApp = createTestApp({ analyze })` in
  `beforeEach`, with `analyze = vi.fn<Analyze>()`, and closes it in `afterEach`, which
  also calls `vi.restoreAllMocks()`.
- **Two tasks**, written out in each file that needs them: `bug`
  (`Finish login bug fix`, `Before Friday`, `coding`, 90, `high`, 0.9) and `milk`
  (`Buy milk`, `''`, `shopping`, 15, `medium`, 0.49). `found(...tasks)` is
  `{ tasks, fallback: false }`; `failed()` is `{ tasks: [milk], fallback: true }`.
- **The two routes.** `ROUTES` is `[['/add/voice', 'voice', 'Voice'], ['/add/text', 'text', 'Type']]`:
  the address, the kind and the label of the tab. "For both routes" below is an
  `it.each` or a `describe.each` over it.
- **A text post.** `postText(route, text)` is
  `request(testApp.app).post(route).type('form').send({ text })`. A body that needs a
  field twice, or `\r\n`, is sent as a string.
- **Rows.** `sources()` reads `id`, `kind`, `image_path` and `transcript` of every
  source in `id` order. `tasks()` is `listTasks(testApp.db)`.
- **The page.** `selectedTab(document)` is the text of
  `one(document, '[role="tab"][aria-selected="true"]')`. `shownAlerts(document)` and
  `shownStatuses(document)` are the texts of the `[role="alert"]` and `[role="status"]`
  elements that pass `isShown`. `shownForms(document)` are the `action`s of the
  `main form`s that pass `isShown`. `boxOf(document, route)` is the `value` of
  `one(document, `main form[action="${route}"] textarea[name="text"]`)` as a `DomInput`.
- **The Add page in the layout** is `main h1` with `Add task`, five navigation links
  and exactly one `[aria-current]`, the `/add` link.
- **A rejecting analyzer.** A test that makes the stub reject first replaces
  `console.error` with `vi.spyOn(console, 'error').mockImplementation(() => {})`.
- **Pages with scripts.** `openPage`, then `stubObjectUrls`, then the speech stub when
  the test wants one (`stubSpeechRecognition`, D16), then `runLinkedScripts`. Every
  window is pushed to `opened`; `afterEach` asserts `scriptErrors(window)` is `[]` for
  each and closes it. `openVoice(speech)` in `src/add-voice.test.ts` does this for
  `GET /add?tab=voice` and returns the window, the stub, the record button
  (`[data-voice-record]`), the Voice textarea (`[data-voice-text]`) and
  `state()`, which is `[textOf(record), record.getAttribute('aria-pressed')]`.
- **A recording.** `record.click()`, then `stub.instances[n].fire('result', resultEvent([...]))`.
  `final(t)` and `interim(t)` are `{ transcript: t, isFinal: true }` and
  `{ transcript: t, isFinal: false }`.

### AC1: `src/add-tabs.test.ts`

- `it.each` over `/add`, `/add?tab=photo`, `/add?tab=voice`, `/add?tab=text`: 200, the
  Add page in the layout; exactly one `[role="tablist"]`, with an `aria-label`; its
  `[role="tab"]` elements are three `a` elements whose texts and `href`s are, in order,
  `Photo` `/add?tab=photo`, `Voice` `/add?tab=voice`, `Type` `/add?tab=text`. Fails when
  a tab is a `<button>`, the order changes, or a tab is left out.
- The same four: `aria-selected` of the three tabs is `true` for the one the address
  names (`Photo` for `/add`) and `false`, written out, for the other two.
- `it.each` over `/add?tab=`, `?tab=VOICE`, `?tab=type`, `?tab=%20voice`,
  `?tab=constructor`, `?tab=voice&tab=text`, `?tab[]=voice`: 200 and `Photo` selected.
  Fails when the value is lowercased, trimmed, or the first of several is taken.
- For each of the three tabs: the page has three `[role="tabpanel"]`; the one whose `id`
  is the selected tab's `aria-controls` has no `hidden`; the other two have it. Fails
  when the wrong panel is shown or a second one is.
- Each tab's `aria-controls` is the `id` of a panel whose `aria-labelledby` is that
  tab's `id`; no `id` is in the page twice; no element has a `style` attribute.
- The tabs work without a script: requesting each tab's `href` answers the page with
  that tab selected.
- The Photo panel holds the form to `/add/photo` and no other; the Voice panel the form
  to `/add/voice`; the Type panel the form to `/add/text`.
- The edited tests of `src/add-page.test.ts` hold that the Photo tab answers as before:
  the form, the input, the label, the preview and the scripts.

### AC2: `src/add-tabs.test.ts`

- For both routes, on each of the three tab addresses: the form has `method="post"`,
  that `action`, no `enctype` and no `onsubmit`, and is marked `data-analyze-form`.
- It holds exactly one `textarea` and no `input`: `name="text"`, `required`,
  `maxlength="5000"`, and a `value` of `''`. Fails when a default text is served or the
  limit is another number.
- One `label` whose `for` is the textarea's `id` and whose text is not blank. The two
  textareas have different ids.
- Exactly one `button[type="submit"]`, with the text `Find tasks`, not disabled.
- Every `button` of the page has the `btn` class, on each of the three tab addresses.
  The same in `src/add-text.test.ts` for the 400, the 413, the 200 and the 502 answer
  of a text post.
- `src/add-page.test.ts`, edited: each of `text-form`, `text-form__label`,
  `text-form__input` and `text-form__actions` is used in the page and has a rule in the
  stylesheet.

### AC3: `src/add-text.test.ts`

For both routes.

- With `found(bug, milk)` and the text `'  buy milk and finish the login bug \n'`: 303
  with `Location: /review/1`; `sources()` equals exactly
  `[{ id: 1, kind, image_path: null, transcript: 'buy milk and finish the login bug' }]`.
  Fails when the kind is fixed, the text is not trimmed, or two sources are made.
- The analyzer was called once, with `toStrictEqual`,
  `[{ kind: 'text', text: 'buy milk and finish the login bug' }]`. The stub reads
  `sources()` when it is called and the test finds the one row there: the source is
  stored before the analyzer runs.
- Two tasks are stored in the order `bug`, `milk`: `status: 'draft'`, `source_id: 1`,
  the five values as returned (`description: ''` stays `''`, `confidence: 0.49` stays
  0.49) and `priority` equal to the urgency.
- Every other column of each is `null`: the ten of `UNSET_COLUMNS` in
  `src/add-analysis.test.ts`, written out here too.
- With `found(milk)`: one draft, 303.
- A list whose second task the table refuses (`confidence: 2`) answers 500 and stores
  no task; the source stays.
- Line breaks: the body `text=buy+milk%0D%0Acall+mum` is stored, and handed to the
  analyzer, as `'buy milk\ncall mum'` (D6). Inner spaces are kept: `'buy  milk'` is
  stored as it is.
- With the database closed the post answers 500 and the analyzer is not called.

### AC4: `src/add-text.test.ts`

For both routes. `expectRefused(response, status, message, label, route, box)` asserts:
the status; the Add page in the layout; `selectedTab` is `label`; `shownAlerts` equals
`[message]`; `shownStatuses` is `[]`; `shownForms` equals `[route]` (so no `Try again`
form); `boxOf(document, route)` is `box`; `sources()` is `[]`; `tasks()` is `[]`; the
analyzer was not called.

- `it.each` over a post with no body, `text=`, `text=%20%0D%0A%09`, `text=a&text=b`,
  `note=buy+milk` (no `text` field), a JSON body `{ text: 'buy milk' }` and a multipart
  field `text`: `expectRefused` with 400, `Describe what you need to do first.` and an
  empty box. Fails when the first of two values is taken, or a blank text is stored.
- 5001 times `x`: `expectRefused` with 413,
  `That text is longer than 5000 characters. Shorten it.` and the 5001 characters in the
  box. The other tab's box is empty.
- 5001 times `x` between spaces: 413, and the box holds the 5001 characters (D6).
- Exactly 5000 times `x`: 303 and one source whose transcript has 5000 characters.
- 5000 times `x` between two spaces and a line break: 303. Fails when the length is
  measured before trimming.
- 5000 characters as the browser counts them, with `\r\n` line breaks (2499 times
  `x\r\n`, then `xx`, sent as a string): 303, and the transcript has 5000 characters
  (D6). Fails when the line breaks are not normalized.

### AC5: `src/add-text.test.ts`

For both routes, with `found()` and the text `' buy milk '`.

- 200; the Add page in the layout; `selectedTab` is the route's label; `shownStatuses`
  equals `['No tasks were found in that text.']`; `shownAlerts` is `[]`; `shownForms`
  equals `[route]`; `boxOf(document, route)` is `buy milk`.
- `tasks()` is `[]`; `sources()` has the one row; the analyzer was called once.
- A text of `</textarea><script>window.x = 1</script>` and a second line comes back as
  the value of the box, and `main` has no `script` without `src`.

### AC6: `src/add-text.test.ts`

For both routes. `expectFailedText(response, label, route, text)` asserts: 502; the Add
page in the layout; `selectedTab` is `label`; `shownAlerts` equals
`['The text could not be analyzed.']`; `shownStatuses` is `[]`; one form with
`method="post"` and `action="/review/1/analyze"`, with no `input`, whose one button is
`type="submit"` and reads `Try again`; `shownForms` equals
`['/review/1/analyze', route]`; `boxOf(document, route)` is `text`.

- With `failed()`: `expectFailedText`; **no task stored**; one source kept;
  `console.error` not called.
- With a stub that rejects with `new Error('the model is down')`: the same answer and
  rows; `console.error` was called once with `The analysis of source 1 failed:` and that
  error (`toBe`).
- With a stub that throws before it returns a promise: the same answer.
- With the app built on `createAnalyze(undefined, 'm')` and the network guard of 006
  D22 (`fetch` replaced by a rejecting spy, zero calls asserted in `afterEach`): the
  same answer, and `fetch` was not called.

### AC7: `src/add-text.test.ts`

For both routes. `beforeEach` posts `buy milk` with `failed()` (502), so source 1 exists
with its transcript and no task, and then clears the stub's calls.

- `POST /review/1/analyze` with `found(bug, milk)`: 303 to `/review/1`; the analyzer was
  called once with `[{ kind: 'text', text: 'buy milk' }]`; two drafts under source 1;
  `sources()` still has one row. Fails with the kind check of 006 left in, or when the
  retry stores a source.
- With `found()`: the page of AC5 with the route's tab selected and `buy milk` in its
  box. With `failed()` and with a rejection: `expectFailedText` again. No task in all
  three, and still one source.
- A stub that creates a task under source 1 before it resolves to `found(bug, milk)`:
  303, and the source has that one task only.
- `it.each` over `draft` and `done`: a source of the route's kind, made with
  `createSource`, whose only task has that status: 303 to `/review/<id>`, the analyzer
  is not called, the tasks are unchanged.
- A photo source: the edited `expectNoTasksPage` and `expectFailedPage` of
  `src/add-analysis.test.ts` assert `Photo` as the selected tab for the upload and for
  its retry, with the photo's two messages as before.
- The not-found page for `POST /review/999/analyze` stays held by
  `src/review-actions.test.ts`, unedited.

### AC8: `src/add-text.test.ts`

For both routes, after a post of `buy milk and finish the login bug` with
`found(bug, milk)`.

- `GET /review/1`: 200; two `[data-draft]` cards whose title inputs hold the two
  titles; one `details` that contains the transcript as text, has a `summary` and no
  `img`.
- Confirm: posting `formFields(one(document, 'main form'))` to `/review/1/confirm`
  answers 303; `listTasks(db, { status: 'pending' })` then has the two ids and
  `listTasks(db, { status: 'draft' })` is empty.
- Remove: `POST /review/1/remove/1` with the fields answers 303; task 1 is gone and
  task 2 is still a draft.
- Discard: `POST /review/1/discard` answers 303 with `Location: /add`; no task is left;
  the source row is still there.
- Before the confirm, `GET /` and `GET /add?tab=voice` contain neither title.

### AC9: `src/add-analyzing.test.ts`

- `it.each` over the three tab addresses, scripts off: one `[data-analyzing]` element
  with `role="status"`, `hidden`, the text `Analyzing...` and a `.skeleton`; it is
  inside `main`, inside no `[role="tabpanel"]`, and nothing around it is hidden (the
  edited `expectHiddenAnalyzing`). The same on the 400, the 200 and the 502 answer of a
  post to `/add/text`.
- With the scripts run on `/add?tab=voice` and a stubbed `SpeechRecognition`: nothing is
  shown or disabled on load. Dispatching `submit` on the Voice form returns `true`;
  the status passes `isShown`; every `main button[type="submit"]` is disabled (both
  `Find tasks` and `Upload photo`); no `textarea` is disabled; the record button is not
  disabled. Fails when the status is left inside the Photo panel, or the Voice form is
  not marked `data-analyze-form`.
- The same on `/add?tab=text` for the Type form, with no stub.
- On the 502 answer of a post to `/add/text`: dispatching `submit` on the form to
  `/review/1/analyze` returns `true`, shows the status and disables `Try again` and
  both `Find tasks`. `pageshow` on the window then hides the status and enables them.
- An `input` event on a textarea and a click on the record button do not show the
  status.
- The request waits for the analyzer: with a stub whose promise the test resolves, a
  post to `/add/text` has not been answered after `vi.waitFor` saw the stub called and
  two turns of `setImmediate`; resolved with `found(milk)`, the answer is 303.

### AC10

`src/add-tabs.test.ts` (served, scripts off)

- On each of the three tab addresses: one `[data-voice-record]`, a `button` inside the
  form to `/add/voice`, with the text `Start recording`, `type="button"`,
  `aria-pressed="false"`, the `btn` class and `hidden`.

`src/add-voice.test.ts`

- The page links three scripts, `/js/add-photo.js`, `/js/add-analyzing.js`,
  `/js/add-voice.js`, each with `defer`; the app serves the third as JavaScript (the
  edited test of `src/add-page.test.ts` holds all three).
- `it.each` over `SpeechRecognition` and `webkitSpeechRecognition`: with only that stub
  on the window of `/add?tab=voice`, the record button has no `hidden` and passes
  `isShown`; the Voice tab has no `hidden` and is still selected; `stub.instances` is
  `[]` (nothing is made on load); `state()` is `['Start recording', 'false']`.
- With both stubs on the window, a click makes one recognition from the
  `SpeechRecognition` stub and none from the other.
- With neither: the record button keeps `hidden`.
- `it.each` over the three tab addresses and over the three windows (one constructor,
  the other, neither): `runLinkedScripts` resolves to the three script names, and the
  `afterEach` finds no script error.

### AC11: `src/add-voice.test.ts`

Each with a stubbed `SpeechRecognition` on `/add?tab=voice`.

- A click on the record button: `stub.instances` has length 1; its `continuous` and
  `interimResults` are `true` (`toBe`); `startCalls` is 1 and `stopCalls` is 0;
  `state()` is `['Stop recording', 'true']`. The textarea has neither `disabled` nor
  `readonly`. A `submit` listener the test puts on the form was not called.
- The spec's example: the box holds `call mum`; after the click, the event
  `[final('buy milk'), interim(' and finish the login bug')]` leaves it at
  `call mum buy milk and finish the login bug`. Fails when results that are not final
  are skipped, when only the result at `resultIndex` is read, or when the second
  alternative is read.
- With an empty box the same event gives `buy milk and finish the login bug`, with no
  space in front.
- Three events in a row, `[interim('buy')]`, `[interim('buy milk')]`,
  `[final('buy milk'), interim(' and eggs')]`, on a box that held `call mum`, end at
  `call mum buy milk and eggs`. Fails when an event adds to what the last one wrote.
- White space: `[final('  buy \n milk '), final('and   eggs ')]` on an empty box gives
  `buy milk and eggs`. Fails when the results are joined without a space (D11), or the
  white space is not collapsed.
- The earlier text is kept exactly: a box of `call mum\nwater plants` and
  `[final('buy milk')]` give `call mum\nwater plants buy milk`.
- An event with no result, and one whose only transcript is blank, leave the box at
  `call mum`, with no space added.

### AC12: `src/add-voice.test.ts`

- While recording, a click calls `stop()` once on that recognition and makes no second
  one; `state()` is still `['Stop recording', 'true']` (D11). After `fire('end')` it is
  `['Start recording', 'false']` and the box holds what the last event wrote.
- `end` without a click (the browser ended it) gives the same state.
- A second recording: after `end`, the test sets the box to
  `call mum buy milk today` (an edit), clicks, and fires `[final('pay rent')]` on
  `stub.instances[1]`: the box is `call mum buy milk today pay rent`, and
  `stub.instances` has length 2. Fails when the first recording's start text is reused.
- A late event of the first recognition: with the second one recording,
  `fire('result', …)` and `fire('end')` on `stub.instances[0]` change neither the box
  nor `state()`.
- A `submit` dispatched on the Voice form while recording calls `stop()` once and
  returns `true`; dispatched while not recording it calls nothing (D11).

### AC13: `src/add-voice.test.ts`

- Served, scripts off, on each tab address: one `[data-voice-error]` inside the Voice
  panel, with `role="alert"`, `hidden` and the text
  `Voice input stopped working. Try again, or type your tasks here.`
- `it.each` over the error kinds `not-allowed`, `no-speech`, `network`,
  `audio-capture`, `aborted`: after a click, one result event and
  `fire('error', { error: kind })`: `state()` is `['Start recording', 'false']`; the box
  keeps its text; `shownAlerts` equals that one message.
- `error` followed by `end`, as Chrome fires them: the same state, the alert shown once.
- A `start()` that throws (`stub.startError = new Error('not now')` before the click):
  the same state and the alert, and no script error.
- The next click hides the alert, makes a new recognition and records: `shownAlerts` is
  `[]`, `state()` is `['Stop recording', 'true']`, and a result event writes the box.

### AC14

`src/add-tabs.test.ts` (served, scripts off)

- On each tab address: one `[data-voice-unavailable]` inside the Type panel, with
  `role="status"`, `hidden` and the text
  `Voice input is not available in this browser. Type your tasks instead.`

`src/add-voice.test.ts`, with neither constructor on the window

- `/add?tab=voice`: the Voice tab has `hidden` and `aria-selected="false"`; `Type` has
  `aria-selected="true"`; `Photo` has `"false"`; `panel-text` has no `hidden`;
  `panel-voice` and `panel-photo` have it; `shownStatuses` equals that one message;
  `shownForms` equals `['/add/text']`.
- `/add` and `/add?tab=text`: the Voice tab has `hidden`; the selected tab, the shown
  panel and `shownForms` are as served; `shownStatuses` is `[]`.
- With a stubbed constructor on `/add?tab=voice`: the Voice tab is shown and selected,
  the Voice panel is shown, `shownStatuses` is `[]`.
- On the 502 answer of a post of `buy milk` to `/add/voice`: after the scripts ran, the
  Type box holds `buy milk`; `shownAlerts` equals `['The text could not be analyzed.']`;
  `shownForms` equals `['/review/1/analyze', '/add/text']` (D4, D12).
- A Type box that already holds a text when the scripts run (set by the test before
  `runLinkedScripts`) keeps it.
- `public/js/add-voice.js` contains none of `location`, `fetch(`, `XMLHttpRequest`,
  `setTimeout`, `setInterval` and `preventDefault`: it loads no page, sends nothing and
  stops no submit.

### AC15

- Step 6: `yarn build` and `env -u ANTHROPIC_API_KEY yarn test`, the repo and the
  temporary folder clean afterwards.
- No new test builds an app except through `createTestApp`, whose database is in memory,
  whose uploads folder is temporary and whose analyzer is a stub (the unedited tests of
  `src/testing/app.test.ts` hold that).
- The one test that builds the real analyzer, without a key, runs under the network
  guard (AC6).
- The only recognition a test meets is the stub of D16, put on the window by the test:
  the "neither" tests of AC10 and AC14 pass on jsdom as it comes, which shows it has no
  constructor of its own.
