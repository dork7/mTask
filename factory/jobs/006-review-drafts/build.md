# 006-review-drafts: build

Branch `factory/006-review-drafts`, code commit `022a033`. Built on Node v26.8.2 and
yarn 1.22.22, the only Node on this machine.

## What changed

Created:

| File | Why | Decision |
|---|---|---|
| `src/db/transaction.ts` | `inTransaction`: every write of several rows is all or none | D4 |
| `src/services/drafts.ts` | Runs the analyzer on a photo source and stores the drafts; reads the review form; confirms, removes, discards | D5, D10, D14, D16 |
| `src/routes/review.ts` | The five routes under `/review/:sourceId`, the cards and the three messages | D8, D9, D11, D15, D16 |
| `src/views/pages/review.ejs` | The review page in its three states, with the form | D17, D18 |
| `public/js/add-analyzing.js` | Shows "Analyzing..." and disables the submit buttons when a form is submitted | D13 |
| `public/js/review.js` | The `−` and `+` buttons of the minutes | D19 |
| `src/db/transaction.test.ts`, `src/services/create-analyze.test.ts`, `src/add-analysis.test.ts`, `src/add-analyzing.test.ts`, `src/review-page.test.ts`, `src/review-actions.test.ts` | The tests of `plan.md` | D22 |
| `docs/errors/chrome-debugging-port-holds-commands-until-navigation-ends.md` | An error of the by-hand check and what fixed it | error log |

Changed:

| File | Why | Decision |
|---|---|---|
| `src/services/analyzer.ts` | Appended `Analyze`, `AnalyzerKeyError`, `createAnalyze`. Nothing above them changed | D1, D2 |
| `src/services/photo-storage.ts` | `photoFile`, the file of a stored photo from its `image_path` | D5 |
| `src/app.ts` | `AppDeps.analyze`; the review router mounted after the Add router | D1, D11 |
| `src/server.ts` | Builds the real analyzer from the configured key and model | D2 |
| `src/routes/add.ts` | `AddPage` with `error`, `notice`, `retryAction`; `reviewPath`, `answerAnalysis`; the upload is analyzed before it is answered | D6, D7 |
| `src/views/pages/add.ejs` | The notice, the `Try again` form, the "Analyzing..." element, the second script | D7, D12 |
| `public/css/base.css` | The rules of D21, and the comment above `.photo`, which named the saved photo that is gone | D21 |
| `src/testing/app.ts` | `createTestApp({ analyze })`, `oneTaskAnalysis`, `TestApp.analyze` | D20 |
| `src/testing/dom.ts`, `src/testing/jsdom.d.ts` | `isShown`, `formFields`, `DomInput`, a cancelable event, `window.dispatchEvent` | D22 |
| `src/add-photo.test.ts`, `src/add-page.test.ts`, `src/app.test.ts`, `src/project.test.ts`, `src/server.test.ts`, `src/testing/app.test.ts` | The edits of the table in D23, and the added tests of AC1 | D23 |

## Acceptance criteria

