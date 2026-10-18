# 023-hardening: plan

Decision numbers (D1, D2, …) refer to `design.md`.

## Steps

1. **Error page.** Files: `src/routes/errors.ts`, `src/views/pages/error.ejs`,
   `src/render.ts`, `src/routes/mini-bar.ts`, `src/app.ts`. Serves AC1, AC2.
   - Add `PageToast`, `toast?` and the optional `done` parameter to `renderPage` (D5).
   - Give both properties of the mini-bar middleware `configurable: true`, and export
     `skipLayoutReads` (D4).
   - Write `errorStatus` and `createErrorHandler` (D1, D2) and the page of D1.
   - Mount the handler last in `createApp`.
   - Check: `vitest run src/error-page.test.ts`.

2. **Live region and toast partial.** Files: `src/views/layout.ejs`,
   `src/views/partials/toast.ejs`, `src/views/partials/undo-button.ejs`. Serves AC8.
   - Add `#live-region` after `</main>`, and render `locals.toast` inside it with the
     undo-button partial (D9).
   - Remove `aria-live` from the toast partial, and turn `toast__actions` into a `div`.
   - Check: `vitest run src/live-region.test.ts src/components.test.ts`.

3. **Rate limit.** Files: `src/services/rate-limit.ts`, `src/routes/add.ts`,
   `src/routes/review.ts`, `src/app.ts`. Serves AC3.
   - Write `createRateLimiter` (D6) and `limitAnalysis` with `TOO_MANY_REQUESTS` (D7).
   - Change the router signatures, mount the middleware on the four posts in the
     positions of D7, and make one limiter in `createApp`.
   - Check: `vitest run src/rate-limit.test.ts src/add-*.test.ts src/review-*.test.ts`.

4. **Rows for undo.** Files: `src/db/tasks.ts`, `src/services/task-actions.ts`,
   `src/services/task-list.ts`. Serves AC6, AC7.
   - Write `takeTask` and `restoreTask` (D10).
   - Make `markDone` return what it wrote (D11).
   - Add `withToastParam` (D13).
   - Check: `vitest run src/db/tasks-restore.test.ts src/services/recurrence.test.ts`.

5. **Undo service and routes.** Files: `src/services/undo.ts`, `src/routes/tasks.ts`,
   `src/routes/overdue.ts`, `src/app.ts`. Serves AC6, AC7.
   - Write the store and functions of D12.
   - Wire Done, Delete, the toasts of the `GET`s and the three undo posts as D13 lists.
   - Make one store in `createApp`.
   - Check: `vitest run src/undo.test.ts`.

6. **Photo cleanup.** Files: `src/db/sources.ts`, `src/services/photo-cleanup.ts`,
   `src/server.ts`. Serves AC4, AC5.
   - Write `removeStalePhotoSources` and `listImagePaths` (D15), and `runPhotoCleanup`
     and `startPhotoCleanup` (D14).
   - Call the starter from `server.ts` after `startRecurrence`.
   - Check: `vitest run src/services/photo-cleanup.test.ts src/server.test.ts`.

7. **CSS.** Files: `public/css/base.css`. Serves AC10, AC11.
   - Make the two changes of D16.
   - Check: `vitest run src/focus-motion.test.ts src/stylesheet.test.ts`.

8. **Accessible names.** Files: `src/accessible-names.test.ts`, and any view it finds
   failing. Serves AC9.
   - Write the audit (D17). Run it, and fix each view it names; do not fix the test.
   - Check: `vitest run src/accessible-names.test.ts`.

9. **README.** Files: `README.md`. Serves AC12.
   - Write the sections of D18.
   - Check: `vitest run src/readme.test.ts`.

10. **Existing tests and the full run.** Serves AC13.
    - Change only these, and list each change in the build report:
      - `src/components.test.ts`: "sits in a polite live region" now asserts that the
        `.toast-region` root has no `aria-live`. "puts every toast in a live region" now
        asserts that the only `[aria-live]` element on the style guide is `#live-region`
        and that the stage toast is not inside it.
      - `src/tasks-actions.test.ts` (Done Locations at about lines 105 and 116, which
        gain `done=1`), `src/task-start-done.test.ts` (about 196 and 207),
        `src/recurrence-done.test.ts` (the `/tasks/1/done` and `/overdue/1/done` cases),
        `src/overdue-actions.test.ts` (the Done case at about line 106, which becomes
        `/overdue?done=1`) and `src/tasks-edit.test.ts` (the Delete Locations, which
        gain `deleted=1`). Every path stays the same.
      - `src/server.test.ts`: `vi.doMock('./services/photo-cleanup.ts', () =>
        ({ startPhotoCleanup }))` in `beforeEach`, with the matching `doUnmock`.
      - Any view fix from step 8 that changes what an existing test checks.
    - Check: `yarn build` and `yarn test` with `ANTHROPIC_API_KEY` and the three
      `VAPID_*` unset, then `git status` shows nothing new under `data/`.

