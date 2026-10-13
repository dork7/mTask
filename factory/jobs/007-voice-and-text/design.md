# 007-voice-and-text: design

The spec can be built as written. Ten points in it can be read two ways, or are left to
the architect. Each is settled under Decisions:

- AC3 and AC4, "trimmed" and "longer than 5000 characters": a line break counts as one
  character, as the browser's `maxlength` counts it, although the browser posts it as
  two. The stored transcript has `\n` line breaks (D6).
- AC4, "the textarea holds the posted text": the text as it was measured, which is the
  posted text with its line breaks as `\n` and its ends trimmed (D6).
- AC1, "any other tab panel in the page": all three panels are in every Add page, two of
  them hidden, and every tab names its panel (D1).
- AC4 to AC6, where the message and the `Try again` form sit: between the tab list and
  the panels, not inside a panel. The `Analyzing...` status sits after the panels (D4).
- AC10, "with the Voice tab selected, the page's script shows it": the script shows the
  button whenever the window has a constructor. With another tab selected the button is
  inside a hidden panel (D11).
- AC11, "the transcripts are joined": with one space between them, before the whitespace
  is collapsed (D11).
- AC12, between the click on `Stop recording` and the `end` event: the button still
  reads `Stop recording`. It changes on `end`, as the criterion says (D11).
- AC13, where the alert comes from: it is served hidden in the Voice panel and shown by
  the script. A `start()` that throws is treated as an error. The alert is hidden again
  when the next recording starts (D11, D13).
- AC14, a text and a message that are on the page when the script moves it from Voice to
  Type: the messages stay, because they are outside the panels, and the text is copied
  into the Type box (D12).
- AC7 reverses one 006 decision (006 D8: a `text` source is not analyzed). The one 006
  test that holds it is removed (D10, D17).

Two things the spec does not ask for are added, both in the script: a submit of the
Voice form stops a running recording, and an event of a recognition that is no longer
the current one is ignored (D11).

Everything marked "checked" below was run in a throwaway copy outside the repo with the
repo's own `node_modules`, `tsconfig.json` and Vitest config: Node 26.8.2, yarn 1.22.22,
Express 5.3.0 (body-parser 2.3.0), EJS 7.0.1, jsdom 30.1.1, supertest 7.3.1, Vitest
5.0.1, TypeScript 5.9.3, and Chrome 154.0.8037.99 driven headless through its debugging
port. The design was built there once as a prototype: the service, the routes, the view,
the script, the CSS and the test helper. `tsc --noEmit` was clean, a smoke file of 27
tests ran against it, the app was served by plain Node, and four pages were looked at in
Chrome at 375px (Voice while recording, Voice after an error, Type in the dark theme,
and Voice in a window without the API). No new package is needed.

Not checked: the prototype's tests were one smoke file, not the tests of `plan.md`. No
real microphone was used, so no real `result` event was seen; in headless Chrome the
recognition ends with `not-allowed`. Safari, Firefox and a phone were not tried. The
pages at 1200px and the light theme of the Type tab were not looked at. No request
reached the live API: there is no key here. Node 26.8.2 is the only Node on this
machine.

## Approach

The job has four parts.

**The Add page gets three tabs.** The tabs are links to `/add?tab=photo`, `?tab=voice`
and `?tab=text`, written with the button partial. The page always holds all three
panels; the route says which one is selected and the view hides the other two. The ids
of the tabs are the kinds of `sources` (`photo`, `voice`, `text`), so a source names its
own tab. The message of the last post, the `Try again` form and the `Analyzing...`
status move out of the Photo panel, so they show whichever panel does.

**Two routes store a text.** `POST /add/voice` and `POST /add/text` share one handler.
It reads the one field `text`, stores a source of the route's kind, and answers through
the same `answerAnalysis` as a photo. `answerAnalysis` takes the tab, the words of the
messages and the text of the textarea from the source it is given.

**The analysis is widened.** `analyzePhotoSource` in `src/services/drafts.ts` becomes
`analyzeSource`: a photo is handed to the analyzer as an image, a `voice` or `text`
source as its transcript. Everything after the analyzer's answer is as in 006. The retry
route drops its "photo only" check. The review page needs no change.

**One new script.** `public/js/add-voice.js` shows the record button and runs the
recognition when the window has the Web Speech API, and hides the Voice tab when it has
not. `public/js/add-analyzing.js` already acts on every form marked `data-analyze-form`;
the two new forms get that attribute and the script's behaviour is not changed.

## Decisions

**D1. All three panels are in every Add page, and the tab ids are the source kinds.**
In `src/routes/add.ts`, not exported:

```ts
/** A tab of the Add page. Each is named after the kind of source it makes. */
type AddTab = SourceKind;

const TABS: readonly { id: AddTab; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'voice', label: 'Voice' },
  { id: 'text', label: 'Type' },
];
```

The element ids are `tab-<id>` and `panel-<id>`: `tab-photo` and `panel-photo` exist
since 004, and `tab-voice`, `panel-voice`, `tab-text`, `panel-text` are new. Every tab
has `aria-controls="panel-<id>"`, every panel `aria-labelledby="tab-<id>"`. Exactly one
panel is without `hidden`.

