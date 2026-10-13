# 006-review-drafts: design

The spec can be built as written. Nine points in it can be read two ways, or are left to
the architect. Each is settled under Decisions:

- AC6, "an element with `role="status"`, the text `Analyzing...` and the skeleton
  partial": one element that has the role, holds the text and holds the partial (D12).
- AC5, a source that is not a photo: answered like a source that already has tasks, with
  303 and no call of the analyzer (D8).
- AC13, a priority or slot `src/ui.ts` does not have: 400 with a third message, which the
  spec does not word (D15).
- AC13, "the posted values in the cards": the title and the minutes as posted; a posted
  priority or slot only when it is one the page can show (D16).
- AC12 and AC14, "a draft the body has no fields for": decided field by field. A field
  that is not posted keeps its stored value (D14).
- AC13, "a whole number from 1 to 1440": one to four digits after trimming, nothing else
  (D14).
- AC8, the `−` and `+` buttons: served hidden and shown by the script, as 004 did with
  Retake (D19).
- AC8, "one form that posts without any script": the form needs a hidden first submit
  button, or Enter in a title field removes the first card (D18).
- AC16, the heading of the two states without drafts (D17).

Everything marked "checked" below was run in a throwaway copy outside the repo with the
repo's own `node_modules`, `tsconfig.json` and Vitest config: Node 26.8.2, yarn 1.22.22,
Express 5.3.0 (body-parser 2.3.0), EJS 7.0.1, jsdom 30.1.1, supertest 7.3.1, Vitest
5.0.1, TypeScript 5.9.3, `@anthropic-ai/sdk` 0.133.0, and Chrome 154 driven headless
through its debugging port. The design was built there once as a prototype: the routes,
the two views, the two scripts, the CSS and the wiring. `yarn build` was clean, the
flow was run end to end with supertest and jsdom, the server was started with plain Node
without a key, and the review page was looked at in Chrome (dark theme only) at 375px
and 1200px. No new package is needed.

Not checked: the prototype's tests were one smoke file, not the tests of `plan.md`. The
sticky bar's offset was corrected after the 375px look (D21) and not looked at again.
The light theme was not looked at. No request reached the live API: there is no key
here. Node 26.8.2 is the only Node on this machine.

## Approach

The job has five parts.

**The analyzer reaches the app.** `AppDeps` gains a third required field, `analyze`, a
function from an analyzer input to an analysis. `src/server.ts` builds the real one with
a new `createAnalyze(apiKey, model)` in `src/services/analyzer.ts`. Without a key that
function returns an analyzer that rejects at once and makes no client. Tests hand
`createTestApp` a stub.

**An upload becomes drafts.** `src/services/drafts.ts` holds what the job does with
drafts: it runs the analyzer on a photo source and stores the result as drafts, reads
the posted fields of the review form, and confirms, removes and discards. Each write of
several rows is one transaction, through a new `inTransaction` helper in `src/db/`.
`POST /add/photo` stores the file and the source as before and then answers with one of
three outcomes: 303 to the review page, the Add page with "no tasks", or the Add page
with the error and a retry form.

**The review routes.** `src/routes/review.ts` has five routes under `/review/:sourceId`.
All of them answer an unknown source by falling through to the app's not-found page. The
retry route answers through the same function as the upload.

**The review page.** `pages/review.ejs` renders one of three states from one local,
`review`: the form with a card per draft, "N tasks saved", or the empty state. The form
is plain HTML with flat field names (`title-<id>`, `minutes-<id>`, `priority-<id>`,
`slot-<id>`). Remove and Discard are submit buttons of the same form with their own
`formaction`.

**Two small scripts.** `public/js/add-analyzing.js` shows the "Analyzing..." state on
the Add page; `public/js/review.js` makes the stepper buttons work. Both are deferred
classic scripts like `add-photo.js`, and both pages work without them.

## Decisions

**D1. `AppDeps` gains `analyze: Analyze`, required.** In `src/services/analyzer.ts`:

```ts
export type Analyze = (input: AnalyzerInput) => Promise<Analysis>;
```

`src/app.ts` imports it with `import type`, so loading the app does not load the SDK.
Required, as `db` and `uploadsDir` are (004 D2): a caller that forgets it does not
compile. Checked: with the field added, `tsc` fails in exactly four places, the three
`createApp` calls in `src/app.test.ts` and the one in `src/add-photo.test.ts`.

Rejected: an optional field with a default that rejects (the server could forget it and
every upload would fail quietly); handing in a client and a model and calling `analyze`
in the route (a stub would then have to imitate the API's reply instead of returning
tasks).

**D2. `createAnalyze(apiKey, model)` builds the real analyzer, and without a key one
that rejects.** Added at the end of `src/services/analyzer.ts`:

```ts
export class AnalyzerKeyError extends Error {
  constructor() {
    super('The analyzer has no API key.');
    this.name = 'AnalyzerKeyError';
  }
}

export function createAnalyze(apiKey: string | undefined, model: string): Analyze {
  if (apiKey === undefined) return () => Promise.reject(new AnalyzerKeyError());

  const client = createAnalyzerClient(apiKey);
  return (input) => analyze(input, { client, model });
}
```

Without a key no client is made, so nothing can be sent (AC1). The client is made once,
when the server starts; making it sends nothing. Checked: with `undefined` the returned
function rejects and the global `fetch` is not called; with a key and `fetch` replaced
by a spy that answers with a message, one `POST` goes out with `x-api-key` set to the
key and `model` set to the model given.

`src/server.ts`, after the database is opened:

