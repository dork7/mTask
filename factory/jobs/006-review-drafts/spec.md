# 006-review-drafts: draft tasks and the review-before-save screen

## Goal

Nothing the AI reads from a photo is saved until the user has looked at it
(`docs/plan.md`, task 5 and U4). This job joins the upload of 004 to the analyzer of 005:
an uploaded photo is analyzed, each task the analyzer returns is stored as a `draft`
under the photo's source, and the user lands on `/review/:sourceId`. There every draft is
a card that can be edited or removed, and the whole set is confirmed or discarded.
Confirming turns the drafts into `pending` tasks. The Add page gets its "Analyzing..."
state and an error state with a retry.

`POST /add/photo` in `src/routes/add.ts` answers today with `Photo saved.`; 004 left the
redirect to this job. Drafts are written with `createTask` from 003, which already has
`status`, `source_id` and `confidence`, so no migration is needed. The analyzer is
`analyze` in `src/services/analyzer.ts`; this is the first job that calls it from a
request. The Review screen is the second mockup in `docs/mockUps.html`. The plan names
only `/review/:sourceId`: the other routes, the status codes, the messages and the
low-confidence limit below are this spec's choices. Form field names are the architect's.

## Acceptance criteria

- **AC1**: The analyzer the routes call is handed to `createApp`, as the database and the
  uploads folder are, so a test passes a stub and no test reaches the network.
  `src/server.ts` hands in the real one, built from `getAnthropicApiKey()` and
  `getAnthropicModel()`. With `ANTHROPIC_API_KEY` unset the server still starts and every
  page answers; an upload then ends in the error state of AC4 and no request is made to
  the API.
- **AC2**: `POST /add/photo` with an accepted photo stores the file and the source as in
  004, then calls the analyzer once with the stored file as an image input (its path
  inside the uploads folder). When the result has `fallback: false` and one or more
  tasks, each task is stored in the result's order with `status` `draft`, `source_id`
  the new source, `title`, `description`, `category`, `estimated_minutes` and
  `confidence` as returned, and `priority` set to the task's `urgency`. `time_slot` and
  every other column are left unset; the photo is reached through the source. The
  response is 303 with `Location: /review/<source id>`. The 004 tests that expect 201 and
  `Photo saved.` are changed. An upload that 004 rejects (415, 413, 400) answers as
  before and does not call the analyzer.
- **AC3**: When the result has `fallback: false` and no tasks, no task is stored and the
  response is 200 with the Add page, the message `No tasks were found in that photo.` in
  an element with `role="status"`, and the upload form.
- **AC4**: When the result has `fallback: true`, or the analyzer rejects, no task is
  stored: the fallback task is never saved. The source and the file are kept. The
  response is 502 with the Add page, the message `The photo could not be analyzed.` in an
  element with `role="alert"`, a form with `method="post"` and
  `action="/review/<source id>/analyze"` whose submit button is `Try again`, and the
  upload form.
- **AC5**: `POST /review/:sourceId/analyze` on a photo source with no tasks calls the
  analyzer once on the stored photo and answers exactly as AC2, AC3 or AC4 would, without
  creating a second source or file. On a source that already has a task of any status it
  does not call the analyzer and answers 303 to `/review/<source id>`.
- **AC6**: The Add page has an element with `role="status"`, the text `Analyzing...` and
  the skeleton partial, hidden when the page loads. When the upload form or the
  `Try again` form is submitted, the page's script shows it and disables the submit
  buttons, without stopping the submit. This raises no script error. The request itself
  is answered only when the analysis is done: there is no polling and no job queue.
- **AC7**: `GET /review/:sourceId` for a source with drafts returns 200 in the layout
  with the Add navigation link marked `aria-current="page"`, the heading `Review N tasks`
  (`Review 1 task` for one) and the text `Nothing saved yet`. The source is pinned above
  the cards in a `<details>` element, closed by default: an `<img>` whose `src` is the
  source's `image_path` for a photo, the transcript as text for a `voice` or `text`
  source.
- **AC8**: The page has one card per draft of that source, in `id` order, and no card for
  a task of another source or of another status. All cards sit in one form that posts
  without any script. A card holds:
  - a text input with the accessible name `Task title`, holding the title;
  - a number input for the minutes, with `min="1"` and `max="1440"`, holding
    `estimated_minutes`, between a `−` and a `+` button;
  - one radio input per priority of `src/ui.ts`, with the draft's priority checked;
  - a slot picker with the four slots of `src/ui.ts` and a `No slot` choice, which is
    the one selected while `time_slot` is unset;
  - a `Remove` button.