A tab is the button partial with `href`, so it is an `<a class="btn btn--ghost">` with
`role="tab"`. The existing rule `.tabs .btn[aria-selected="true"]` styles the selected
one. A tab is not switched in place: a click loads the page (the spec leaves switching
to the architect; it is not taken). Arrow keys do not move between the tabs; they are
links and are reached with Tab.

All three panels are always there because AC14 needs the Type panel on a page served
with Voice selected, and one shape of the page is simpler than two. Rejected: rendering
only the selected panel, and the Type panel as well when Voice is selected.

Checked: `GET /add`, `?tab=photo`, `?tab=voice` and `?tab=text` each have three
`a[role="tab"]` in order with the three addresses, one selected, three panels of which
the one the selected tab controls is not hidden, no id twice and no `style` attribute.

**D2. `tab` is read strictly.** In `src/routes/add.ts`, not exported:

```ts
/** The tab an address names: one of the three ids, written exactly so. Anything else is Photo. */
function readTab(raw: unknown): AddTab {
  return TABS.find((tab) => tab.id === raw)?.id ?? 'photo';
}
```

`GET /add` calls `renderAdd(res, 200, readTab(req.query.tab))`. Checked on Express
5.3.0: `?tab=`, `?tab=VOICE`, `?tab=constructor`, `?tab=voice&tab=text` (an array) and
`?tab[]=voice` (another key) all select Photo with 200.

**D3. The Add page's local is `addPage: { tab, tabs, error, notice, retryAction, text, maxTextLength }`.**

```ts
/** What `pages/add.ejs` reads. Every field is always present. */
interface AddPage {
  /** The selected tab. Its panel is the one that is not hidden. */
  tab: AddTab;
  /** The three tabs in order, each with its address and whether it is the selected one. */
  tabs: { id: AddTab; label: string; href: string; selected: boolean }[];
  error: string | null;
  notice: string | null;
  retryAction: string | null;
  /** What the textarea of the selected tab holds. The other textarea is empty. */
  text: string;
  /** The `maxlength` of both textareas. */
  maxTextLength: number;
}

/** What an answer adds to the page. Anything left out is not shown. */
interface AddAnswer {
  error?: string;
  notice?: string;
  retryAction?: string;
  text?: string;
}

function renderAdd(res: Response, status: number, tab: AddTab, answer: AddAnswer = {}): void
```

`renderAdd` fills `tabs` from `TABS` (`href` is `` `/add?tab=${id}` ``, `selected` is
`id === tab`), `error`, `notice` and `retryAction` with `?? null`, `text` with `?? ''`
and `maxTextLength` with `MAX_TEXT_LENGTH` (D6). Every answer of the router still goes
through it. The six existing calls for a photo pass `'photo'` as the tab.

**D4. The message of the last post and the `Try again` form sit between the tab list
and the panels; the `Analyzing...` status sits after the panels.** All four are children
of `<main>`, which already spaces its children (`.page > * + *`).

In 006 they were inside the Photo panel. Left there, the status could never be shown
with another tab selected, since its panel would be hidden (AC9), and a message would
vanish when the script moves the page from Voice to Type (AC14). Rejected: writing the
three message blocks into each panel.

**D5. The view.** The whole of `src/views/pages/add.ejs` below its header comment;
tests select on the attributes and the `data-` hooks.