```ts
const analyze = createAnalyze(getAnthropicApiKey(), getAnthropicModel());
const app = createApp({ db, uploadsDir: getUploadsDir(), analyze });
```

Checked: `node src/server.ts` without a key starts, `/`, `/add` and `/_styleguide`
answer 200, and an upload answers 502 with the retry form.

The SDK's own time limit and repeats stay at their defaults. The spec puts a time limit
out of scope.

**D3. A rejected analysis is written to stderr; nothing else is logged.** In
`analyzePhotoSource` (D5): `console.error(`The analysis of source ${source.id} failed:`, error)`.
The page says only `The photo could not be analyzed.`, and without this line a missing
key, an unreadable file and a bug in the analyzer leave no trace at all. A `fallback:
true` result is not logged: the analyzer has already dropped the reason (005 Risks).
Tests that hand in a rejecting analyzer replace `console.error` with a spy and assert
the call.

**D4. One transaction helper in `src/db/`, used for every write of several rows.** New
file `src/db/transaction.ts`:

```ts
export function inTransaction<T>(db: Database, run: () => T): T
```

`BEGIN`, `run()`, `COMMIT`, and the result is returned. When `run` or the `COMMIT`
throws: `ROLLBACK` inside its own `try` (SQLite may have ended the transaction itself;
that second error is dropped) and the first error is thrown again. `run` is synchronous,
as the driver is. It is not nested: checked, a second `BEGIN` throws "cannot start a
transaction within a transaction". It lives in `src/db/` because code outside that
folder does not call the driver (003 D2). `migrations.ts` has the same few lines
privately and is not changed.

Checked: a `createTask` that fails on a `CHECK` after one that succeeded leaves no row
after the `ROLLBACK`.

**D5. `analyzePhotoSource(deps, source)` in `src/services/drafts.ts` runs the analyzer
and stores the drafts, and returns one of three outcomes.**

```ts
export type AnalysisOutcome = 'drafts' | 'none' | 'failed';

export interface DraftDeps {
  db: Database;
  uploadsDir: string;
  analyze: Analyze;
}

export async function analyzePhotoSource(deps: DraftDeps, source: Source): Promise<AnalysisOutcome>
```

`AppDeps` fits `DraftDeps` as it is; the service does not import from `src/app.ts`. In
this order:

1. `source.image_path` is `null`: return `'failed'`. The routes never get here (D8), and
   the table gives every photo source a path.
2. `await deps.analyze({ kind: 'image', path: photoFile(deps.uploadsDir, source.image_path) })`.
   Only this call is inside the `try`. When it rejects: the line of D3, return
   `'failed'`.
3. `analysis.fallback` is true: return `'failed'`. Nothing is stored (AC4).
4. `analysis.tasks` is empty: return `'none'` (AC3).
5. Inside `inTransaction`: when `listSourceTasks(db, source.id)` is not empty, store
   nothing. Otherwise `createTask` for each task, in order, with exactly these eight
   fields: `title`, `description`, `category`, `estimated_minutes` and `confidence` as
   returned, `priority: task.urgency`, `status: 'draft'`, `source_id: source.id`.
   Return `'drafts'`.

The check in step 5 is for two requests that analyze one source at the same time (a
double press on `Try again` without the script): the second to finish stores nothing and
still answers with the redirect. Checked with a stub that creates a task under the
source before it resolves: the source ends with that one task.

A database error in step 5 is not caught. It reaches Express and is answered with 500;
the transaction leaves no part of the list behind.

`photoFile(uploadsDir, imagePath)` is new in `src/services/photo-storage.ts`:
`path.join(uploadsDir, path.posix.basename(imagePath))`. For a stored photo it is the
path multer wrote (`file.path`), so the upload and the retry hand the analyzer the same
path. Only the last segment of `image_path` is used, so no stored value can name a file
outside the uploads folder.

**D6. `POST /add/photo` answers through `answerAnalysis`, which the retry route shares.**
Rows 1 to 5 of 004 D10 are unchanged and do not call the analyzer. Row 6 becomes: store
the source as before, then

```ts
analyzePhotoSource(deps, source)
  .then((outcome) => answerAnalysis(res, source, outcome))
  .catch(next);
```

`.catch(next)`, not a second argument of `then`: an error thrown while answering must
reach Express too. Exported from `src/routes/add.ts`:

```ts
export function reviewPath(sourceId: number): string            // `/review/${sourceId}`
export function answerAnalysis(res: Response, source: Source, outcome: AnalysisOutcome): void
```

| Outcome | Status | Answer |
|---|---|---|
| `'drafts'` | 303 | `res.redirect(303, reviewPath(source.id))` |
| `'none'` | 200 | the Add page with `notice`: `No tasks were found in that photo.` |
| `'failed'` | 502 | the Add page with `error`: `The photo could not be analyzed.` and `retryAction`: `/review/<id>/analyze` |

The two messages are constants in `src/routes/add.ts`: `NO_TASKS` and `NOT_ANALYZED`.
Checked: `res.redirect(303, '/review/1')` sends `Location: /review/1`.

The file and the source are kept in all three outcomes (AC4; the cleanup is 023).

**D7. The Add page's local is `addPage: { error, notice, retryAction }`.** `savedPhoto`
and the `Photo saved.` markup go: nothing answers with them any more. All three fields
are always present, `null` when there is nothing to show. `renderAdd` keeps its
signature and fills the three.

The view, between the tab and the upload form, in this order:

```ejs
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
```

The upload form is as it was, plus the attribute `data-analyze-form` on the `<form>`.
After it, still inside the tab panel, comes the element of D12, and after the panel the
two script tags (D13).