"Fails when" is the change I made to see the test fail; the file was restored after each.
Every row was seen failing and then passing again. Test files are under `src/`.

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1: the analyzer is handed to `createApp`; a test passes a stub | `testing/app.test.ts` "is the one handed in, and the app calls it for an upload" | `createTestApp` ignores `options.analyze`; the upload does not call the analyzer | PASS |
| AC1: no test app reaches the network | `testing/app.test.ts` "is a stub that finds one task, a new object on every call" | the default shares one object; the default is a fallback | PASS |
| AC1: `server.ts` hands in the real one, from the key and the model | `server.test.ts` "builds the analyzer from the configured key and model and hands it to the app", "builds the app on that database…" | the key is not passed; the model is fixed; another function, or none, is handed to `createApp` | PASS |
| AC1: without a key the server starts | `server.test.ts` "builds it without a key, on the default model, and still listens" | another function is handed to `createApp` | PASS |
| AC1: `createAnalyze` with a key asks that model with that key | `services/create-analyze.test.ts` "asks the model it was given…", "sends every call of one analyzer with that key" | the client gets another key; the model is fixed | PASS |
| AC1: without a key every call rejects and no request is made | `services/create-analyze.test.ts` "returns an analyzer that rejects a text with an AnalyzerKeyError", "rejects an image whose file does not exist with the same error…" | a client is built anyway (the `fetch` guard fails); a plain `Error` is thrown; the name is not set | PASS |
| AC1: without a key every page answers, an upload ends in the error state, nothing is sent | `add-analysis.test.ts` "answers GET %s with 200", "answers an upload with the error state…", "answers the retry of that upload with the error state again" | the no-key analyzer builds a client; the rejection is not caught | PASS |
| AC2: 303 with `Location: /review/<source id>`; file and source as in 004 | `add-analysis.test.ts` "answers 303 to the review page of the new source…"; `add-photo.test.ts` "stores a file declared as %s…" | 302; `/reviews/1`; the upload answers 201 again; the stored file is removed after the analysis | PASS |
| AC2: the analyzer is called once with the stored file as an image input | `add-analysis.test.ts` "calls the analyzer once, with the stored file as an image, which is on disk by then" | the path is the `image_path`; the input is a text | PASS |
| AC2: each task stored in order, `draft`, under the source, five values as returned, `priority` the urgency | `add-analysis.test.ts` "stores each task as a draft of the source, in the order of the result", "stores one draft for a result of one task" | no `priority`; `status: 'pending'`; no `source_id`; reversed order; no `description`; `''` stored as `null`; confidence rounded | PASS |
| AC2: `time_slot` and every other column unset | `add-analysis.test.ts` "leaves every other column of a draft unset…" | the photo path is copied onto the task | PASS |
| AC2: no part of a list is stored (design, Risks) | `add-analysis.test.ts` "answers 500 and stores no part of a list whose second task the table refuses" | the transaction is taken out | PASS |
| AC2: the 004 tests expect 303 | `add-photo.test.ts`, the nine places of D23 | the upload answers 201 again (17 tests fail) | PASS |
| AC2: a rejected upload (415, 413, 400) does not call the analyzer | `add-photo.test.ts` `expectRejected`, and "answers 500 and keeps no file when the source cannot be written" | the analyzer is called in the 415, the 413, each 400 branch, and the failed-source branch, one at a time | PASS |
| AC3: no task stored; 200 with the Add page, the message in `role="status"`, the upload form | `add-analysis.test.ts` "answers 200 with the Add page, the message as a status, and the upload form", "stores no task and keeps the source and the file" | 201; another message; the message as an alert; an empty list answered as drafts; no upload button | PASS |
| AC4: `fallback: true` stores no task; source and file kept | `add-analysis.test.ts` "never saves the fallback task, and keeps the source and the file" | the fallback check is taken out; the file is removed | PASS |
| AC4: 502 with the Add page, the alert, the `Try again` form to `/review/<id>/analyze`, the upload form | `add-analysis.test.ts` "answers a fallback result with 502, the alert, the Try again form and the upload form" | 500; another message; no `retryAction`; the form is `method="get"`; the button reads `Retry`; a fallback is logged | PASS |
| AC4: the same when the analyzer rejects, or throws | `add-analysis.test.ts` "answers an analyzer that rejects the same way, and writes the reason to stderr", "…throws before it returns a promise the same way" | the rejection is thrown on; nothing is written to stderr (D3) | PASS |
| AC4: every button of the 502 page has `btn` | `add-page.test.ts` "gives every button of the page the btn class, whatever the page answers" | `Try again` is a bare `<button>` | PASS |
| AC5: the retry analyzes the stored photo once and answers as AC2, AC3 or AC4 | `add-analysis.test.ts` "analyzes the stored photo once and answers 303…", "answers 200 with the no-tasks status…", "answers 502 with the retry form again…" (two) | the mutations of AC2, AC3 and AC4 above fail these too | PASS |
| AC5: no second source or file | `add-analysis.test.ts` "creates no second source and no second file" | the retry creates a source of its own | PASS |
| AC5: a source that has a task of any status is not analyzed; 303 | `add-analysis.test.ts` "does not call the analyzer for a source whose only task is %s…" (`draft`, `done`) | the task check is taken out; only drafts are counted; the redirect goes to `/add` | PASS |
| AC5: a `text` source is not analyzed (D8) | `add-analysis.test.ts` "does not call the analyzer for a text source without tasks, and answers 303" | the kind check is taken out | PASS |
| AC5: two requests on one source store one set (D5, step 5) | `add-analysis.test.ts` "stores nothing more when another request stored a task for the source while this one waited" | the check inside the transaction is taken out | PASS |
| AC5: the path stays inside the uploads folder (D5) | `add-analysis.test.ts` "hands the analyzer a path inside the uploads folder, whatever the stored image path says" | `photoFile` joins the whole `image_path` | PASS |
| AC6: an element with `role="status"`, `Analyzing...` and the skeleton, hidden on load | `add-analyzing.test.ts` "is a hidden status with the text and the skeleton, inside the tab panel", and the two "is there, hidden, on the page that answers…"; `add-page.test.ts` "shows no message and no photo before anything is posted" | no `hidden`; no `role`; another text; no skeleton; outside the panel | PASS |
| AC6: submitting the upload form shows it and disables the submit buttons, without stopping the submit | `add-analyzing.test.ts` "shows the status and disables Upload photo when the upload form is submitted, without stopping it", "leaves the file input and Retake enabled…" | `preventDefault`; the status stays hidden; the buttons stay enabled; every control is disabled; the form is not marked `data-analyze-form` | PASS |
| AC6: the same for the `Try again` form | `add-analyzing.test.ts` "shows the status and disables both submit buttons when Try again is submitted…", "shows the status for the upload form too when the page also has the Try again form" | only the first, or only the last, form listens; only one form's button is disabled; the retry form is not marked | PASS |
| AC6: reset when the page is shown again (D13, step 4) | `add-analyzing.test.ts` "is reset when the browser shows the page again" | the `pageshow` listener does nothing | PASS |
| AC6: nothing else shows it | `add-analyzing.test.ts` "changes nothing when the scripts load", "is not shown by a click or by choosing a photo" | busy on load; busy on `click`; busy on `change` | PASS |
| AC6: no script error | the `afterEach` of `add-analyzing.test.ts` | the listener calls a function that does not exist (4 tests fail) | PASS |
| AC6: the script is linked, deferred and served | `add-analyzing.test.ts` "comes with its script, deferred…"; `add-page.test.ts` "links to two scripts…", "stays hidden when the script loads with no file chosen" | the tag is removed; no `defer`; the two tags swapped | PASS |
| AC6: the request is answered only when the analysis is done; no polling, no queue | `add-analyzing.test.ts` "is answered only when the analyzer is done", "is not polled for and not sent by the script…" | the route redirects before the analysis; a `setTimeout` in the script | PASS |
| AC7: 200 in the layout, the Add link current | `review-page.test.ts` "returns 200 in the layout, with the Add link as the current page" | `nav: 'tasks'`; another title | PASS |
| AC7: `Review N tasks`, `Review 1 task`, `Nothing saved yet` | `review-page.test.ts` "has the one heading Review 3 tasks…", "says Review 1 task for one draft" | always plural; no count; no `sub` | PASS |
| AC7: the source in a closed `<details>` above the cards, with the photo | `review-page.test.ts` "pins the photo above the cards in a details element that is closed" | `open`; a `<div>`; a fixed `src`; a blank `alt`; the source moved into the form; the source moved below the form | PASS |
| AC7: the transcript as text for `voice` and `text` | `review-page.test.ts` "shows the transcript of a %s source as text, with no image" | unescaped output; no transcript; `voice` treated as a photo | PASS |
| AC7: no inline style (plan) | `review-page.test.ts` "has no inline style" | a `style` attribute on the list | PASS |
| AC8: one card per draft, in `id` order, none of another source or status | `review-page.test.ts` "has one card per draft, in id order", "has no card for a task of another status or of another source" | `listDrafts` drops the status filter, or the source filter; the cards reversed | PASS |
| AC8: one form that posts without any script | `review-page.test.ts` "holds every card in one form that posts to the confirm route…" | `method="get"`; another action; an `enctype`; an `onsubmit` | PASS |
| AC8: the hidden first submit button (D18) | `review-page.test.ts` "starts the form with a hidden submit button of its own…" | the button is removed; not hidden; given a `formaction` | PASS |
| AC8: the title input, named `Task title` | `review-page.test.ts` "gives each card a text input named Task title that holds the title", "renders a title with markup in it as the value of the input, not as markup" | another label; another field name; no value; unescaped value | PASS |
| AC8: the number input, `min="1"`, `max="1440"`, between `−` and `+` | `review-page.test.ts` "gives each card a number input for the minutes, from 1 to 1440, between a − and a + button" | a text input; `min="0"`; `max="999"`; a fixed value; a hyphen for `−`; the buttons swapped; a button of `type="submit"` | PASS |
| AC8: one radio per priority, the draft's checked | `review-page.test.ts` "gives each card one radio per priority…", "checks no radio for a draft without a priority" | one priority left out; checkboxes; none checked; the first always checked; no label text | PASS |
| AC8: the slot picker with `No slot`, selected while the slot is unset | `review-page.test.ts` "gives each card a slot picker…", "selects the stored slot of a draft that has one" | no `No slot` option; it is never selected; the stored slot is not selected; three slots; another field name | PASS |
| AC8: the `Remove` button | `review-page.test.ts` "gives each card a Remove button that posts the form to the remove route of that draft" | `type="button"`; an action without the task id; no `formnovalidate`; another label | PASS |
| AC8: the field names and the routes agree | `review-page.test.ts` "posts exactly the four fields of each draft, with the stored values" | the name is `title_1`; the select is named as the radios | PASS |
| AC9: below 0.5 shows `Low confidence` | `review-page.test.ts` "is on a card below 0.5 and not on a card at 0.5 or above", "for a confidence of 0 it is shown: true" | the limit is 0.4; 0 is not low; another text | PASS |
| AC9: 0.5 or above, or none, does not | the same test, and "for a confidence of null / 1 it is shown: false" | the limit is 0.6; `<=`; `null` read as 0; always shown | PASS |
| AC10: `−` and `+` are shown by the script | `review-page.test.ts` "is served with its two buttons hidden…", "shows the two buttons of every card once the script ran" | served without `hidden`; the script does not unhide; only the first card is wired | PASS |
| AC10: they change that card's minutes by 5 | `review-page.test.ts` "adds 5 with + and takes 5 off with −, on that card only" | a step of 1; `+` steps 10; the first card's input is always the one changed | PASS |
| AC10: never below 1 or above 1440; a blank field counts as 0 | `review-page.test.ts` "from "%s", %s gives %s" (eight rows) | no lower bound; a lower bound of 0, of 5; no upper bound; an upper bound of 1435; a blank field is left alone | PASS |
| AC10: no script error; the buttons do not submit | the `afterEach`, and "does not submit the form" | the listener calls a function that does not exist; the listener dispatches `submit`; `+` is `type="submit"` | PASS |
| AC10: the script is linked, deferred, served | `review-page.test.ts` "comes with one script, deferred…" | the tag is removed; no `defer` | PASS |
| AC10: without the script the number can be typed | `review-page.test.ts`, the number input test of AC8 | a text input instead (16 tests fail) | PASS |
| AC11: the form ends in the bar, with `Discard` and `Confirm all (N)` | `review-page.test.ts` "is the last thing in the form and holds Discard and Confirm all (3)", "counts one card as Confirm all (1)" | an element after the bar; another label; another action; no `formnovalidate`; no count; `Confirm all` of `type="button"` | PASS |
| AC11: `position: sticky` | `review-page.test.ts` "is kept in view by the stylesheet…" | `position: static`; `bottom: 0` on a narrow screen; no rule in the wide block | PASS |
| AC11: every button carries `btn` | `review-page.test.ts` "gives every button the btn class, in every state of the page" | `Discard` as a bare `<button>`; `Add another` as a bare link | PASS |
| AC11: each new class is used and styled (plan) | `review-page.test.ts` "uses the class %s in a page and styles it in the stylesheet"; `add-page.test.ts` the same for `analyzing`, `analyzing__text` | a rule renamed; the element removed | PASS |
| AC12: posted title (trimmed), minutes, priority, slot stored; status `pending`; 303 | `review-actions.test.ts` "confirms the form as it was served…", "stores the posted title, trimmed…", "stores minutes posted as…", "stores the priority %s", "stores the slot %s" | status not set; edits ignored; 302; redirect to `/add`; title not trimmed; each of the four fields not read, one at a time; the bounds 2 and 1439; minutes not trimmed; a leading zero refused; the body not parsed | PASS |
| AC12: `No slot` stores an unset `time_slot` | `review-actions.test.ts` "clears a stored slot when No slot is posted", "keeps a stored slot that is posted as it was served" | `''` keeps the stored slot | PASS |
| AC12: a draft the body has no fields for is confirmed as stored | `review-actions.test.ts` "confirms a draft the body has no fields for…", "keeps the stored value of a field that is not posted", "confirms every draft as stored for a post with no body at all" | such a draft is skipped; an unposted slot is cleared; an unposted title is a problem; no body is refused | PASS |
| AC12: fields for a task that is not a draft of this source change nothing | `review-actions.test.ts` "changes nothing through a field named after a task that is not a draft of this source", "is not refused for a bad field named after…" | every task of the source is written; drafts of every source are read; the fields of another source's tasks are checked | PASS |
| AC13: a blank title answers 400 with `Give every task a title.` and changes no task | `review-actions.test.ts` "answers a blank title with 400 and the title message…", "refuses a field that is posted twice" | a blank title falls back to the stored one; the problems are not checked; 422; another message; a field posted twice takes its first value | PASS |
| AC13: minutes that are not a whole number from 1 to 1440 | `review-actions.test.ts` "answers minutes of "%s" with 400 and the minutes message…" (twelve values) | the shape check replaced by `Number.isInteger(Number(text))`, by `parseInt`; no range; the minutes problem not counted; another message | PASS |
| AC13: a priority or slot `src/ui.ts` does not have | `review-actions.test.ts` "answers %s of "%s" with 400 and the choice message…" (five rows) | a bad priority ignored; a bad slot ignored, or read as `No slot`; the choice problem not counted; another message | PASS |
| AC13: every draft is still a draft with its stored values | `expect(tasks()).toEqual(before)` in each test above, and "does not save a good card that stands beside a bad one" | the good cards are written before the page is answered (21 tests fail) | PASS |
| AC13: the messages in one `role="alert"`, in order | `review-actions.test.ts` "gives both messages, the title one first…", "gives all three messages in their order" | the minutes message first; all messages always; no `role`; one alert per message | PASS |
| AC13: the page again with the posted values in the cards | `review-actions.test.ts` "renders the cards with the posted values…", "shows the stored priority and slot of a card whose posted ones the page cannot show", "keeps the page in the layout…" | the cards built without the body; each of title, minutes, priority, slot not taken from the body, one at a time; a blank posted title replaced by the stored one | PASS |
| AC14: `Remove` deletes that draft; 303 to the review page | `review-actions.test.ts` "deletes that draft and answers 303 to the review page, which then has two cards", "leaves nothing to review when the last draft is removed" | nothing deleted; redirect to `/add`; the body not parsed | PASS |
| AC14: edits of the other cards that pass are stored, the others left; they stay `draft` | `review-actions.test.ts` "stores the edits made to the other cards, which stay drafts", "stores the good fields of another card and leaves its bad ones as stored", "does not check the fields of the card that is removed", "removes the draft of a post with no body and writes nothing else" | the edits are dropped; the others are set `pending`; a bad field stops the remove; the removed card is checked; a draft without an edit is written | PASS |
| AC14: a `taskId` that is not a draft of this source answers 404 and changes nothing | `review-actions.test.ts` "answers 404 for %s and changes nothing, not even the other cards" (six rows), "leaves the tasks of another status and of another source alone" | any task of the source can be removed; a draft of another source can; 303 in place of 404; the edits are stored before the 404; the id read with `parseInt` | PASS |
| AC15: `Discard` deletes every draft of the source; 303 to `/add` | `review-actions.test.ts` "deletes every draft of the source and nothing else…", "discards for a post with no body…" | nothing deleted; redirect to the review page | PASS |
| AC15: other statuses, the source row and the file stay | the same two, and "answers 303 to the Add page and changes nothing for a source without drafts" | every task of the source deleted; every draft of every source deleted; the source row deleted when it has no task left | PASS |
| AC12, AC14, AC15: each write of several rows is all or none (D4, D14) | `review-actions.test.ts` "confirms no draft when one of them cannot be written", "removes no draft and stores no edit when…", "discards no draft when one of them cannot be deleted" | the transaction is taken out of `confirmDrafts`, `removeDraft`, `discardDrafts`, one at a time | PASS |
| AC16: no drafts but other tasks: `N tasks saved`, `Add another`, no form | `review-page.test.ts` "says how many tasks are saved…", "says 1 task saved for one", "counts only the tasks of that source"; `review-actions.test.ts` "shows how many tasks are saved… where the confirm sends the browser" | always plural; every task of the database counted; the state never shown; another label; another `href`; the form shown without cards | PASS |
| AC16: no tasks at all: the empty state, `Nothing to review`, a link to `/add` | `review-page.test.ts` "renders the empty state for a source with no task at all" | the saved state shown for no task; another heading; no link; a link to `/`; no `<h1>` | PASS |
| AC16: a second confirm changes nothing and answers 303 | `review-actions.test.ts` "answers a second confirm with 303 and changes nothing" | the confirm reads every task of the source; a source without drafts answers 404 | PASS |
| AC17: `GET /review/…` with an id that is no source answers 404 with the not-found page | `review-page.test.ts` "answers %s with the not-found page" (seven addresses) | any run of digits is an id; the id read with `parseInt`, with `Number`; an unknown source answered with 200 | PASS |
| AC17: the same for every `POST` | `review-actions.test.ts` "answers %s with the not-found page and changes nothing" (ten addresses) | each of the four routes goes on without a source, one at a time; the id shape loosened | PASS |
| AC18: before a confirm no other page has a draft's title | `add-analysis.test.ts` "is on the review page of its source and on no other page" | a title written into `home.ejs`; `listDrafts` asks for `pending`, so the review page loses them | PASS |
| AC18: after a confirm `listTasks` returns them as `pending`, not as `draft` | `review-actions.test.ts` "lists the tasks as drafts before the confirm and as pending after it" | the confirm sets `draft`; the confirm sets `done` | PASS |
| AC19: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset | the commands under Test run, with `env -u ANTHROPIC_API_KEY` | not a test | PASS |
| AC19: stubbed analyzer, temporary folder, in-memory database, nothing in `data/` | `testing/app.test.ts` (the two added tests, and the unedited ones of 004); the `fetch` guard in the two files that build a real analyzer | as AC1 above | PASS |
| D4: the transaction helper | `db/transaction.test.ts`, four tests | no `ROLLBACK` (3 fail); the result dropped; the error swallowed; no `BEGIN` | PASS |

