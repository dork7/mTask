# 007-voice-and-text: build

Branch `factory/007-voice-and-text`, code commit `4fba609`, and `7e7d9b1` for an error
log entry that was written after it. Built on Node v26.8.2 and yarn 1.22.22, the only
Node on this machine.

## What changed

Created:

| File | Why | Decision |
|---|---|---|
| `public/js/add-voice.js` | Shows the record button and runs the recognition when the window has the Web Speech API; hides the Voice tab and moves a page that opened on it to Type when it has not. The code is the design's, as written | D11, D12 |
| `src/add-tabs.test.ts` | The tab list, the panels and the two text forms as served, and the served elements of AC10 and AC14 | plan, AC1, AC2, AC10, AC14 |
| `src/add-text.test.ts` | A posted text from the first post to the confirmed task, for both routes | plan, AC3 to AC8 |
| `src/add-voice.test.ts` | What the voice script does with a stubbed recognition, and with none | plan, AC10 to AC14 |
| `docs/errors/test-data-with-its-own-space-hides-a-missing-separator.md` | A test that passed with the behaviour broken, and what fixed it | error log |
| `docs/errors/repeated-test-runs-run-out-of-ports.md` | Tests failing with `EADDRNOTAVAIL` when the files are run many times in a row | error log |

Changed:

| File | Why | Decision |
|---|---|---|
| `src/services/drafts.ts` | `analyzePhotoSource` is `analyzeSource`; `inputOf` hands a photo on as an image and a `voice` or `text` source as its transcript. Nothing below the `catch` changed | D8 |
| `src/routes/add.ts` | `AddTab`, `TABS`, `readTab`, `AddPage`, `AddAnswer`, `renderAdd` with the tab; `MAX_TEXT_LENGTH`, `readText`, the four messages; `postText` behind the simple form parser on `/add/voice` and `/add/text`; `answerAnalysis` takes the tab, the words and the text from the source | D1 to D3, D6, D7, D9 |
| `src/routes/review.ts` | The retry analyzes any source that has no task; the kind check of 006 is gone | D10 |
| `src/app.ts` | The doc comment of `AppDeps.analyze`. No code | Files |
| `src/views/pages/add.ejs` | Three tabs as links, three panels, the two text forms; the message, the `Try again` form and the "Analyzing..." status moved out of the Photo panel; the third script | D4, D5, D13 |
| `public/js/add-analyzing.js` | Two comments. No statement | D14 |
| `public/css/base.css` | The text form shares the three rules of the photo form; `.text-form__input`; `.btn[aria-pressed="true"]` | D15 |
| `src/testing/dom.ts`, `src/testing/jsdom.d.ts` | `stubSpeechRecognition`, `resultEvent` and their types; the two constructors on `DomWindow`; `addEventListener` on `DomElement` (see Not done) | D16 |
| `src/add-page.test.ts`, `src/add-photo.test.ts`, `src/add-analysis.test.ts`, `src/add-analyzing.test.ts` | The edits of the table in D17, the removed 006 test, and the AC9 tests | D10, D17 |

## Acceptance criteria

"Fails when" is the change I made to see the test fail; the file was restored after each.
There were 238 such changes, each followed by one run of the seven `src/add-*.test.ts`
files, and after each the named tests failed. Test files are under `src/`. `%s` in a test
name stands for each case of its `it.each`; "both routes" means the test runs once in the
describe of `/add/voice` and once in that of `/add/text`, and the break made it fail in
the ones named.