```ejs
<%- include('../partials/page-header', { pageHeader: { heading: 'Add task' } }) -%>

<div class="tabs" role="tablist" aria-label="Ways to add a task">
<% for (const tab of addPage.tabs) { -%>
  <%- include('../partials/button', { button: {
    label: tab.label,
    variant: 'ghost',
    href: tab.href,
    attrs: { role: 'tab', id: `tab-${tab.id}`, 'aria-selected': tab.selected ? 'true' : 'false', 'aria-controls': `panel-${tab.id}` },
  } }) -%>
<% } -%>
</div>

<% if (addPage.error) { -%>
<p class="notice notice--error" role="alert"><%= addPage.error %></p>
<% } -%>
<% if (addPage.notice) { -%>
<p class="notice" role="status"><%= addPage.notice %></p>
<% } -%>
<% if (addPage.retryAction) { -%>
<form method="post" action="<%= addPage.retryAction %>" data-analyze-form>
  <%- include('../partials/button', { button: { label: 'Try again', type: 'submit' } }) -%>
</form>
<% } -%>

<div class="tab-panel" role="tabpanel" id="panel-photo" aria-labelledby="tab-photo"<% if (addPage.tab !== 'photo') { %> hidden<% } %>>
  <form class="photo-form" method="post" action="/add/photo" enctype="multipart/form-data" data-analyze-form>
    <label class="photo-form__label" for="photo-input">Take or choose a photo</label>
    <input class="photo-form__input" id="photo-input" type="file" name="photo" accept="image/*" capture="environment" required data-photo-input>
    <img class="photo" alt="Preview of the photo you chose" data-photo-preview hidden>
    <div class="photo-form__actions">
      <%- include('../partials/button', { button: { label: 'Retake', variant: 'ghost', attrs: { 'data-photo-retake': '', hidden: '' } } }) -%>
      <%- include('../partials/button', { button: { label: 'Upload photo', type: 'submit' } }) -%>
    </div>
  </form>
</div>

<div class="tab-panel" role="tabpanel" id="panel-voice" aria-labelledby="tab-voice"<% if (addPage.tab !== 'voice') { %> hidden<% } %>>
  <p class="notice notice--error" role="alert" data-voice-error hidden>Voice input stopped working. Try again, or type your tasks here.</p>
  <form class="text-form" method="post" action="/add/voice" data-analyze-form>
    <label class="text-form__label" for="voice-text">Speak or type what you need to do</label>
    <textarea class="field text-form__input" id="voice-text" name="text" rows="6" maxlength="<%= addPage.maxTextLength %>" required data-voice-text><%= addPage.tab === 'voice' ? addPage.text : '' %></textarea>
    <div class="text-form__actions">
      <%- include('../partials/button', { button: { label: 'Start recording', variant: 'ghost', attrs: { 'aria-pressed': 'false', 'data-voice-record': '', hidden: '' } } }) -%>
      <%- include('../partials/button', { button: { label: 'Find tasks', type: 'submit' } }) -%>
    </div>
  </form>
</div>

<div class="tab-panel" role="tabpanel" id="panel-text" aria-labelledby="tab-text"<% if (addPage.tab !== 'text') { %> hidden<% } %>>
  <p class="notice" role="status" data-voice-unavailable hidden>Voice input is not available in this browser. Type your tasks instead.</p>
  <form class="text-form" method="post" action="/add/text" data-analyze-form>
    <label class="text-form__label" for="type-text">Type what you need to do</label>
    <textarea class="field text-form__input" id="type-text" name="text" rows="6" maxlength="<%= addPage.maxTextLength %>" required data-type-text><%= addPage.tab === 'text' ? addPage.text : '' %></textarea>
    <div class="text-form__actions">
      <%- include('../partials/button', { button: { label: 'Find tasks', type: 'submit' } }) -%>
    </div>
  </form>
</div>

<div class="analyzing" role="status" data-analyzing hidden>
  <p class="analyzing__text">Analyzing...</p>
  <%- include('../partials/skeleton', { skeleton: {} }) -%>
</div>
<script src="/js/add-photo.js" defer></script>
<script src="/js/add-analyzing.js" defer></script>
<script src="/js/add-voice.js" defer></script>
```

- The Photo panel's form is the 006 form, unchanged. Only what stood around it moved.
- **Each `<textarea>` and its closing tag are on one line** with nothing but the EJS tag
  between them, or the box starts with white space.
- The record button has no `type` in its object, so the partial makes it
  `type="button"`: it never posts.
- The header comment of the view names the seven fields of `addPage`, the three scripts
  and what each does, and says that without them every form still posts.

Checked: a transcript of `</textarea><script>window.x=1</script>` followed by a second
line comes back as the value of the textarea, and `<main>` has no script without `src`.

**D6. A posted text is read by one function, which counts a line break once.** In
`src/routes/add.ts`, not exported:

```ts
const MAX_TEXT_LENGTH = 5000;

/**
 * The text a posted form carries: the one field `text` with its line breaks as `\n` and
 * its ends trimmed. `undefined` when the field is missing, posted more than once, or blank.
 */
function readText(body: unknown): string | undefined {
  const posted = postedValue(body, 'text');
  if (typeof posted !== 'string') return undefined;

  const text = posted.replace(/\r\n/g, '\n').trim();
  return text === '' ? undefined : text;
}
```

`postedValue` is the 006 reader in `src/services/drafts.ts` (D10 there): `undefined` for
a field that was not posted, `null` for one posted more than once.

The line breaks are the reason for the first reading in the opening list. Checked in
Chrome 154: a textarea with `maxlength="3"` whose value is `a`, a line break, `b` reports
a length of 3 and is valid, and the form posts `text=a%0D%0Ab`, which is four
characters. Without the replacement, a text the browser lets the user write up to 5000
characters would be refused by the server once it has a line break in it. With it, the
server's 5000 is the browser's 5000. Length is `text.length`, UTF-16 code units, which
is what `maxlength` counts.

The text that is stored, handed to the analyzer, measured and put back into a textarea
is always this one. So the textarea of a 413 holds the trimmed text, not the text with
its outer white space. Inner white space is kept as posted.

**D7. `POST /add/voice` and `POST /add/text` are one handler, mounted twice behind the
simple form parser.** In `createAddRouter`:

```ts
const form = express.urlencoded({ extended: false });

function postText(kind: 'voice' | 'text'): RequestHandler

router.post('/add/voice', form, postText('voice'));
router.post('/add/text', form, postText('text'));
```

The handler is `async` and takes `(req, res)`:

| # | Condition | Status | Answer |
|---|---|---|---|
| 1 | `readText(req.body)` is `undefined` | 400 | `renderAdd(res, 400, kind, { error: NO_TEXT })` |
| 2 | `text.length > MAX_TEXT_LENGTH` | 413 | `renderAdd(res, 413, kind, { error: TEXT_TOO_LONG, text })` |
| 3 | otherwise | | `source = createSource(deps.db, { kind, transcript: text })`, then `answerAnalysis(res, source, await analyzeSource(deps, source))` |

