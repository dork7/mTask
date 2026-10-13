# 008-slot-rules: design

The spec can be built as written, with one correction and three readings. Each is
settled under Decisions:

- AC11 names two files whose tests expect `working_hours` to be the only settings row
  (`src/db/settings.test.ts`, `src/db/schema.test.ts`) and says no other existing test
  changes. There is a third: `src/db/database.test.ts`, line 106, counts the rows of
  `settings` and expects 1. AC1 makes that 2. The reading: AC11 describes the tests by
  what they expect, and its list of files is short by one. That one line changes and
  nothing else in the file does (D8).
- AC3 leaves open whether the function is handed the database or the rules. It is handed
  the rules; a second function reads them from the database (D3).
- AC9, "with no `slot_rules` row at all ... the function does not throw": the function
  that meets the missing row is the reader, which returns an empty list. The rule
  function then gives `null` for every category, as it does for `[]` (D3).
- AC10, "with the `slot_rules` setting of that database": the setting as it is when the
  drafts are stored, read once for the whole list. A retry of a failed analysis goes by
  the setting as it is at the retry (D5).

Everything marked "checked" below was run in a throwaway copy outside the repo with the
repo's own `node_modules`, `tsconfig.json` and Vitest config: Node 26.8.2 (its bundled
SQLite 3.53.4), yarn 1.22.22, TypeScript 5.9.3, Vitest 5.0.1, Express 5.3.0, supertest
7.3.1. The design was built there once as a prototype: the migration, the setting's
type, the service, the change to the drafts service, the edits to the five existing test
files and the three new test files. `yarn build` was clean and `yarn test` passed with
`ANTHROPIC_API_KEY` unset: 38 files, 1330 tests, which are the 1235 of before and the 95
of `plan.md`. Twelve ways of breaking the code were tried, one at a time, and each made
the tests named under Risks fail. The copy is deleted.

Not checked: Node 22 and 24 (26.8.2 is the only Node on this machine). No request
reached the live API: there is no key here, and nothing in this job calls it.

## Approach

The job has three parts.

**The setting.** A second migration is appended to `src/db/migrations.ts`. It inserts
one row into `settings`: the key `slot_rules` and the two rules as JSON. Migration 1 is
not edited. A new database runs both migrations; a database at version 1 runs the second
one the next time it is opened; a database at version 2 runs nothing, which is what
keeps a changed value. `Settings` in `src/db/settings.ts` gains the key, with the type
of one rule beside it.

**The service.** `src/services/rules.ts` has two functions. `readSlotRules(db)` returns
the value of the setting, or an empty list when the row is missing. `applyRules(rules,
category, urgency)` is pure: it returns the urgency as the priority, no slot for an
urgent task, and otherwise the slot of the first rule that names the category. It
imports the analyzer's category type as a type only, so loading it loads neither the
analyzer nor the Anthropic SDK.

**The drafts.** `analyzeSource` in `src/services/drafts.ts` reads the rules once, inside
the transaction that stores the drafts, and gives each draft the priority and the slot
the rules return. Photo, voice and text sources and the retry all go through this one
function, so nothing else has to change. The review page already selects a stored slot
(006 D16), and the confirm already stores what is posted.

## Decisions

**D1. Migration 2 is one `INSERT` of the `slot_rules` row.** Appended to the
`migrations` array, after the closing `` `, `` of migration 1:

```ts
  // 2: the slot rules: the part of the day a category of task belongs to.
  `
INSERT INTO settings (key, value) VALUES ('slot_rules', '[{"category":"coding","time_slot":"morning","start":"09:00","end":"11:00"},{"category":"shopping","time_slot":"night","start":"20:00","end":"22:00"}]');
`,
```

The JSON is on one line and has no space in it: it is what `JSON.stringify` gives for
the value of AC1, so a test can compare the stored text. These are four added lines and
no removed one. Nothing above them changes, the header comment included.

The runner of 003 D6 does the rest. Checked:

- A new database, in memory and in a file, is at `user_version` 2 and
  `getSetting(db, 'slot_rules')` is the value of AC1.
- A file made with migration 1 only (`migrate(db, migrations.slice(0, 1))`), with
  `working_hours` changed and a task stored, is at version 2 after `openDatabase`, has
  the seeded rules, the changed hours and the task as it was.
- A copy of the developer's own `data/app.db`, which is at version 1 with the one row
  `working_hours`, opened the same way: version 2, both keys. The original was only read.
- A file whose `slot_rules` was changed with `setSetting`, set to `[]`, or deleted, has
  the same after it is opened again.

It is a plain `INSERT`, as the seed of migration 1 is. A version 1 database that already
has a `slot_rules` row would fail the migration with `UNIQUE constraint failed:
settings.key` and not open. No code before this job could write that key: `SettingKey`
had `working_hours` only. Rejected: `ON CONFLICT (key) DO NOTHING`, which guards a case
only raw SQL can make. Rejected: seeding in `openDatabase` when the row is missing; it
would bring back a row that was deleted and run on every open.

**D2. `SlotRule` and the key `slot_rules` are in `src/db/settings.ts`.** The file's
imports and the top of it become:

```ts
import type { Slot } from '../ui.ts';
import type { Database } from './database.ts';

