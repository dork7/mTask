VERDICT: CHANGES

# Review: spec, round 2

## Findings

All three round-1 findings are fixed (see Earlier findings). The two below are clauses
that are true in the code and protected by no test; both were found by breaking the code
in a scratch copy and seeing the whole suite stay green.

1. `src/services/recurrence.ts:153-154` — AC2's "the Dubai day" is not pinned. I copied
   the repo to a scratch folder under `$TMPDIR`, changed `const today =
   dubaiDay(now.getTime());` to the UTC day `Math.floor(now.getTime() / DAY_MS)`, and ran
   the whole suite: `Test Files 66 passed (66)`, `Tests 1998 passed (1998)`. Changing only
   the other branch, `dubaiDay(Date.parse(task.scheduled_start))` (line 154), to the UTC
   day is green too. Every 016 test and every route test uses a `now` and a
   `scheduled_start` before 20:00Z, where the UTC day and the Dubai day are equal, so the
   window from a Dubai midnight to 4 AM (20:00Z–24:00Z) is never exercised. In that window
   the clause is false: a daily, 30-minute, no-slot task with no start made at
   `2026-10-12T21:00:00.000Z` (1 AM Dubai on 13 Oct) is dated 12 Oct instead of 13 Oct and
   gets a next instance on 13 Oct instead of 14 Oct, and no test fails. The round-1 fix's
   own comment, `src/services/recurrence.test.ts:230` ("13 Oct only holds when the
   instance's date is the Dubai day of `now`"), is not true of that test: at `NOW`
   (09:36Z) the UTC day is 12 Oct as well, so the test cannot tell the two apart. This is
   reachable behavior — the periodic run `src/services/recurrence.ts:205-212` runs every
   15 minutes, so it runs in that window nightly. Fix: add one case with an instant in the
   window, e.g. the same no-slot daily task with no start made at
   `2026-10-12T21:00:00.000Z`, whose next instance starts `2026-10-14T05:00:00.000Z`
   (`dubaiDayStart(14 Oct)` is `2026-10-13T20:00:00.000Z`, so the next 9 AM mark is on
   14 Oct), and/or a case whose `scheduled_start` is `2026-10-12T21:00:00.000Z`.

2. `src/views/partials/task-sheet-body.ejs:54-55` — AC8's "a `<select name="repeat">`
   labelled `Repeat`" is asserted as the label's *text* only
   (`src/recurrence-sheet.test.ts:74`, `textOf(one(document,
   'label[for="sheet-repeat"]'))`), not as the label being tied to the select. Removing
   the select's `id="sheet-repeat"` leaves the label pointing at nothing and the select
   with no accessible name, yet `yarn -s vitest run src/recurrence-sheet.test.ts
   src/task-sheet.test.ts` stays green: `Test Files 2 passed (2)`, `Tests 39 passed (39)`.
   (The review card is not affected: its select carries `aria-label="Repeat"` directly,
   `src/views/pages/review.ejs:73`.) Fix: assert the select's id is `sheet-repeat`, or
   look the label up through the select's own id, as `src/overdue-actions.test.ts:203`
   does.

## Earlier findings

The round-1 fixes are commit `af239d9` (+36 lines, three test files, no source change),
so the module and the views are exactly the code round 1 reviewed. I reproduced each
mutation the round-1 file names, in a scratch copy, and each now fails a test:

1. **`src/services/recurrence.ts:154` — AC2's no-start day (round-1 finding 1).** Fixed by
   `src/services/recurrence.test.ts:224` "takes the day it is made for an instance with no
   start (AC2)". Broke the branch to `? today + 1000 :`; `yarn -s vitest run
   src/services/recurrence.test.ts` → `Tests 1 failed | 38 passed`, the new test failing
   at `:231` on `scheduled_start`. Fixed. (Finding 1 above is the part of this same clause
   that the new test still leaves unpinned.)

2. **`task-sheet-body.ejs:54` / `review.ejs:73` — AC8's label and AC10's same control
   (round-1 finding 2).** Fixed by `src/recurrence-sheet.test.ts:74` (label text) and
   `src/recurrence-review.test.ts:95` (`aria-label`). Broke the sheet label
   `Repeat`→`RepeatX` and removed the review select's `aria-label`; the two files →
   `Tests 1 failed | 17 passed` and `1 failed | 8 passed`, one for each. Fixed. (Finding 2
   above is the label *association* this fix still leaves unpinned.)

3. **`src/services/recurrence.ts:189` — AC5's "one transaction each" (round-1 finding 3).**
   Fixed by `src/services/recurrence.test.ts:333` "handles each task in its own
   transaction, so one refusal leaves the others whole". Both breaks `build.md` names were
   run: the per-task `inTransaction` removed (bare call) → new test failed at `:350`
   (`parent_task_id === 2` had 1, wanted 0); one `inTransaction` around the whole loop →
   new test failed at `:348` (`parent_task_id === 1` had 0, wanted 1). Fixed; the builder's
   choice to refuse the rule-clearing `UPDATE` rather than the `INSERT` does distinguish
   the clause, as its Round-1 note argues.

## Checked

Read `spec.md`, `design.md`, `plan.md`, `build.md` (including its `## Round 1` section and
table), `CLAUDE.md`, `round-1/review-spec.md`, `round-1/review-code.md`, and the whole of
`git diff main...HEAD` (26 files) except the body of `yarn.lock` — no lockfile line is in
the diff, and `package.json`/`yarn.lock` are untouched, so no dependency check was needed.
`git branch --show-current` prints `factory/016-recurring`. The round-2 change under review
is `git show af239d9`.