Rows 1 and 2 store nothing and do not call the analyzer. Express 5 hands a rejection of
the handler to its error handler. Checked: with the database closed the post answers
500.

The messages, constants beside the photo ones:

| Constant | Message |
|---|---|
| `NO_TEXT` | `Describe what you need to do first.` |
| `TEXT_TOO_LONG` | `` `That text is longer than ${MAX_TEXT_LENGTH} characters. Shorten it.` `` |
| `NO_TASKS_IN_TEXT` | `No tasks were found in that text.` |
| `TEXT_NOT_ANALYZED` | `The text could not be analyzed.` |

`NO_TASKS` and `NOT_ANALYZED` keep their names and their texts and stay the photo's.

Checked on Express 5.3.0. Each case was run on one of the two routes, which share the
handler; the redirect was run on both:

- No body, `text=%20%20`, `text=%0D%0A`, `text=a&text=b`, a JSON body and a multipart
  body answer 400. `req.body` is `undefined` for the last two.
- 5000 characters between two spaces answer 303. 2499 times `x` and a `\r\n`, then
  `xx`, which is 5000 characters as the browser counts and 7499 as posted, answers 303.
  5001 answer 413 with the text in the tab's textarea and the other textarea empty.
- The parser's own limit is left at its 100 kB. 5000 characters are at most 45 kB when
  posted (a character of three UTF-8 bytes is nine bytes percent-encoded); 5000 times
  `水` answered 303. 11000 of them answered 413 with the Add page. 110000 times `x`
  was answered 413 by Express itself, without the Add page, which the spec puts out of
  scope (023).

**D8. `analyzeSource(deps, source)` replaces `analyzePhotoSource`.** Same file, same
signature, same three outcomes:

```ts
/** What the analyzer is handed for a source, or `undefined` when the source has nothing to hand. */
function inputOf(uploadsDir: string, source: Source): AnalyzerInput | undefined {
  if (source.kind === 'photo') {
    return source.image_path === null
      ? undefined
      : { kind: 'image', path: photoFile(uploadsDir, source.image_path) };
  }
  return source.transcript === null ? undefined : { kind: 'text', text: source.transcript };
}

export async function analyzeSource(deps: DraftDeps, source: Source): Promise<AnalysisOutcome>
```

`analyzeSource` returns `'failed'` when `inputOf` is `undefined` (the table gives every
source what its kind needs, so the routes never get there), then calls
`deps.analyze(input)` inside the `try` of 006. Everything below that call is 006 D5 as
it stands: the line on stderr, the fallback check, the empty list, the transaction with
its check for a second request, the eight fields of a draft. `inputOf` is not exported.
`AnalyzerInput` is imported with `import type`.

The transcript is handed on exactly as stored. Renamed, not kept beside a second
function: the two callers are in this job's files and no test imports it.

**D9. `answerAnalysis` takes the tab, the words and the text from the source.** Its
signature is unchanged:

| Outcome | Status | Answer |
|---|---|---|
| `'drafts'` | 303 | `res.redirect(303, reviewPath(source.id))` |
| `'none'` | 200 | `renderAdd(res, 200, source.kind, { notice, text })` |
| `'failed'` | 502 | `renderAdd(res, 502, source.kind, { error, retryAction: '/review/<id>/analyze', text })` |

`notice` is `NO_TASKS` for a photo, else `NO_TASKS_IN_TEXT`. `error` is `NOT_ANALYZED`
for a photo, else `TEXT_NOT_ANALYZED`. `text` is `source.transcript ?? ''`; the view
puts it into the textarea of the selected tab only, so a photo shows none. A `voice`
source selects the Voice tab and a `text` source the Type tab, for the first post and
for the retry alike (AC7).

**D10. `POST /review/:sourceId/analyze` analyzes any source that has no task.** Row 2 of
006 D8 loses its first half:

| # | Condition | Answer |
|---|---|---|
| 1 | no such source | the not-found page, 404 |
| 2 | `listSourceTasks(db, source.id)` is not empty | 303 to `/review/<id>`, the analyzer is not called |
| 3 | otherwise | `answerAnalysis(res, source, await analyzeSource(deps, source))` |

No source is created here, so there is never a second one. The 006 test "does not call
the analyzer for a text source without tasks, and answers 303" is removed; the AC7 tests
take its place.

**D11. `public/js/add-voice.js`: what it does, exactly.** A third deferred script of the
Add page, after the other two. Same style: one function that calls itself, `var`, no
arrow functions. Below its header comment the file is this, checked as written:

```js
(function () {
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var voiceTab = document.getElementById('tab-voice');
  var typeTab = document.getElementById('tab-text');
  var voicePanel = document.getElementById('panel-voice');
  var typePanel = document.getElementById('panel-text');
  var unavailable = document.querySelector('[data-voice-unavailable]');
  var record = document.querySelector('[data-voice-record]');
  var voiceText = document.querySelector('[data-voice-text]');
  var typeText = document.querySelector('[data-type-text]');
  var failure = document.querySelector('[data-voice-error]');

  /* The recognition that is recording, or null. */
  var current = null;
  /* What the text box held when that recording began. */
  var base = '';

  /* No Web Speech API: the Voice tab goes, and a page that opened on it shows Type. */
  if (!Recognition) {
    voiceTab.hidden = true;
    if (voiceTab.getAttribute('aria-selected') === 'true') {
      voiceTab.setAttribute('aria-selected', 'false');
      typeTab.setAttribute('aria-selected', 'true');
      voicePanel.hidden = true;
      typePanel.hidden = false;
      unavailable.hidden = false;
      if (typeText.value === '') typeText.value = voiceText.value;
    }
    return;
  }

  function setRecording(on) {
    record.textContent = on ? 'Stop recording' : 'Start recording';
    record.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  /* An event of a recognition that is no longer the current one changes nothing. */
  function finish(recognition, failed) {
    if (recognition !== current) return;
    current = null;
    setRecording(false);
    if (failed) failure.hidden = false;
  }

  /* The first alternative of every result, final or not, as one line of text. */
  function spokenOf(results) {
    var parts = [];
    var index;
    for (index = 0; index < results.length; index += 1) {
      parts.push(results[index][0].transcript);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function start() {
    var recognition;

    failure.hidden = true;
    base = voiceText.value;
    try {
      recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = function (event) {
        var spoken;
        if (recognition !== current) return;
        spoken = spokenOf(event.results);
        if (spoken === '') voiceText.value = base;
        else voiceText.value = base === '' ? spoken : base + ' ' + spoken;
      };
      recognition.onend = function () {
        finish(recognition, false);
      };
      recognition.onerror = function () {
        finish(recognition, true);
      };
      current = recognition;
      recognition.start();
    } catch (error) {
      current = null;
      setRecording(false);
      failure.hidden = false;
      return;
    }
    setRecording(true);
  }

  record.hidden = false;
  record.addEventListener('click', function () {
    if (current) current.stop();
    else start();
  });

  /* The microphone is not left on while the page waits for the analyzer. */
  voiceText.form.addEventListener('submit', function () {
    if (current) current.stop();
  });
})();
```

What follows from it, and why:

- **The constructor** is `SpeechRecognition`, and `webkitSpeechRecognition` only when
  the first is not there. Checked: Chrome 154 has both.
- **The button is shown whenever there is a constructor**, whichever tab is selected. In
  a hidden panel it is still not on screen.
- **One recognition per recording.** Each click on `Start recording` makes a new one.
- **`on<event>` properties, not `addEventListener`**, so the test stub is a plain object
  (D16). Both work in a browser.
- **The whole list of results is read on every event**, from index 0, not from
  `event.resultIndex`: with `continuous` the list holds every result of the recording,
  and the criterion asks for "every result of the event". So each event replaces what
  the last one wrote, and the text never doubles.
- **The join is one space**, then every run of white space becomes one space. Chrome
  starts each later result with a space, so the spec's example gives the same text
  either way; an engine that does not would otherwise glue two words together. Cost: a
  language written without spaces gets a space between two results.
- **The earlier text is kept exactly**, its own line breaks included. An event whose
  transcripts are all blank leaves the box at the earlier text, with no space added.
- **The button changes on `end`, not on the click on `Stop recording`.** A second click
  before `end` calls `stop()` again, which does nothing.
- **`start()` can throw.** Checked in Chrome 154: a second `start()` on a recognition
  throws `InvalidStateError`. The `try` turns any throw into the error state, so the
  click never raises a script error.
- **`error` is followed by `end`.** Checked in headless Chrome 154, which has no
  microphone permission: `error` with `not-allowed`, then `end`. `finish` clears
  `current` on the first, so the second finds nothing to do, and neither can undo a
  recording that was started in between.
- **The submit listener never calls `preventDefault`.** It is the second `submit`
  listener of that form; the first is `add-analyzing.js`.
- The textarea is never disabled or made read-only. What the user types while a
  recording runs is replaced by the next `result` event, as AC11 words it; what is typed
  between two recordings is the next recording's earlier text.
- A value the script writes is not held to `maxlength` by the browser. A text that grew
  past 5000 is answered with the 413 of D7 and comes back in the box.

Checked in jsdom 30.1.1 with the stub of D16, for a window with `SpeechRecognition`,
with only `webkitSpeechRecognition`, and with both: the spec's example gives
`call mum buy milk and finish the login bug`; a second recording adds to it; a late
`result` and `end` of the first recognition change nothing; `error` shows the alert and
resets the button; a throwing `start()` does the same; the next click hides the alert;
a submit while recording calls `stop()` once and is not stopped. In Chrome 154 the same
page went from `Start recording` to `Stop recording` on a click and, 1.5 s later, back
to `Start recording` with the alert shown and the typed text kept. No exception.

**D12. Without a constructor the script hides the Voice tab, and moves a page that was
served on Voice to Type.** The first branch of the script in D11. The Photo tab and its
panel are never touched. On a page served with Photo or Type selected only
`hidden` on the Voice tab changes.