/**
 * One slot rule: a task of this category belongs to this part of the day. `start` and
 * `end` are the rule's own window, `HH:MM` on a 24-hour clock, on the user's clock.
 * `category` is a category as the analyzer names it; a rule for a name no task has
 * applies to nothing.
 */
export interface SlotRule {
  category: string;
  time_slot: Slot;
  start: string;
  end: string;
}

/**
 * Every setting and the type of its value. A value is stored as JSON under its key.
 * A job that adds a setting adds its key here.
 */
export interface Settings {
  /** The hours tasks may be scheduled in: `HH:MM` on a 24-hour clock, on the user's clock. */
  working_hours: { start: string; end: string };
  /** The category rules, in the order they apply: the first rule that names a category is the one used. */
  slot_rules: SlotRule[];
}
```

`SettingKey`, `getSetting` and `setSetting` are not changed: they are generic over
`Settings`, so both are typed for the new key. Checked with `tsc`:
`const rules: SlotRule[] | undefined = getSetting(db, 'slot_rules')` compiles without a
cast, and `setSetting(db, 'slot_rules', …)` is refused for an object that is no list,
for a `time_slot` of `'dawn'` and for a rule without `start` and `end`.

`category` is `string`, not `TaskCategory`. `src/db/` imports nothing from
`src/services/`, and `tasks.category` is free text in the table and `string | null` in
`Task`. A rule for a category the analyzer does not have matches no task, which is what
the spec's Out of scope says of an unknown category. `time_slot` is `Slot`, as
`Task.time_slot` is; `src/db/tasks.ts` already imports from `src/ui.ts`. Rejected:
`category: TaskCategory` through a type-only import of `../services/analyzer.ts`; it
would catch a misspelled category at compile time and make the database folder depend on
the analyzer.

**D3. `src/services/rules.ts` has a reader and a pure rule function; the function is
handed the rules.** The whole file:

```ts
import type { Database } from '../db/database.ts';
import { getSetting, type SlotRule } from '../db/settings.ts';
import type { Priority, Slot } from '../ui.ts';
import type { TaskCategory } from './analyzer.ts';

/*
 * The rules that give a task its priority and the part of the day it belongs to, from
 * the category and the urgency the analyzer found.
 *
 * The category rules are data: the `slot_rules` setting. The urgent rule is code. Nothing
 * here reads the clock or asks a model, so the same input and the same setting always
 * give the same result. Finding the time a task is done at is not done here.
 */

/** What the rules decide for one task. `time_slot` is `null` when the task belongs to no part of the day. */
export interface RuleResult {
  priority: Priority;
  time_slot: Slot | null;
}

/** The category rules of this database, in the order they apply. None when the setting is missing. */
export function readSlotRules(db: Database): SlotRule[] {
  return getSetting(db, 'slot_rules') ?? [];
}

/**
 * The priority and the slot of a task of this category and urgency under these rules.
 * The priority is the urgency, unchanged. The slot is that of the first rule that names
 * the category, or `null` when none does. An urgent task has no slot, whatever its
 * category and whatever the rules: it is not held back for one.
 */