Two tests did not fail the first time I broke what they cover, and were changed until
they did:

- With `add-analyzing.js` listening on the first form only, nothing failed: the page
  after a 502 has the `Try again` form first, and no test submitted the upload form
  there. Added "shows the status for the upload form too when the page also has the Try
  again form".
- With `review.js` always changing the first card's input, nothing failed: the test
  clicked only the first card's buttons. "adds 5 with + and takes 5 off with −, on that
  card only" now also clicks the second and the third card.

Eight of my own mutations were written wrongly the first time. Four named a function
the file does not import, so the tests failed on a `ReferenceError` and not on the
behaviour. Three put the change where it broke nothing, or something else: an element
before the bar where I meant after it, a `parseInt` behind the shape check, a second
`<details>` where I meant the source moved. All seven were written again and run, and
the table holds the second runs. The eighth replaced `\d{1,4}` by `\d+`, which the
range check makes equal for every value a test can post; it is not in the table.

### Checked by hand

Without a key: `ANTHROPIC_API_KEY= PORT=3999 DATABASE_PATH=:memory: node src/server.ts`,
with `UPLOADS_DIR` in a scratch folder outside the repo. Port 3999 was free before and
after.

- The server printed `Task Image AI is running at http://localhost:3999`. `/`, `/add` and
  `/_styleguide` answered 200.
