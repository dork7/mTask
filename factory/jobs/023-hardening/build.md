# 023-hardening: build

Branch `factory/023-hardening`, code commit `5f2ce79`. Built and tested on Node v26.8.2
and yarn 1.22.22.

## What changed

Created:

| File | Why |
| --- | --- |
| `src/routes/errors.ts` | `errorStatus` and `createErrorHandler`: the error page, 4xx kept, 500 logged with `req.path` (D1, D2) |
| `src/views/pages/error.ejs` | The error page fragment (D1) |
| `src/views/partials/undo-button.ejs` | The toast's Undo form (D9) |
| `src/services/rate-limit.ts` | `AI_RATE_LIMIT`, `RateLimiter`, `createRateLimiter`: sliding window per key, refused hits counted (D6) |
| `src/services/undo.ts` | The in-memory undo store and the Delete/Done undo functions (D8, D12) |
| `src/services/photo-cleanup.ts` | `runPhotoCleanup`, `startPhotoCleanup` and their constants (D14) |
| `src/error-page.test.ts` | AC1, AC2 |
| `src/rate-limit.test.ts` | AC3 |
| `src/services/photo-cleanup.test.ts` | AC4, AC5 |
| `src/db/tasks-restore.test.ts` | AC6 (rows) |
| `src/undo.test.ts` | AC6, AC7 |
| `src/live-region.test.ts` | AC8 |
| `src/accessible-names.test.ts` | AC9 (D17) |
| `src/focus-motion.test.ts` | AC10, AC11 |
| `src/readme.test.ts` | AC12 |

Changed:

| File | Why |
| --- | --- |
| `src/app.ts` | One limiter and one undo store per app, passed to the add, review, tasks and overdue routers; error handler mounted last (D1, D6, D8) |
| `src/render.ts` | `PageToast`, `toast?` in `PageLocals`, optional `done` callback of `renderPage` (D5) |
| `src/routes/mini-bar.ts` | `configurable: true` on both getters, `skipLayoutReads` (D4) |
| `src/routes/add.ts` | `TOO_MANY_REQUESTS`, `limitAnalysis` (drains an unread body before it answers), mounted first on the photo post and after `form` on voice and text (D7) |
| `src/routes/review.ts` | `limitAnalysis(limiter, 'photo')` before the analyze handler (D7) |
| `src/routes/tasks.ts` | Done (not `from=sheet`) and Delete through the undo store, `done=`/`deleted=` Locations, the list toast, `undo-delete` and `undo-done` posts; `deleteTask` import removed (D13) |
| `src/routes/overdue.ts` | Done through the undo store, `/overdue?done=<id>`, the toast, `POST /overdue/:taskId/undo-done` (D13) |
| `src/services/task-actions.ts` | `markDone` returns `{ next }` or `undefined` (D11) |
| `src/services/task-list.ts` | `withToastParam` (D13) |
| `src/db/tasks.ts` | `TakenTask`, `takeTask`, `restoreTask` (D10) |
| `src/db/sources.ts` | `removeStalePhotoSources`, `listImagePaths` (D15) |
| `src/server.ts` | `uploadsDir` read once; `startPhotoCleanup(db, uploadsDir)` after `startRecurrence(db)` (D14) |
| `src/views/layout.ejs` | `#live-region` after `</main>`, holding the toast (D9) |
| `src/views/partials/toast.ejs` | No `aria-live`, `toast__actions` as a `div`, comment updated (D9) |
| `public/css/base.css` | `.toast .btn` min-height; the `*` reduced-motion rule (D16) |
| `README.md` | Rewritten with the sections of D18 |

Existing tests changed (plan step 10), each only where this job changes what it checks:

| Test | Change | Reason |
| --- | --- | --- |
| `src/components.test.ts` "sits in a polite live region…" | Now "brings no live region of its own…": asserts the `.toast-region` root has no `aria-live` and the fragment has no `[aria-live]` | D9: the toast partial lost its own live region |
| `src/components.test.ts` "puts every toast in a live region" | Now asserts the style guide's only `[aria-live]` is `#live-region` and the stage toast is outside it | AC8 |
| `src/tasks-actions.test.ts` lines 105, 116, 254 | Done Location gains `done=1` | D13, path unchanged |
| `src/task-start-done.test.ts` lines 196, 207 | Done Location gains `&done=1` | D13, path unchanged |
| `src/recurrence-done.test.ts` `/tasks/1/done` and `/overdue/1/done` cases | Gain `done=1` | D13, path unchanged |
| `src/overdue-actions.test.ts` line 106 | `/overdue` becomes `/overdue?done=1` | D13, path unchanged |
| `src/tasks-edit.test.ts` lines 302, 314 | Delete Location gains `deleted=1` | D13, path unchanged |
| `src/server.test.ts` | Mocks `./services/photo-cleanup.ts` in `beforeEach` with the matching `doUnmock`; one new case for AC5 | So the stand-in database is never cleaned; AC5 |

