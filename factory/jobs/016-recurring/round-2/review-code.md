VERDICT: PASS

# Review: code, round 2

## Findings
None.

## Earlier findings

Round 1 `review-code.md` was PASS with no findings, so there is nothing of mine to
re-check. The commit under review, `af239d9`, is the builder's fix for the three
findings of `round-1/review-spec.md` (each a clause true in the code but protected by no
test). Those three are the whole of this round's diff — 36 added lines in three test
files, no source change — and I reproduced each fix by breaking the clause in a scratch
copy under `$TMPDIR` and running the test, then restoring the file:

1. `src/services/recurrence.ts:154` — AC2's "no start is dated the Dubai day it is
   completed". Fixed by the new test `takes the day it is made for an instance with no
   start (AC2)` (`src/services/recurrence.test.ts:224-235`). Broke `task.scheduled_start
   === null ? today : …` to `? today + 1000 :`; `yarn -s vitest run
   src/services/recurrence.test.ts` → `1 failed | 38 passed`, the new test failing at
   `:231` (`scheduled_start` not `2026-10-13T05:00:00.000Z`). Fixed.
2. `src/views/partials/task-sheet-body.ejs:54` and `src/views/pages/review.ejs:73` —
   AC8's `Repeat` label and AC10's accessible name. Fixed by
   `src/recurrence-sheet.test.ts:74` (label text) and `src/recurrence-review.test.ts:95`
   (`aria-label`). Broke the sheet label `Repeat`→`RepeatX` and removed the review
   select's `aria-label`; `src/recurrence-sheet.test.ts` + `src/recurrence-review.test.ts`
   → `2 failed | 25 passed`, one for each break. Fixed.
3. `src/services/recurrence.ts:189` — AC5's "one transaction each". Fixed by
   `handles each task in its own transaction, so one refusal leaves the others whole`
   (`src/services/recurrence.test.ts:333-352`). I ran both breaks the builder names:
   the per-task `inTransaction` removed (bare call) → new test failed at `:350`
   (`parent_task_id === 2` had 1 not 0); one `inTransaction` around the whole loop →
   new test failed at `:348` (`parent_task_id === 1` had 0 not 1). Fixed.

## Checked

Read `spec.md`, `design.md`, `plan.md`, `build.md`, `CLAUDE.md`, the one `docs/errors/`
entry (`next-instance-returned-before-placement.md`), both `round-1/review-*.md` files,
`build.md`'s `## Round 1` section and the whole of `git diff main...HEAD`. The cross-check
of each dependency in the lockfile was not needed: `package.json` and `yarn.lock` are
untouched by the job (the diff of `yarn.lock` is empty). `git branch --show-current` prints
`factory/016-recurring`. The round's diff `git show af239d9` is only `+36` lines across
`src/services/recurrence.test.ts`, `src/recurrence-sheet.test.ts` and
`src/recurrence-review.test.ts`; no line of `src/` is changed, so the module and the views
are exactly the code round 1 passed.

Ran, on Node v26.8.2 / yarn 1.22.22:

- `yarn build`:

  ```
  yarn run v1.22.22
  $ tsc --noEmit
  Done in 2.26s.
  ```

- `ANTHROPIC_API_KEY= yarn test`:

  ```
   Test Files  66 passed (66)
        Tests  1998 passed (1998)
      Duration  3.40s (tests 60%, import 33%, transform 6%)
  ```

  (No `EADDRNOTAVAIL`; the run overlapped no failure.) `git status --porcelain data/` was
  empty afterwards and `git status --porcelain` lists nothing; the only path this job adds
  is the reviewers' `factory/jobs/016-recurring/round-2/`.
- Mutation runs in a scratch copy at `$TMPDIR/mtask-review-016-r2` (rsync without
  `node_modules`/`.git`/`data`/`cache`, `node_modules` symlinked to the repo's): the five
  breaks listed under Earlier findings, each run against the targeted file and each
  restored from the pristine copy. Baseline in the scratch,
  `src/services/recurrence.test.ts src/recurrence-sheet.test.ts src/recurrence-review.test.ts`
  → `3 passed (3)`, `66 passed (66)`. The scratch was deleted and no scratch file or
  process remains.

Not a finding, for the record:

- The new AC5 test keys its trigger on `OLD.id = 2` and so depends on the two `groceries()`
  tasks taking ids 1 and 2. That is stable here (a fresh in-memory database per test, no
  other rows) and the trigger fires on the second task's own rule-clearing `UPDATE`, which
  the second task's `INSERT` precedes; both properties hold in the restored code
  (`src/services/recurrence.ts:169` `updateTask(task.id, …)` after `:157` `createTask`,
  and `storeSchedule` at `:172` only `UPDATE`s the freshly inserted instance,
  `src/services/scheduler.ts:237-240`), so no other task is touched inside task 1's
  transaction.
- The builder's deviation from the spec reviewer's fix 3 (refusing the second task's
  rule-clearing write rather than its insert) is correct and better: the test is the only
  one of the two shapes that fails when the per-task `inTransaction` is removed, which the
  two mutation runs above confirm.
- The round adds an assertion inside two existing tests (the sheet label, the review
  `aria-label`) rather than new `it`s; both are still inside the AC8/AC10 tests `build.md`
  names, so nothing about the acceptance-criteria mapping changes.