- `curl -F 'photo=@small.png;type=image/png' …/add/photo` answered 502. The answer held
  `<p class="notice notice--error" role="alert">The photo could not be analyzed.</p>`, a
  form with `method="post" action="/review/1/analyze"` and the button `Try again`.
- `POST /review/1/analyze` answered 502 again. `GET /review/1` answered 200 with
  `Nothing to review`.
- The server's stderr held, once per attempt,
  `The analysis of source 1 failed: AnalyzerKeyError: The analyzer has no API key.` and a
  stack.
- One file was in the scratch uploads folder. No `data` folder was made in the repo.

The page, in headless Chrome 154.0.8037.99 with a profile of its own, driven through its
debugging port, against the app on an in-memory database with four seeded sources of
three drafts each and a stub analyzer that answers after two seconds. The Chrome that
was already running on this machine was not touched; both processes I started were
stopped by their process ids, and ports 3998 and 9333 were free afterwards.

- **(a) Enter.** With the focus in the first title field, a real Enter key press posted
  `POST /review/2/confirm`, then `GET /review/2`, and the page read `3 tasks saved` with
  `Add another -> /add`. No card was removed. With another card's title emptied, Enter
  posted nothing (the browser stopped it), and a click on `Remove` of the first card
  posted `POST /review/3/remove/7`; the page then read `Review 2 tasks` with cards 8
  and 9.
