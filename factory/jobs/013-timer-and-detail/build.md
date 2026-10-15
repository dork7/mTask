# 013-timer-and-detail: build

Branch `factory/013-timer-and-detail`, code commit `dc1575a`. Built on Node 26.8.2 and
yarn 1.22.22.

## What changed

Created:

| File | Why |
|---|---|
| `src/services/timer.ts` | `elapsedLabel`, `timerOf`, `workedMinutes`, `runningTask` (D5, D6, D8) |
| `src/routes/mini-bar.ts` | The middleware that reads the clock once per request and gives every page the mini-bar; `requestTime(res)` (D9, D10). The bar is built lazily, see Not done |
| `src/views/pages/task-sheet.ejs` | The sheet page: the 002 bottom sheet, open, id `task-sheet` (D2) |
| `src/views/partials/task-sheet-body.ejs` | Status, Started and timer, Completed and summary, error notice, edit form (D3, D4) |
| `src/views/partials/task-sheet-actions.ejs` | Start, Done, Close (D3) |
| `src/views/partials/timer.ejs` | `span.timer[data-started-at]` (D5) |
| `src/views/partials/mini-bar.ejs` | `aside#mini-bar` (D10) |
| `public/js/timer.js` | Rewrites every `[data-started-at]` on load and each second (D14) |
| `docs/errors/app-middleware-reads-db-before-every-router.md` | The error hit in step 5 |
| `src/dubai-datetime.test.ts`, `src/services/timer.test.ts`, `src/task-sheet.test.ts`, `src/task-sheet-edit.test.ts`, `src/task-start-done.test.ts`, `src/timer-and-mini-bar.test.ts` | The tests the plan lists (AC11) |

Changed:

| File | Why |
|---|---|
| `src/dubai.ts` | `dateTimeValue`, `instantOfDateTime` (D11) |
| `src/services/task-list.ts` | `taskPath`, `sheetDoneAction` (D16) |
| `src/services/task-actions.ts` | `SheetEdit`, `SheetProblems`, `readSheetEdit`, `startTask`; `markDone` records `actual_minutes`; `saveTaskEdit` takes a `SheetEdit` (D7, D8, D12, D13) |
| `src/routes/tasks.ts` | `shownEdit`, `renderSheet`, the `GET` and `POST /tasks/:taskId` and Start handlers, Done's `?from=sheet` redirect, `TaskCard.href`; the local `taskPath` removed (D1–D4, D7–D9, D13, D15, D16) |
| `src/services/timeline.ts` | `TimelineBlock.href` (D15) |
| `src/views/pages/tasks.ejs`, `src/views/pages/timeline.ejs` | The title links to the sheet (D15) |
| `src/views/layout.ejs` | `timer.js` and the mini-bar when `locals.miniBar` is set (D9, D10) |
| `src/app.ts` | Mounts the middleware after the static handlers and before `homeRouter` (D9) |
| `public/css/base.css` | Sheet, timer, mini-bar and link rules; the mini-bar's `bottom: 0` in the wide-screen block (D15, D17) |
| `src/testing/dom.ts`, `src/testing/jsdom.d.ts` | `stubClock`; `Date` and `setInterval` on `DomWindow` (D14) |