**D8. `POST /review/:sourceId/analyze` analyzes only a photo source without tasks.**

| # | Condition | Answer |
|---|---|---|
| 1 | no such source (D9) | the not-found page, 404 |
| 2 | `source.kind` is not `'photo'`, or `listSourceTasks(db, source.id)` is not empty | 303 to `/review/<id>`, the analyzer is not called |
| 3 | otherwise | `answerAnalysis(res, source, await analyzePhotoSource(deps, source))` |

The handler is `async`; Express 5 sends a rejection to its error handler (checked: 500).
No body is read. A `voice` or `text` source gets row 2 until 007 analyzes transcripts:
its review page then says `Nothing to review`. Rejected: 404 for such a source, which
would say the source does not exist.

**D9. A source id is read strictly, and an unknown one falls through to the app's
not-found page.** In `src/routes/review.ts`, not exported:

```ts
const ID_SHAPE = /^[1-9]\d{0,14}$/;
function readId(raw: unknown): number | undefined
function findSource(db: Database, raw: unknown): Source | undefined
```

`readId` returns the number when `raw` is a string that matches, else `undefined`.
`findSource` is `getSource` on that number. Every handler starts with it and calls
`next()` when there is no source; the handler at the end of `createApp` then renders the
not-found page with 404, for any method. Checked: `GET` of `/review/99`, `/review/abc`,
`/review/1.0`, `/review/01` and `/review/-1`, and a `POST` to each of the four action
routes with an unknown id, all answer 404 with that page. The same `readId` reads
`taskId` (D11).

**D10. The form's fields are flat names with the task id: `title-<id>`, `minutes-<id>`,
`priority-<id>`, `slot-<id>`.** One function builds them, in `src/services/drafts.ts`:

```ts
export type DraftFieldName = 'title' | 'minutes' | 'priority' | 'slot';
export function draftField(name: DraftFieldName, taskId: number): string   // `${name}-${taskId}`
```

The view gets the names from the route (D16) and never builds one itself, so the page
and the reader cannot drift apart. The body is parsed by
`express.urlencoded({ extended: false })`, mounted on the confirm and remove routes only.
Checked on Express 5.3.0:

- A posted form arrives as an object of strings; a field posted twice arrives as an
  array.
- `req.body` is `undefined`, not `{}`, when there is no body or the body is JSON or
  multipart. The reader below takes `unknown`.
- A body over 100 kB or with more than 1000 fields is answered by Express itself with
  413. That is room for some 250 cards. Left as it is.

```ts
/** A string, `undefined` when the field was not posted, `null` when it was posted more than once. */
export function postedValue(body: unknown, name: string): string | null | undefined
```

It answers only for an own property (`Object.hasOwn`).

Rejected: `tasks[12][title]` with the extended parser. It needs `qs` semantics, depth
limits and a shape check for a tree the reader would flatten again.

**D11. The five routes of `src/routes/review.ts`.** `createReviewRouter(deps: AppDeps):
Router`, mounted in `createApp` directly after the Add router. `form` below is the
parser of D10.

| Route | Does | Answers |
|---|---|---|
| `GET /review/:sourceId` | D17 | 200 with the review page |
| `POST /review/:sourceId/analyze` | D8 | 303, or the Add page with 200 or 502 |
| `POST /review/:sourceId/confirm` (`form`) | D14 | 303 to `/review/<id>`, or 400 with the review page |
| `POST /review/:sourceId/remove/:taskId` (`form`) | below | 303 to `/review/<id>` |
| `POST /review/:sourceId/discard` | `discardDrafts(db, source.id)` | 303 to `/add` |

Remove: `drafts = listDrafts(db, source.id)`; `removed` is the draft whose id is
`readId(req.params.taskId)`. With no source or no such draft: `next()`, before anything
is written (AC14: 404, nothing changed). Otherwise
`removeDraft(db, removed, others, readDraftEdits(req.body, others))`, where `others` are
the remaining drafts, then the redirect. The removed card's own posted fields are never
read.

Discard reads no body. After it the source has no drafts; tasks of another status, the
source row and the file are not touched (AC15).

No route checks who is asking (the spec: one user, no login).

**D12. The "Analyzing..." element.** In `pages/add.ejs`, directly after the upload form:

```ejs
  <div class="analyzing" role="status" data-analyzing hidden>
    <p class="analyzing__text">Analyzing...</p>
    <%- include('../partials/skeleton', { skeleton: {} }) -%>
  </div>
```

The skeleton partial brings a `role="status"` of its own and the hidden label `Loading`.
That is a status inside a status. Accepted: the partial is used as it is (004 kept the
partials untouched, and its two 002 tests fix the role and the label), and the element
is on screen only while a request is waiting.

Because of it, "no element with `role="status"`" is no longer true of the Add page. The
tests that asserted it now count only statuses that are shown (D22, `isShown`).

**D13. `public/js/add-analyzing.js`: what it does, exactly.** A second deferred script
of the Add page, after `add-photo.js`. Same style: one function that calls itself, `var`,
no arrow functions.

1. Finds `[data-analyzing]` and every `[data-analyze-form]`. The page always has the
   first and at least one of the second.
2. `setBusy(busy)`: sets `hidden` on the status to `!busy`, and `disabled` on every
   `[data-analyze-form] [type="submit"]` to `busy`.
3. `submit` on each such form calls `setBusy(true)`. It never calls `preventDefault`.
4. `pageshow` on `window` calls `setBusy(false)`.

Only submit buttons are disabled. The file input is not: a disabled input is left out of
the post. Retake is `type="button"` and stays as it is.