- **(b) The stepper.** After load no `−` or `+` button was hidden and both were laid out.
  Real mouse clicks: `+` took 90 to 95, `−` twice to 85. The other cards stayed at 40 and
  15, and the address stayed `/review/1`.
- **(c) The bar.** At 375 by 812 the bar was `position: sticky` with `bottom: 64px`; its
  bottom edge was at 748, which is the top edge of the tab bar, so no card shows between
  them. Its background is the page's, and the card behind it is covered. Scrolled to the
  end, the bar sat at its own place under the last card (639 to 708), clear of the tab
  bar and the raised Add button. The page was 375 wide with no sideways scroll. At 1200
  by 700 the computed `bottom` was `0px` and the bar's bottom edge was at 700, the bottom
  of the window; scrolled to the end it sat under the last card.
- **(d) Both themes.** The eight screenshots (narrow and wide, top and end, light and
  dark) were looked at. In dark the bar, the fields, the chips and the `Low confidence`
  text in the `--high` color are readable; the checked radio keeps its dot.
- **The source.** A click on `Photo` opened the `<details>` and the 320px image was shown.
- **Discard.** A click posted `POST /review/4/discard`, then `GET /add`; `/review/4` then
  read `Nothing to review`.
- **"Analyzing...".** On `/add` the status was hidden on load. With a file chosen and
  `Upload photo` clicked, the page recorded half a second later: status shown, text
  `Analyzing...`, 107px high with three skeleton lines, `Upload photo` disabled, the
  file input and Retake not disabled, still on `/add`. The post went through with the
  button disabled: `POST /add/photo`, then `GET /review/5`, 2.2 s after the click, and
  the page read `Review 3 tasks`. After `history.back()` the Add page came back from the
  back-forward cache (`persisted: true`) with the status hidden and the button enabled.