export function applyRules(rules: readonly SlotRule[], category: TaskCategory, urgency: Priority): RuleResult {
  // Before the category rules, so no rule can hold an urgent task back.
  if (urgency === 'urgent') return { priority: urgency, time_slot: null };

  const rule = rules.find((item) => item.category === category);
  return { priority: urgency, time_slot: rule?.time_slot ?? null };
}
```

The function of AC3 is `applyRules`. It is handed the rules because the one caller
stores a whole list of drafts: one read serves them all, and they all go by the same
rules. It also keeps the rule function free of the database, so it cannot read anything
but its arguments. Rejected: `applyRules(db, category, urgency)`, one query per task.

The import of `TaskCategory` is `import type`, so it is erased. Checked in plain Node:
with a `throw` put at the end of `src/services/analyzer.ts`, importing
`src/services/rules.ts` and calling both functions still worked.

The result's two names are the column names, as AC3 says. The object is new on every
call and the rules handed in are not changed.

**D4. The order of the rules in `applyRules`.**

| # | Condition | `priority` | `time_slot` |
|---|---|---|---|
| 1 | `urgency === 'urgent'` | `'urgent'` | `null` |
| 2 | a rule in `rules` has this `category` | the urgency | the `time_slot` of the first such rule |
| 3 | otherwise | the urgency | `null` |

Row 1 is code and comes first (AC7). Row 2 uses `Array.prototype.find`, which returns
the first match (AC9). `start` and `end` of a rule are not read (Out of scope). Nothing
checks the shape of a rule (Out of scope): a `time_slot` the table does not allow is
refused by the `tasks_time_slot` check when the draft is stored, and the analysis
answers 500 with nothing stored, as any database error does (006 D5).

**D5. `analyzeSource` reads the rules once, inside the transaction, and sets both fields
by name.** In `src/services/drafts.ts`, the transaction becomes:

```ts
  inTransaction(deps.db, () => {
    // Another request analyzed this source while this one waited for the analyzer.
    if (listSourceTasks(deps.db, source.id).length > 0) return;

    // Read once, so every draft of one analysis goes by the same rules.
    const rules = readSlotRules(deps.db);
    for (const task of analysis.tasks) {
      const ruled = applyRules(rules, task.category, task.urgency);
      createTask(deps.db, {
        title: task.title,
        description: task.description,
        category: task.category,
        estimated_minutes: task.estimated_minutes,
        confidence: task.confidence,
        priority: ruled.priority,
        time_slot: ruled.time_slot,
        status: 'draft',
        source_id: source.id,
      });
    }
  });
```

The import `import { applyRules, readSlotRules } from './rules.ts';` goes after the
import of `./photo-storage.ts`. The doc comment of `analyzeSource` gains one sentence
after its first: `Each draft gets its priority and its slot from the rules of
`rules.ts`, with the `slot_rules` setting as it is when the drafts are stored.`

The two fields are written out, not spread from the result: `createTask` throws on a key
that is no task field, so a field added to `RuleResult` later would break every
analysis. `time_slot: null` is written as `NULL`, which is what the column held before.

The rules run here and nowhere else: not on confirm, not on remove (Out of scope). The
read is after the check for an earlier set of drafts, so a request that stores nothing
reads nothing.

Checked: with the seeded value, a photo, a spoken text and a typed text whose analysis
is a `coding` task of urgency `high`, a `shopping` task of `medium`, a `personal` task of
`low` and a `shopping` task of `urgent` each store `high` `morning`, `medium` `night`,
`low` `NULL` and `urgent` `NULL`. With the row deleted the post still answers 303 and
every slot is `NULL`.

**D6. The review route, the view and the script are not changed.** `cardOf` in
`src/routes/review.ts` already gives the card `draft.time_slot ?? ''`, and
`pages/review.ejs` already marks that option `selected` (006 D16, D18). Checked through
supertest and in plain Node with a stub analyzer on a port: the four cards of D5 have
`Morning`, `Night`, `No slot` and `No slot` selected and `high`, `medium`, `low` and
`urgent` checked. Confirming the form as served stores the same four slots as `pending`;
a confirm that posts other priorities and slots stores those.

**D7. The tests pin migration 1 by its SHA-256 and build a version 1 database with the
runner.** In the new `src/db/migrations.test.ts`:

```ts
/** SHA-256 of the text of migration 1 as it was merged by 003. It never changes. */
const MIGRATION_1_SHA256 = 'b9c464e43fd295f55123aacd8dd23c72b6375f3a6631168d745b3add10c5a934';

