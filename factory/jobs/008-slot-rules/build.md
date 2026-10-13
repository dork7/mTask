# 008-slot-rules: build

Branch `factory/008-slot-rules`, code commit `8b9b686`, and `4ffe112` for an error log
entry that was written after it. Built on Node v26.8.2 and yarn 1.22.22, the only Node on
this machine.

## What changed

Created:

| File | Why | Decision |
|---|---|---|
| `src/services/rules.ts` | `RuleResult`, `readSlotRules(db)` and `applyRules(rules, category, urgency)`. The file is the design's, as written | D3, D4 |
| `src/services/rules.test.ts` | The reader, the shape of the result, and one `describe` for each of the priority, coding, shopping, urgent and no-rule rules and for "the rules are the setting". 66 tests | plan, AC3 to AC9 |
| `src/db/migrations.test.ts` | Migration 1 by its SHA-256, a version 1 database built with the runner, and the reopen tests. 6 tests | D7, AC2 |
| `src/add-rules.test.ts` | The stored drafts, the review page and the confirm for a photo, a spoken text and a typed text, the retry, and one test the plan does not list (see Not done). 20 tests | D9, AC10 |
| `docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md` | A command run by hand left `.vitest/` in the repo | error log |

Changed:

| File | Why | Decision |
|---|---|---|
| `src/db/migrations.ts` | Migration 2, one `INSERT` of the `slot_rules` row: four added lines, none removed | D1 |
| `src/db/settings.ts` | The import of `Slot`, `SlotRule`, and the key `slot_rules` in `Settings` | D2 |
| `src/services/drafts.ts` | The import of `./rules.ts`, the sentence in the doc comment of `analyzeSource` (the comment's lines after it were wrapped again), and the transaction: the rules are read once and each draft is stored with `ruled.priority` and `ruled.time_slot` | D5 |
| `src/db/settings.test.ts` | The keys after a reopen are `slot_rules`, `working_hours`, read with `ORDER BY key`; the import of `SlotRule`; four AC1 tests in a new `describe` at the end | D8, AC1 |
| `src/db/schema.test.ts` | The one test of D8: renamed, `ORDER BY key`, two keys, the hours read from `rows[1]` | D8 |
| `src/db/database.test.ts` | `count(second, 'settings')` is 2, not 1. Nothing else | D8 |
| `src/add-analysis.test.ts`, `src/add-text.test.ts` | `'time_slot',` removed from `UNSET_COLUMNS`. Nothing else | D8 |

## Acceptance criteria

"Fails when" is the change I made to see the test fail; the file was restored after each.
There were 49 such changes, each made alone and followed by one run of the test files it
could reach (or of `yarn build` for the four type changes). A script outside the repo made
the change, ran the tests, restored the file, and compared a hash of every file of the
repo before and after: it was the same every time. The runs that use supertest were
paced, and no failure message held `EADDRNOTAVAIL`.

One run was thrown away: my first "seeded on every open" change wrote SQL that did not
parse, so 246 tests failed for a reason that proves nothing. It was written again and run
again; the result below is the second one.

After the last of these runs, five lines of 121 characters in `src/add-rules.test.ts` and
`src/services/rules.test.ts` were wrapped (three `setSetting` calls and two `flatMap`
expressions, no assertion). The whole suite was run after that; the breaks were not.

Test files are under `src/`.

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1: a new database has `slot_rules`, exactly the two rules, coding first | `db/settings.test.ts` "a new database in memory has the two seeded rules, coding first"; `services/rules.test.ts` "returns the seeded rules of a new database" | the seeded end is `23:00`; the two rules are in the other order; there is no migration 2 | PASS |
| AC1: the same in a file, stored as that JSON text | `db/settings.test.ts` "a new database in a file has the same, stored as the JSON of the two rules" | the three above; the stored JSON has a space in it (this test alone fails then) | PASS |
| AC1: `slot_rules` is a key of `Settings`, so `getSetting` is typed for it | `db/settings.test.ts`, the line `const rules: SlotRule[] \| undefined = getSetting(db, 'slot_rules')`, through `yarn build` | the key is removed from `Settings` (build exit 2, `TS2345` and `TS2322`); its type is `SlotRule[] \| SlotRule` (`TS2322`) | PASS |
| AC1: `setSetting` is typed for it | `db/settings.test.ts` "setSetting is typed for the rules: a value of another shape does not compile", three `@ts-expect-error` lines, through `yarn build` | the value may be one rule (`TS2578` unused directive, line 119); `time_slot` is `string` (line 121); `start` and `end` are optional (line 123). Build exit 2 each time | PASS |
| AC1: `setSetting` replaces the rules and leaves the hours | `db/settings.test.ts` "setSetting replaces the rules and leaves the working hours as they were" | `setSetting` writes nothing for `slot_rules`; `setSetting` deletes every other key first | PASS |
| AC1 (D8): a new database has the two keys and no other, hours 09:00 to 22:00 | `db/schema.test.ts` "holds the slot rules and the working hours, 09:00 to 22:00, and nothing else when it is created" | there is no migration 2; every open adds a settings row | PASS |
| AC2: the text of migration 1 is unchanged | `db/migrations.test.ts` "leaves migration 1 as it was merged" | one space is added inside migration 1; the rules are seeded inside migration 1 | PASS |
| AC2: the setting is added by an appended migration | `db/migrations.test.ts` "is the second of two migrations", "is not part of migration 1: a database with migration 1 only has no slot rules" | there is no migration 2 (the first); the rules are seeded inside migration 1 (both) | PASS |
| AC2: a version 1 database with changed hours gets the rules and keeps its hours | `db/migrations.test.ts` "gives a version 1 database the rules and keeps its working hours and its tasks" | there is no migration 2; migration 2 also sets the hours back; migration 2 deletes the tasks; migration 2 empties `time_slot` of the tasks | PASS |
| AC2: opening again does not overwrite changed rules | `db/migrations.test.ts` "does not overwrite rules that were changed when the database is opened again" | `openDatabase` writes the seeded value on every open | PASS |
| AC2 (plan): nor bring back emptied or deleted rules | `db/migrations.test.ts` "does not bring back rules that were emptied or deleted when the database is opened again" | `openDatabase` writes the seeded value on every open; `openDatabase` seeds the row when it is missing | PASS |
| AC2 (D8): a reopen keeps changed hours, and the keys are the two | `db/settings.test.ts` "opening the database again does not overwrite a value that was changed" | there is no migration 2; every open adds a settings row | PASS |
| AC2 (D8): a later open adds no settings row | `db/database.test.ts` "keeps the rows of an earlier open, and a later open adds none", and unedited "changes nothing in the file when it is opened again" | every open adds a settings row (both); there is no migration 2 (the first) | PASS |
| AC3: a function of a category and an urgency returns `priority` and `time_slot`, and nothing else | `services/rules.test.ts` "returns a priority and a time slot, and nothing else" | the result carries a third field, `category` | PASS |
| AC3: the rules it applies are the value of the setting | `services/rules.test.ts` "returns the list that was set with setSetting", "returns no rules when the setting is missing" | the reader returns the two rules written into it (12 tests fail, these two and ten of AC7 and AC9) | PASS |
| AC3: it reads no clock | `services/rules.test.ts` "gives the same result at any time of day and sends no request" | `applyRules` gives no slot from 12:00 UTC on; `applyRules` calls `fetch` (this test alone fails then) | PASS |
| AC3 (plan): the rules handed in are not changed | `services/rules.test.ts` "does not change the rules it is handed" | `applyRules` pops the last rule off the list | PASS |
| AC3 (design, Risks): the seeded rules name only categories and slots that exist | `services/rules.test.ts` "the seeded rules name only categories of the analyzer and slots of src/ui.ts" | the second seeded category is `groceries`; `night` is removed from `slots` in `src/ui.ts` (this test alone fails then) | PASS |
| AC3 (plan): the 24 inputs | `services/rules.test.ts` "is tested with every category and every urgency, 24 pairs" | not broken: it guards the test's own helper, so no test below runs over an empty list | PASS |
| AC4: `priority` is the urgency for all four, whatever the category | `services/rules.test.ts` "a %s task of urgency %s has that urgency as its priority" (24) | a `coding` task of urgency `medium` gets `high` (that one case fails); the urgent rule answers `high` (the six `urgent` cases fail) | PASS |
| AC5: `coding` with `high`, `medium`, `low` gives `morning` | `services/rules.test.ts` "a coding task of urgency %s belongs to the morning" (3) | the seeded coding rule says `afternoon`; `applyRules` never gives a slot; there is no migration 2 | PASS |
| AC6: `shopping` with `high`, `medium`, `low` gives `night` | `services/rules.test.ts` "a shopping task of urgency %s belongs to the night slot" (3) | the seeded shopping rule says `evening`; its category is `groceries`; `applyRules` never gives a slot; the first rule of the list is applied whatever its category | PASS |
| AC7: `urgent` gives `urgent` and `null` for every category | `services/rules.test.ts` "an urgent %s task is urgent and has no slot" (6) | the urgent line is removed (`coding` and `shopping` fail); the urgent rule answers `high` (all six fail) | PASS |
| AC7: the rule is code and wins over the category rules | `services/rules.test.ts` "wins over a rule for every category" | the urgent line is removed; the urgent rule applies only when no rule names the category; the reader ignores the setting (the first half of the test) | PASS |
| AC8: `work`, `home`, `personal`, `other` give `null` | `services/rules.test.ts` "a %s task of urgency %s has no slot" (12) | a task without a rule gets `afternoon`; the first rule of the list is applied whatever its category | PASS |
| AC9: a changed setting changes the result | `services/rules.test.ts` "a changed setting changes the result" | the reader returns rules written into it; `setSetting` writes nothing for the key; only `morning` and `night` are honoured in the code | PASS |
| AC9 (plan): any of the four slots | `services/rules.test.ts` "a rule can send a category to the slot %s" (4) | only `morning` and `night` are honoured (`afternoon` and `evening` fail); the reader returns rules written into it (all four) | PASS |
| AC9: `[]` gives `null` for every category and does not throw | `services/rules.test.ts` "an empty list gives no category a slot and does not throw" | a task without a rule gets `afternoon`; the reader returns rules written into it | PASS |
| AC9: no row gives `null` for every category and does not throw | `services/rules.test.ts` "a missing setting gives no category a slot and does not throw", "returns no rules when the setting is missing" | the reader falls back to the two rules when the row is missing; the reader returns `undefined` (the rule function throws) | PASS |
| AC9: the first of two rules for a category is applied | `services/rules.test.ts` "the first of two rules for a category is the one applied", "... when a rule of another category comes first" | `findLast` in place of `find` (both); the first rule of the list is applied whatever its category (the second) | PASS |
| AC10: each draft is stored with what the rules give, with the seeded value, for all three ways | `add-rules.test.ts` "stores each draft with what the seeded rules give for its category and urgency" (photo, spoken text, typed text) | the drafts are stored as before this job; `time_slot` is not passed on; the urgent line is removed (the urgent shopping task gets `night`) | PASS |
| AC10: with the `slot_rules` setting of that database | `add-rules.test.ts` "goes by the slot_rules setting of its database" (3) | the drafts service uses the two rules written into it; `time_slot` is not passed on | PASS |
| AC10 with AC9: no row, the post still answers 303 | `add-rules.test.ts` "stores the drafts with no slot when the database has no slot_rules setting" (3) | the drafts service uses rules written into it; the reader returns `undefined` when the row is missing | PASS |
| AC10: the review page has `Morning` selected for the coding draft and `No slot` for the personal one | `add-rules.test.ts` "shows each draft on the review page with its slot selected and its priority checked" (3) | the drafts are stored as before; the review card ignores the stored slot; the review card ignores the stored priority; the urgent line is removed | PASS |
| AC10: a confirm stores what the card shows | `add-rules.test.ts` "a confirm of the form as it is served stores the slots the rules gave" (3) | the drafts are stored as before; the review card ignores the stored slot | PASS |
| AC10: the user can change both, and a confirm stores what was posted | `add-rules.test.ts` "a confirm with edits stores what was posted, not what the rules give" (3) | `confirmDrafts` applies the rules again (these three and eleven tests of `review-actions.test.ts` fail) | PASS |
| AC10 (D5): the retry goes by the setting as it is at the retry | `add-rules.test.ts` "stores its drafts by the rules as they are at the retry" | the drafts are stored as before; rules written into the service; the rules of a database are read before the analyzer runs and kept | PASS |
| AC10 (D5): the setting as it is when the drafts are stored | `add-rules.test.ts` "a later analysis goes by rules that were changed after an earlier one" | the rules of a database are kept from the first analysis that stored drafts (this test alone fails then) | PASS |
| AC10 (D8): the nine other columns stay unset | `add-analysis.test.ts` "leaves every other column of a draft unset: the photo is reached through the source"; `add-text.test.ts` "leaves every other column of a draft unset" (both routes) | the drafts service also sets `actual_minutes` | PASS |
| AC10 (D8): `priority` is still the urgency | `add-analysis.test.ts` and `add-text.test.ts` "stores each task as a draft of the source, in the order of the result", and the retry tests of both | every draft is stored with the priority `low` (26 tests fail: 2 in `add-analysis.test.ts`, 4 in `add-text.test.ts` and all 20 of `add-rules.test.ts`) | PASS |
| AC11: `yarn build` and `yarn test` pass with the key unset | the run below | | PASS |
| AC11: one unit test or more for each of the five rules | the `describe`s "the priority rule (AC4)", "the coding rule (AC5)", "the shopping rule (AC6)", "the urgent rule (AC7)", "a category with no rule (AC8)" in `services/rules.test.ts` | the rows of AC4 to AC8 above | PASS |
| AC11: nothing is left in `data/` | by hand, below | | PASS |
| AC11: only the tests that expect one settings row or an unset `time_slot` change | `git diff --stat main` on the test files, below | | PASS, with `src/db/database.test.ts` as the design says (D8) |

No test can tell whether a draft's priority comes from `ruled.priority` or straight from
`task.urgency`: the priority rule is the identity (design, Risks). The line in
`src/services/drafts.ts` reads `priority: ruled.priority`.

Checked by hand:

- `shasum data/app.db` printed `fd8a3660bbae2cfd23f97de04f210070621712f0` before the
  first edit, after every whole run of the suite, and after the last one. No test and no
  hand check opened the file.
- After the last run: `ls "$(node -p 'os.tmpdir()')" | grep '^mtask-'` printed nothing,
  and there is no `.env` in the repo.
- `git diff --numstat main -- src/db/migrations.ts` printed `4	0	src/db/migrations.ts`.
- The plan's `git diff --stat main -- package.json yarn.lock src/db/database.ts ...` over
  the design's Not touched list printed nothing.
- The existing test files that differ from `main` are the five of D8:
  `src/add-analysis.test.ts` (1 line removed), `src/add-text.test.ts` (1 line removed),
  `src/db/database.test.ts` (1 line changed), `src/db/schema.test.ts` (4 lines changed),
  `src/db/settings.test.ts`.
- A database of before this job. `data/app.db` was copied into a new folder (see Not
  done for where). `sqlite3` on the copy, read-only, printed version `1` and the one row
  `working_hours|{"start":"09:00","end":"22:00"}`. The plan's
  `node --input-type=module -e "..." <the copy>` then printed
  `2 { start: '09:00', end: '22:00' }` and the two rules: `coding`, `morning`, `09:00`,
  `11:00`, then `shopping`, `night`, `20:00`, `22:00`. The folder was deleted.
- The review page in plain Node. `lsof -nP -iTCP:3987 -sTCP:LISTEN` printed nothing. A
  script outside the repo built the app with `openDatabase(':memory:')`, a new uploads
  folder outside the repo and an analyzer that resolves to the four tasks, and printed
  `listening on 3987`. `curl -i -d 'text=the list' http://127.0.0.1:3987/add/text`
  answered `HTTP/1.1 303 See Other` with `Location: /review/1`.
  `curl -s http://127.0.0.1:3987/review/1 | grep -n 'selected\|checked'` printed eight
  lines, in this order: `priority-1` `high` checked, `Morning` selected, `priority-2`
  `medium` checked, `Night` selected, `priority-3` `low` checked, `No slot` selected,
  `priority-4` `urgent` checked, `No slot` selected. The script was stopped, `lsof`
  printed nothing again, and the folder was deleted.

## Test run

`yarn build`:

```
$ tsc --noEmit
Done in 1.05s.
```

`env -u ANTHROPIC_API_KEY yarn test`, the whole suite, once, on the committed tree:

```
 RUN  v5.0.1 /Users/dork/repos/mTask


 Test Files  38 passed (38)
      Tests  1331 passed (1331)
   Start at  17:48:13
   Duration  1.67s (tests 55%, import 34%, transform 10%)

Done in 2.23s.
```

1331 is the 1235 of before and 96 new: 66 in `src/services/rules.test.ts`, 20 in
`src/add-rules.test.ts`, 6 in `src/db/migrations.test.ts` and 4 in
`src/db/settings.test.ts`. None skipped.

```
VERIFICATION
Build: PASS
Tests: PASS   (1331 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

Diff: every file of `git diff --name-only main...HEAD` outside `factory/` is in the
design's Files list, except the one new entry under `docs/errors/`, which the design
allows for a logged error. No `.only`, `.skip`, `TODO`, `console.log`, `debugger` or
path of this machine in the new files.

## Not done

Nothing in the spec was skipped. What differs from the design or the plan:

- **One test more than the plan lists** (96 new tests, the design counted 95). "a later
  analysis goes by rules that were changed after an earlier one" in
  `src/add-rules.test.ts`. Without it, a drafts service that keeps the rules of a
  database from its first analysis passed every test: in the plan's retry test the first
  analysis is the fallback, which stores nothing and so reads no rules. It serves AC10 as
  D5 reads it, "the setting as it is when the drafts are stored".
- **The two hand checks used the session's scratch folder, not `$TMPDIR`.** The plan says
  "a new folder under `$TMPDIR`"; this session is told to keep its temporary files in a
  scratch folder of its own, which is also outside the repo. Both folders were deleted.
- **One thing the design's Risks say was not seen.** "The rules are seeded on every open
  ... and so does the 003 test 'changes nothing in the file when it is opened again'":
  with my change (an upsert of the seeded value after `migrate`) that test stayed green
  and the two reopen tests of AC2 failed. I did not find out why the bytes stayed the
  same. The 003 test did fail for the change that adds a settings row on every open.
- **Not run on Node 22 or 24.** 26.8.2 is the only Node here, as the design says.
- **No request reached the Anthropic API**, and nothing in this job calls it.
- `src/db/settings.test.ts`: the changed assertion of D8 is written over four lines, not
  one; the one line would be 124 characters. The assertion is the design's.