Checked in Chrome 154: a button disabled inside the `submit` listener does not stop the
post. Also checked there: without step 4, going back after the redirect brings the page
back from the browser's back-forward cache with the status shown and the buttons
disabled (`persisted: true`, twice); with step 4 it is reset.

A separate file, not more lines in `add-photo.js`: that file is the preview, and 007's
forms need this state without a photo. They opt in with `data-analyze-form`. Cost: the
two 004 tests that expect exactly one script change (D23).

**D14. `readDraftEdits` reads the posted fields of the given drafts, field by field.**

```ts
export interface DraftEdit {
  title?: string;
  estimated_minutes?: number;
  priority?: Priority;
  time_slot?: Slot | null;
}
export interface DraftProblems { title: boolean; minutes: boolean; choice: boolean }
export interface DraftEdits { byTask: Map<number, DraftEdit>; problems: DraftProblems }

export function readDraftEdits(body: unknown, drafts: readonly Task[]): DraftEdits
export function hasProblems(problems: DraftProblems): boolean
```

For each draft and each of its four fields, with `value = postedValue(body, draftField(name, draft.id))`:

| Field | `undefined` (not posted) | Valid when | Edit | Else |
|---|---|---|---|---|
| `title` | no edit | a string with `value.trim() !== ''` | `title: value.trim()` | `problems.title` |
| `minutes` | no edit | a string whose trimmed text matches `/^\d{1,4}$/` and is a number from 1 to 1440 | `estimated_minutes: <number>` | `problems.minutes` |
| `priority` | no edit | the id of one of `priorities` | `priority: <id>` | `problems.choice` |
| `slot` | no edit | `''`, or the id of one of `slots` | `time_slot: null` for `''`, else the id | `problems.choice` |

A field posted more than once (`null`) is never valid. `byTask` has an entry for every
draft given, empty when nothing valid was posted for it. Only the drafts handed in are
looked up, so a field named after any other task is never read (AC12).

`MIN_MINUTES = 1` and `MAX_MINUTES = 1440` are exported constants of the service; the
analyzer keeps its own private pair (005).

The minutes rule is strict: `30.0`, `3e1`, `+30` and `1e2` are refused, `030` is 30. A
number input can send `3e1`; the user then gets the page back with the message.

- **Confirm** (AC12, AC13): `drafts = listDrafts(db, source.id)`, then the edits. With
  `hasProblems`: 400 and the page (D16); nothing is written. Otherwise
  `confirmDrafts(db, drafts, edits)` and the redirect.
  `confirmDrafts` runs, in one transaction, `updateTask(db, draft.id, { ...edit, status: 'pending' })`
  for every draft. A source without drafts passes with nothing to do, which is the
  second confirm of AC16.
- **Remove** (AC14): the problems are ignored. `removeDraft(db, removed, others, edits)`
  runs, in one transaction, `deleteTask(db, removed.id)` and then `updateTask` for each
  other draft whose edit has at least one field. Status is not set, so they stay drafts.

```ts
export function listDrafts(db: Database, sourceId: number): Task[]   // listTasks(db, { status: 'draft', source_id: sourceId })
export function confirmDrafts(db: Database, drafts: readonly Task[], edits: DraftEdits): void
export function removeDraft(db: Database, removed: Task, others: readonly Task[], edits: DraftEdits): void
export function discardDrafts(db: Database, sourceId: number): void  // deletes listDrafts(...) in one transaction
```

Checked in the prototype: a confirm with one bad field leaves every draft as stored
(compared with `toEqual` against the rows read before); a remove stores the valid fields
of the other cards and skips an invalid one.

**D15. The three messages of a refused confirm.** Constants in `src/routes/review.ts`,
shown in this order, each only when its problem is set:

| Problem | Constant | Message |
|---|---|---|
| `title` | `NO_TITLE` | `Give every task a title.` |
| `minutes` | `BAD_MINUTES` | `Set every duration to a whole number of minutes from 1 to 1440.` |
| `choice` | `BAD_CHOICE` | `Choose every priority and every slot from the ones offered.` |

The third is this design's wording; the form cannot send such a value. They are rendered
in one element, one `<p>` each:

```ejs
<div class="notice notice--error" role="alert">
<% for (const message of review.errors) { -%>
  <p><%= message %></p>
<% } -%>
</div>
```

**D16. The view gets cards, not tasks.** Built in `src/routes/review.ts` by
`cardOf(sourceId: number, draft: Task, body: unknown): DraftCard`, not exported:

| Field | Value |
|---|---|
| `id` | `draft.id` |
| `title` | the posted string, else `draft.title` |
| `minutes` | the posted string, else `String(draft.estimated_minutes)`, or `''` when that is `null` |
| `priority` | the posted value when it is a priority id, else `draft.priority` (may be `null`) |
| `slot` | the posted value when it is `''` or a slot id, else `draft.time_slot ?? ''` |
| `lowConfidence` | `draft.confidence !== null && draft.confidence < LOW_CONFIDENCE` |
| `fields` | `{ title, minutes, priority, slot }`, each from `draftField` |
| `removeAction` | `/review/<sourceId>/remove/<draft.id>` |

"Posted" means `postedValue` returned a string. On a plain `GET` the body is `undefined`
and every value is the stored one. `LOW_CONFIDENCE = 0.5` is an exported constant of the
service (AC9: below it, not at it).

A posted title or number is shown exactly as posted, blank or wrong, so the user sees
what was refused. A priority or slot the page has no control for cannot be shown; the
card falls back to the stored one.

Everything goes through one function:

