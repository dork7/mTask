VERDICT: PASS

# Review: code, round 1

## Findings
None.

## Earlier findings
Round 1: none.

## Checked

Read the job's `spec.md`, `design.md`, `plan.md`, `build.md`, `CLAUDE.md`, the one
`docs/errors/` entry (`next-instance-returned-before-placement.md`), and the whole of
`git diff main...HEAD` (24 files): the new module `src/services/recurrence.ts`, the new
test files, and every changed line of `src/services/drafts.ts`, `src/services/task-actions.ts`,
`src/routes/tasks.ts`, `src/routes/review.ts`, `src/app.ts`, `src/server.ts`,
`src/server.test.ts`, `src/testing/dom.ts`, the two `.ejs` files and the three edited test
files. `package.json`/`yarn.lock` are untouched (no `node-cron`), so no dependency check was
needed. `git branch --show-current` prints `factory/016-recurring`.

Ran:

- `yarn build` → `$ tsc --noEmit` / `Done in 2.06s` (clean).
- `ANTHROPIC_API_KEY= yarn test` → `Test Files 66 passed (66)` / `Tests 1996 passed (1996)`,
  no `EADDRNOTAVAIL`. `git status --porcelain data/` empty afterwards; the only untracked
  path is the reviewers' `factory/jobs/016-recurring/round-1/`.
- `TZ=America/New_York ANTHROPIC_API_KEY= yarn -s vitest run src/services/recurrence.test.ts
  src/recurrence-done.test.ts src/recurrence-sheet.test.ts src/recurrence-review.test.ts` →
  `4 passed`, `71 passed` (the suite is not tied to the shell's zone).
- `diff -u` of `src/services/recurrence.ts` against the code block in `design.md` → identical.
- A scratch fuzz (`$TMPDIR`, deleted) of `nextDay` against an independent reference over
  every Dubai day from 2020-01-01 to 2030-12-31, each against `notBefore` = day−40, −1, 0,
  +1, +7, +40, +400, for daily, monthly, and weekly with six day-sets (plain and by day):
  0 mismatches. So the daily/monthly/weekly next-date arithmetic (AC2) is right and the
  monthly cap and month walk do not read the process zone.
- A scratch probe of `readSheetEdit`, `readDraftEdits`, `readRule`, `repeatRule`: the four
  forms map and round-trip; `repeatRule` refuses an unknown repeat, a repeated repeat, a
  non-string repeat and a bad day with `undefined`; a day posted with anything but `weekly`
  is dropped; `null` (twice-posted) refuses.

Notes (not findings):

- `src/services/recurrence.ts` — `readSheetEdit`/`readDraftEdits` reach `postedStrings`,
  which keeps only string values, so a `repeat-days` value that is neither a string nor an
  array of strings is silently dropped (`repeat=weekly` then stores `FREQ=WEEKLY`) instead
  of answering 400. With `express.urlencoded({ extended: false })` the body parser
  (`querystring`) yields only strings or string arrays, so this shape is not reachable
  through the HTTP routes; I saw it only by calling the functions directly.
- `src/services/recurrence.ts:385` — `makeNextInstance` returns the row `createTask`
  inserted, before `storeSchedule` writes the times; callers use only `.id` and the
  tests read the stored row back (`getTask`/`listTasks`). This is exactly what
  `docs/errors/next-instance-returned-before-placement.md` records, and that entry is
  accurate.
- `src/review-page.test.ts:426` — the test name still says "posts exactly the four fields"
  while it now lists six; the assertion itself is correct. Cosmetic.