- No exception was reported by the page in any of these.

## Test run

`yarn build`:

```
$ tsc --noEmit
Done in 0.98s.
```

`env -u ANTHROPIC_API_KEY yarn test`:

```
 Test Files  32 passed (32)
      Tests  1024 passed (1024)
   Start at  12:04:13
   Duration  1.48s (tests 48%, import 36%, transform 16%, worker 1%)

Done in 2.04s.
```

823 tests before this job, 201 added. After the run there was no `.env` and no `data`
folder in the repo, and nothing named `mtask-…` in the temporary folder.
`git diff --stat main -- <the design's Not touched list>` printed nothing.

```
VERIFICATION
Build: PASS
Tests: PASS   (1024 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

Diff: every file of commit `022a033` is in the design's Files list, except the new entry
under `docs/errors/`. `git diff main...HEAD` also shows `factory/backlog.md` and this
job's `spec.md`, `design.md` and `plan.md`; those came with the commits before mine.

## Not done

- **The check with a real key.** No `ANTHROPIC_API_KEY` was in the shell and there is no
  `.env`, so none was asked for or made. No request of this job reached the live API. A
  phone photo of a handwritten list turning into cards has not been seen; the analyzer
  in every check above was a stub, or the no-key one.
- **Other Node versions and other browsers.** The suite ran on Node 26.8.2 only. Enter
  in a title field was tried in Chrome only, not in Safari or Firefox.
- **The themes were looked at through `prefers-color-scheme`**, which Chrome was told to
  answer `light` or `dark`. The `data-theme` attribute the toggle sets was not used. Both
  select the same dark tokens (002's tests hold that), but the toggle itself was not
  pressed on this page.
- **Narrow pages and themes were not made as the error log entry says** (a wrapper page
  with an `<iframe width="375">`, saved HTML with `data-theme`). The debugging port was
  needed for the Enter key anyway, and it can set a real 375px viewport and the color
  scheme itself, so I used that. The measured width of the page was 375.
- **No screenshot of the "Analyzing..." state.** Chrome holds a screenshot command until
  the navigation is over, so the state was read by the page itself and reported as
  numbers. Logged in `docs/errors/`.
- **Step 3's check could not pass as written.** The plan adds, in step 3, the test that
  an upload calls the analyzer handed to `createTestApp`. No route called the analyzer
  until step 5, so the suite had that one failure (834 passed, 1 failed) after step 3
  and passed from step 5 on.

Done differently from the design, on purpose:

- **The alert of D15 is rendered only when there are errors.** The design shows the
  `<div role="alert">` without a condition around it. Without one, every review page
  would carry an empty alert.
- **One comment line in `review.ejs` above the form** says why the hidden first button
  is there. It is an EJS comment and adds nothing to the page; the form itself is the
  design's markup, character for character.
- **One comment in `base.css` outside D21**: the line above `.photo` named "the one just
  saved", which no page shows any more.
- **The review tests read siblings through `children`**, and count submits with a
  listener added by `window.eval`, so `jsdom.d.ts` gained only what D22 lists.
- **`review-actions.test.ts` fakes `Date`** (as the 003 tests do) and moves the clock on
  before each post. "Unchanged" then also catches a write that changed nothing but
  `updated_at`.
- **Tests beyond the plan**: the path handed to the analyzer for an `image_path` with
  `..` in it; the three all-or-none tests, which make the database refuse one write with
  a trigger; the retry without a key; a count of saved tasks that leaves out other
  sources; and more values in the `it.each` lists (`+30`, `1 5`, `0x1E`, an empty
  priority, `constructor` as a slot, `/review/01/confirm`, `/review/1.0/discard`, a task
  id of `02`).

Nothing in the spec was skipped.
