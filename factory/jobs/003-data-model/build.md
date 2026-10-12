# 003-data-model: build

Branch `factory/003-data-model`, commit `d1d4b19`. Built on Node 25.4.0 (bundled SQLite
through `node:sqlite`), yarn 1.22.22, with the versions already in `package.json`
(Vitest 5.0.1, TypeScript 5.9.3, `@types/node` 26.6.5). No dependency was added or
changed. The suite was also run once on Node 22.21.0 (see Test run).

## What changed

Changed:

| File | Why |
|---|---|
| `src/config.ts` | Adds `getDatabasePath(env = process.env)` (D4): `<rootDir>/data/app.db` when `DATABASE_PATH` is unset or blank, `:memory:` as it is, anything else resolved against `rootDir`. Nothing else in the file changed. |
| `.env.example` | A comment line and `DATABASE_PATH=data/app.db`. |
| `.gitignore` | The line `/data/`, anchored to the repo root (D4). |
| `vitest.config.ts` | `env: { DATABASE_PATH: ':memory:' }` under `test`, so the configured database is in memory in every test run (D5). |

Created:

| File | Why |
|---|---|
| `src/db/database.ts` | The type `Database` and `openDatabase(file)`: refuses a path that is neither absolute nor `:memory:`, creates the parent folder, opens the file, runs `PRAGMA foreign_keys = ON`, migrates, and closes the handle when that fails (D4, D6, D9). Its header comment carries the D2 rules: which driver calls may be used, and positional parameters only. |
| `src/db/migrations.ts` | `migrations` with migration 1 exactly as in D7 (the `<utc>` check written out as `GLOB '????-??-??T??:??:??.???Z'`), and `migrate(db, list = migrations)` numbered by `PRAGMA user_version`, one transaction per migration (D6). The comment states that a merged migration is never edited. |
| `src/db/timestamps.ts` | `nowTimestamp()` and `isTimestamp(value)` (D10). |
| `src/db/tasks.ts` | `taskStatuses`, `TaskStatus`, `Task`, `TaskFields`, `NewTask`, `TaskChanges`, and `createTask`, `getTask`, `listTasks`, `updateTask`, `deleteTask` (D11, D12). The 18 field names live in one constant object typed over `keyof TaskFields`, so the compiler rejects a missing or a misspelled name; SQL column names come from it and never from the input's keys (D2). |
| `src/db/sources.ts` | `sourceKinds`, `SourceKind`, `Source`, `NewSource`, and `createSource`, `getSource`, `listSourceTasks` (D11, D12, D13). |
| `src/db/settings.ts` | `Settings`, `SettingKey`, `getSetting`, `setSetting` (D14). |
| `src/config.database.test.ts`, `src/db/database.test.ts`, `src/db/schema.test.ts`, `src/db/timestamps.test.ts`, `src/db/tasks.test.ts`, `src/db/sources.test.ts`, `src/db/settings.test.ts` | The tests of `plan.md`, listed in the table below. |
| `src/db/foreign-keys.test.ts` | Not in the design's file list. See Not done, point 1. |

Not touched, checked with the `git diff --stat main -- ...` command of plan step 8, which
printed nothing: the nine test files that existed, `src/app.ts`, `src/server.ts`,
`src/ui.ts`, `package.json`, `yarn.lock`, `tsconfig.json`. Also unchanged: `CLAUDE.md`
(the language and the commands are the same), `src/db/.gitkeep`, and `docs/errors/`
(no error needed a fix, so there is no new entry).

## Acceptance criteria