```ts
function renderReview(res: Response, db: Database, source: Source, status = 200, body: unknown = undefined, errors: string[] = []): void
```

It sets the status and calls `renderPage(res, 'review', { title: 'Review tasks', nav: 'add', review })`
with

```ts
review: {
  source,                       // the Source row
  cards,                        // DraftCard[], from listDrafts in id order
  savedCount,                   // 0 when there are cards, else listSourceTasks(db, source.id).length
  errors,                       // string[]
  confirmAction,                // `/review/<id>/confirm`
  discardAction,                // `/review/<id>/discard`
}
```

**D17. The three states of `pages/review.ejs`.**

| State | When | Heading (page-header partial) | Rest |
|---|---|---|---|
| drafts | `review.cards.length > 0` | `Review N tasks`, `Review 1 task` for one; `sub`: `Nothing saved yet` | the source (below), the errors (D15), the form (D18), the script tag |
| saved | no cards, `savedCount > 0` | `N tasks saved`, `1 task saved` for one | `<p>` with the button partial as a link: `Add another`, `href="/add"` |
| empty | neither | `Review` | the empty-state partial: `heading: 'Nothing to review'`, `text: 'This photo or note has no tasks waiting.'`, `actions`: the button partial as a link, `Add a task`, `href="/add"` |

Only the drafts state has a form and links the script. The empty state needs an `<h1>`;
the partial's heading is an `<h2>`.

The source, in the drafts state only, between the header and the errors:

```ejs
<details class="source">
<% if (review.source.kind === 'photo') { -%>
  <summary class="source__summary">Photo</summary>
  <img class="photo" src="<%= review.source.image_path %>" alt="The photo these tasks were read from">
<% } else { -%>
  <summary class="source__summary">Transcript</summary>
  <p class="source__text"><%= review.source.transcript %></p>
<% } -%>
</details>
```

No `open` attribute. "Pinned" is read as "placed above the cards", not as sticky.
Checked: a transcript of `buy <b>milk</b>` is rendered escaped.

**D18. The form.** The whole of it; tests select on the attributes and the `data-`
hooks.

```ejs
<form class="review-form" method="post" action="<%= review.confirmAction %>">
  <%- include('../partials/button', { button: { label: 'Confirm all', type: 'submit', attrs: { hidden: '' } } }) -%>
  <ol class="drafts">
<% for (const card of review.cards) { -%>
    <li class="card draft" data-draft="<%= card.id %>">
      <div class="draft__row">
<% if (card.lowConfidence) { -%>
        <span class="draft__flag"><span aria-hidden="true">⚠</span> Low confidence</span>
<% } -%>
        <%- include('../partials/button', { button: { label: 'Remove', variant: 'ghost', type: 'submit', attrs: { formaction: card.removeAction, formnovalidate: '' } } }) -%>
      </div>
      <input class="field" type="text" name="<%= card.fields.title %>" value="<%= card.title %>" aria-label="Task title" required>
      <div class="stepper" data-stepper>
        <%- include('../partials/button', { button: { label: '−', variant: 'ghost', attrs: { 'data-minutes-step': '-5', 'aria-label': '5 minutes less', hidden: '' } } }) -%>
        <input class="field stepper__input" type="number" name="<%= card.fields.minutes %>" value="<%= card.minutes %>" min="1" max="1440" aria-label="Minutes" required data-minutes>
        <%- include('../partials/button', { button: { label: '+', variant: 'ghost', attrs: { 'data-minutes-step': '5', 'aria-label': '5 minutes more', hidden: '' } } }) -%>
        <span class="stepper__unit" aria-hidden="true">min</span>
      </div>
      <fieldset class="choices">
        <legend class="visually-hidden">Priority</legend>
<% for (const item of ui.priorities) { -%>
        <label class="choice">
          <input type="radio" name="<%= card.fields.priority %>" value="<%= item.id %>"<% if (card.priority === item.id) { %> checked<% } %>>
          <span><span aria-hidden="true"><%= item.glyph %></span> <%= item.label %></span>
        </label>
<% } -%>
      </fieldset>
      <select class="field" name="<%= card.fields.slot %>" aria-label="Time slot">
        <option value=""<% if (card.slot === '') { %> selected<% } %>>No slot</option>
<% for (const item of ui.slots) { -%>
        <option value="<%= item.id %>"<% if (card.slot === item.id) { %> selected<% } %>><%= item.label %></option>
<% } -%>
      </select>
    </li>
<% } -%>
  </ol>
  <div class="review-bar">
    <%- include('../partials/button', { button: { label: 'Discard', variant: 'ghost', type: 'submit', attrs: { formaction: review.discardAction, formnovalidate: '' } } }) -%>
    <%- include('../partials/button', { button: { label: `Confirm all (${review.cards.length})`, type: 'submit' } }) -%>
  </div>
</form>
<script src="/js/review.js" defer></script>
```

- **The hidden first button is not decoration.** Enter in a text or number field presses
  the form's first submit button in document order. Checked in Chrome 154: without it,
  Enter in a title field posted to `/remove/<first id>` and the first card was gone;
  with it, Enter posted to the form's own action, the confirm. `hidden` takes it out of
  the tab order and away from screen readers, and the browser still uses it. It must
  stay the first submit button of the form and must have no `formaction`.
- **`formnovalidate` on Remove and Discard.** The title and the minutes are `required`,
  so the browser stops a confirm with a blank one before it is posted. Remove and
  Discard must still post. Checked in Chrome: with another card's title blank, Enter was
  stopped and Remove posted.
- **The `−` character is U+2212**, the minus sign of the spec, not a hyphen.
- **The stepper buttons have no `type` attribute in the object**, so the partial makes
  them `type="button"`: they never post.