No view failed the AC9 audit, so no view was changed for it.

## Acceptance criteria

| Criterion | Test | Fails when | Result |
| --- | --- | --- | --- |
| AC1 server error page | `src/error-page.test.ts` "the server error page" (4 tests) | Removed `skipLayoutReads(res)` from the handler: 3 failed (closed database, mini-bar/alarm task, upload `next(failure)`) | PASS |
| AC2 client error page | `src/error-page.test.ts` "answers a body the parser refuses…", `errorStatus` cases, "keeps the not-found page" | `errorStatus` always returned 500: 4 failed, incl. the 415 request | PASS |
| AC3 rate limit | `src/rate-limit.test.ts` (13 tests) | (a) Refused hits not pushed: "counts refused hits toward the limit" failed. (b) Limiter removed from `/add/photo`: 4 failed. (c) Clock captured at module load (`const realNow = Date.now`): "accepts a request again once 60 seconds have passed" failed | PASS |
| AC4 photo cleanup | `src/services/photo-cleanup.test.ts` "runPhotoCleanup" (10 tests) | `created_at < ?` changed to `<=`: "keeps a photo source … 24 hours ago or less" failed | PASS |
| AC5 cleanup schedule | `src/services/photo-cleanup.test.ts` "startPhotoCleanup", `src/server.test.ts` "the photo cleanup" | Removed the first `run()`: 2 failed ("runs at once…", "logs a run that fails…") | PASS |
| AC6 undo Delete | `src/undo.test.ts` "Undo Delete", `src/db/tasks-restore.test.ts` | `takeTask` kept the `toTask` copy as `row` (drops `reminded_at`): "puts the task back with … every column, reminded_at …" and "restores a task whose parent is gone" failed | PASS |
| AC7 undo Done | `src/undo.test.ts` "Undo Done" (8 tests) | Removed `deleteTask(db, next.id)` from `undoDone`: "removes the next instance a recurring task made and gives the rule back" failed | PASS |
| AC8 one live region | `src/live-region.test.ts` (17 tests), `src/components.test.ts` | Dropped `aria-live` from `#live-region`: all 17 failed | PASS |
| AC9 accessible names | `src/accessible-names.test.ts` (16 tests) | Undo button label set to `''`: "names every control on the list with the toast of a Delete" failed | PASS |
| AC10 focus and touch targets | `src/focus-motion.test.ts` "focus and touch targets" | Removed `min-height` from `.toast .btn`: "gives .toast .btn a touch-target min-height" failed | PASS |
| AC11 reduced motion | `src/focus-motion.test.ts` "reduced motion" | `transition-duration` set to `1ms`: failed | PASS |
| AC12 README | `src/readme.test.ts` (16 tests) | `` `UPLOADS_DIR` `` removed from the table: 2 failed | PASS |
| AC13 build and tests | the whole suite, `yarn build` | (no single break; see the test run) | PASS |

Each file was restored from a copy after its break, and the full suite was run again
afterwards (2377 passed).

Checked by hand: the user's own `yarn dev` server (`node --watch src/server.ts`, PID 4138,
not started by me) was running on port 3000 and reloaded with the new code. Read-only
requests to it: `GET /tasks` held `<div id="live-region" aria-live="polite"></div>`,
`GET /no-such-page` answered 404, and `POST /tasks/999999/edit` with
`charset=koi8-r` answered 415. Nothing else was posted to it.

## Test run

All runs with `ANTHROPIC_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
`VAPID_SUBJECT` unset (`env -u …`).

`yarn build`:

```
yarn run v1.22.22
$ tsc --noEmit
Done in 1.32s.
```

`yarn test`:

```
 Test Files  97 passed (97)
      Tests  2377 passed (2377)
   Start at  19:50:26
   Duration  4.45s (tests 54%, import 40%, transform 6%)
```

Before the job the suite had 2260 tests in 88 files.

```
VERIFICATION
Build: PASS
Tests: PASS   (2377 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped. Points to know:

- The AC2 test uses `charset=koi8-r` (415) instead of the spec's `title=%E0%A4%A`, which
  the parser accepts. This is D3.
- The plan's undo case "an undo after the task was set back to pending some other way" is
  tested by setting the task back to `pending` with `updateTask` after an overdue Done,
  then posting the undo (404, no change, no toast).
- `data/` (ignored by git) was written at 19:44:49 by the user's `yarn dev` server when it
  reloaded, not by the tests. Every new test uses an in-memory database and an
  `mkdtemp` folder under `os.tmpdir()`. Because that server now runs the new code, it
  runs `startPhotoCleanup` on the developer database in `data/`: photo sources with no
  task older than 24 hours, and unnamed upload files older than 24 hours, are removed
  there. That is the feature working as specified, but it ran on real local data.
- No `docs/errors/` entry: nothing failed in a way worth logging.
