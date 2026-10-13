# 007-voice-and-text: Voice and Type tabs on the Add screen

## Goal

A task can be spoken or typed as well as photographed (`docs/plan.md`, task 6 and the
Voice and Type tabs of U3). This job gives `/add` its other two tabs. On the Voice tab a
record button transcribes speech in the browser with the Web Speech API into a text the
user can correct before sending. The Type tab is a plain text box, and it is what a
browser without that API gets in place of the Voice tab. Either text is stored as a
source, analyzed, and reviewed on `/review/:sourceId` exactly as a photo is.

`/add` has one tab, Photo, from 004, and its "Analyzing..." and retry states from 006.
`sources` already takes the kinds `voice` and `text` with a `transcript` (003), the
analyzer already takes a text input (005), and the review page already shows a transcript
(006, AC7), so no migration and no new page are needed. What 006 does for a photo source
in `src/services/drafts.ts` and `POST /review/:sourceId/analyze` is widened to the two
text kinds. `docs/mockUps.html` has no Add screen. The plan names no route, field, limit
or message for this job: those below are this spec's choices.

## Acceptance criteria

- **AC1**: `GET /add` has one tab list with exactly three tabs, in the order `Photo`,
  `Voice`, `Type`. Each is a link, to `/add?tab=photo`, `/add?tab=voice` and
  `/add?tab=text`, so the tabs work without any script. Exactly one tab has
  `aria-selected="true"` and the other two `aria-selected="false"`: the one the `tab`
  query names, and `Photo` when `tab` is missing or is any other value. The selected tab
  names its panel with `aria-controls`, and that panel is shown; any other tab panel in
  the page carries `hidden`. The 004 and 006 tests that expect one tab or one form on the
  page are changed; the Photo tab itself answers as before.
- **AC2**: The Voice panel holds a form with `method="post"` and `action="/add/voice"`,
  and the Type panel one with `method="post"` and `action="/add/text"`. Each has one
  labelled `<textarea name="text">` with `required` and `maxlength="5000"`, empty on a
  plain `GET`, and a submit button `Find tasks`. Both forms post without any script.
  Every button on the page carries the `btn` class.
- **AC3**: `POST /add/voice` and `POST /add/text` with a form-encoded `text` that is not
  blank and, trimmed, no longer than 5000 characters create exactly one source: `kind`
  `voice` for the first route and `text` for the second, `transcript` the trimmed text,
  `image_path` unset. The analyzer is then called once with that transcript as a text
  input. When the result has `fallback: false` and one or more tasks, each is stored as a
  draft under the source with the columns 006 AC2 gives a photo's drafts, and the
  response is 303 with `Location: /review/<source id>`.
- **AC4**: A post to either route with no `text` field, a blank one, or more than one
  answers 400 with the message `Describe what you need to do first.` A `text` that is
  longer than 5000 characters after trimming answers 413 with the message
  `That text is longer than 5000 characters. Shorten it.`, and the textarea holds the
  posted text; one of exactly 5000 is accepted. Both render the Add page with the
  route's tab selected (`Voice` for `/add/voice`, `Type` for `/add/text`), the message in
  an element with `role="alert"` and the tab's form. No source is created and the
  analyzer is not called.
- **AC5**: When the result has `fallback: false` and no tasks, no task is stored and the
  response is 200 with the Add page, the route's tab selected, the message
  `No tasks were found in that text.` in an element with `role="status"`, and the tab's
  form with the transcript in its textarea.
- **AC6**: When the result has `fallback: true`, or the analyzer rejects, no task is
  stored and the source is kept. The response is 502 with the Add page, the route's tab
  selected, the message `The text could not be analyzed.` in an element with
  `role="alert"`, a form with `method="post"` and `action="/review/<source id>/analyze"`
  whose submit button is `Try again`, and the tab's form with the transcript in its
  textarea.
- **AC7**: `POST /review/:sourceId/analyze` on a `voice` or `text` source with no tasks
  calls the analyzer once with the stored transcript as a text input and answers as AC3,
  AC5 or AC6 would, with the tab of the source's kind selected and without creating a
  second source. On one that already has a task of any status it does not call the
  analyzer and answers 303 to `/review/<source id>`. A photo source is answered as in
  006, with the Photo tab selected.
