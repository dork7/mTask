VERDICT: CHANGES

# Review: spec, round 1

## Findings

All three are clauses that are true in the code today but that no test protects: the
change below leaves the whole suite green (66 files, 1996 tests passed) in the scratch
copy.

1. `src/services/recurrence.ts:154` — AC2's clause "When the instance has no start, its
   date is the Dubai day it is completed" is not tested. I changed the ternary's
   `today` to `today + 1000`, so a task with no `scheduled_start` uses a day hundreds
   of days from its completion day. Full suite: `Test Files 66 passed (66)`, `Tests
   1996 passed (1996)`. The only rule-bearing task without a `scheduled_start` in the
   tests is the AC3 "cannot be placed" case (`src/services/recurrence.test.ts:239`),
   whose next instance is left with null times, so the day `makeNextInstance` computed
   is never observed. Fix: add a placeable case — a `FREQ=DAILY`, 30-minute task with no
   `scheduled_start` and no slot, made at `NOW`; its next instance should be
   `2026-10-13T05:00:00.000Z`–`2026-10-13T05:30:00.000Z` (13 Oct), which only holds when
   the instance's date is the Dubai day of `now`.

2. `src/views/partials/task-sheet-body.ejs:54` and `src/views/pages/review.ejs:73` —
   AC8's clause "a `<select name="repeat">` labelled `Repeat`" (and AC10's "the same
   controls as AC8") is not tested. I changed the sheet label's text from `Repeat` to
   `RepeatX` and deleted the review select's `aria-label="Repeat"`. Full suite: `Test
   Files 66 passed (66)`, `Tests 1996 passed (1996)`. `src/recurrence-sheet.test.ts` and
   `src/recurrence-review.test.ts` find the select by its `name` only and never assert
   its accessible name (the day checkboxes' `Mon`…`Sun` labels *are* asserted, at
   `src/recurrence-sheet.test.ts:84`, so this is a gap only for the select). Fix: assert
   the accessible name — `textOf` of `label[for="sheet-repeat"]` is `Repeat`, and the
   card select's `aria-label` is `Repeat`.

3. `src/services/recurrence.ts:189` — AC5's clause "one transaction each" is not tested.
   I removed the per-task `inTransaction` so `makeNextInstance` runs bare in the loop.
   Full suite: `Test Files 66 passed (66)`, `Tests 1996 passed (1996)`. Nothing makes one
   task's insert fail while the run continues, so the per-task isolation is never
   observed. Fix: add a run over two due tasks where the second insert is refused with
   the trigger trick of `src/recurrence-done.test.ts:142`
   (`CREATE TRIGGER refuse_insert BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, …)`)
   scoped so the first is still made, and assert the first task's next instance is
   created and returned.

## Checked

Read `spec.md`, `design.md`, `plan.md`, `build.md`, `CLAUDE.md`, and the whole of
`git diff main...HEAD` except the body of `yarn.lock` (no lockfile line changed: the diff
touches no `package.json` or `yarn.lock`). Branch is `factory/016-recurring`
(`git branch --show-current`). Round 1, so no earlier `round-*/review-spec.md`.

Ran in the repo, on Node v26.8.2, yarn 1.22.22:

- `yarn build`:

  ```
  yarn run v1.22.22
  $ tsc --noEmit
  Done in 1.34s.
  ```

- `ANTHROPIC_API_KEY= yarn test`:

  ```
   Test Files  66 passed (66)
        Tests  1996 passed (1996)
     Duration  5.45s (tests 61%, import 34%, transform 5%)
  ```

  (No `EADDRNOTAVAIL`: no concurrent run competed here.)
- `git status --porcelain data/` was empty after the run, and `git status --porcelain`
  listed nothing before I wrote this file.

Mutation checks. I copied the repo (without `node_modules`, `cache/`, `.git`, `data/`) to
`$TMPDIR/mtask-review-016`, symlinked the repo's `node_modules`, broke one clause at a
time, ran the tests, and restored each file from the repo. The repo itself was not
changed; the copy was deleted. Every row was run against the targeted file unless it says
"suite".

| Criterion / clause | Change tried | Result |
| --- | --- | --- |
| AC1 order and no repeats | `readRule`: `index <= previous` → `index === -1` | 2 failed (`recurrence.test.ts`) |
| AC1/AC9 mapping | `repeatRule`: `daily` → `'FREQ=YEARLY'` | 2 failed (unit), 3 failed (sheet) |
| AC2 daily not-before | `nextDay` daily: `Math.max(day + 1, notBefore)` → `day + 1` | 1 failed |
| AC2 weekly not-before | drop `while (candidate < notBefore) candidate += 7` | 1 failed |
| AC2 monthly cap | `Math.min(dayOfMonth, last)` → `dayOfMonth` | 4 failed |
| AC2 no-start day | `today` → `today + 1000` | **0 failed → finding 1** |
| AC3 copied fields | drop `category: task.category` | 2 failed (unit), 3 failed (done) |
| AC3 placement | place from `now` only | 2 failed |
| AC3 clears rule | drop `updateTask(…, { recurrence_rule: null })` | 9 failed |
| AC3 times stored | drop `storeSchedule` | 5 failed (unit), 3 failed (done) |
| AC4 Done→next | drop `makeNextInstance` from `markDone` | 4 failed |
| AC4 all-or-none | write the Done and the instance outside `inTransaction` | 1 failed (the all-or-none case) |
| AC4 already done | drop `if (task.status === 'done') return` | 1 failed |
| AC5 draft guard | drop `if (task.status === 'draft') continue` | 1 failed |
| AC5 end passed | drop the `scheduled_end` before-`now` check | 5 failed |
| AC5 one transaction each | drop the per-task `inTransaction` in `runRecurrence` | **0 failed (suite) → finding 3** |
| AC6 rule carried | clear with the same rule instead of `null` | 9 failed |
| AC7 run at once | drop the initial `run()` | 1 failed |
| AC7 every 15 min | `EVERY_MS = 20 * MINUTE_MS` | 1 failed |
| AC7 stop | `return () => clearInterval(timer)` → `return () => {}` | 1 failed |
| AC7/AC11 server starts it | drop `startRecurrence(db)` from `server.ts` | 1 failed (`server.test.ts`) |
| AC8 picker shown | `shownRepeat` GET → `{ repeat: '', days: [] }` | 3 failed |
| AC8/AC10 labelled Repeat | label text `Repeat`→`RepeatX`; drop review `aria-label="Repeat"` | **0 failed (suite) → finding 2** |
| AC9/AC10 day boxes | `postedStrings` returns `[]` for arrays | 2 failed (sheet), 2 failed (review) |
| AC10 confirm/Remove | store the posted value instead of the `repeatRule` result | 3 failed |

Each failure above is the test `build.md` names for that criterion, and each match to
`build.md`'s own "Fails when" column (e.g. AC1 2, AC9 3, AC4 routes 4, AC6 5 of its cases).

Hand-run claims of `build.md` I repeated: 66 files / 1996 tests; the four existing test
files' diff holds only the named edits (`src/task-sheet.test.ts:161` gains `repeat: ''`;
`src/review-page.test.ts` gains `repeat-<id>: ''` for the three drafts and finds the two
slot selects as `select[name^="slot-"]`; `src/add-rules.test.ts`'s helper reads
`select[name^="slot-"]` with its assertion at `:182` untouched; `src/server.test.ts` gains
the mock and one test); `src/ui.test.ts:48` passes (`repeats`/`weekdays` are not in `ui`).

Out of scope: nothing excluded was built. No change to the analyzer, the 010 edit page or
its picker (`src/views/pages/task-edit.ejs`, `readTaskEdit` beyond `repeat: false`), the
`/`, `/tasks`, `/timeline`, `/overdue` views, `src/db/`, `package.json`, `yarn.lock`, any
stylesheet or `src/ui.ts`. `factory/backlog.md` was ticked in the spec commit `fcf04ca`,
not by the builder. `docs/errors/next-instance-returned-before-placement.md` is the logged
error the factory asks for.

Not a finding, for the record: AC3's "and any task it bumps are stored (009 AC7)" is not
exercised by a 016 test (no test makes a next instance overlap a task), but the
`placeTasks`/`storeSchedule` call that does it is protected — dropping `storeSchedule`
fails 8 tests — and 009 has its own bumping tests, so I am not raising it. All tests use
an in-memory database and a temp uploads folder (`src/testing/app.ts:52-54`), the
analyzers are stubs, so nothing touches `data/` or the network.
