# 016-recurring: build

Branch `factory/016-recurring`, code commit `d0f400b10421924ffeedd7ad077ab9bd92fc9563`. Built
on Node v26.8.2 and yarn 1.22.22.

## What changed

Created:

| File | Why |
| --- | --- |
| `src/services/recurrence.ts` | The whole module copied from the Files block of `design.md`: `weekdays`/`repeats` and their id types (D8); `readRule`/`repeatRule`/`repeatOf`/`daysOf` (D3, AC1); `nextDay` with `nextWeeklyDay`/`nextMonthlyDay` (D2, AC2); `makeNextInstance` (D4, AC3, AC6); `runRecurrence` (D6, AC5); `startRecurrence` (D7, AC7). Nothing reads the clock. |
| `src/services/recurrence.test.ts` | AC1, AC2, AC3, AC5, AC6 and AC7 on an in-memory database, as the scheduler tests. |
| `src/recurrence-done.test.ts` | AC4: the three Done routes, plus the done/no-rule/draft and all-or-none cases. |
| `src/recurrence-sheet.test.ts` | AC8 and AC9: the sheet's picker shown, stored and refused. |
| `src/recurrence-review.test.ts` | AC10: the review cards' pickers, a confirm, a Remove and the refusals. |
| `docs/errors/next-instance-returned-before-placement.md` | The one error that needed a fix (see Not done). |

Changed:

| File | Why |
| --- | --- |
| `src/services/drafts.ts` | The `repeatRule` import; `postedStrings` (D10); `DraftFieldName` gains `repeat`/`repeat-days`; `DraftEdit.recurrence_rule`; `DraftProblems.repeat`; the `readDraftEdits` problems literal and its repeat block; `hasProblems` includes `repeat` (D13, AC9, AC10). |
| `src/services/task-actions.ts` | The `postedStrings` and `makeNextInstance`/`repeatRule` imports; `SheetEdit.recurrence_rule`; `readSheetEdit` reads the picker (D12, AC9); `markDone` wraps the Done and the next instance in one `inTransaction` (D5, AC4); `readTaskEdit`'s problems literal gains `repeat: false`. |
| `src/routes/tasks.ts` | The imports, `BAD_REPEAT`, `SheetForm.repeat`/`days`, `sheetMessages` appends the repeat message last (D16), `shownRepeat` (D14), and the `form` spread. |
| `src/routes/review.ts` | The imports, `BAD_REPEAT`, `DraftCard.repeat`/`days`, `cardOf`'s `fields` and returned object with the two controls (D13, D14), `messagesOf` appends the repeat message last (D16). |
| `src/views/partials/task-sheet-body.ejs` | The Repeat select and the seven day boxes after the Time slot fieldset (D14). |
| `src/views/pages/review.ejs` | The Repeat select and the day boxes after each card's slot select, and the header-comment sentence (D14). |
| `src/app.ts` | `import { repeats, weekdays }` and `app.locals.recurrence = { repeats, weekdays };` (D11). |
| `src/server.ts` | `startRecurrence(db);` after `openDatabase` (D7). |
| `src/server.test.ts` | The `startRecurrence` mock, its `doMock`/`doUnmock` and one new test (D9). |
| `src/testing/dom.ts` | `formFields` skips an unchecked checkbox too, and its comment says so (D15). |
| `src/task-sheet.test.ts` | The exact form gains `repeat: ''` (D15). |
| `src/review-page.test.ts` | The exact form gains `repeat-<id>: ''` per draft, and the two slot selects are found by name (D15). |
| `src/add-rules.test.ts` | `selectedSlots` reads `select[name^="slot-"]` (D15); its assertion is untouched. |

No file in `src/db/`, no `package.json`, no `yarn.lock`, no stylesheet and no `src/ui.ts`
was touched.

## Acceptance criteria

