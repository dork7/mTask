# 015-learning-loop: build

Branch `factory/015-learning-loop`, code commit `5e19b26`. Built on Node v26.8.2 and
yarn 1.22.22.

## What changed

Created:

| File | Why |
| --- | --- |
| `src/services/corrections.ts` | `readCorrections(db)` and `CORRECTIONS_PER_CATEGORY = 3`: done tasks from `listTasks(db, { status: 'done' })`, the AC1 checks via `taskCategories.find`, the gap `Math.abs(actual - estimated) * 2 >= estimated`, latest first with the higher id on a tie, at most 3 per category in `taskCategories` order (D2, D3, D4, D5). Private `Candidate`, `candidateOf`, `isLargeGap`. |
| `src/services/corrections.test.ts` | AC1, AC2, AC3 against an in-memory database (D10). |
| `src/services/analyzer-corrections.test.ts` | AC4 and AC5: the lines in the system prompt, the retry, the `createAnalyze` pass-through, and the pinned SHA-256 hashes of the 005 request (D7, D10). |
| `src/add-corrections.test.ts` | AC6: the app hands the stub the corrections, or the input alone (D9, D10). |

Changed:

| File | Why |
| --- | --- |
| `src/services/analyzer.ts` | `Correction` type (D1); private `CORRECTIONS_INTRO`, `systemPrompt`, `correctionLine` (D6); `analyze` gains `corrections: readonly Correction[] = []` and sets `system: systemPrompt(corrections)` with the key order unchanged (D7, D8); `Analyze` takes an optional list and `createAnalyze` passes it through (D8). Doc comments as in the Files list. |
| `src/services/drafts.ts` | `analyzeSource` reads `readCorrections(deps.db)` after `inputOf` and before the `try`, and calls `deps.analyze(input, corrections)` only when the list has entries, else `deps.analyze(input)` (D9). Doc comment gains the sentence. |

No existing test file, no file in `src/db/`, no route and no view was touched.

## Acceptance criteria

| Criterion | Test | Fails when | Result |
| --- | --- | --- | --- |
| AC1 which tasks count | `corrections.test.ts` › "which tasks count (AC1)" (status, null columns, category cases, exact four fields) | Category matched with `task.category?.trim().toLowerCase()`: "leaves out a task whose category is "Coding"", `" coding"`, `"coding "` failed. Also: `listTasks(db)` without the status filter failed the three status cases; dropping the `actual_minutes === null` check failed "leaves out a task with no actual time". | PASS |
| AC2 large gap | `corrections.test.ts` › "a large gap (AC2)", 8 rows | `* 2 >= estimated` changed to `* 2 > estimated`: "estimated 30, actual 45" and "estimated 30, actual 15" failed. | PASS |
| AC3 last N per category | `corrections.test.ts` › "the last ones per category (AC3)" | Tie broken by `a.id - b.id`: "counts the higher id as later…" failed. Comparator flipped to oldest first: "keeps the three latest of each category…" and "gives no slot to a newer task that does not count" failed. | PASS |
| AC4 in the request | `analyzer-corrections.test.ts` › "the lines in the request (AC4)": text, order kept, image, quote and line break, retry text and image, user message unchanged, `createAnalyze` | Title written as `"${title}"` instead of `JSON.stringify`: "writes a title with a quote and a line break as a JSON string, on one line" failed. `createAnalyze` dropping the list: "is handed the corrections through createAnalyze, and sends them" failed. | PASS |
| AC5 no corrections, no change | `analyzer-corrections.test.ts` › "without corrections (AC5)" (hashes, 6 cases) and "the result, the retry and the fallback (AC5)"; the existing `analyzer.test.ts` and `analyze-command.test.ts` unchanged | `systemPrompt` returning the prompt plus the intro for an empty list: all six hash cases (text and image, no list, `[]`, `undefined`) failed. | PASS |
| AC6 the app passes them | `add-corrections.test.ts` (8 tests) | `deps.analyze(input, corrections)` always: the four "input alone" tests and the three retry tests failed (7). `deps.analyze(input)` always: the three "passes the one correction" tests and two retry tests failed (5). | PASS |
| AC7 build and tests | the whole suite with `ANTHROPIC_API_KEY` unset | (covered by the breaks above; the analyzer file fails in `afterEach` on any unexpected `fetch`) | PASS |

Checked by hand:

- Step 1: the two pinned hashes passed against the unchanged `src/services/analyzer.ts`
  before any code changed (2 passed).
- A first AC1 break (no category check at all, the stored category cast through) left all
  34 tests green. The behaviour was not broken: the final `taskCategories.flatMap` only
  emits candidates whose category equals one of the six ids, so an unknown category is
  dropped there too and never takes a slot. The break above (trim and case folding) does
  change the behaviour, and the tests catch it.
- `ls -la data/` was the same before and after `yarn test`.
- `git diff main --stat -- src` lists only `src/services/analyzer.ts` and
  `src/services/drafts.ts` as changed; the four new files are added. No existing
  `*.test.ts` file is in the diff.

## Test run

`env -u ANTHROPIC_API_KEY yarn build`:

```
yarn run v1.22.22
$ tsc --noEmit
Done in 1.07s.
```

`env -u ANTHROPIC_API_KEY yarn test`:

```
 Test Files  62 passed (62)
      Tests  1924 passed (1924)
   Start at  17:29:08
   Duration  2.92s (tests 58%, import 35%, transform 7%)

Done in 3.35s.
```

```
VERIFICATION
Build: PASS
Tests: PASS   (1924 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped. The plan's first step was done as written (hash tests
with no third argument against the unchanged analyzer); those two tests were then folded
into the `it.each` over no list, `[]` and `undefined` in step 2, so the file holds the
plan's six AC5 hash cases and no duplicates.