## Acceptance criteria

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1 sheet page and 404 | `task-sheet.test.ts` "the sheet (AC1)": layout, title, open overlay, escaped heading, status labels, Close, 404 for `2`, `99`, `01`, `1e0`, `abc` | `open: true` → `open: false` in `task-sheet.ejs`: "is a page in the layout with the sheet open…" failed | PASS |
| AC2 ways in | `task-sheet.test.ts` "the ways in (AC2)": card title link, timeline block link with glyph first and classes kept | the `<a>` removed from the card title in `tasks.ejs`: "links each card title on the list to the sheet" failed | PASS |
| AC3 edit fields | `task-sheet.test.ts` "the edit fields (AC3)": form action, `formFields` with reminder `2026-10-12T20:00`, textarea, empty fields | `dateTimeValue` without the Dubai offset: "posts to the sheet and holds the stored values…" failed | PASS |
| AC4 edit post | `task-sheet-edit.test.ts` "a valid post (AC4)": whole row with only the seven fields and `updated_at` changed, empties as null, past reminder, reschedule on minutes, no reschedule on title | `instantOfDateTime` reading the day as UTC (`day * DAY_MS`): "stores the seven fields…" and "accepts a reminder in the past" failed | PASS |
| AC5 edit refused | `task-sheet-edit.test.ts` "a refused post (AC5)": six bad reminders, four messages in order with the posted values, missing category shown empty, 010 form body on both routes, 404s | the `hours > 23` bound removed: "refuses the reminder "2026-10-12T24:00"…" failed | PASS |
| AC6 Start | `task-start-done.test.ts` "Start (AC6)": the form on pending only, row after Start, a task already in progress is left alone, no change on in progress or done, 404s | the status guard of `startTask` removed: "changes nothing on a task that is in_progress" and "… done" failed | PASS |
| AC7 Done records time | `task-start-done.test.ts` "Done from the sheet (AC7)": the forms, 75 minutes and redirect to the sheet, the 1-minute floor, a pending task's minutes stay null, the list redirect without `from`, `from=x` kept out | the `Math.max(1, …)` floor removed from `workedMinutes`: "records at least one minute" failed | PASS |
| AC8 running timer | `timer-and-mini-bar.test.ts` "the running timer (AC8)": four texts, Started line, none on pending or done, the script tag and its route, jsdom `12:05`→`12:06` and `59:59`→`1:00:00` with `scriptErrors` empty | the first `update()` call removed from `timer.js`: both jsdom cases failed | PASS |
| AC9 mini-bar | `timer-and-mini-bar.test.ts` "the mini-bar (AC9)": on `/`, `/tasks`, `/timeline`, `/add` and the 404 page, outside `main`; absent with no task in progress, with one `script` on `/`; latest start and highest id on a tie; no timer without a start | `runningTask` choosing the earliest start (`>` → `<`): "shows the task started last…" failed | PASS |
| AC10 estimate vs. actual | `task-sheet.test.ts` "estimated against actual (AC10)": summary and Completed, own numbers, none when a value is null, no Completed without `completed_at`, none on pending, Start to Done end to end | the summary written with fixed numbers: "writes the task own minutes" failed | PASS |
| AC11 build, tests, nothing in `data/`, no existing test changed | the whole suite with `ANTHROPIC_API_KEY=` | not broken on purpose. `git diff --stat main -- '*.test.ts'` lists no existing test file, and `git status --porcelain data/` is empty | PASS |

Each break was run once against its own test file and the file was put back. The unit
files `dubai-datetime.test.ts` and `services/timer.test.ts` hold the cases the plan
lists (Kiritimati time zone, 149 s → 2, 151 s → 3, `runningTask` order).

Checked by hand: nothing. The spec asks for no check by hand.

## Test run

```
$ ANTHROPIC_API_KEY= yarn build
$ tsc --noEmit
Done in 1.02s.
```

```
$ ANTHROPIC_API_KEY= yarn test
 Test Files  53 passed (53)
      Tests  1739 passed (1739)
   Start at  16:22:24
   Duration  2.60s (tests 62%, import 30%, transform 7%)
Done in 3.33s.
```

```
VERIFICATION
Build: PASS
Tests: PASS   (1739 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped. I did one thing differently from the design:

- **D10: the mini-bar is built when a page is rendered, not before the handler runs.**
  As designed, the middleware called `listTasks` for every request. That failed the
  existing test `src/add-photo.test.ts` "answers 500 and keeps no file when the source
  cannot be written". The test closes the database, so the middleware threw before the
  photo handler ran, and the uploads folder the test expects was never made. The
  middleware still reads the clock once, up front (`res.locals.requestTime`, D9). But
  `res.locals.miniBar` is now an enumerable getter that reads the database the first
  time it is read and keeps the result. Express reads it when it spreads `res.locals`
  into a page's render options. Every page in the layout still gets the bar, the 404
  page and a refused post's 400 included. A request that renders no page never reads
  the database for it. The bar now shows the database as it is at render time, not
  before the handler. Every handler that changes a status answers with a redirect, so
  nothing the bar shows changes. Logged in
  `docs/errors/app-middleware-reads-db-before-every-router.md`.
- `taskPath` and `sheetDoneAction` sit right after `LIST_PATH` in
  `src/services/task-list.ts`, not at the end of the file, next to the path they build on.