Each row was also checked the other way: one change that breaks the behaviour was made
in the working tree, the whole suite was run, and the change was undone. 16 changes were
tried, one at a time. 15 made at least one test fail. One did not at first (the
`PRAGMA foreign_keys = ON` line removed); it does now, see Not done, point 1. The "Fails
when" column names the change that belongs to the row; a row without one was not tried.

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1: opening creates the schema when it is missing | `src/db/database.test.ts` > openDatabase (AC1) > creates the folders, the file and the schema when they are missing; > creates the schema in a file that exists and is empty; > opens a database in memory with the schema | the `mkdirSync` line removed | PASS |
| AC1: opening it again changes nothing | same > changes nothing in the file when it is opened again (the bytes are equal and the folder holds one file); > keeps the rows of an earlier open, and a later open adds none | | PASS |
| AC1: the schema is brought up to date in steps | `src/db/database.test.ts` > migrate (AC1) > applies every migration of a new database, in order, and counts them; > runs nothing when the database is up to date; > runs only the migrations the database does not have yet; > undoes a migration that fails, and leaves no transaction open; > throws when the database has more migrations than the list; openDatabase (AC1) > refuses a file written by newer code and leaves it as it is | the `ROLLBACK` removed; the version check removed | PASS |
| AC1: the path comes from `DATABASE_PATH`, `data/app.db` when not set | `src/config.database.test.ts` > getDatabasePath (AC1) > is data/app.db under the repo root when DATABASE_PATH is not set / is empty / is blank; > starts a relative value at the repo root, not at the working folder; > returns an absolute value unchanged; > returns :memory: unchanged | the default changed to `db/app.db` | PASS |
| AC1: `.env.example` lists `DATABASE_PATH` | `src/config.database.test.ts` > environment files (AC1) > .env.example lists DATABASE_PATH, and its value names the default file; and the unedited 001 test `src/project.test.ts` > .env.example lists every environment variable the app reads | | PASS |
| AC1: the data folder is git-ignored | `src/config.database.test.ts` > environment files (AC1) > the folder of the default file is the one .gitignore ignores; by hand: `git check-ignore data/app.db` prints `data/app.db` | | PASS |
| AC2: the 21 columns | `src/db/schema.test.ts` > the tasks table (AC2) > has the columns of the plan, then confidence and the two timestamps | | PASS |
| AC2: rejects a `status` other than the four | same > names the four statuses in taskStatuses; > accepts the status draft / pending / in_progress / done; > rejects the status "nope" / "Draft" / ""; > rejects a task with no status at all; > gives a task the status draft when the insert leaves it out. `src/db/tasks.test.ts` > values the table does not allow (AC2) > createTask / updateTask throws for a status that is not allowed | | PASS |
| AC2: rejects a `priority` other than the four ids in `src/ui.ts` | `src/db/schema.test.ts` > the tasks table (AC2) > has priorities to check against; > accepts the priority "..." exactly when src/ui.ts has it (7 values); > accepts a task with no priority and no time slot yet. `src/db/tasks.test.ts` > values the table does not allow (AC2) > createTask / updateTask throws for a priority that is not allowed | | PASS |
| AC2: rejects a `time_slot` other than the four slot ids | `src/db/schema.test.ts` > the tasks table (AC2) > accepts the time slot "..." exactly when src/ui.ts has it (7 values). `src/db/tasks.test.ts` > values the table does not allow (AC2) > createTask / updateTask throws for a time slot that is not allowed | | PASS |
| AC2: column types and `confidence` (D7, D15) | `src/db/schema.test.ts` > the tasks table (AC2) > rejects text / a number that is not whole in estimated_minutes; > stores a whole number in estimated_minutes as an integer; > stores the confidence 0 / 0.5 / 1; > rejects the confidence 1.5 / -0.1 / 85; > accepts a task with no confidence; > rejects a task with no title | | PASS |
| AC3: a `sources` table with kind, image path or transcript, created | `src/db/schema.test.ts` > the sources table (AC3) > all 12 tests (columns, `sourceKinds`, each kind accepted with its content, `video` / `Photo` / `""` rejected, a photo without an image path, a voice and a text source without a transcript, no `created_at`). `src/db/sources.test.ts` > a source the table does not allow (AC3) > createSource throws for ... and stores nothing (8 inputs) | | PASS |
| AC3: a task cannot point at a source or a parent that does not exist | `src/db/schema.test.ts` > foreign keys (AC3) > are enforced on every connection; > reject a task whose source does not exist; > reject a task whose parent task does not exist (each on a memory database, a new file and a second open of a file); > accept a task whose source and parent task exist; > keep a source that a task points at from being deleted; > let a source with no tasks be deleted. `src/db/tasks.test.ts` > a task and what it points at (AC3) > all 6 tests. `src/db/foreign-keys.test.ts` > all 3 tests | `PRAGMA foreign_keys = ON` removed (fails `foreign-keys.test.ts` only) | PASS |
| AC4: create and get; a new task is a `draft` unless another status is given | `src/db/tasks.test.ts` > createTask and getTask (AC4) > stores a draft with only a title, and returns it as a plain object; > uses the status it is given; > stores every field it is given; > throws without a title and stores nothing; > getTask returns undefined for an id that does not exist | the row returned without the copy (`{ ...row }`) | PASS |
| AC4: list returns every task, or only those with a status | same > listTasks (AC4) > is empty when there are no tasks; > returns every task in id order; > returns only the tasks with the status ... (4); > is empty when no task has the status ... (4) | the status filter ignored | PASS |
| AC4: update changes only the fields given and sets `updated_at` | same > updateTask (AC4) > changes only the fields it is given, and sets updated_at; > leaves a field given as undefined alone, and clears a field given as null; > with no fields changes updated_at and nothing else; > returns undefined for an id that does not exist, and changes no task | `updated_at` left out of the `UPDATE` | PASS |
| AC4: delete, and "nothing found" for get and delete | same > deleteTask (AC4) > returns false for an id that does not exist, and deletes nothing; > deletes the task and returns true, once; > never gives the id of a deleted task to a new one | `deleteTask` made to return `true` always | PASS |
| AC4: an unknown field is refused (D12) | same > fields that are not task fields (AC4, AC7) > createTask / updateTask throws for ..., names the key and stores / changes nothing (7 inputs each) | the unknown-key check removed | PASS |
| AC5: create a source, get one by id | `src/db/sources.test.ts` > createSource and getSource (AC5) > stores a photo with its image path, and returns it as a plain object; > stores a voice / text source with its transcript; > getSource returns the source that was created; > getSource returns undefined for an id that does not exist | | PASS |
| AC5: list the tasks that belong to a source | same > listSourceTasks (AC5) > returns the tasks of the source it is given, in id order; > is empty for a source with no tasks and for an id that is no source; > listTasks combines the source with a status | | PASS |
| AC6: a `settings` table, get one and set one | `src/db/schema.test.ts` > the settings table (AC6) > stores a value under a key, and the key is the primary key; > rejects a value that is not JSON. `src/db/settings.test.ts` > setSetting replaces the value under its key; > setSetting stores a key that is not there yet; > getSetting returns undefined for a key that does not exist | `ON CONFLICT ... DO UPDATE` removed | PASS |
| AC6: working hours seeded as 09:00 to 22:00 | `src/db/schema.test.ts` > the settings table (AC6) > holds the working hours, 09:00 to 22:00, and nothing else when it is created. `src/db/settings.test.ts` > a new database has the working hours 09:00 to 22:00 | the seed `INSERT` removed | PASS |
| AC6: a later open does not overwrite a changed value | `src/db/settings.test.ts` > opening the database again does not overwrite a value that was changed | | PASS |
| AC7: timestamps are UTC ISO 8601 strings | `src/db/timestamps.test.ts` > all 13 tests. `src/db/schema.test.ts` > timestamp columns (AC7) > `<column>` of a task takes a UTC ISO string and rejects SQLite's own datetime('now') (7 columns); > created_at of a source rejects SQLite's own datetime('now'). `src/db/tasks.test.ts` > the timestamp a caller sets in `<field>` (AC7) > updateTask stores a UTC ISO string exactly as it is given; > updateTask clears it with null; > updateTask / createTask throws a RangeError for ... (7 wrong values each), for each of the 5 fields | the check in the helpers removed; `isTimestamp` reduced to "parses as a date" | PASS |
| AC7: the helpers set `created_at` and `updated_at`; a caller cannot leave them unset | `src/db/tasks.test.ts` > the timestamps the helpers set (AC7) > createTask sets created_at and updated_at to the clock, as UTC ISO text; > updateTask moves updated_at to the clock and leaves created_at; fields that are not task fields (AC4, AC7) > the rows for `id`, `created_at` and `updated_at`. `src/db/sources.test.ts` > the timestamp of a source (AC7) > all 3 tests. `src/db/schema.test.ts` > timestamp columns (AC7) > reject a task inserted without created_at / updated_at; > reject an update that empties created_at / updated_at | | PASS |
| AC8: `yarn build` passes | the command, output below | | PASS |
| AC8: the tests that existed still pass | `yarn test`: the 9 files and 291 tests from before the job are among the 17 files and 555 tests; run on their own they report 9 files, 291 passed | | PASS |
| AC8: the new tests use a temporary database and never touch `data/app.db` | `src/config.database.test.ts` > the configured database under the test runner (AC8) > is in memory, never data/app.db. `src/db/database.test.ts` > openDatabase refuses a path that depends on the working folder (AC1, AC8) > throws for a relative path and creates no file; > throws for an empty path. After the run: `git status --short` is clean, there is no `data/` folder and no `*.db` file in the repo | the `env` line removed from `vitest.config.ts`; the path check removed from `openDatabase` | PASS |
| AC8: plain Node can load the modules and exit with an open database | `src/db/database.test.ts` > the database modules in plain Node (AC8) > plain Node can load them, use a database and exit | | PASS |