Ran in the repo, on Node v26.8.2, yarn 1.22.22:

- `yarn build`:

  ```
  yarn run v1.22.22
  $ tsc --noEmit
  Done in 1.26s.
  ```

- `ANTHROPIC_API_KEY= yarn test`:

  ```
   Test Files  66 passed (66)
        Tests  1998 passed (1998)
      Duration  3.37s (tests 59%, import 34%, transform 7%)
  ```

  No `EADDRNOTAVAIL`. `git status --porcelain data/` was empty after the run;
  `git status --porcelain` lists only `factory/jobs/016-recurring/round-2/` (the
  reviewers' files). Nothing in `data/` was written: `data/` was not copied to the
  scratch and its files predate this session.

Mutation runs. I copied the repo without `node_modules`/`.git`/`cache`/`data` to
`$TMPDIR/mtask-spec-r2-kx9` (a unique name: the code reviewer's scratch at
`$TMPDIR/mtask-review-016-r2` was deleted underneath an earlier run of mine when it
finished, which is why I then used a name of my own), symlinked the repo's
`node_modules`, kept a pristine `src.orig`, and restored `src/` before each mutation. Each
row was run against the file(s) named; "suite" is `vitest run`. Baseline in the scratch:
`src/services/recurrence.test.ts src/recurrence-done.test.ts` → `Tests 46 passed (46)`.

| Clause / earlier finding | Change tried | Result |
| --- | --- | --- |
| AC2 no-start day (round-1 finding 1) | `? today :` → `? today + 1000 :` | 1 failed |
| AC2 "the Dubai day of now"/no-start | `dubaiDay(now.getTime())` → UTC day `Math.floor(now / DAY_MS)` | **0 failed (suite) → finding 1** |
| AC2 "the Dubai day of `scheduled_start`" | `dubaiDay(Date.parse(start))` → UTC day | **0 failed (suite) → finding 1** |
| AC8 sheet label (round-1 finding 2) | label text `Repeat` → `RepeatX` | 1 failed |
| AC10 review control (round-1 finding 2) | drop `aria-label="Repeat"` | 1 failed |
| AC8 label association | drop `<select … id="sheet-repeat">` | **0 failed (39 passed) → finding 2** |
| AC5 one transaction each (round-1 finding 3) | drop the per-task `inTransaction` (bare call) | 1 failed (`:350`) |
| AC5 one transaction each | one `inTransaction` around the whole loop | 1 failed (`:348`) |

Every failure is the test `build.md`/round-1 names for that criterion; the fail counts for
the round-1 breaks match `build.md`'s Round-1 table (finding 1: 1; finding 2: one per
break; finding 3: 1 for each break).

Hand-run claims of `build.md`/round 1 that I repeated: the whole-suite totals (66 files,
1998 tests); `git diff main...HEAD` of `src/task-sheet.test.ts`, `src/review-page.test.ts`,
`src/add-rules.test.ts`, `src/server.test.ts` and `src/testing/dom.ts` holds only the named
edits (`repeat: ''`; `repeat-<id>: ''` for the three drafts; the two slot selects found as
`select[name^="slot-"]`; `selectedSlots` reads `select[name^="slot-"]` with its assertion
at `:182` untouched; the `startRecurrence` mock, its `doMock`/`doUnmock`, and one new test;
`formFields` skips an unchecked checkbox); `src/ui.test.ts:48`
(`expect(ui).toEqual({ navItems, priorities, slots, priority, slot })`) passes, so
`repeats`/`weekdays` are not in `ui`.

Out of scope: nothing excluded was built. `git diff --name-only main...HEAD` touches no
`package.json`, `yarn.lock`, `src/db/`, `src/ui.ts`, `src/views/pages/task-edit.ejs`,
`src/routes/overdue.ts` or `public/`. There is no analyzer change, no 010 edit-page picker,
no "repeats" chip on `/`, `/tasks`, `/timeline` or `/overdue`, no migration/column, and no
`node-cron`. The one `docs/errors/` entry is the logged error the factory asks for.

Not a finding, for the record: the round-1 tests and assertions are additions inside the
existing test files, and the full suite is green, so nothing the fixes touched regressed.
`readSheetEdit`/`readDraftEdits` drop a `repeat-days` value that is neither a string nor an
array of strings (`postedStrings`, `src/services/drafts.ts:133-138`), which `repeat=weekly`
then stores as `FREQ=WEEKLY` rather than refusing; with `express.urlencoded({ extended:
false })` the body parser yields only strings or string arrays, so the HTTP routes cannot
produce that shape (round-1 review-code notes the same). The AC3 "and any task it bumps"
sub-clause still has no 016 test, as round 1 noted; `storeSchedule` is protected by other
tests.