The copy of the text is the last line of that branch. A page can be served on Voice with
a text in its box: the answer to a `/add/voice` post (AC4 to AC6) or to the retry of a
`voice` source. Moved to Type, it would otherwise show an empty box under "The text
could not be analyzed." The Type box is only filled when it is empty, so a text the
browser restored there is not replaced. The form then posts to `/add/text`.

Checked in jsdom, and in Chrome 154 with both constructors removed before the page's
scripts ran: `/add?tab=voice` ends with the Voice tab hidden and not selected, Type
selected, the Type panel shown and the status shown; `/add` ends with only the Voice tab
hidden. After a 502 from `/add/voice`, the Type box holds the transcript and the alert
and the `Try again` form are still shown.

**D13. The alert of AC13 and the status of AC14 are in the served page, hidden; the
script only shows them.** The words stay in the view, as with `Analyzing...`. So the Add
page now always has one `[role="alert"]` and two `[role="status"]` elements that are not
shown. Tests count the shown ones: `all(document, '[role="alert"]').filter(isShown)`
(`isShown` is 006 D22). The four existing assertions that counted every alert change
that way (D17).

Rejected: an alert the script builds, which would put the wording into the script.

**D14. `public/js/add-analyzing.js` keeps its behaviour.** It already finds every
`[data-analyze-form]` and disables only `[type="submit"]`, so the textareas stay
enabled and are posted. Two comments in it name only the photo and are reworded:

- in the header, `so the photo is not sent twice` becomes `so nothing is sent twice`;
- above `setBusy`, `a disabled file input would be left out of the post` becomes
  `a disabled file input or text box would be left out of the post`.

No statement of the file changes. Checked: on the Voice page a dispatched `submit` on
the Voice form returns `true`, shows the status, and disables every submit button and no
textarea.

**D15. The CSS.** In `public/css/base.css`, in the Components section. The three rules
of the photo form are shared with the text form by adding a selector to each; two rules
are new, directly after `.text-form__actions` and above the `Analyzing` comment.

```css
/* Photo form, and the text form of the Voice and Type tabs: a label, a control, the buttons. */
.photo-form,
.text-form {
  /* the four declarations of .photo-form, unchanged */
}

.photo-form__label,
.text-form__label {
  font-weight: 700;
}

.photo-form__actions,
.text-form__actions {
  /* the three declarations of .photo-form__actions, unchanged */
}

/* The text box grows downwards only, so it never gets wider than the page. */
.text-form__input {
  resize: vertical;
}

/* A toggle that is on, such as the record button while it records. The label says it too. */
.btn[aria-pressed="true"] {
  color: var(--urgent);
  border-color: var(--urgent);
}
```

The comment `/* Photo form */` is replaced by the first comment above. The textarea also
has the 006 class `field`. The recording state is said by the button's label; the color
only repeats it. Checked: `src/stylesheet.test.ts` and `src/components.test.ts` pass
unedited with these rules. Seen at 375px: the tabs in one row, the box at full width,
`Stop recording` in the urgent color beside `Find tasks`, no sideways scroll.

**D16. Test helpers.** Checked on jsdom 30.1.1, Vitest 5.0.1 and `tsc`.

`src/testing/jsdom.d.ts`: `DomWindow` gains

```ts
    /** The Web Speech API constructors. jsdom has neither; a test puts a stub here. */
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
```

`src/testing/dom.ts` gains, above `all`:

```ts
/** What a page hears from a recognition: the three events `public/js/add-voice.js` listens for. */
export type SpeechEventType = 'result' | 'end' | 'error';

/** One recognition a page made from a stubbed constructor. */
export interface StubRecognition {
  /** What the page set them to; `undefined` until it does. */
  continuous: unknown;
  interimResults: unknown;
  /** How often the page called `start()` and `stop()`. */
  startCalls: number;
  stopCalls: number;
  /** Calls the handler the page put on `on<type>` with this event. Does nothing when the page set none. */
  fire(type: SpeechEventType, event?: object): void;
}

export interface SpeechStub {
  /** Every recognition the page made, in order. */
  instances: StubRecognition[];
  /** When set, the next `start()` throws it, once. */
  startError: Error | null;
}

/** One result of a `result` event, as a test writes it. */
export interface SpokenResult {
  transcript: string;
  isFinal: boolean;
}

export function resultEvent(results: SpokenResult[]): object

export function stubSpeechRecognition(
  window: DomWindow,
  name: 'SpeechRecognition' | 'webkitSpeechRecognition' = 'SpeechRecognition',
): SpeechStub
```

- `stubSpeechRecognition` puts a class on `window[name]` and returns the stub. The class
  has the fields `continuous` and `interimResults` (both `undefined`), `onresult`,
  `onend`, `onerror` (each `null`), `startCalls` and `stopCalls` (0). Its constructor
  pushes the instance to `stub.instances`. `start()` counts, then throws
  `stub.startError` when one is set and clears it. `stop()` counts and fires nothing: a
  test fires `end` itself. `fire(type, event = {})` is `this[`on${type}`]?.(event)`.
  The class uses fields and no parameter properties.