| Criterion | Test | Fails when | Result |
| --- | --- | --- | --- |
| AC1 rule format | `recurrence.test.ts` › "the rule forms (AC1)" (the three forms, the BYDAY lists, the seven refused values, the `repeatRule` mapping and refusals, the picker's view) | The order guard `index <= previous` in `readRule` was dropped to `index === -1`: "reads FREQ=WEEKLY;BYDAY=TH,MO as no rule" and "reads FREQ=WEEKLY;BYDAY=MO,MO as no rule" failed (2). | PASS |
| AC2 next date | `recurrence.test.ts` › "the next date (AC2)" (each example, and the three zones) | Daily became `day + 1`, dropping `Math.max(…, notBefore)`: "is the next day for daily, not before today" failed (1). | PASS |
| AC3 the next instance | `recurrence.test.ts` › "the next instance (AC3)" | `category: task.category` was removed from the copy in `makeNextInstance`: "copies these fields, clears the rule, and leaves those six null" failed (and the AC5 case that reads the whole row). | PASS |
| AC4 completing makes the next one | `recurrence-done.test.ts` (the three routes, done/no-rule/draft, all-or-none) | `makeNextInstance(db, task, now)` was removed from `markDone`: all three route cases and "is all or none: a refused insert rolls the Done back" failed (4). | PASS |
| AC5 the periodic run | `recurrence.test.ts` › "the periodic run (AC5)" | The `if (task.status === 'draft') continue;` guard was removed: "leaves a draft, a task with no rule and a task not yet due alone, and returns the ids in order" failed (1). | PASS |
| AC6 exactly once | `recurrence.test.ts` › "exactly once (AC6)" (the three cases, the delete and the carried rule) | `updateTask(db, task.id, { recurrence_rule: null })` was changed to write the same rule back: all five AC6 cases failed (5). | PASS |
| AC7 the starter | `recurrence.test.ts` › "the starter (AC7)"; `server.test.ts` › "the recurring job (016 AC7)" | The initial `run()` in `startRecurrence` was removed: "runs at once, again every 15 minutes, and not after the stop" failed (1). Separately, `startRecurrence(db);` was removed from `server.ts`: "starts the recurring job once, on the database it opened, after it opens it" failed (1). | PASS |
| AC8 the sheet's picker shown | `recurrence-sheet.test.ts` › "the sheet picker is shown (AC8)" | `shownRepeat` returned `{ repeat: '', days: [] }` for a GET: "offers the four repeats…", "shows FREQ=DAILY as daily…" and "shows FREQ=MONTHLY as monthly…" failed (3). | PASS |
| AC9 saving the picker | `recurrence-sheet.test.ts` › "saving the picker (AC9)" | `repeatRule` mapped `daily` to `'FREQ=YEARLY'`: "stores repeat daily as FREQ=DAILY", "ignores a day box posted with anything but weekly" and "does not move a task when only the repeat changes" failed (3). | PASS |
| AC10 the review picker | `recurrence-review.test.ts` | `readDraftEdits` stored the posted value instead of the rule from `repeatRule`: "a confirm stores the posted rules…", "confirms a draft as a pending task…" and "a Remove stores the other cards posted rules" failed (3). | PASS |
| AC11 build and tests | the whole suite with `ANTHROPIC_API_KEY` unset, and `yarn build` | `postedStrings` returned `[]` for an array value: `yarn build` stayed clean and `ANTHROPIC_API_KEY= yarn test` failed 4 tests in 2 files (the two multi-day picker cases of AC9 and the two of AC10). | PASS |

Checked by hand:

- Before any break, `src/services/recurrence.test.ts` (37) and the three route files (34)
  passed; the whole suite was 66 files, 1996 tests, all passing.
- `git diff` of the four existing test files and the helper shows only the named edits:
  `task-sheet.test.ts` gains `repeat: ''`; `review-page.test.ts` gains `repeat-<id>: ''`
  for the three drafts and finds each slot select as `select[name^="slot-"]` (two
  places); `add-rules.test.ts`'s `selectedSlots` reads `select[name^="slot-"]`, its
  assertion at `:182` unchanged; `src/server.test.ts` gains the mock and one test and no
  existing assertion changes.
- `git status --porcelain data/` was empty after the whole test run, and `ls data/` was the
  same before and after it.
- `git status --porcelain` listed only the files of the plan (and this report): no
  `data/`, no package file, no `cache/`.
- `src/ui.test.ts:48` still passes: `repeats` and `weekdays` are not in `ui`.

## Test run

`yarn build`:

```
yarn run v1.22.22
$ tsc --noEmit
Done in 1.26s.
```

`ANTHROPIC_API_KEY= yarn test`:

```
 Test Files  66 passed (66)
      Tests  1996 passed (1996)
   Duration  3.56s (tests 59%, import 34%, transform 6%)
```

Verification report:

```
VERIFICATION
Build: PASS
Tests: PASS   (1996 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped.

- The plan's step 2 lists a clean `yarn build` as a step check, but `DraftFieldName` gains
  `repeat`/`repeat-days` there while `src/routes/review.ts` (step 4) is the last reader of
  it, so a clean build first happens at step 5. `yarn build` was clean from step 5 on and
  at step 9; the step-2 test command itself passed with none of its five files edited.
- One error needed a fix while writing the AC3 tests: `makeNextInstance` returns the row
  `createTask` inserted, before `storeSchedule` writes the times, so a test that asserted
  times on the returned value saw null. The tests read the row back with `getTask`, and it
  is logged as `docs/errors/next-instance-returned-before-placement.md`.
