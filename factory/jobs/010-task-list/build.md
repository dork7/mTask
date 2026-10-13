# 010-task-list: build

Branch `factory/010-task-list`, code commit `00abf05`. Built on Node 26.8.2 and yarn 1.22.22.

## What changed

Created:

| File | Why |
|---|---|
| `src/services/task-list.ts` | The list query: read, write in the one order, toggle; which tasks are listed; filter and sort (D1 to D5) |
| `src/services/task-actions.ts` | Done, Reschedule, reading and storing an edit, each multi-row write in one transaction (D1, D9, D10) |
| `src/routes/tasks.ts` | `GET /tasks`, the Done, Reschedule, edit and Delete routes, 404 through `next()` (D1, D8, D11 to D13, D15) |
| `src/views/pages/tasks.ejs` | The list page: filter bar, active filters, sort form, cards or empty state (D11) |
| `src/views/pages/task-edit.ejs` | The edit page and its separate Delete form (D12) |
| `src/services/task-list.test.ts` | AC3 to AC5, unit part |
| `src/tasks-page.test.ts` | AC1 to AC7 |
| `src/tasks-actions.test.ts` | AC8, AC9, AC14 |
| `src/tasks-edit.test.ts` | AC10 to AC13 |

Changed:

| File | Why |
|---|---|
| `src/views/partials/chip.ejs` | `href`, `current`, `removable`; without `href` the same `<span>` as before (D6) |
| `src/app.ts` | Import and mount `createTasksRouter` after the review router (D1) |
| `src/routes/review.ts` | `export function readId` (D13) |
| `src/services/drafts.ts` | `export function readMinutes` (D9) |
| `public/css/base.css` | `.chip[href]` touch target, and the task list and edit page rules (D7, D11) |
| `src/shell.test.ts` | `'/tasks'` removed from the "not-found until its job builds it" list, one line (D14) |

## Acceptance criteria