- `resultEvent` returns `{ resultIndex, results }`. Each result is an array of two
  alternatives, `{ transcript, confidence: 0.9 }` and
  `{ transcript: 'a second alternative', confidence: 0.1 }`, with `isFinal` on the array
  (`Object.assign`). `resultIndex` is the index of the last result, or 0. So a script
  that reads a second alternative, skips a result that is not final, or starts at
  `resultIndex` fails a test.
- The stub goes onto the window after `openPage` and before `runLinkedScripts`, as
  `stubObjectUrls` does. A window with neither constructor is jsdom as it comes.
- A handler called through `fire` runs in the test's own call, so an exception in it
  fails the test at once. A `click` goes through jsdom, so every file that runs page
  scripts still asserts `scriptErrors(window)` in `afterEach`
  (`docs/errors/jsdom-page-script-error-does-not-fail-test.md`).
- A textarea is read and written as `DomInput` (`value`). Parsed with scripts off, its
  `value` is the text it was served with.
- A submit is a dispatched event, as in 006 D22.

**D17. Existing tests that change, and how.** No assertion is loosened except where the
spec says the page changed: a tab list of three, three forms on the page, and hidden
messages.

| File | Change |
|---|---|
| `src/add-page.test.ts` | A helper `photoFormOf(document)`, `one(document, 'main form[action="/add/photo"]')`, replaces all six `one(document, 'main form')`. "has a named tab list with exactly one tab, Photo, which is selected" becomes "has one named tab list, in which Photo is the selected tab": the tab is `one(document, '[role="tab"][aria-selected="true"]')`, and the line that read `aria-selected` goes, since the selector holds it. In "ties the tab to its panel, which holds the form" the tab is that same selected one and the panel is `one(document, '[role="tabpanel"]:not([hidden])')`. In "shows no message and no photo before anything is posted" the alerts are filtered with `isShown`. `NEW_CLASSES` gains `text-form`, `text-form__label`, `text-form__input`, `text-form__actions`. In step 5: "links to two scripts…" becomes "links to three scripts…" and both lists become `['/js/add-photo.js', '/js/add-analyzing.js', '/js/add-voice.js']`. |
| `src/add-photo.test.ts` | In `expectRejected` only: the two alert lines become `expect(all(document, 'main [role="alert"]').filter(isShown).map(textOf)).toEqual([message])`; a line asserts that the selected tab reads `Photo`; the form is the one shown form (`all(document, 'main form').filter(isShown)` has length 1), with the action and the file input asserted as before. |
| `src/add-analysis.test.ts` | `expectNoTasksPage`: the alerts are filtered with `isShown`, the selected tab reads `Photo`, and the count of forms is of the shown ones (1). `expectFailedPage`: the two alert lines become one, as in `expectRejected`, with `NOT_ANALYZED`; the selected tab reads `Photo`; the count of forms is of the shown ones (2). The test "does not call the analyzer for a text source without tasks, and answers 303" is removed in step 3 (D10). |
| `src/add-analyzing.test.ts` | `expectHiddenAnalyzing`: the line that wanted the status inside the one tab panel becomes three: it is inside `main`, `analyzing.closest('[role="tabpanel"]')` is `null`, and `analyzing.parentElement?.closest('[hidden]')` is `null`. The first test's name ends "…outside the tab panels". In step 5 the script list in `openWithScripts` gains `/js/add-voice.js`. The AC9 tests are added (`plan.md`). |

Checked in the prototype: with the code changed and no test edited, 48 tests failed, all
in these four files. With the edits above, one failed: the test that D10 removes. The
other 28 test files passed unedited, 1024 tests before this job.

## Files

Created:

- `public/js/add-voice.js` (D11, D12), under a header comment in the manner of
  `add-photo.js`: what the script does with and without the Web Speech API, that it is
  loaded with `defer` from the one page that has these elements, and that without it the
  Voice form is a text box that still posts.
- Tests: `src/add-tabs.test.ts`, `src/add-text.test.ts`, `src/add-voice.test.ts`: see
  `plan.md`.

Changed:

- `src/services/drafts.ts`: `analyzePhotoSource` becomes `analyzeSource`; `inputOf` is
  added above it, not exported; `AnalyzerInput` joins the type import (D8). The doc
  comment says "a source", and names the photo and the transcript. The comment inside
  the `catch` becomes `The page says only that it could not be analyzed; the reason goes here.`
  Nothing below the `catch` changes.
- `src/routes/add.ts` (D1 to D3, D6, D7, D9): `AddTab`, `TABS`, `readTab`, `AddPage`,
  `AddAnswer`, `renderAdd` with the tab as its third parameter; `MAX_TEXT_LENGTH`,
  `readText`, the four messages; `postText` and the two routes; `answerAnalysis` by
  kind; `GET /add` reads the tab; the upload calls `analyzeSource`. Imports gain
  `express` (default), `type RequestHandler`, `type SourceKind`, `postedValue`.
  `reviewPath` and `answerAnalysis` stay exported with their signatures; nothing else is
  exported. The doc comment of `createAddRouter` names the three tabs.