- **The slot picker is a `<select>`**, the priorities are radios, as AC8 asks. A draft
  with no priority has no radio checked and posts no `priority` field, which D14 reads as
  "keep the stored value".
- **The card is the `card` class on the `<li>`**, not the card partial: the partial is
  one `<div>` around a body built as a string, and a list item cannot be inside it.
- The names of the title, the minutes and the slot are `aria-label`s, as in the mockup.
  The radios are named by their labels and grouped by the `<legend>`.

Checked: the fields of this form, read back from the served page and posted unchanged,
confirm every draft with its stored values.

**D19. `public/js/review.js`: what it does, exactly.** Deferred, same style as D13.

1. Finds every `[data-minutes-step]`. For each: removes `hidden`, and on `click` calls
   `step(event.currentTarget)`.
2. `step(button)`: the input is `button.closest('[data-stepper]').querySelector('[data-minutes]')`.
   `current` is `Number(input.value)`, or 0 when the value is blank or not a finite
   number. The new value is `Math.round(current)` plus the button's `data-minutes-step`,
   held between 1 and 1440, written back as a string.

So 30 and `+` is 35, 3 and `−` is 1, 1438 and `+` is 1440, a blank field and `+` is 5.
The step is always 5; values are not snapped to multiples of 5 (AC10: "by 5").

The buttons are served hidden and shown here, because without the script they would do
nothing (004 D12 did the same with Retake). The number can always be typed.

Checked in jsdom 30.1.1: the values above, and that a number input given `abc` reads as
`''`.

**D20. `createTestApp` takes the analyzer, and has a harmless default.** In
`src/testing/app.ts`:

```ts
export interface TestAppOptions { analyze?: Analyze }
export function oneTaskAnalysis(): Analysis
export function createTestApp(options: TestAppOptions = {}): TestApp
```

`TestApp` gains `analyze: Analyze`, the one the app was built with. The default resolves
to `oneTaskAnalysis()`, a new object each call: one task (`Buy milk`, `''`, `shopping`,
15, `medium`, 0.9) and `fallback: false`. So an upload in a test that does not care
about the analyzer ends in a 303, and no test app can reach the network: the real
analyzer is built in `server.ts` only. A test that cares hands in
`vi.fn<Analyze>()`. `withTestApp` is unchanged.

**D21. The CSS.** Added to `public/css/base.css` at the end of the Components section,
directly above the `Style guide` section comment, plus one rule in the wide block. It
follows the file's rules; the 002 guards in `src/stylesheet.test.ts` and
`src/components.test.ts` passed with it unedited (checked).

```css
/* Analyzing: shown by the page's script while a request waits for the analyzer. */
.analyzing {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.analyzing__text {
  font-weight: 700;
}

/* Field: a text input, a number input or a select in a form. */
.field {
  width: 100%;
  min-height: var(--touch-target);
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font: inherit;
}

/* Source: the photo or the transcript the drafts were read from, closed until asked for. */
.source {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.source__summary {
  padding: var(--space-3);
  color: var(--muted);
  font-weight: 700;
  cursor: pointer;
}

.source > .photo,
.source__text {
  margin: 0 var(--space-3) var(--space-3);
}

.source__text {
  white-space: pre-wrap;
}

/* Review: one card per draft, in one form, above a bar that stays in view. */
.review-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.drafts {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0;
  list-style: none;
}

.draft {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.draft__row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

.draft__flag {
  margin-right: auto;
  color: var(--high);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.stepper {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.stepper__input {
  width: 6rem;
}

.stepper__unit {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  min-width: 0;
  padding: 0;
  border: 0;
}

.choice {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.choice input {
  accent-color: var(--accent);
}

.choice input:checked + span {
  font-weight: 700;
}

/* The bar sits on the tab bar; its bottom padding clears the raised Add button. */
.review-bar {
  position: sticky;
  bottom: var(--nav-height);
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) 0 var(--space-4);
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.review-bar .btn {
  flex: 1;
}
```

In the `@media (min-width: 900px)` block, after `.toast-region`:

```css
  .review-bar {
    bottom: 0;
  }
```

- The radio keeps its native dot, so the chosen priority is not shown by weight or color
  alone. The low-confidence text is `var(--high)`, an existing token, beside the words.
- `.field` has no `:focus` rule; the page-wide `:focus-visible` outline applies.
- No ancestor of the bar may get `overflow` other than `visible`, or it stops sticking.
- Seen at 375px in the prototype, with `bottom: calc(var(--nav-height) + var(--space-4))`
  and even padding: cards showed through the gap between the bar and the tab bar. The
  rule above closes the gap. It has not been looked at since; the builder looks (plan,
  step 9). At 1200px the bar sat at the bottom of the window as intended.

**D22. Test helpers.** Checked on jsdom 30.1.1 and Vitest 5.0.1.

- `src/testing/dom.ts` gains
  - `isShown(element: DomElement): boolean`: `element.closest('[hidden]') === null`.
  - `formFields(form: DomElement): Record<string, string>`: what a browser would post
    for the form as served, read from the attributes of a page parsed with scripts off.
    Every `input[name]` with its `value` attribute (`''` when it has none), except a
    radio without `checked`; every `select[name]` with the `value` of its first
    `option[selected]`, or of its first option. Buttons are left out. It is how the
    tests prove that the page's field names and the routes agree.
  - the type `DomInput` (re-exported).
- `src/testing/jsdom.d.ts` gains `DomInput extends DomElement` with `value: string`;
  `cancelable?: boolean` in the init of `DomWindow.Event`; and
  `DomWindow.dispatchEvent(event: DomEvent): boolean`.