"Fails when" is the change I made to the code to see the test fail. Each was applied
alone, the named test file run, the file restored. All 51 breaks made at least one
test fail. A "—" means I made no break for that clause; its assertion is exact.

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1 200, layout, title, nav current, one card per non-draft with id `task-<id>` | tasks-page "shows one card per pending, in progress and done task, and no draft" | `isListed` returns `true` | PASS |
| AC2 title escaped | tasks-page "shows the title as text, …" | `<%= card.title %>` → `<%-` | PASS |
| AC2 `<n> min` / `No estimate` | tasks-page "shows the title …", "says what is not set" | `NO_ESTIMATE` set to `''` | PASS |
| AC2 badge or none | tasks-page "shows the title …", "says what is not set" | (badge partial throws on null, so the guard is load-bearing; the assertions check `.badge--high` and no `.badge`) | PASS |
| AC2 slot label / `No slot` | tasks-page same two | slot shows the id, not the label | PASS |
| AC2 status label | tasks-page "says what is not set", "shows Done" | `In progress` → `in_progress` | PASS |
| AC2 start label / `Not scheduled`, by the request's day | tasks-page "shows the title …", "labels the start by the day of the request" | raw `scheduled_start` instead of `dayTimeLabel` | PASS |
| AC3 values of one parameter OR'd | tasks-page "two priorities and a slot" | `includes` → `every` | PASS |
| AC3 parameters AND'd | tasks-page filter cases | `&&` between the two → `\|\|` | PASS |
| AC3 repeated value, unknown value ignored, 200 | tasks-page "a repeated value", "an unknown value …"; task-list.test `readListQuery` | given priorities kept as given | PASS |
| AC3 null never matches | tasks-page "a priority alone", "a slot alone" (tasks 5 and 6 have nulls) | not breakable: `includes(null)` is false without the guard (design Risks) | PASS |
| AC4 `start` default, no-start last | tasks-page "sorts by start" (×3 queries) | null start sorted first | PASS |
| AC4 ties by id | tasks-page "same start in id order" | `a.id - b.id` → `b.id - a.id` | PASS |
| AC4 `priority` | tasks-page "sort=priority …" | priority rank dropped | PASS |
| AC4 `newest` | tasks-page "sort=newest …" | sort by id descending only | PASS |
| AC4 any other value is `start` | task-list.test "sorts by start for a repeated key"; tasks-page `?sort=bogus` | `length === 1` → `>= 1` | PASS |
| AC5 chip per value, ui order, class `chip` | tasks-page "has a chip link per priority and per slot" | (covered by order of rendering; also query order breaks below) | PASS |
| AC5 active chip `chip--on` + `aria-current` | tasks-page "marks the chips of the active values" | bar chip `current: false`; chip partial writes `aria-current="false"` | PASS |
| AC5 href toggles its value, keeps the rest | tasks-page "links each chip …"; task-list.test toggles | toggle replaces the list with `[id]` | PASS |
| AC5 canonical order, `sort` left out when `start` | tasks-page "links each chip …", "writes no sort=start"; task-list.test `queryString` | priorities written in array order; `sort=start` written | PASS |
| AC5 chip link touch target | tasks-page "makes a chip link a touch target …" | `min-height` removed from `.chip[href]` | PASS |
| AC6 removable chips, link without the value | tasks-page "lists each active value …" | active slots taken from the inactive ones | PASS |
| AC6 absent with no filter | tasks-page "has no list of active filters" | same break | PASS |
| AC6 GET form, options, current selected, hidden filters | tasks-page "has a GET form …", "selects start …" | hidden inputs carry `sort`; `selected` always on `start` | PASS |
| AC7 `No tasks yet` with `/add` | tasks-page "says No tasks yet …" (×3) | `none` decided by the shown tasks | PASS |
| AC7 `No tasks match these filters`, `Clear filters` | tasks-page "says No tasks match …" | same break | PASS |
| AC8 Done form on non-done cards, action with query | tasks-actions "is a form on a pending and an in progress card …" | Done form on a done card; form action without query | PASS |
| AC8 status and `completed_at` set, rest kept | tasks-actions "makes a pending task done …", "in progress … the same way" | `completed_at: null` | PASS |
| AC8 303 with query and fragment | same | redirect without the query | PASS |
| AC8 done task unchanged, same 303 | tasks-actions "changes nothing on a task that is done already" | status check removed from `markDone` | PASS |
| AC9 Reschedule only on pending | tasks-actions "is a form on a pending card only" | form shown on in_progress | PASS |
| AC9 spec example 09:40–10:10Z | tasks-actions "places a task of yesterday again …" | redirect without fragment (also 303 checks) | PASS |
| AC9 own times not taken | tasks-actions "does not count the task own times as taken" | (holds by 009 D4; asserted) | PASS |
| AC9 moved tasks stored | tasks-actions "stores the new times of a task an urgent one moves" | `moved` dropped before `storeSchedule` | PASS |
| AC9 unplaceable / in_progress / done unchanged | tasks-actions "changes nothing on …" (×3) | status check removed from `rescheduleTask` | PASS |
| AC10 Edit link `/tasks/<id>/edit` | tasks-edit "is linked from the card …" (×2) | — (asserted exactly) | PASS |
| AC10 form posts to its path, fields, radios, filled, Delete, back link | tasks-edit "is a form posting to its own path …", "checks the stored slot" | title not filled; No slot radio never checked; form action `/tasks` | PASS |
| AC11 stores trimmed title, minutes, priority, null slot, 303 | tasks-edit "stores the trimmed title …" | title stored untrimmed | PASS |
| AC11 reschedule when minutes/priority/slot change | tasks-edit "places the task again when only … changed" (×3) | change detection set to `false` | PASS |
| AC11 times kept otherwise, and for in_progress/done | tasks-edit "keeps the times when only the title changed", "keeps the times and the status …" (×2), "form posted back as served" | always reschedule; reschedule unless draft | PASS |
| AC11 status, category, description, source, confidence unchanged | tasks-edit "stores the trimmed title …" (whole row compared) | same breaks | PASS |
| AC12 400, nothing stored | tasks-edit "answers 400 with each message …" and per-problem cases | status 200 | PASS |
| AC12 each message once, in order | same | minutes message pushed twice | PASS |
| AC12 slot neither empty nor an id | tasks-edit "an unknown slot", "no slot field" | unknown slot read as `null` | PASS |
| AC12 repeated / blank title | tasks-edit "refuses a repeated title …", "an empty title" | missing title read as non-blank | PASS |
| AC12 fields show posted values | tasks-edit "answers 400 …", "checks the posted priority …" | posted minutes ignored; posted priority ignored | PASS |
| AC13 card Delete form with query | tasks-edit "is a form on the card that carries the list query" | action without query | PASS |
| AC13 deletes the row only, 303 with query | tasks-edit "deletes the task row only …" | redirect without query; `deleteTask` removed | PASS |
| AC13 edit page Delete → `/tasks`; source and file kept | tasks-edit "goes back to the bare list …", "leaves the photo file of the task" | `deleteTask` removed | PASS |
| AC14 404 for draft, 99, `01`, `1e0`, `abc` on all five routes, no row changed | tasks-actions "answers 404 for /tasks/%s/…" (×5) | `isListed` → `true`; `readId` replaced by `parseInt` | PASS |
| AC14 redirect keeps only valid query values | tasks-actions "keeps only the valid values of a posted query …" | redirect built from `req.url` | PASS |
| AC15 build and test with `ANTHROPIC_API_KEY` unset, in-memory DB, nothing in `data/` | the run below | — | PASS |

Checked by hand: `data/app.db` was last written at 17:50, before this job; the test run
left nothing new in `data/` and no `.vitest/`.

## Test run

```
$ env -u ANTHROPIC_API_KEY yarn build
$ tsc --noEmit
Done in 1.95s.

$ env -u ANTHROPIC_API_KEY yarn test
 Test Files  45 passed (45)
      Tests  1559 passed (1559)
Done in 3.07s.
```

1559 = the 1470 of before, less the `/tasks` case of `src/shell.test.ts`, plus 90 new.

```
VERIFICATION
Build: PASS
Tests: PASS   (1559 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped. As the design says (D14), one existing test line
changed: `'/tasks'` left the not-found list of `src/shell.test.ts`, since AC1 makes that
page answer 200.

One early run of `yarn build && vitest run src/stylesheet.test.ts src/app.test.ts
src/shell.test.ts` stalled with no output for over two minutes and was stopped. Each
command then ran on its own in about a second, and it did not happen again in any later
run, so I found no cause and logged no error entry.