- `src/routes/review.ts` (D10): the import and the call are `analyzeSource`; the
  condition of the analyze route is `listSourceTasks(deps.db, source.id).length > 0`
  alone; the comment above the route becomes
  `Only a source that has no task yet is analyzed.` with its second sentence kept, and
  the doc comment of `createReviewRouter` says "analyze the source again".
- `src/app.ts`: the doc comment of `AppDeps.analyze` becomes
  `Turns a stored photo or a transcript into tasks. The real one asks the Anthropic API; a test hands in a stub.`
  No code changes.
- `src/views/pages/add.ejs`: D5.
- `public/js/add-analyzing.js`: the two comments of D14.
- `public/css/base.css`: D15.
- `src/testing/dom.ts`, `src/testing/jsdom.d.ts`: D16.
- `src/add-page.test.ts`, `src/add-photo.test.ts`, `src/add-analysis.test.ts`,
  `src/add-analyzing.test.ts`: the table in D17.

Not touched: `package.json` and `yarn.lock` (no package is added;
`express.urlencoded` comes with Express); `src/server.ts`, `src/config.ts`,
`.env.example`, `vitest.config.ts`; everything under `src/db/` (`createSource` already
takes a `voice` or `text` source with its transcript; no migration);
`src/services/analyzer.ts` (it already takes a text input) and
`src/services/photo-storage.ts`; `src/views/pages/review.ejs` and `public/js/review.js`
(the page already shows a transcript; Discard still goes to `/add`, as 006 AC15 says);
`public/js/add-photo.js`; `src/views/layout.ejs` and every partial (the tabs use the
button partial as it is); `src/ui.ts`, `src/render.ts`, `src/routes/home.ts`;
`src/testing/app.ts`, `src/testing/page.ts`, `src/testing/css.ts`;
`src/review-page.test.ts`, `src/review-actions.test.ts`, `src/app.test.ts`,
`src/server.test.ts`, `src/project.test.ts`, `src/shell.test.ts`,
`src/stylesheet.test.ts`, `src/components.test.ts`, `src/testing/app.test.ts`;
`tsconfig.json`, `.gitignore`, `CLAUDE.md`, `README.md`; `docs/` unless the builder logs
an error; everything under `factory/` except this job's `build.md`.

## Risks

- **The status or a message sits in a hidden panel and is never seen.** D4. The AC9
  tests submit the Voice and the Type form and assert `isShown` of the status; the AC14
  test asserts the alert and the `Try again` form are shown after the move to Type.
- **A text the browser accepts is refused for its line breaks.** D6. An AC4 test posts
  5000 characters with `\r\n` line breaks and expects 303.
- **A blank or a too long text makes a source, or reaches the analyzer.** Every AC4 test
  asserts no source row and no call.
- **The fallback task of a text is saved.** The AC6 test hands in `fallback: true` with
  a task in it and expects no task row.
- **The retry makes a second source, or answers with the wrong tab.** The AC7 tests
  count the sources and read the selected tab for both kinds, and for a photo.
- **The script doubles the text, drops results that are not final, or reads the wrong
  alternative.** The AC11 tests fire several events in a row and use `resultEvent`,
  whose shape makes each of the three fail (D16).
- **A late event of an old recognition flips the button.** One AC12 test.
- **A script throws and the test passes.** `afterEach` asserts `scriptErrors` in every
  file that runs page scripts; `fire` throws into the test.
- **The stub is not the browser.** Real `error` and `end` events and the throwing
  `start()` were seen in Chrome 154. A real `result` event was not: it needs a
  microphone. Android Chrome is known to hand out results differently with
  `continuous`. The builder says the words of the spec's check into a real browser if
  one with a microphone is at hand (plan, step 6); otherwise it goes under Not done.
- **A screen reader does not announce a message that is shown by removing `hidden`.**
  Accepted (D13): the text is on the page and the button's label changes as well. Live
  regions are 023.
- **Tabs that are links** have no arrow-key movement and a click loads the page, so a
  chosen photo or a typed text is lost on a tab change. The spec says so.
- **What the user types while a recording runs is replaced by the next result.** The
  spec words AC11 that way.
- **Each `Find tasks` after a failure stores another source**, and a source that ends
  with no task is kept. The spec puts the cleanup out of scope (023).
- **A body over 100 kB gets Express's own 413 page.** Out of scope by the spec; a text
  of up to about 11000 characters still gets the page's own message (D7).
- **A hidden message is counted by a test as shown.** D13, D17: every count of alerts
  and statuses on the Add page goes through `isShown`.
- **The new CSS breaks a 002 guard.** `src/stylesheet.test.ts` and
  `src/components.test.ts` run unedited.
- **A test reaches the network, a microphone or `data/`.** Test apps are temporary by
  construction (004 D17) with a stub analyzer (006 D20); the one describe that builds
  the real analyzer, without a key, holds `fetch` to zero calls (006 D22); jsdom has no
  microphone and the only recognition is the stub.
- **Nothing here ran on Node 22 or 24, in Safari or in Firefox.** The script uses
  nothing newer than `var`, `hidden` and `setAttribute`. Firefox has no constructor and
  takes the path of D12, which was seen in Chrome with both constructors removed.