## Tests

Shared setup: `createTestApp()` from `src/testing/app.ts` (an in-memory database and a
temporary uploads folder), `request` from supertest, `parseHtml`, `all`, `one` and
`textOf` from `src/testing/dom.ts`. Tests that need a clock use
`vi.useFakeTimers({ toFake: ['Date'] })` with `vi.setSystemTime` (NOW =
`2026-10-12T09:36:00.000Z`) and call `vi.useRealTimers()` in `afterEach`. Every test that
causes a 500 sets `vi.spyOn(console, 'error').mockImplementation(() => {})`.

### AC1: `src/error-page.test.ts`
- Close the database, then `GET /tasks`. Assert 500, an HTML content type, the title
  `Something went wrong - Task Image AI`, exactly one `main h1` with the text
  `Something went wrong`, and an `a[href="/"]` in `main`. Fails without the handler,
  because Express's default page has none of these.
- In the same answer, assert no `#mini-bar` and no `#alarm`. Assert that the body does not
  contain the logged error's `message` and does not match `/\n\s+at /`. Assert that
  `console.error` was called once and its last argument is an `Error`. Fails when D4 is
  missing (the getter throws and the answer is Express's bare one), or when the message is
  shown.
- Make a task with `status: 'in_progress'` and an urgent `reminder_at`, then close the
  database and `GET /tasks`. Assert 500 with the page, so the layout extras are left out
  even when a task would show them.
- Close the database, then upload a PNG to `POST /add/photo`, which reaches `next(failure)`.
  Assert 500 with the same `h1`.
- Create a task, then add `CREATE TRIGGER … BEFORE UPDATE ON tasks … RAISE(ABORT, 'x')`
  and `POST /tasks/1/done`. Assert 500 with the page, so a thrown SQLite error is
  rendered too.
- `errorStatus` unit cases: `{ status: 404 }` gives 404, `{ statusCode: 418 }` gives 418,
  `{ status: 415, statusCode: 400 }` gives 415, and each of `{ status: 399 }`,
  `{ status: 503 }`, `{ status: '400' }`, `{ status: 400.5 }`, `null`, `'x'` and
  `new Error()` gives 500.

### AC2: `src/error-page.test.ts`
- Create task 1, then `POST /tasks/1/edit` with
  `Content-Type: application/x-www-form-urlencoded; charset=koi8-r` and body `title=a` (D3).
  Assert 415 (not 500), the `main h1` `Something went wrong`, the stored title unchanged,
  and `console.error` not called.
- `GET /no-such-page`: assert 404, the title `Page not found - Task Image AI`, and the `h1`
  `Page not found`. Fails if the error handler took over the 404s.

### AC3: `src/rate-limit.test.ts`
Unit tests of `createRateLimiter({ limit: 10, windowMs: 60_000, now })`, with `now`
reading a local variable:
- Ten hits of `'a'` at t=0 return `undefined`, and the eleventh returns 60.
- `'b'` is still accepted at t=0.
- With 10 hits at t=0, a hit at t=59 999 is refused and one at t=60 000 is accepted.
- Refused hits count: 5 hits at t=0, 5 at t=30 s and 5 refused at t=31 s, then a hit at
  t=60 s is refused with 30. Fails if refused hits are not recorded.
- Every refusal returns a whole number from 1 to 60.

App tests, with a faked `Date`:
- 10 × `POST /add/text` (`text=buy+milk`) answer 303. The eleventh request, a small PNG
  to `POST /add/photo`, answers 429:
  - `Retry-After` matches `/^\d+$/` and is from 1 to 60;
  - the selected tab (`[role=tab][aria-selected=true]`) reads `Photo`;
  - `.notice--error` holds `Too many requests. Wait a minute and try again.`;
  - `analyze` was called 10 times, there are 10 sources, and the uploads folder has no
    file.
- `it.each` over `/add/voice` (tab `Voice`), `/add/text` (tab `Type`) and
  `/review/1/analyze` (tab `Photo`, with source 1 created): after 10 accepted posts, the
  eleventh answers 429 with that tab and with no new source or `analyze` call. The text
  posts show the posted text in the textarea (D7).
- After the limit is hit, `GET /add` answers 200, and 15 more `GET /add` answer 200 each.
  `GET /tasks` and `POST /review/1/discard` do not answer 429.
- After the limit is hit, advance the clock by 60 s. `POST /add/text` then answers 303.
  Fails with a captured `Date.now` (D6).

### AC4: `src/services/photo-cleanup.test.ts`
Shared setup: `openDatabase(':memory:')`, an uploads folder from
`mkdtempSync(path.join(tmpdir(), 'mtask-cleanup-'))`, removed in `afterEach`, a faked
`Date`, and sources made with `setSystemTime` at their creation time. Files are written
and their mtime set with `utimesSync`.
- An old (25 h) photo source with no task: `runPhotoCleanup` returns its id in `sources`,
  `getSource` gives `undefined`, and its file is gone.
- Old photo sources with a draft, a pending, an in-progress and a done task each keep the
  source and the file (`it.each` over the four statuses).
- A photo source with no task created exactly 24 h before `now`, and one created 1 h
  before, are both kept with their files. Fails with `<=`.
- Old voice and text sources with no task are kept.
- An unnamed file with an mtime 25 h old is removed and listed in `orphans`. An unnamed
  file with an mtime 1 h old is kept. An old file named by a kept source is kept. A
  subfolder is left alone.
- An old source whose file is missing, and an uploads folder that does not exist: the run
  resolves with no error.
- App test: build an app on the same database, run the cleanup, then
  `GET /review/<removed id>` answers 404.

### AC5: `src/services/photo-cleanup.test.ts`, `src/server.test.ts`
- With `vi.useFakeTimers()`, `startPhotoCleanup(db, dir, cleanup)` and a `vi.fn` that
  resolves: one call right away with `(db, dir, a Date)`, two after
  `advanceTimersByTime(60 * 60_000)`. After `stop()` and two more hours, still two.
- A cleanup that rejects is logged with `console.error` (spied) and does not stop the
  interval: a second call happens after an hour.
- `createApp` does not start it: open a database, make an old photo source with no task
  and an old orphan file, call `createApp`, and await one `setImmediate`. The source and
  the file are both still there.
- `server.test.ts`: `startPhotoCleanup` is called once with the database `openDatabase`
  returned (`toBe`) and the configured uploads folder, and after `openDatabase`
  (invocation order).

### AC6: `src/db/tasks-restore.test.ts`, `src/undo.test.ts`
`tasks-restore.test.ts`:
- `takeTask` then `restoreTask` on a task with every field set and `reminded_at` set by
  SQL. The raw `SELECT * FROM tasks WHERE id = ?` row afterwards equals the one before,
  `reminded_at` and `updated_at` included. Fails if `toTask`'s row is used.
- A child whose `parent_task_id` the delete cleared gets it back.
- After the source of the taken task is deleted, `restoreTask` returns `undefined` and no
  row exists.
- After the parent of the taken task is deleted, the task is restored with
  `parent_task_id` `null`.
- A second `restoreTask` of the same taken task returns `undefined` and changes nothing.

`undo.test.ts`, Delete:
- `POST /tasks/2/delete?priority=medium` answers 303 to `/tasks?priority=medium&deleted=2`,
  and the Location's path is `/tasks`.
- `GET` that Location: `#live-region .toast` reads `Task deleted`, and has a
  `form[method=post]` whose action is `/tasks/2/undo-delete?priority=medium` and whose
  `button` reads `Undo`.
- Posting that action answers 303 to `/tasks?priority=medium#task-2`. The raw row equals
  the one before the delete, and `GET /tasks` has `#task-2`.
- Posting it again answers 404 and the rows are unchanged. `POST /tasks/99/undo-delete`
  answers 404.
- After an undo, `GET /tasks?deleted=2` has an empty `#live-region`, and so does
  `GET /tasks?deleted=99`.
- `UNDO_LIMIT`: delete 51 tasks. The undo of the first one answers 404 and the undo of the
  last one answers 303.

### AC7: `src/undo.test.ts`
- A pending task: `POST /tasks/1/done?priority=medium` answers 303 to
  `/tasks?priority=medium&done=1#task-1`. `GET` shows the toast `Task marked done` with an
  action of `/tasks/1/undo-done?priority=medium`. Posting it answers 303 to
  `/tasks?priority=medium#task-1`, and `status`, `completed_at` and `actual_minutes` are
  as before.
- An in-progress task with a `started_at`: Done sets `actual_minutes`, and the undo gives
  back `in_progress`, `completed_at` `null` and `actual_minutes` `null`.
- A recurring task (`FREQ=DAILY`): Done makes task 2. The undo deletes task 2, and task 1
  is pending with `recurrence_rule` `FREQ=DAILY`. Fails if the instance is kept, or the
  rule is not given back.
- The same task, but with task 2 started (`POST /tasks/2/start`) before the undo: task 2
  stays `in_progress`, and task 1 is back to pending with `recurrence_rule` `null`.
- Overdue: `POST /overdue/1/done` answers 303 to `/overdue?done=1`. `GET` shows the toast
  with the action `/overdue/1/undo-done`. Posting it answers 303 to `/overdue`, and
  `GET /overdue` lists `#task-1` again.
- A second undo answers 404 and changes nothing. An undo after the task was set back to
  pending some other way (Done, then the undo, then a third post) answers 404.
- `POST /tasks/1/done?from=sheet` answers 303 to `/tasks/1`. `GET /tasks/1` has an empty
  `#live-region`, and `POST /tasks/1/undo-done` answers 404.
- Done on a task that is already done answers 303 to `/tasks#task-1` with no `done=`.

### AC8: `src/live-region.test.ts`
- `it.each` over `/`, `/add`, `/tasks`, `/overdue`, `/timeline`, `/digest`, `/settings`,
  `/_styleguide`, `/no-such-page`, `/tasks/1`, `/tasks/1/edit` and `/review/<id>`, with a
  task and a draft seeded. Assert exactly one `#live-region` with `aria-live="polite"`,
  `all(document, '[aria-live]')` equal to that one element, no children and empty text.
- The error page (database closed, `GET /tasks`) has the same single empty region.
- After a Delete, then a list Done, then an overdue Done, the page each leads to has one
  `[aria-live]`, `#live-region`, and its `.toast` is inside it.
- `/_styleguide`: the Toast section's `.toast` is not inside `#live-region` and has no
  `[aria-live]` ancestor, and the page has exactly one `[aria-live]`.

### AC9: `src/accessible-names.test.ts`
- Seed, at the faked NOW: a pending task scheduled today, an overdue pending task
  (yesterday), an in-progress urgent task with a reminder (mini-bar and alarm), and a
  photo source with one draft.
- For each page of AC9 (`/`, `/add`, `/tasks`, `/overdue`, `/timeline`, `/digest`,
  `/settings`, `/_styleguide`, `/tasks/1`, `/tasks/1/edit`, `/review/<id>`), and for
  `/tasks?deleted=<id>` after a Delete (the toast), use the helpers of D17:
  - every `a` and `button` has a non-empty `nameOf`;
  - every `input:not([type=hidden])`, `select` and `textarea` passes `hasLabel`.
- Each failure message names the page and the element's `outerHTML`. A link whose only
  text is an `aria-hidden` glyph would fail.
- Both helpers are also tested on small fixtures:
  - `<button><span aria-hidden="true">×</span></button>` has no name;
  - `<input id="x">` with `<label for="x">X</label>` has a label;
  - `<a aria-labelledby="missing">` has no name.

### AC10: `src/focus-motion.test.ts`
Shared setup: `getStylesheet()` and `findRule`/`valueOf` from `src/testing/css.ts`.
- `:focus-visible` (no at-rule) has an `outline` that is set and does not match
  `/^(none|0)\b/`.
- No rule anywhere has `outline` matching `/^(none|0(px)?)(\s|$)/`, `outline-style:
  none` or `outline-width: 0`.
- `.btn` and `.toast .btn` each have `min-height` `var(--touch-target)`. Fails today for
  `.toast .btn`.

### AC11: `src/focus-motion.test.ts`
- In `@media (prefers-reduced-motion: reduce)`, one rule's `selectors` include `*`,
  `*::before` and `*::after`.
- Its `animation-duration` and `transition-duration`, with `!important` removed, are each
  0.01 ms or less, after parsing `ms` or `s`.
- Its `scroll-behavior` is `auto` (or `auto !important`).

### AC12: `src/readme.test.ts`
- `README.md` starts with `# Task Image AI`.
- It contains `22.18`, `yarn install`, `yarn dev`, `yarn test` and `yarn build`.
- It contains each of the eight variable names.
- It contains every name matched by `/env\.([A-Z_]+)/g` in `src/config.ts`, so a variable
  added later fails the test.
- It contains `429` and `24 hours`, the limit and the cleanup.

### AC13: whole suite
- `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` and `VAPID_*` unset.
- Every new test writes only under `os.tmpdir()` or in memory, and `git status` shows
  nothing under `data/`.
- Each existing test changed in step 10 is listed in the build report with the reason.