- **AC9**: A card whose draft has a `confidence` below 0.5 shows the text
  `Low confidence`. A card at 0.5 or above, or with no confidence, does not.
- **AC10**: The page's script makes `−` and `+` change the card's minutes by 5, never
  below 1 or above 1440, and raises no script error. Without the script the number can
  still be typed.
- **AC11**: The form ends in a bar that the stylesheet keeps in view with
  `position: sticky`. It holds a `Discard` button and a `Confirm all (N)` button, N being
  the number of cards. Every button on the page carries the `btn` class.
- **AC12**: `POST /review/:sourceId/confirm` with the form's fields stores, for every
  draft of the source, the posted title (trimmed), minutes, priority and slot (`No slot`
  stores an unset `time_slot`), sets its `status` to `pending`, and answers 303 to
  `/review/<source id>`. A draft the body has no fields for is confirmed as stored.
  Fields for a task that is not a draft of this source change nothing.
- **AC13**: A confirm in which any draft has a blank title, or minutes that are not a
  whole number from 1 to 1440, or a priority or slot that `src/ui.ts` does not have,
  answers 400 and changes no task: every draft is still a `draft` with its stored
  values. The page is rendered again with the posted values in the cards and, in an
  element with `role="alert"`, `Give every task a title.` for a blank title and
  `Set every duration to a whole number of minutes from 1 to 1440.` for bad minutes.
- **AC14**: `POST /review/:sourceId/remove/:taskId`, which the card's `Remove` button
  posts the whole form to, deletes that draft and answers 303 to `/review/<source id>`.
  Edits made to the other cards are not lost: each posted field of another draft that
  passes the checks of AC13 is stored, one that does not is left as stored, and those
  drafts stay `draft`. A `taskId` that is not a draft of this source answers 404 and
  changes nothing.
- **AC15**: `POST /review/:sourceId/discard` deletes every draft of the source, leaves
  its tasks of any other status, the source row and the photo file in place, and answers
  303 to `/add`.
- **AC16**: `GET /review/:sourceId` for a source with no drafts shows no form. When the
  source has tasks of another status it shows `N tasks saved` (`1 task saved` for one)
  and a link `Add another` to `/add`; this is what the user sees after a confirm. When
  the source has no tasks at all it renders the empty-state partial with
  `Nothing to review` and a link to `/add`. A second confirm on such a source changes
  nothing and answers 303.
- **AC17**: Every `/review/...` route answers 404 with the not-found page when
  `sourceId` is not the id of a source, including an id that is not a number.
- **AC18**: Before a confirm, no page other than `/review/<source id>` contains a
  draft's title: `GET /` after an upload does not. After a confirm,
  `listTasks(db, { status: 'pending' })` returns the confirmed tasks and
  `listTasks(db, { status: 'draft' })` returns none of them.
- **AC19**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. The new
  tests use a stubbed analyzer, a temporary uploads folder and a temporary or in-memory
  database, and leave nothing in `data/`.

## Out of scope

- Analyzing a `voice` or `text` source, and the Voice and Type tabs (007). The review
  page already shows a transcript (AC7), but AC2 to AC5 cover photo sources only.
- Choosing a priority and a slot from the category: the rules are 008. Until then a
  draft's priority is the analyzer's `urgency` and it has no slot. The backlog's open
  decision 3 (which slot coding and shopping get) is not needed here and is not taken.
- Scheduling on confirm and the "Today 8:00 PM" landing preview on a card (009).
  Confirmed tasks have no `scheduled_start`.
- The recurrence picker on a card (016).
- Pages that list confirmed tasks: `/tasks` (010), `/timeline` (012), Today (014). Each
  of them must leave out `draft` tasks; this job only guarantees the status.
- Editing a draft's description or category. The plan's task 5 names title, duration,
  priority and slot.
- Keeping the fallback task. 005 returns one so that a caller always has something; this
  job reads `fallback: true` as a failed analysis and offers the retry instead, so
  nobody confirms an `Untitled task` by accident.
- A toast after confirm or discard, and undo (023). 002 expected the toast here; AC16
  gives the confirmation as a page state instead.
- Deleting the photo and the source when a set is discarded or an analysis finds nothing
  (023, cleanup of images with no tasks), and rate limiting on the AI endpoints (023).
- Analysis in the background. The upload request waits for the analyzer, with no time
  limit beyond the client's own.
- Accounts. The backlog's open decision 4 is taken at its default, one user and no
  login, so `/review/:sourceId` is not guarded.
- Checked by hand: with a real key, a phone photo of a handwritten list shows the
  "Analyzing..." state and then several cards, and edits made there are on the saved
  tasks after `Confirm all`.