/** A database file as the code before this job left it: migration 1 and no other. */
function versionOne(file: string): Database {
  const db = new DatabaseSync(file);
  opened.push(db);
  migrate(db, migrations.slice(0, 1));
  return db;
}
```

The hash is of `migrations[0]` on `main`, computed with
`createHash('sha256').update(migrations[0]).digest('hex')` (checked; the string has 2233
characters). 003 said that no test can see an edited migration from inside one checkout;
this one can, and it is what proves "the text of migration 1 is unchanged" (AC2).
`node:sqlite` is imported in a test under `src/db/`, as `src/db/database.test.ts` does.

**D8. Existing tests that change, and how.** No assertion is loosened. Each change is
the one AC1 or AC10 forces.

| File | Change |
|---|---|
| `src/db/settings.test.ts` | In "opening the database again does not overwrite a value that was changed", the last assertion becomes `expect(second.prepare('SELECT key FROM settings ORDER BY key').all()).toEqual([{ key: 'slot_rules' }, { key: 'working_hours' }])`. The import gains `type SlotRule`. The AC1 tests are added in a new `describe` at the end (`plan.md`). |
| `src/db/schema.test.ts` | The test "holds the working hours, 09:00 to 22:00, and nothing else when it is created" is renamed "holds the slot rules and the working hours, 09:00 to 22:00, and nothing else when it is created". Its query becomes `'SELECT key, value FROM settings ORDER BY key'`, the keys `['slot_rules', 'working_hours']`, and the hours are read from `rows[1]`. |
| `src/db/database.test.ts` | In "keeps the rows of an earlier open, and a later open adds none", `expect(count(second, 'settings')).toBe(1)` becomes `.toBe(2)`. Nothing else. This is the file AC11 does not name. |
| `src/add-analysis.test.ts` | `'time_slot',` is removed from `UNSET_COLUMNS`. Nothing else. |
| `src/add-text.test.ts` | `'time_slot',` is removed from `UNSET_COLUMNS`. Nothing else. |

The two `ORDER BY key` are needed. Checked: on a new database `SELECT key FROM settings`
returns `slot_rules` first (SQLite reads the key's index) and
`SELECT key, value FROM settings` returns `working_hours` first (it reads the table).

Checked in the prototype: with the code changed and no test edited, six tests failed,
in these five files and no other: the three tests named above, and "leaves every other
column of a draft unset" once in `src/add-analysis.test.ts` and twice in
`src/add-text.test.ts`. With the edits above, all 1235 passed. The other 30 test files
ran unedited.

**D9. The tests of AC10 are a new file, `src/add-rules.test.ts`.** It posts through the
three routes and the retry with a stub analyzer and reads the stored rows and the review
page. Rejected: adding them to `src/add-analysis.test.ts` and `src/add-text.test.ts`,
which would say the same thing three times in two files.

## Files

Created:

- `src/services/rules.ts` (D3, D4): `RuleResult`,
  `readSlotRules(db: Database): SlotRule[]`,
  `applyRules(rules: readonly SlotRule[], category: TaskCategory, urgency: Priority): RuleResult`.
- Tests: `src/services/rules.test.ts`, `src/db/migrations.test.ts`,
  `src/add-rules.test.ts`: see `plan.md`.

Changed:

- `src/db/migrations.ts`: the four lines of D1, appended inside the array.
- `src/db/settings.ts`: the import of `Slot`, `SlotRule`, and the key `slot_rules` with
  its comment (D2).
- `src/services/drafts.ts`: the import, the sentence in the doc comment of
  `analyzeSource`, and the transaction of D5.
- `src/db/settings.test.ts`, `src/db/schema.test.ts`, `src/db/database.test.ts`,
  `src/add-analysis.test.ts`, `src/add-text.test.ts`: the table in D8.

Not touched: `package.json` and `yarn.lock` (no package is added); lines 1 to 73 of
`src/db/migrations.ts` (the header comment and migration 1) and `migrate` below the
array; `src/db/database.ts`, `src/db/tasks.ts`, `src/db/sources.ts`,
`src/db/transaction.ts`, `src/db/timestamps.ts`; `src/services/analyzer.ts` (the
categories and the urgency are read from it, nothing is added); `src/routes/add.ts`,
`src/routes/review.ts`, `src/views/pages/review.ejs`, `public/js/review.js` (D6);
`src/app.ts`, `src/server.ts`, `src/config.ts`, `.env.example`, `vitest.config.ts`;
`src/ui.ts`; `src/testing/app.ts` (the default stub's one task is `shopping` and now gets
the slot `night`; no test reads it); `src/review-page.test.ts`,
`src/review-actions.test.ts` (they write their drafts straight into the database, so no
rule runs) and every other existing test file; `src/services/.gitkeep`; `tsconfig.json`,
`.gitignore`, `CLAUDE.md`, `README.md`; `docs/` unless the builder logs an error;
everything under `factory/` except this job's `build.md`; and `data/`, the developer's
own database included.

## Risks

- **Migration 1 is edited, or the rules are seeded inside it.** D7: the hash test in
  `src/db/migrations.test.ts` fails. Seeded inside migration 1 with no migration 2, the
  tests "there are two migrations" and "a database with migration 1 only has no slot
  rules" fail as well.
- **A database of before this job does not get the rules, or loses what it had.** The
  version 1 test of AC2 builds such a file with changed hours and a task, opens it and
  reads all three.
- **The rules are seeded on every open and overwrite a changed value.** The two reopen
  tests of AC2 fail, and so does the 003 test "changes nothing in the file when it is
  opened again" in `src/db/database.test.ts`.
- **The seeded value differs from AC1 by one field, or its two rules are in the other
  order.** `toStrictEqual` on the whole list in `src/db/settings.test.ts`, and the
  stored text compared with `JSON.stringify`.
- **The rules are written into the service and the setting is ignored.** Nine AC9 tests
  fail: the changed setting, the four slots, the empty list, the missing row and the two
  for the first of two rules.
- **The service falls back to default rules when the row is missing.** The AC9 test
  that deletes the row expects no slot for all 24 inputs.
- **An urgent task is held back for its category's slot.** The AC7 tests for `coding`
  and `shopping`, and the one that gives every category a rule.
- **The last of two rules for a category wins.** Two AC9 tests, one with a rule of
  another category first.
- **A rule changes a priority.** The AC4 test runs all 24 inputs.
- **The function reads the clock.** The AC3 test compares all 24 results at two times of
  the faked clock, one before and one after noon, and holds `fetch` to no call.
- **The drafts are stored without the rules, or the rules run again on confirm.** The
  AC10 tests read the stored rows for all three routes and the retry; the confirm test
  posts a slot and a priority that differ from what the rules gave.
- **No test can tell whether a draft's priority comes from the rules or straight from
  the urgency.** The priority rule is the identity (AC4). D5 writes `ruled.priority`; a
  reviewer reads that line. The first rule that changes a priority brings the test with
  it.
- **A stored rule names a slot or a category that does not exist.** Out of scope by the
  spec. For the seeded value one test in `src/services/rules.test.ts` holds every
  category to `taskCategories` and every slot to `src/ui.ts`, so dropping `night` from
  `src/ui.ts` fails it.
- **`src/services/rules.ts` passes in Vitest and plain Node cannot load it.** The 001
  test in `src/project.test.ts` loads the app in plain Node, and the app imports the
  drafts service, which imports this file.
- **The developer's `data/app.db` is migrated to version 2 while this branch is checked
  out.** `main` then refuses it: `The database is at schema version 2, but this code
  knows only 1.` No test opens it (003 D5). Nothing by hand in `plan.md` starts the
  server on it: every start sets `DATABASE_PATH=:memory:`, and the one check that reads
  the file works on a copy outside the repo. After the merge the next `yarn dev` migrates
  it, as AC2 means it to.
- **Test files run in a loop run out of ports**
  (`docs/errors/repeated-test-runs-run-out-of-ports.md`). `src/add-rules.test.ts` uses
  supertest. The plan runs each check once; a failure whose message holds
  `EADDRNOTAVAIL` says nothing about the code.
- **Nothing here ran on Node 22 or 24.** The service uses `Array.prototype.find`,
  optional chaining and `??`; the migration is one `INSERT`.