The first pass of these runs was not clean. In three of them hundreds of tests failed
that the break could not reach; the cause was the machine running out of ports
(`docs/errors/repeated-test-runs-run-out-of-ports.md`). All of them were run a second
time, paced, with every run that held such a failure thrown away and repeated. The
results below are those of the second pass, in which no run was thrown away.

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1: one tab list with exactly three tabs, `Photo`, `Voice`, `Type`, each a link to its address | `add-tabs.test.ts` "has one named tab list at %s, with the three tabs as links, in order" (four addresses) | a tab is a `<button>` (no `href`); Voice and Type swap places; the Type tab is left out; the list has no `aria-label`; a tab links to `/add?kind=` | PASS |
| AC1: the tabs work without any script | `add-tabs.test.ts` "works without a script: the address of each tab answers the page with that tab selected" | no `href`; `/add?kind=`; `GET /add` ignores the `tab` query | PASS |
| AC1: exactly one tab `aria-selected="true"`, the other two `"false"`, the one the query names | `add-tabs.test.ts` "selects exactly the tab %s names" | Photo is always the selected one; `aria-selected` is empty on a tab that is not selected; `GET /add` ignores the query; the page opens on Voice when no tab is named | PASS |
| AC1: `Photo` when `tab` is missing or any other value | `add-tabs.test.ts` "selects Photo at %s, which names no tab" (seven addresses) | the default is Voice; the value is lowercased; trimmed; the first of several is taken; `type` is read as the Type tab; `tab[]=voice` is read | PASS |
| AC1: the selected tab names its panel, which is shown; every other panel is `hidden` | `add-tabs.test.ts` "shows at %s the panel of the %s tab and hides the other two" | the conditions of the Voice and the Type panel are swapped; the Type panel is never hidden; the Photo panel is never hidden; every tab controls `panel-photo` | PASS |
| AC1 (D1): every tab is tied to its panel, no id twice, no `style` | `add-tabs.test.ts` "ties every tab to its panel at %s, with no id twice and no style" | every tab controls `panel-photo`; the Voice panel is labelled by the Photo tab; the two text boxes share one id; a panel has a `style` attribute | PASS |
| AC1 (D1): each form is in the panel of its own tab | `add-tabs.test.ts` "keeps each form in the panel of its own tab at %s" | the Voice and the Type form swap their actions; the Photo form is outside its panel | PASS |
| AC1: the 004 and 006 tests are changed; the Photo tab answers as before | `add-page.test.ts` "has one named tab list, in which Photo is the selected tab", "ties the tab to its panel, which holds the form" and the photo form tests through `photoFormOf`; `add-photo.test.ts` `expectRejected`; `add-analysis.test.ts` `expectNoTasksPage`, `expectFailedPage` | the page opens on Voice when no tab is named; the Photo form is outside its panel; a refused upload is answered with the Voice tab (the 18 tests that call `expectRejected`); a photo source is answered with the Voice tab | PASS |
| AC2: each panel's form is `method="post"` to its route and posts without a script | `add-tabs.test.ts` "posts to its route as a plain form at %s, with no script in the way" (both routes) | both forms are `method="get"`; the Voice form posts as multipart; the Type form has an `onsubmit`; the Voice form is not marked `data-analyze-form` | PASS |
| AC2: one labelled `<textarea name="text">`, `required`, `maxlength="5000"`, empty on a plain `GET` | `add-tabs.test.ts` "has one control at %s, an empty required text box of 5000 characters", "labels the text box", "gives the two text boxes different ids" | the boxes are named `task`; not required; `maxlength` 4000; no `maxlength`; a default text is served; an `<input>` is added; the label points at another id; the label is empty; the two boxes share an id; the box starts on a new line, so its text starts with white space | PASS |
| AC2: a submit button `Find tasks` | `add-tabs.test.ts` "has one submit button at %s, Find tasks" (both routes) | the buttons read `Send`; `Find tasks` is `type="button"`; the record button is `type="submit"` | PASS |
| AC2: every button on the page has `btn` | `add-tabs.test.ts` "gives every button of the page at %s the btn class"; `add-text.test.ts` "all have the btn class on the %i answer" (400, 413, 200, 502, both routes) | a bare `<button>` is in the Voice form | PASS |
| AC2 (D15): the four `text-form` classes are used and styled | `add-page.test.ts` "uses the class %s in the page and styles it in the stylesheet" | the `.text-form__input` rule is removed; `.text-form`, `.text-form__label` and `.text-form__actions` are taken out of the shared rules | PASS |
| AC3: exactly one source, the kind of the route, the trimmed text, `image_path` unset; 303 with `Location: /review/<id>` | `add-text.test.ts` "answers 303 to the review page of the one new source, which holds the trimmed text" (both routes) | the kind is always `text`; always `voice`; the text is not trimmed; two sources are made; the redirect is 302; it goes to `/add` | PASS |
| AC3: the analyzer is called once with that transcript as a text input, after the source is stored | `add-text.test.ts` "calls the analyzer once, with the transcript as a text, after the source is stored" | the analyzer runs before the source is stored; it is handed the transcript in upper case; an image input; nothing at all (the 006 behaviour, `'failed'`); it is called twice | PASS |
| AC3: each task is a draft under the source with the columns of 006 AC2 | `add-text.test.ts` "stores each task as a draft of the source, in the order of the result", "stores one draft for a result of one task", "leaves every other column of a draft unset" | stored as `pending`; no `source_id`; no `priority`; `''` stored as `null`; the confidence rounded; reverse order; only the first task; a draft gets a time slot | PASS |
| AC3: no part of a list is stored (design, Risks) | `add-text.test.ts` "answers 500 and stores no part of a list whose second task the table refuses" (both routes) | the transaction is taken out | PASS |
| AC3 (D6): a line break is stored once, as `\n`, and handed on the same | `add-text.test.ts` "stores a line break once, as the browser counts it, and hands the analyzer the same text" | `\r\n` is not replaced | PASS |
| AC3 (D6): inner white space is kept | `add-text.test.ts` "keeps the white space inside the text as it was posted" | runs of spaces are collapsed | PASS |
| AC3 (D7): a database error answers 500 | `add-text.test.ts` "answers 500 and does not call the analyzer when the source cannot be written" | the error is answered as a failed analysis (502); the analyzer runs before the source is stored | PASS |
| AC4: no `text`, a blank one, or more than one answers 400 with `Describe what you need to do first.` | `add-text.test.ts` "refuses %s with 400 and the tab of the route" (seven bodies, both routes) | the first of two values is taken; a blank text is stored; white space is not blank; a missing field is read as the string `undefined`; a JSON body is parsed too; the status is 422; the message is another one | PASS |
| AC4: the Add page with the route's tab selected, the message in `role="alert"`, the tab's form and no other | the same tests, through `expectRefused` | the 400 page opens on Photo; on Type for both routes; the message is a `role="status"`; the message sits inside the Photo panel | PASS |
| AC4: longer than 5000 after trimming answers 413 with its message, and the textarea holds the posted text | `add-text.test.ts` "refuses 5001 characters with 413 and gives the text back in the box of its tab only", "refuses 5001 characters between spaces with 413, and the box holds the 5001" | the status is 400; the message is another one; the text is not given back; the page opens on Photo; the text is put into both boxes; 5001 characters are accepted; the limit is 6000 | PASS |
| AC4: exactly 5000 is accepted | `add-text.test.ts` "accepts exactly 5000 characters" | `>=` in place of `>` | PASS |
| AC4: the length is that of the trimmed text | `add-text.test.ts` "measures the text after it is trimmed: 5000 characters between spaces and a line break are accepted" | the length is measured before trimming | PASS |
| AC4 (D6): a line break counts once | `add-text.test.ts` "counts a line break once, as the browser does: 5000 characters with line breaks are accepted" | `\r\n` is not replaced | PASS |
| AC4: no source is created and the analyzer is not called | `expectRefused` in all of the above | a too long text is stored before it is refused; the analyzer is called for a too long text; for a missing text | PASS |
| AC5: no task stored; 200, the route's tab, `No tasks were found in that text.` in `role="status"`, the tab's form with the transcript | `add-text.test.ts` "answers 200 with the Add page, the tab of the route, the message as a status and the text in its box", "stores no task, keeps the source and calls the analyzer once" (both routes) | the photo's message; another wording; 404; the page opens on Photo; on Type for every source; the text is not given back; the message is an alert; an empty list is answered as drafts | PASS |
| AC5 (D5): the transcript is escaped | `add-text.test.ts` "gives a text that looks like markup back as the value of the box, and runs none of it" (both routes) | the text is written with `<%-` | PASS |
| AC5: a photo keeps its own message | `add-analysis.test.ts` "answers 200 with the Add page, the message as a status, and the upload form" | the text message is used for a photo too | PASS |
| AC6: `fallback: true` stores no task and keeps the source; 502, the route's tab, the alert, the `Try again` form to `/review/<id>/analyze`, the tab's form with the transcript | `add-text.test.ts` "answers a fallback result with 502, the alert, the Try again form and the text in its box" (both routes) | the fallback task is saved; 500; the photo's message; the page opens on Photo; no `Try again` form; it posts to `/add`; it is `method="get"`; the button reads `Retry`; it is `type="button"`; the text is not given back; the `Try again` form sits inside the Photo panel; a fallback is logged; the source is deleted | PASS |
| AC6: the same when the analyzer rejects, or throws | `add-text.test.ts` "answers an analyzer that rejects the same way, and writes the reason to stderr", "answers an analyzer that throws before it returns a promise the same way" | the rejection is thrown on; nothing is written to stderr | PASS |
| AC6, AC15: without a key the answer is the same and nothing is sent | `add-text.test.ts` "answers a text with the error state, keeps the source, stores no task and makes no request" (both routes) | the rejection is thrown on; nothing is written to stderr | PASS |
| AC6: a photo keeps its own message | `add-analysis.test.ts` "answers a fallback result with 502, the alert, the Try again form and the upload form" | the text message is used for a photo too | PASS |
| AC7: the retry of a `voice` or `text` source without tasks calls the analyzer once with the stored transcript and answers as AC3 | `add-text.test.ts` "analyzes the stored transcript once and answers 303 to the review page, with the drafts stored" (both kinds) | the kind check of 006 is left in; the retry only redirects; the transcript is handed on in upper case; the retry stores a second source | PASS |
| AC7: as AC5 or AC6 would, with the tab of the source's kind | `add-text.test.ts` "answers 200 with the no-tasks status, the tab of the source and its text when nothing is found", "answers 502 with the retry form again when the result is the fallback again", "answers 502 with the retry form again when the analyzer rejects" | the kind check of 006; a voice source is answered with the Type tab; the retry stores a second source | PASS |
| AC7: no second source | the three tests above and the first, which compare all of `sources()` | the retry stores a second source | PASS |
| AC7 (D8): two requests on one source store one set | `add-text.test.ts` "stores nothing more when another request stored a task for the source while this one waited" (both kinds) | the check inside the transaction is taken out | PASS |
| AC7: a source that has a task of any status is not analyzed; 303 to `/review/<id>` | `add-text.test.ts` "does not call the analyzer for a source whose only task is %s, and answers 303" (`draft`, `done`, both kinds) | the task check is taken out; only drafts are counted; the redirect goes to `/add` | PASS |
| AC7: a photo source is answered as in 006, with the Photo tab | `add-analysis.test.ts` "answers 200 with the no-tasks status when nothing is found this time either", "answers 502 with the retry form again when the result is the fallback again", and the upload tests of AC3 and AC4 there | a photo source is answered with the Voice tab | PASS |
| AC8: one card per draft, the transcript as text in `<details>`, no `<img>` | `add-text.test.ts` "are one card each on the review page, under the transcript as text, with no image" (both routes) | the transcript is not printed; a `voice` source is shown as a photo; only the first draft is shown | PASS |
| AC8: a confirm makes them `pending` | `add-text.test.ts` "become pending tasks when the form is confirmed" | a confirm makes them `done` | PASS |
| AC8: remove | `add-text.test.ts` "lose the one that is removed, and the other stays a draft" | Remove deletes nothing | PASS |
| AC8: discard | `add-text.test.ts` "are all deleted on Discard, which leads to the Add page and keeps the source" | Discard leads to `/`; Discard deletes the source too | PASS |
| AC8 (plan): a draft is on no other page before the confirm | `add-text.test.ts` "are not on %s before they are confirmed" (`/`, `/add?tab=voice`) | a title is written into the home page; the Add page serves `Buy milk` in an empty text box | PASS |
| AC9: the status is in the page whichever tab is selected, hidden on load, outside the panels | `add-analyzing.test.ts` "is a hidden status outside the tab panels with the %s tab selected", "is there, hidden, on the page that refuses a post with no text", "…that answers a text with no task", "…that answers a text that could not be analyzed" | the status is inside the Photo panel, as in 006; it is served shown; it has no `role` | PASS |
| AC9: submitting the Voice or the Type form shows it and disables the submit buttons, without stopping the submit | `add-analyzing.test.ts` "shows the status and disables every submit button when the form of the %s tab is submitted, without stopping it" | the status is inside the Photo panel; the Voice form, or the Type form, is not marked `data-analyze-form`; the script calls `preventDefault`; it does not show the status; it disables no button; it disables the buttons of the photo form only | PASS |
| AC9: the same for a `Try again` form, and reset when the page is shown again | `add-analyzing.test.ts` "shows the status and disables Try again and both Find tasks when the Try again form of a text is submitted" | the form is not marked; `preventDefault`; the photo form's buttons only; `pageshow` resets nothing | PASS |
| AC9: the textareas are not disabled | `add-analyzing.test.ts` "leaves the text boxes and the record button enabled when the form of the %s tab is submitted, so the text is still posted" | the script disables every button and text box of the forms | PASS |
| AC9: nothing else shows it | `add-analyzing.test.ts` "changes nothing when the scripts load with the %s tab selected", "is not shown by typing in a text box or by a click on the record button" | the status is shown on load; on `input`; on `click` | PASS |
| AC9: the request is answered only when the analysis is done | `add-analyzing.test.ts` "the request behind the Analyzing state of a text (007 AC9) > is answered only when the analyzer is done" | the route redirects before the analysis | PASS |
| AC10: a button `Start recording`, `type="button"`, `aria-pressed="false"`, hidden in the served page, in the Voice form | `add-tabs.test.ts` "is at %s a hidden button of the Voice form that does not post" | served without `hidden`; `type="submit"`; no `aria-pressed`; it reads `Record`; it is outside the Voice form | PASS |
| AC10: the script shows it when the window has `SpeechRecognition`, or `webkitSpeechRecognition` when only that is there | `add-voice.test.ts` "is shown when the window has only %s, and nothing is recorded yet", "records with webkitSpeechRecognition when the window has only that", "records with SpeechRecognition, not the other one, when the window has both" | the script knows `SpeechRecognition` only; `webkitSpeechRecognition` only; it prefers the `webkit` one; it does not show the button; a recognition is made on load | PASS |
| AC10: with neither the button stays hidden | `add-voice.test.ts` "stays hidden when the window has neither" | the script shows it before it looks for a constructor; the button is served shown | PASS |
| AC10: loading raises no script error with either, or with neither | `add-voice.test.ts` "the scripts of %s > load without an error in a window with %s" (three addresses, three windows), and the `afterEach` of the file | the script throws on load in a window with neither; in a window with a constructor | PASS |
| AC10: the script is linked, deferred and served | `add-voice.test.ts` "comes with its script, deferred, which the app serves as JavaScript"; `add-page.test.ts` "links to three scripts, each deferred, which the app serves as JavaScript" | the tag is removed; it has no `defer` | PASS |
| AC11: a click makes one recognition, sets `continuous` and `interimResults` to `true`, calls `start()`; the button reads `Stop recording` with `aria-pressed="true"`; the textarea stays editable | `add-voice.test.ts` "starts one continuous recognition with interim results on a click, and the button says so" | `continuous` is not set; it is set to `1`; `interimResults` is `false`; `start()` is not called; it is called twice; the label does not change; `aria-pressed` does not change; the box is read-only while recording; the click submits the form | PASS |
| AC11: on each `result` the box holds the earlier text, then the first alternative of every result, final or not (the spec's example) | `add-voice.test.ts` "writes the first alternative of every result, final or not, after the text that was there" | results that are not final are skipped; only the result at `resultIndex` is read; the second alternative is read; the last alternative; the earlier text is replaced; no space between the two; the white space is not collapsed; `result` is not listened for | PASS |
| AC11: no space in front when there was no earlier text | `add-voice.test.ts` "puts no space in front of the transcript when the box was empty" | a space is always put in front | PASS |
| AC11: an event replaces what the last one wrote | `add-voice.test.ts` "replaces what the last event wrote, so the text never doubles" | each event adds to what the last one wrote; results that are not final are skipped | PASS |
| AC11 (D11): the transcripts are joined with one space | `add-voice.test.ts` "joins two results with a space when neither brings one, as an engine other than Chrome may" | `join('')` | PASS |
| AC11: their white space is collapsed to single spaces and trimmed | `add-voice.test.ts` "collapses the white space of the transcript to single spaces and trims it" | no collapse; no trim | PASS |
| AC11 (D11): the earlier text is kept exactly | `add-voice.test.ts` "keeps the earlier text exactly, its line breaks included" | the white space of the earlier text is collapsed when the recording begins; when the text is written | PASS |
| AC11 (D11): a blank event leaves the earlier text, with no space | `add-voice.test.ts` "leaves the box at the earlier text, with no space added, on an event with %s" (no result, a blank transcript) | a blank event adds a space; it leaves what the last event wrote | PASS |
| AC12: a click on `Stop recording` calls `stop()`; the button changes on `end`, and the text is kept | `add-voice.test.ts` "stops the recognition on a click, and resets the button only when it has ended" | the click starts another recording; it does nothing; the button is reset on the click; `stop()` is never called; `end` does not reset the button; `end` empties the box; `end` puts the earlier text back; `end` shows the error message | PASS |
| AC12: `end`, whoever ended it | `add-voice.test.ts` "resets the button when the browser ends the recognition by itself" | `end` does not reset the button; `end` empties the box; `end` shows the error message | PASS |
| AC12: a second recording adds to the text and does not replace it | `add-voice.test.ts` "adds a second recording to the text as it is then, edits included" | the start text of the first recording is reused; the second recording starts from an empty text; one recognition is reused for every recording | PASS |
| AC12 (D11): an event of a recognition that is no longer the current one is ignored | `add-voice.test.ts` "ignores a late event of a recognition that is no longer the current one" | a late `end` resets the button; a late `result` is written | PASS |
| AC12 (D11): a submit of the Voice form stops a running recording and is not stopped itself | `add-voice.test.ts` "stops a running recording when the Voice form is submitted, without stopping the submit", "calls nothing when the Voice form is submitted while nothing is recorded" | the submit does not stop the recording; the submit is prevented while recording; `stop()` is called with nothing recording; a submit starts a recording | PASS |
| AC13 (D13): the message is served as a hidden `role="alert"` in the Voice panel | `add-voice.test.ts` "has its message at %s as a hidden alert in the Voice panel" | served shown; `role="status"`; another wording; it is in the Type panel | PASS |
| AC13: on `error`, whatever its kind, the button returns to `Start recording`, the text is kept and the message is shown | `add-voice.test.ts` "resets the button, keeps the text and shows the one message on the error %s" (five kinds) | an error does not show the message; it does not reset the button; only `not-allowed` shows it; `aborted` and `no-speech` are not treated as errors; an error puts the earlier text back | PASS |
| AC13 (D11): `error` followed by `end` | `add-voice.test.ts` "shows the message once when the error is followed by the end, as Chrome fires them" | the `end` after an error hides the message again; an error does not show it | PASS |
| AC13 (D11): a `start()` that throws is an error, and no script error | `add-voice.test.ts` "treats a start that throws as an error, and raises no script error" | the throw is not caught; the button is left at `Stop recording`; no message is shown | PASS |
| AC13 (D11): the next recording hides the message | `add-voice.test.ts` "hides the message and records again on the next click" | the message is not hidden; the button is disabled after an error | PASS |
| AC14 (D13): the message is served as a hidden `role="status"` in the Type panel | `add-tabs.test.ts` "is at %s a hidden status in the Type panel" | served shown; `role="alert"`; another wording; it is in the Voice panel | PASS |
| AC14: with neither constructor and Voice selected, the script hides the Voice tab, selects Type, shows the Type panel, hides the Voice panel and shows the message | `add-voice.test.ts` "moves a page that opened on the Voice tab to the Type tab, and says why" | the Voice tab is not hidden; the page is not moved; Voice stays selected; Type is not selected; the Voice panel stays shown; the Type panel stays hidden; the status is not shown; Photo is selected in place of Type; the message is an alert; it is in the Voice panel | PASS |
| AC14: with Photo or Type selected, nothing but the Voice tab changes | `add-voice.test.ts` "only hides the Voice tab at %s" (`/add`, `/add?tab=text`) | the Voice tab is not hidden; every page is moved to Type; the status is shown whatever was selected | PASS |
| AC14: with a constructor nothing of this happens | `add-voice.test.ts` "leaves the Voice tab as it was served in a browser that has voice input" | the Voice tab is hidden with the API too; the page is moved with the API too | PASS |
| AC14 (D4, D12): the text and the messages go along to the Type tab | `add-voice.test.ts` "takes the text and the message of a failed analysis along to the Type tab", "keeps a text the Type box already holds when the scripts run" | the text is not copied; it replaces what the Type box holds; the message of the post sits inside the Photo panel; the `Try again` form sits inside the Photo panel | PASS |
| AC14: without loading another page | `add-voice.test.ts` "loads no page, sends nothing and stops no submit: the script has none of those calls" | the script sets `location.search`; the submit listener calls `preventDefault` | PASS |
| AC15: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset | the two commands under Test run | not broken: it is the run itself | PASS |
| AC15: stubbed analyzer, stubbed recognition, temporary or in-memory database; nothing reaches the network, a microphone or `data/` | every new test builds its app through `createTestApp` only; the no-key describe of `add-text.test.ts` holds `fetch` to zero calls in its `afterEach`; the "neither" tests of AC10 and AC14 pass on jsdom as it comes | the rows of AC6 and AC10 above | PASS |

Two existing tests were not broken by me, because this job did not change what they
cover: the not-found page of `POST /review/999/analyze` in `src/review-actions.test.ts`
(unedited), and the 006 test "comes with its script, deferred, which the app serves as
JavaScript" for `add-analyzing.js`.

### Checked by hand

Without a key, the real server on port 3917 (free before, checked with `lsof`), started
with `ANTHROPIC_API_KEY= PORT=3917 DATABASE_PATH=:memory:` and `UPLOADS_DIR` in a
temporary folder outside the repo, and stopped afterwards:

- `curl -i -d 'text=buy milk' http://localhost:3917/add/text` answered
  `HTTP/1.1 502 Bad Gateway`. The page had the Type tab with `aria-selected="true"`,
  `<p class="notice notice--error" role="alert">The text could not be analyzed.</p>`, a
  form `method="post" action="/review/1/analyze"` with the button `Try again`, `buy milk`
  in the textarea `type-text`, and an empty `voice-text`.
- The server's stderr had
  `The analysis of source 1 failed: AnalyzerKeyError: The analyzer has no API key.`
- `curl -i -d 'text=' http://localhost:3917/add/voice` answered `HTTP/1.1 400 Bad Request`
  with the Voice tab selected and `Describe what you need to do first.` in the alert.

The page, in headless Chrome 154.0.8037.99 with a profile of its own, driven through its
debugging port, against the app built by a short script outside the repo that calls
`createApp` with an in-memory database and a stub analyzer that answers two tasks after
two seconds. Both processes were mine and were stopped; the ports 3918 and 9333 were free
before and after. No script exception was reported on any of the pages.

- (a) `/add?tab=voice`: the Voice tab selected, `panel-voice` the one shown panel, the
  button `Start recording` with `aria-pressed="false"`, shown. The window had both
  `SpeechRecognition` and `webkitSpeechRecognition`. I put `call mum` into the box and
  clicked: `Stop recording`, `aria-pressed="true"`. Two and a half seconds later, with no
  microphone permission: `Start recording`, `"false"`, the alert
  `Voice input stopped working. Try again, or type your tasks here.` above the form, and
  `call mum` still in the box. Seen in a screenshot as well.
- (b) With both constructors deleted before the page's scripts ran
  (`Page.addScriptToEvaluateOnNewDocument`): `/add?tab=voice` ended with the Voice tab
  hidden and `aria-selected="false"`, Type `"true"`, `panel-text` the one shown panel and
  the status `Voice input is not available in this browser. Type your tasks instead.`
  `/add` ended with Photo selected, `panel-photo` shown, the Voice tab hidden and no
  status.
- (c) From `/add`, a click on Voice loaded `/add?tab=voice` with Voice selected and
  `panel-voice` shown; a click on Type loaded `/add?tab=text` with Type and `panel-text`;
  a click on Photo loaded `/add?tab=photo` with Photo and `panel-photo`.
- (d) On `/add?tab=text` with `buy milk and finish the login bug` in the box, a click on
  `Find tasks`. The page recorded its own state 503 ms after the submit, as
  `docs/errors/chrome-debugging-port-holds-commands-until-navigation-ends.md` says: still
  on `/add?tab=text`, the status not hidden and reading `Analyzing...`, `Upload photo` and
  both `Find tasks` disabled, neither textarea disabled. The answer came 2236 ms after the
  submit: `/review/1`, `Review 2 tasks`, the titles `Buy milk` and `Finish login bug fix`,
  and the transcript in the `<details>`.
- (e) The three tabs at 375 by 812 and at 1200 by 900, each in the light and the dark
  color scheme, set through the debugging port (`Emulation.setDeviceMetricsOverride`,
  `Emulation.setEmulatedMedia`): on all twelve pages `scrollWidth` equalled `clientWidth`
  (375, 1200), the three tabs stood in one row, and the text box was 343px wide at 375
  and 686px at 1200. The background was white or `rgb(238, 240, 244)` in light and
  `rgb(23, 26, 33)` or `rgb(12, 14, 18)` in dark. I looked at the screenshots of Voice at
  375 dark and of Type at 1200 light: the selected tab in the accent color, the box at
  full width, `Start recording` beside `Find tasks`, nothing cut off.

## Test run

`yarn build`:

```
yarn run v1.22.22
$ tsc --noEmit
Done in 1.78s.
```

`env -u ANTHROPIC_API_KEY yarn test`, the whole suite, once (1024 tests before this job):

```
 RUN  v5.0.1 /Users/dork/repos/mTask


 Test Files  35 passed (35)
      Tests  1235 passed (1235)
   Start at  13:39:36
   Duration  1.66s (tests 54%, import 34%, transform 11%)

Done in 2.24s.
```

After the run: `git status --short` was empty; there is no `.env`;
`ls "$(node -p 'os.tmpdir()')" | grep '^mtask-'` printed nothing; the `git diff --stat main --`
over the design's Not touched list (plan, step 6) printed nothing.

```
VERIFICATION
Build: PASS
Tests: PASS   (1235 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

No test was skipped. The diff against `main` holds the files of the design's Files list,
the two entries under `docs/errors/`, and the spec, the design, the plan and the backlog
line, which earlier commits of this branch brought.

## Not done

- **The check with a microphone and a real key was not done.** There is no person to
  speak here, headless Chrome has no microphone permission, and no key is in the shell or
  in a `.env`. No real `result` event was seen and no request reached the live API. What
  a real recognition hands out with `continuous` is known only from the stub and from the
  `error` and `end` events of (a).
- **Safari, Firefox and a phone were not tried**, and nothing ran on Node 22 or 24.
- **`data/app.db` is in the repo folder**, although plan step 6 expects no `data` folder.
  It is ignored by git and dated 12:47:53, before this build began; its date and size
  were the same after every test run and by-hand check. A `node src/server.ts` that was
  started at that same second listens on port 3000 with the default database path, and
  is where the file comes from. I started neither and left both: that process is still
  running. The servers and the Chrome of the by-hand checks were mine and are stopped.
- **`DomElement` got `addEventListener` in `src/testing/jsdom.d.ts`**, which D16 does not
  list. The plan's AC11 test puts a `submit` listener on the form, and the typing had no
  way to say so.
- **`openWithScripts` in `src/add-analyzing.test.ts` got an optional second parameter**
  for the speech stub, which D17 does not list. The plan's AC9 test of the Voice form
  needs a window with a constructor.
- **One test more than the plan lists, and one assertion more in two.** The plan's white
  space case of AC11 did not fail with the results joined by nothing
  (`docs/errors/test-data-with-its-own-space-hides-a-missing-separator.md`); it stays,
  under the name "collapses the white space…", and "joins two results with a space when
  neither brings one" was added. The two AC12 tests of `end` also assert that no alert is
  shown: without that, an `end` that shows the error message would pass.
- **The AC9 tests of step 4 were written after the helpers of step 5**, because one of
  them needs `stubSpeechRecognition`. The check of each step was run and passed.
- **The second commit of code, `7e7d9b1`, holds only an error log entry.** The error was
  found after the code commit, while the results of the breaks were read again.
- Nothing in the spec was skipped.