- **AC8**: After AC3, `GET /review/<source id>` shows one card per draft and the
  transcript as text in the `<details>` element, with no `<img>`. Confirm, remove and
  discard act on these drafts as 006 AC12 to AC15 say, and after a confirm
  `listTasks(db, { status: 'pending' })` returns them.
- **AC9**: The `Analyzing...` status of 006 AC6 is in the page whichever tab is selected,
  hidden when the page loads. When the Voice form, the Type form or a `Try again` form is
  submitted, the page's script shows it and disables the submit buttons, without stopping
  the submit. The textareas are not disabled.
- **AC10**: The Voice form has a button `Start recording` with `type="button"` and
  `aria-pressed="false"`, hidden in the served page. With the Voice tab selected, the
  page's script shows it when the window has `SpeechRecognition`, or
  `webkitSpeechRecognition` when only that is there. Loading the page raises no script
  error with either, or with neither.
- **AC11**: A click on `Start recording` makes one recognition from that constructor,
  sets `continuous` and `interimResults` to `true` on it and calls its `start()`. The
  button then reads `Stop recording` with `aria-pressed="true"`. On each `result` event
  the Voice textarea holds the text it had when the recording began, then the transcript
  of the first alternative of every result of the event, final or not, in order: the
  transcripts are joined, their whitespace collapsed to single spaces and trimmed, and
  one space separates them from the earlier text when there is some. A textarea holding
  `call mum` and an event with the results `buy milk` and ` and finish the login bug`
  give `call mum buy milk and finish the login bug`. The textarea stays editable.
- **AC12**: A click on `Stop recording` calls the recognition's `stop()`. When the
  recognition fires `end`, whoever ended it, the button reads `Start recording` with
  `aria-pressed="false"` again and the textarea keeps its text. A second recording adds
  to that text as AC11 says and does not replace it.
- **AC13**: When the recognition fires `error`, whatever its kind, the button returns to
  `Start recording`, the textarea keeps its text, and the page shows
  `Voice input stopped working. Try again, or type your tasks here.` in an element with
  `role="alert"`. One message for every error is the simplest reading; the script does
  not tell a blocked microphone from silence.
- **AC14**: When the window has neither constructor, the page's script hides the Voice
  tab. If the Voice tab was the selected one, as on `GET /add?tab=voice`, the script,
  without loading another page, selects the Type tab (`aria-selected="true"`, and
  `"false"` on Voice), shows the Type panel, hides the Voice panel, and shows
  `Voice input is not available in this browser. Type your tasks instead.` in an element
  with `role="status"` that is hidden in the served page. This is how the backlog's
  "shown automatically when the API is missing" is read. With the Photo or the Type tab
  selected, nothing but the Voice tab changes.
- **AC15**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. The new
  tests use a stubbed analyzer, a stubbed recognition constructor placed on the test
  window, and a temporary or in-memory database. None reaches the network or a
  microphone, and none leaves anything in `data/`.

## Out of scope

- Recording or uploading audio, and transcription on the server. Speech is turned into
  text by the browser only; the server receives text.
- Choosing the recognition language. The script leaves it at the browser's default.
- Switching tabs without a page load, and keeping a chosen photo or a typed text when the
  user moves to another tab. Each tab is a link (AC1); a script that also switches in
  place is the architect's choice.
- The quick-add buttons for camera, voice and text on the Today page (014). They can link
  to the addresses of AC1.
- Choosing a priority and a slot from the category (008), scheduling on confirm and the
  landing preview (009). A text draft gets the analyzer's `urgency` as its priority and
  no slot, as a photo draft does. The backlog's open decision 3 is not needed here and is
  not taken.
- Deleting a text source that ends with no tasks, rate limiting on the AI endpoints, and
  a styled page for a body the form parser itself refuses for its size (023).
- Accounts. The backlog's open decision 4 is taken at its default, one user and no login.
- Checked by hand: on a phone or in Chrome or Safari, with a real key, tapping
  `Start recording` asks for the microphone, the transcript appears while speaking, and
  saying "buy milk and finish the login bug" gives two drafts on the review page. In a
  browser without the Web Speech API, opening the Voice tab lands on Type.