- **A submit is a dispatched event.** `form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))`
  runs the page's listener and returns `true` when nothing called `preventDefault`,
  which is the proof of "without stopping the submit". jsdom does not then navigate.
  Do not call `requestSubmit()` or click a submit button: jsdom has no navigation.
- **`pageshow`** is `window.dispatchEvent(new window.Event('pageshow'))`.
- **The stub** is `vi.fn<Analyze>()`; `analyze.mock.calls[n][0]` is the input, typed.
- **The network guard** of 005 D13 (`fetch` replaced by a rejecting spy, the number of
  calls asserted in `afterEach`) is used in the two new files that build a real
  analyzer.
- Every test file that runs page scripts asserts `scriptErrors(window)` in `afterEach`
  (`docs/errors/jsdom-page-script-error-does-not-fail-test.md`).

**D23. Existing tests that change, and how.** No assertion is loosened except where the
spec says the answer changed.

| File | Change |
|---|---|
| `src/add-photo.test.ts` | `beforeEach` builds `analyze = vi.fn<Analyze>(() => Promise.resolve(oneTaskAnalysis()))` and `createTestApp({ analyze })`. Every `toBe(201)` becomes `toBe(303)` (and `[201, 201]` becomes `[303, 303]`): nine places. In "stores a file declared as %s…" the content-type assertion and the block that parses the Add page (`expectAddPage`, `Photo saved.`, the `<img>`, no alert, the form action) are replaced by `expect(response.headers.location).toBe('/review/1')`; the stored file and the source row are asserted as before. `expectRejected` counts only shown statuses (`all(document, '[role="status"]').filter(isShown)`) and adds `expect(analyze).not.toHaveBeenCalled()`. The closed-database test adds the same line. The `createApp` call gets `analyze: testApp.analyze`. |
| `src/add-page.test.ts` | `beforeEach` builds `analyze = vi.fn<Analyze>(() => Promise.resolve({ tasks: [], fallback: false }))` and `createTestApp({ analyze })`. `getAddAfterPhoto` is replaced by `getAddAfterNoTasks` (200) and `getAddAfterFailure` (the stub resolves once to `{ tasks: [], fallback: true }`; 502); `addPages()` returns the four states. "shows no message…" counts only shown statuses. `NEW_CLASSES` gains `analyzing` and `analyzing__text`. "links to one script…" becomes two: the `src` values are `['/js/add-photo.js', '/js/add-analyzing.js']`, each `defer`, each served as JavaScript. "stays hidden when the script loads…" expects `start()` to resolve to those two. |
| `src/app.test.ts` | The three `createApp({ … })` calls get `analyze: testApp.analyze`. |
| `src/project.test.ts` | The plain-Node script passes `analyze: async () => ({ tasks: [], fallback: false })` as the third field. |
| `src/server.test.ts` | `./services/analyzer.ts` is replaced by `{ createAnalyze }`, a spy that returns a stand-in function `analyze` (and unmocked in `afterEach`), so the SDK is not loaded. The `createApp` spy's parameter type gains `analyze: unknown`. `toStrictEqual([{ db: database, uploadsDir }])` becomes `toStrictEqual([{ db: database, uploadsDir, analyze }])`. Two tests are added (`plan.md`). |
| `src/testing/app.test.ts` | Two tests are added (`plan.md`). Nothing that is there changes. |

Checked in the prototype: with the code changed and these files not yet edited, 49 tests
failed, all in `src/add-photo.test.ts`, `src/add-page.test.ts` and `src/server.test.ts`,
each for a reason in this table. The other 23 files passed unedited (774 tests). With
the `server.test.ts` edits that file passed, the two new tests included.

## Files

Created:

- `src/db/transaction.ts`: `inTransaction<T>(db: Database, run: () => T): T` (D4).
- `src/services/drafts.ts` (D5, D10, D14, D16):
  - `LOW_CONFIDENCE = 0.5`, `MIN_MINUTES = 1`, `MAX_MINUTES = 1440`.
  - `type AnalysisOutcome`, `interface DraftDeps`,
    `analyzePhotoSource(deps: DraftDeps, source: Source): Promise<AnalysisOutcome>`.
  - `listDrafts(db: Database, sourceId: number): Task[]`.
  - `type DraftFieldName`, `draftField(name: DraftFieldName, taskId: number): string`,
    `postedValue(body: unknown, name: string): string | null | undefined`.
  - `interface DraftEdit`, `interface DraftProblems`, `interface DraftEdits`,
    `readDraftEdits(body: unknown, drafts: readonly Task[]): DraftEdits`,
    `hasProblems(problems: DraftProblems): boolean`.
  - `confirmDrafts`, `removeDraft`, `discardDrafts` with the signatures of D14.
  - Imports the analyzer's types with `import type` only.
- `src/routes/review.ts`: `createReviewRouter(deps: AppDeps): Router` with the five
  routes of D11. Not exported: `NO_TITLE`, `BAD_MINUTES`, `BAD_CHOICE`, `ID_SHAPE`,
  `readId`, `findSource`, `interface DraftCard`, `cardOf`, `messagesOf(problems): string[]`,
  `renderReview`.
- `src/views/pages/review.ejs`: D17 and D18, under a header comment that names `review`
  and its six fields.
- `public/js/add-analyzing.js` (D13), `public/js/review.js` (D19), each under a header
  comment in the manner of `add-photo.js`.