## Test run

`yarn build`:

```
yarn run v1.22.22
$ tsc --noEmit
Done in 1.22s.
```

`yarn test` (Node 25.4.0), the end of the output:

```
(node:16835) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:16841) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  17 passed (17)
      Tests  555 passed (555)
   Start at  15:52:28
   Duration  1.67s (import 45%, tests 30%, transform 23%, worker 1%)

Done in 2.40s.
```

The warning lines are the ones D1 accepts: one per test worker that loads `node:sqlite`.

The new files on their own: `src/config.database.test.ts` 9, `src/db/database.test.ts`
14, `src/db/foreign-keys.test.ts` 3, `src/db/schema.test.ts` 71, `src/db/settings.test.ts`
5, `src/db/sources.test.ts` 19, `src/db/tasks.test.ts` 130, `src/db/timestamps.test.ts`
13. That is 264, and 291 + 264 = 555.

The same suite on Node 22.21.0, run as
`/usr/local/n/versions/node/22.21.0/bin/node node_modules/vitest/vitest.mjs run`:

```
 Test Files  17 passed (17)
      Tests  555 passed (555)
   Start at  15:51:46
   Duration  8.17s (import 87%, tests 9%, transform 4%, worker 1%)
```

Plan step 8:

- `git diff --stat main -- <the nine test files> src/app.ts src/server.ts src/ui.ts package.json yarn.lock tsconfig.json`
  printed nothing.