- Tests: `src/db/transaction.test.ts`, `src/services/create-analyze.test.ts`,
  `src/add-analysis.test.ts`, `src/add-analyzing.test.ts`, `src/review-page.test.ts`,
  `src/review-actions.test.ts`: see `plan.md`.

Changed:

- `src/services/analyzer.ts`: append `type Analyze`, `class AnalyzerKeyError` and
  `createAnalyze` (D1, D2). Nothing that is there changes.
- `src/services/photo-storage.ts`: add `photoFile(uploadsDir: string, imagePath: string): string`
  and the import of `path` from `node:path` (D5).
- `src/app.ts`: `AppDeps` gains `analyze: Analyze` with a doc comment; the type import;
  `app.use(createReviewRouter(deps))` directly after the Add router. The doc comment of
  `createApp` names the third dependency.
- `src/server.ts`: the two lines of D2 and the three imports they need.
- `src/routes/add.ts`: `AddPage` and `renderAdd` (D7); `NO_TASKS`, `NOT_ANALYZED`;
  `reviewPath` and `answerAnalysis`, exported (D6); row 6 of the upload (D6). The header
  comment of `AddPage` names the three fields.
- `src/views/pages/add.ejs`: D7 and D12; the second script tag after the first; the
  header comment names the three fields and both scripts.
- `public/css/base.css`: D21.
- `src/testing/app.ts` (D20), `src/testing/dom.ts` and `src/testing/jsdom.d.ts` (D22).
- `src/add-photo.test.ts`, `src/add-page.test.ts`, `src/app.test.ts`,
  `src/project.test.ts`, `src/server.test.ts`, `src/testing/app.test.ts`: the table in
  D23.

Not touched: `package.json` and `yarn.lock` (no package is added; `express.urlencoded`
comes with Express); `src/config.ts`, `.env.example` and `vitest.config.ts` (both
settings exist); everything under `src/db/` except the new file (`createTask`,
`updateTask`, `deleteTask`, `listTasks`, `getSource` and `listSourceTasks` are used as
they are; no migration; `migrations.ts` keeps its own rollback); `src/analyze.ts` and
`src/analyze-command.ts` (the command keeps making its own client);
`src/services/analyzer.test.ts`; `src/views/layout.ejs` and every partial (D12);
`home.ejs`, `not-found.ejs`, `styleguide.ejs`; `public/js/add-photo.js`; `src/ui.ts`;
`src/render.ts` (`PageLocals` already allows `review`); `src/routes/home.ts` (it lists
no tasks yet; AC18 is held by a test); `src/shell.test.ts`, `src/stylesheet.test.ts`,
`src/components.test.ts` and `src/ui.test.ts`; `tsconfig.json`, `.gitignore`,
`CLAUDE.md`, `README.md`; `docs/` unless the builder logs an error; everything under
`factory/` except this job's `build.md`.

## Risks

- **Enter in a title field removes the first card.** The hidden first button of D18
  prevents it. An AC8 test asserts that the form's first submit button is hidden and has
  no `formaction`. The behaviour itself was checked in Chrome only; Safari and Firefox
  follow the same rule of the HTML standard and were not tried. The builder tries Enter
  by hand (plan, step 9).
- **The fallback task is saved.** The AC4 tests hand in a `fallback: true` result with a
  task in it and expect no task row.
- **Part of a list is stored.** The transaction test stores nothing when the second of
  two writes fails; an AC2 test hands in a task the table refuses (a confidence of 2)
  after a good one and expects 500 and no task.
- **A refused confirm changes a draft.** Every AC13 test compares all task rows before
  and after with `toEqual`.
- **The page's field names and the routes drift apart.** The AC12 test posts
  `formFields` of the served form; a renamed field makes it post nothing the route
  reads, and the edit test fails.
- **A field of another task is written.** AC12 and AC14 tests post fields named after a
  pending task of the same source and a draft of another source.
- **Remove loses the edits of the other cards, or confirms them.** The AC14 tests assert
  the stored values and the status `draft` of the others.
- **The retry makes a second source or file.** The AC5 tests count both.
- **Two requests analyze one source.** Step 5 of D5; one AC5 test.
- **The script stops the post or leaves the page stuck.** The AC6 tests assert the
  return value of `dispatchEvent` and the reset on `pageshow`. That a disabled button
  does not stop a real post was checked in Chrome only.
- **A status inside a status** (D12) may be read twice by a screen reader. Accepted;
  live regions are 023.
- **A script throws and the test passes.** `afterEach` asserts `scriptErrors` in both
  new page test files.
- **A draft shows on another page.** The AC18 test requests `/`, `/add` and
  `/_styleguide` after an upload. It passes today because no page lists tasks; it is
  there for the jobs that add one.
- **A missing key looks like a failed photo.** The page cannot tell them apart; the line
  of D3 on stderr can. A wrong key or model ends in `fallback: true` and leaves nothing
  (005).
- **The request waits for the analyzer**, up to the SDK's ten minutes and its repeats.
  The spec says so. Node's server does not time out a response that is being waited for.
- **The new CSS breaks a 002 guard.** `src/stylesheet.test.ts` runs unedited.
- **The bar hides the last card's controls** on a short screen. It is sticky inside the
  form, so the page scrolls on under it; looked at once at 375px before the fix of D21.
- **A test leaves a file or reaches the API.** Test apps are temporary by construction
  (004 D17), no test builds a real analyzer except the two files with the `fetch` guard,
  and the configured key is blank under Vitest (005 D10).
- **Nothing here ran on Node 22 or 24.** The calls used are old (`Object.hasOwn` is in
  Node since 16.9). If the builder has one at hand, running the suite on it once is
  worth a line in `build.md`.