- `git status --short` after the test run showed only this job's files; there is no
  `data/` folder, and `find` lists no `*.db`, `*.db-journal` or `*.sqlite` file outside
  `node_modules`.
- `grep -rln "node:sqlite" src --include='*.ts'` lists `src/db/database.ts`,
  `src/db/tasks.ts`, `src/db/sources.ts`, `src/db/database.test.ts`,
  `src/db/schema.test.ts` and `src/db/foreign-keys.test.ts`: files under `src/db/` only.
  `tasks.ts` and `sources.ts` import types from the driver (`SQLInputValue`,
  `SQLOutputValue`), no value.

Verification loop:

```
VERIFICATION
Build: PASS
Tests: PASS   (555 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

Lint is skipped because Project facts lists no lint command. Diff: `git diff main...HEAD`
holds this job's files only (the spec, design and plan, one line of `factory/backlog.md`
from the spec commit, and the files in What changed); no debug output, `.only`, `.skip`,
TODO, secret or machine path in them.

## Not done

Nothing in the spec was skipped. What differs from the design or plan, and what was
checked by hand:

1. **One test file more than the design lists: `src/db/foreign-keys.test.ts`.** D9 says
   `openDatabase` turns foreign keys on itself and "does not rely on the driver's
   default". With that line removed, all 552 tests of the planned files still passed,
   because `node:sqlite` turns foreign keys on by default. The new file replaces the
   driver, for that file only (`vi.mock('node:sqlite')`), with one that opens every
   database with foreign keys off, and then checks that `PRAGMA foreign_keys` is 1 and
   that a task with a missing source or parent is rejected. It fails when the line is
   removed. The mock passes the constructor option `enableForeignKeyConstraints`, which
   is outside the D2 list of driver calls; it is used in this test only, never in
   `src/db/` code.
2. **An unknown key throws even when its value is `undefined`.** D12 says an unknown key
   throws and that a field given as `undefined` counts as not given. I read "a field" as
   one of the 18: `{ titel: undefined }` throws `Unknown task field "titel"`, and
   `{ description: undefined }` is left alone. Both are tested.
3. **`migrate` keeps the migration's error when the `ROLLBACK` itself fails.** D6 says
   "on any error `ROLLBACK` and rethrow". SQLite ends the transaction by itself after
   some errors, and a `ROLLBACK` with no transaction open throws; that second error
   would replace the real one. The `ROLLBACK` is therefore in a `try` whose `catch` is
   empty, with a comment. D2 rules out `isTransaction`, which would be the other way.
4. **"`openDatabase` closes the handle when `migrate` fails" has no test of the close
   itself.** The test for a file written by newer code checks that the call throws and
   that the file's bytes are unchanged. A handle that stayed open cannot be seen from
   outside without a driver call D2 excludes.
5. **By hand, done:** `git check-ignore data/app.db` prints `data/app.db`.
   `git check-ignore src/data/x.db` prints nothing, so a later `src/data/` is not ignored.
6. **By hand, done:** the suite on a second Node version, 22.21.0 (output above). It was
   run with that Node binary and Vitest's entry file, not through `yarn test`, so the
   machine's default Node was not switched. Node 24 is not installed here and was not
   run.
7. **No error-log entry.** The error log was read before the child-process test was
   written, and its two entries were followed (a `timeout` on `spawnSync`, the exit code
   asserted and stderr not). No error in this build needed a fix.
