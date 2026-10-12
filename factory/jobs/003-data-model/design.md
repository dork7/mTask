# 003-data-model: design

No spec problems. Five points in the spec can be read two ways. Each is settled under
Decisions so the builder and a reviewer work from the same reading:

- AC1: this job adds the function that opens the database and the function that gives
  its path. Nothing in the app calls them yet, because no route or service reads data
  (Out of scope). The first job that stores something opens it at start-up (D3).
- AC2, "rejects a `priority` other than the four ids": a task may also have no priority
  and no time slot yet. `NULL` is allowed for both; any other value is rejected (D8).
- AC4: the spec says what get and delete do for an id that does not exist, and is
  silent on update. Update reports it the same way as get (D12).
- AC7, "timestamps": the two the helpers set, plus the five a caller sets on a task
  (`scheduled_start`, `scheduled_end`, `started_at`, `completed_at`, `reminder_at`) and
  `created_at` on a source. All eight have one stored format (D10).
- AC8, "never touch `data/app.db`": a test cannot prove this by watching the file (a
  developer may have one, and a running dev server may write to it). It is made true by
  construction instead, and the construction is tested (D5).

Everything marked "checked" below was run in a throwaway copy outside the repo with the
repo's own `node_modules`, `tsconfig.json` and Vitest config (Node 25.4.0, its bundled
SQLite 3.51.1, Vitest 5.0.1, TypeScript 5.9.3, `@types/node` 26.6.5). The whole design
was built there once as a prototype: `yarn build` was clean and the existing 291 tests
still passed beside the prototype's own.

## Approach

The database is one SQLite file, opened through Node's built-in `node:sqlite` module.
No dependency is added. All database code lives in `src/db/`, and it is the only folder
that imports the driver.

`openDatabase(file)` creates the folder of the file when it is missing, opens the file,
turns foreign keys on and brings the schema up to date. The schema is a list of
migrations: SQL strings applied in order, each in its own transaction, with the number
applied so far kept in the file itself (`PRAGMA user_version`). Migration 1 is this
job: the three tables and the working-hours row. A database that is already up to date
runs no migration, so opening it again writes nothing (checked: the file is the same
byte for byte).

The helpers are plain functions that take the open database as their first argument:
`createTask(db, input)`, `getSetting(db, key)` and so on. There is no shared
connection and no class. A test opens its own database, in memory or in a temporary
folder, and hands it to the helper it tests.

The rules the spec puts on the data are enforced by the tables, not by the helpers:
the allowed values of `status`, `priority`, `time_slot` and `kind`, the two foreign
keys, the columns that may not be empty, and the shape of a stored timestamp. A helper
passes the SQLite error on. The helpers add only what a table cannot do: they set
`created_at` and `updated_at` from the clock, refuse a field they do not know, and check
that a timestamp a caller gives is a real UTC instant in the one stored format.

The path of the file is read in `src/config.ts`, the only file that reads the
environment. Under the test runner `DATABASE_PATH` is always `:memory:`, set in
`vitest.config.ts`, so no test can reach `data/app.db` through the configured path.

## Decisions

**D1. The driver is Node's built-in `node:sqlite`, not `better-sqlite3`.** Both were
installed and run here.

| | `node:sqlite` | `better-sqlite3` 13.0.3 |
|---|---|---|
| New packages | none; the types are in `@types/node` already | `better-sqlite3`, `node-addon-api`, and `@types/better-sqlite3` 9.6.0 for the types |
| Install | nothing | 26 MB; ships a native binary for 8 platforms; yarn 1 ran node-gyp on install even though the shipped binary was used (it left a `build/` folder with a Makefile), and node-gyp needs Python and make |
| Status | experimental: "active development" in the Node 22 docs, "release candidate" from 24.15 and 25.7, still that in 26.11. On this machine (25.4.0) every process that loads it prints one `ExperimentalWarning` line to stderr | stable for years; the driver the plan names |
| Works here | yes: plain Node, Vitest and `tsc` (checked) | yes: plain Node, Vitest and `tsc` (checked) |

Reasons for the built-in: the repo has twice chosen what the runtime already does over
a dependency (001 D3, type stripping over `tsx`; 001 D5, `process.loadEnvFile` over
`dotenv`), and this choice has the same shape. It needs no native binary and no build
tool on the machine that installs the app. And the choice is cheap to undo: the driver
is used in `src/db/` only (D2), and the file on disk is an ordinary SQLite database
whichever driver wrote it.

What is given up, and accepted: the warning line on stderr (in `yarn test` once per
test worker that loads the module, and in `yarn dev` once the app opens the database);
the "experimental" label on the supported range; and two conveniences `better-sqlite3`
has, a transaction helper and an error on a missing named parameter.

Rejected: `better-sqlite3`. It is the fallback. If a Node release changes the calls in
D2, or the warning has to go, switch to it; only `src/db/` changes.

Do not silence the warning (`--disable-warning`, a `warning` listener). The `dev` script
is fixed by a 001 test, and hiding experimental warnings would hide the next one too.

**D2. The driver stays inside `src/db/`, and only a small, old part of it is used.**
No file outside `src/db/` imports `node:sqlite`. Other code imports the type `Database`
from `src/db/database.ts` and calls the helpers.

Use only: `new DatabaseSync(path)`, `db.exec`, `db.prepare`, `db.close`, `db.isOpen`,
and on a statement `run`, `get` and `all`. All of these are in Node 22.18, the oldest
version `package.json` allows. `@types/node` 26 also offers newer calls
(`createTagStore`, `isTransaction` and others); `tsc` will not stop them, so this list
is the rule.

Parameters are positional (`?`), never named. Checked: with a named parameter left out
of the object, `node:sqlite` binds `NULL` and says nothing, which would write `NULL`
over a column default. Also checked: `undefined` cannot be bound (it throws a
`TypeError`), so a helper never passes it.

Column names in SQL built at run time come from a constant list in the source, never
from the keys of an input object.

**D3. A helper takes the database as its first argument. This job does not open the
database in the app.** `createTask(db, input)`, not a module-level connection and not a
class. A test then needs no mocking to use its own database, and 001 D11 already
planned for `createApp` to be handed one.

`src/server.ts` and `src/app.ts` are not changed. Nothing reads data yet, and
`src/server.test.ts` imports the real `server.ts`, so opening the database there would
change an existing test's behaviour for no gain. The contract for the first job that
stores something (004): open the database once in `server.ts` with
`openDatabase(getDatabasePath())`, before listening, and pass the handle down. Never
open it inside a request and never import a shared connection.

Rejected: a singleton `getDb()` that reads the configuration on first use. Every test
would have to reset it, and one forgotten reset opens the real file.

**D4. The path.** `getDatabasePath(env = process.env)` in `src/config.ts`:

- `DATABASE_PATH` unset or blank: `<rootDir>/data/app.db`.
- `:memory:`: returned as it is. SQLite's name for a database that lives in memory.
- anything else: resolved against `rootDir`, so `data/app.db` in `.env` means the
  project folder whatever the working folder is (001 D13). An absolute path stays.

`openDatabase(file)` takes the path as a required argument and does not read the
configuration itself. It accepts an absolute path or `:memory:` and throws on anything
else, before it creates a file: a relative path would land in whatever folder the
process was started from. For a file path it creates the parent folder
(`mkdirSync(..., { recursive: true })`); checked: SQLite fails with "unable to open
database file" when the folder is missing.

The `data` folder is not committed and gets no `.gitkeep`. `.gitignore` gets the line
`/data/`: anchored, so it ignores the folder at the repo root (the database and the
journal file SQLite puts beside it while writing) and not a `src/data/` a later job
might add (checked with `git check-ignore`). Rejected: a bare `data` line like the
existing entries, which matches at any depth.

**D5. Under the test runner the configured database is always in memory.**
`vitest.config.ts` gets `env: { DATABASE_PATH: ':memory:' }` under `test`. Checked: it
wins over a `DATABASE_PATH` set in the shell that starts `yarn test`. So
`getDatabasePath()` cannot return `data/app.db` in a test, now or when a later job
opens the database in `server.ts`. A test asserts it, and fails if the line is removed.

The new tests never call `getDatabasePath()` to find a database to open. Helper tests
open `:memory:`. Tests that need a file (creating it, opening it twice) use a folder
from `mkdtempSync` under the system temp folder and remove it afterwards, as
`src/config.test.ts` does.

Rejected: a test that compares `data/app.db` before and after the run. It fails when a
dev server is writing to the file at the same time, and passes when a test wrote to it
and nobody looked.

**D6. Migrations are numbered by `PRAGMA user_version`.** `src/db/migrations.ts` exports
`migrations`, an ordered list of SQL strings, and `migrate(db, list = migrations)`:

1. Read `user_version`. It is the count of migrations already applied; a new file has 0.
2. If it is greater than `list.length`, throw. The file was written by newer code (a
   later factory branch, for example) and this code does not know its schema.
3. For each migration not yet applied, in order: `BEGIN`, run it, set `user_version` to
   its number, `COMMIT`. On any error `ROLLBACK` and rethrow. Checked: `user_version` is
   rolled back with the rest, and a failed `exec` leaves the transaction open, so the
   `ROLLBACK` is needed.
4. With nothing to apply, no statement is run after the read in step 1.

A migration that has been merged is never edited. A later job that changes the schema
appends one. This is why migration 1 writes the allowed values as literals and does not
build them from `src/ui.ts`: a database created next month must get the same table as
one created today. A test ties the two together instead (see Risks).

Seeding is part of migration 1, so it happens exactly when the database is first
created and never again (AC6).

`openDatabase` closes the handle and rethrows when `migrate` fails.

Rejected: `CREATE TABLE IF NOT EXISTS` on every open. It cannot change a table that
exists, and a later job will have to: a new column or a new allowed value needs a step
that runs once. Rejected: a migrations table with names and dates; one counter is
enough for a list that only grows at the end.

**D7. The schema.** Migration 1, exactly. `<utc>` stands for
`GLOB '????-??-??T??:??:??.???Z'` (D10).

```sql
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  image_path TEXT,
  transcript TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT sources_kind CHECK (kind IN ('photo', 'voice', 'text')),
  CONSTRAINT sources_content CHECK (
    (kind = 'photo' AND image_path IS NOT NULL) OR (kind <> 'photo' AND transcript IS NOT NULL)
  ),
  CONSTRAINT sources_created_at CHECK (created_at <utc>)
) STRICT;

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  image_path TEXT,
  category TEXT,
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  priority TEXT,
  time_slot TEXT,
  scheduled_start TEXT,
  scheduled_end TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  started_at TEXT,
  completed_at TEXT,
  reminder_at TEXT,
  recurrence_rule TEXT,
  parent_task_id INTEGER REFERENCES tasks (id) ON DELETE SET NULL,
  source_id INTEGER REFERENCES sources (id) ON DELETE RESTRICT,
  confidence REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT tasks_status CHECK (status IN ('draft', 'pending', 'in_progress', 'done')),
  CONSTRAINT tasks_priority CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  CONSTRAINT tasks_time_slot CHECK (time_slot IN ('morning', 'afternoon', 'evening', 'night')),
  CONSTRAINT tasks_confidence CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT tasks_scheduled_start CHECK (scheduled_start <utc>),
  CONSTRAINT tasks_scheduled_end CHECK (scheduled_end <utc>),
  CONSTRAINT tasks_started_at CHECK (started_at <utc>),
  CONSTRAINT tasks_completed_at CHECK (completed_at <utc>),
  CONSTRAINT tasks_reminder_at CHECK (reminder_at <utc>),
  CONSTRAINT tasks_created_at CHECK (created_at <utc>),
  CONSTRAINT tasks_updated_at CHECK (updated_at <utc>)
) STRICT;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  CONSTRAINT settings_value CHECK (json_valid(value))
) STRICT;

INSERT INTO settings (key, value) VALUES ('working_hours', '{"start":"09:00","end":"22:00"}');
```

- **Every constraint has a name.** SQLite puts it in the error:
  `CHECK constraint failed: tasks_status` (checked). Tests match on the name.
- **`STRICT`.** Without it SQLite stores the text `thirty` in an `INTEGER` column. With
  it the insert fails: `cannot store TEXT value in INTEGER column
  tasks.estimated_minutes` (checked). A number that is whole (`30`) is accepted, `30.5`
  is not.
- **`AUTOINCREMENT`.** The id of a deleted row is never given to a new row (checked).
  Without it SQLite reuses the highest id after it is deleted, and a stale page or an
  undo that still names the old id would act on a different task.
- **`title` is `NOT NULL` and nothing more.** Whether a blank title is allowed is a
  rule for the forms that take one (006, 010).
- **No index beyond the primary keys, and the default journal mode.** One user, a few
  thousand rows at most. WAL would add two files beside the database and gain nothing
  with one process. A job that measures a slow query adds an index with a migration.

**D8. `priority` and `time_slot` may be `NULL`; `status` may not.** A `CHECK` passes on
`NULL`, so both columns hold either one of the four ids or nothing. Nothing means "not
decided yet": the rules that decide them arrive in job 008, after the first drafts
(006). `status` is `NOT NULL DEFAULT 'draft'` (AC4).

Rejected: `NOT NULL DEFAULT 'medium'` for the priority and some default slot. A made-up
value cannot be told from one the rules, the model or the user chose. The cost: a view
must handle a task without a priority or slot, since the badge partials throw on an
unknown id.

**D9. What a delete does to rows that point at the deleted row.**

- `parent_task_id` is `ON DELETE SET NULL`. Deleting a task keeps the tasks made from
  it and clears their link. Rejected: `CASCADE`, which would delete next week's
  instance along with a finished one; the default, which would refuse to delete any
  task that has a child.
- `source_id` is `ON DELETE RESTRICT`. A source cannot be deleted while a task points
  at it. This job has no helper that deletes a source; job 023 removes only images
  with no tasks, which is the same rule. Rejected: `CASCADE`, which would delete
  confirmed tasks with their photo.

`SET NULL` is done by SQLite, so it does not change the child's `updated_at`.

Foreign keys are enforced per connection. `openDatabase` runs `PRAGMA foreign_keys = ON`
on every open and does not rely on the driver's default.

**D10. Timestamps.** One stored format for all eight columns: what
`Date.prototype.toISOString()` returns, `2026-01-31T09:00:00.000Z`. Always 24
characters, always milliseconds, always `Z`. Values in one format sort as text in time
order, which later jobs rely on (`ORDER BY scheduled_start`, "end has passed").

- `src/db/timestamps.ts` exports `nowTimestamp()` (`new Date().toISOString()`) and
  `isTimestamp(value)`: a string in exactly that shape that is a real instant
  (`new Date(value).toISOString() === value`, which rejects 30 February).
- The helpers set `created_at` and `updated_at` with `nowTimestamp()`. On create both
  get the same value, read from the clock once. Neither is a field a caller can pass
  (D12), and both columns are `NOT NULL` with no default, so SQL that leaves one out
  fails too.
- For the five timestamps a caller sets, the task helpers accept a string for which
  `isTimestamp` is true, or `null`, and throw a `RangeError` that names the field on
  anything else, before any SQL runs. A caller with a `Date` passes
  `date.toISOString()`. Rejected: accepting a `Date` or any parseable string and
  converting it. `new Date('2026-10-12 08:00')` is read in the server's local time
  zone, so the same input would store different instants on different machines.
- The `<utc>` check on each column is the backstop for SQL that does not go through the
  helpers. It tests the shape only. It is what stops `datetime('now')` or
  `CURRENT_TIMESTAMP`, which write `2026-10-12 11:00:00` (checked).
- Tests control the clock with `vi.useFakeTimers({ toFake: ['Date'] })` and
  `vi.setSystemTime(...)`, and call `vi.useRealTimers()` in `afterEach` (checked with
  Vitest 5.0.1). Rejected: a `now` parameter on every helper, which the app would never
  pass.

Times are stored in UTC. Showing them in Asia/Dubai is the job of the code that shows
them. The working hours in `settings` are not timestamps: they are times of day on the
user's clock (D14).

**D11. A row is a plain object with the column names as they are.** `task.estimated_minutes`,
not `task.estimatedMinutes`. The plan, the SQL and the analyzer's JSON (job 005) already
use these names, and a mapping layer is one more list to keep in step. `node:sqlite`
returns rows with no prototype (checked); the helpers return a copy (`{ ...row }`), so
`hasOwnProperty`, `toStrictEqual` and templates behave as with any object.

Types, all in `src/db/`:

- `taskStatuses = ['draft', 'pending', 'in_progress', 'done'] as const` and
  `TaskStatus`, in `tasks.ts`. `sourceKinds = ['photo', 'voice', 'text'] as const` and
  `SourceKind`, in `sources.ts`. Same pattern as `src/ui.ts`.
- `Task`: the 21 columns. `id: number`, `title: string`, `status: TaskStatus`,
  `created_at: string`, `updated_at: string`; `priority: Priority | null` and
  `time_slot: Slot | null` with the types imported from `src/ui.ts` (`import type`);
  `estimated_minutes`, `actual_minutes`, `parent_task_id`, `source_id` and `confidence`
  are `number | null`; every other column is `string | null`.
- `TaskFields = Omit<Task, 'id' | 'created_at' | 'updated_at'>`,
  `NewTask = Pick<TaskFields, 'title'> & Partial<TaskFields>`,
  `TaskChanges = Partial<TaskFields>`.
- `Source`: `id: number`, `kind: SourceKind`, `image_path: string | null`,
  `transcript: string | null`, `created_at: string`.
  `NewSource = { kind: 'photo'; image_path: string } | { kind: 'voice' | 'text'; transcript: string }`.

**D12. The helpers.**

`src/db/tasks.ts`:

| Function | Returns |
|---|---|
| `createTask(db, input: NewTask)` | the new `Task`, read back from the database |
| `getTask(db, id: number)` | the `Task`, or `undefined` when there is none |
| `listTasks(db, filter: { status?: TaskStatus; source_id?: number } = {})` | `Task[]` in `id` order; the filters given are combined with AND |
| `updateTask(db, id: number, changes: TaskChanges)` | the `Task` after the change, or `undefined` when there is none |
| `deleteTask(db, id: number)` | `true` when a row was deleted, `false` when there was none |

`src/db/sources.ts`: `createSource(db, input: NewSource): Source`,
`getSource(db, id): Source | undefined`, and `listSourceTasks(db, sourceId): Task[]`,
which is `listTasks(db, { source_id: sourceId })`. It returns `[]` for a source without
tasks and for an id that is no source.

Rules for create and update:

- "Nothing was found" is a return value (`undefined`, `false`), never an exception. A
  missing task is an ordinary outcome a route turns into a 404. Rejected: a
  `NotFoundError`.
- A key that is not one of the 18 fields of `TaskFields` throws
  `Error('Unknown task field "<key>"')` before any SQL runs. That covers `id`,
  `created_at` and `updated_at`, which TypeScript already keeps out. Rejected: ignoring
  unknown keys, which hides a misspelled field.
- A field whose value is `undefined` is treated as not given. `null` is a value: it
  clears the column.
- Create writes only the columns it is given, plus the two timestamps, so the column
  default gives `draft`. Update writes the fields it is given and `updated_at`, in one
  `UPDATE ... RETURNING *`. Update with no fields still sets `updated_at`.
- A value the table rejects (a bad status, a missing source, text for a number) surfaces
  as the SQLite error, with the constraint's name in its message. The statement changes
  nothing. The helpers do not repeat the table's checks.

**D13. A source holds what its kind needs.** The `sources_content` check requires
`image_path` for a photo and `transcript` for voice or text. It does not forbid the
other column, so a later job can keep the text read from a photo without rebuilding the
table. `NewSource` is the narrower contract of this job: a caller gives exactly the one
that belongs to the kind. `createSource` reads the keys `kind`, `image_path` and
`transcript` and no other, writes `NULL` for the one that is absent, and sets
`created_at` from the clock. It needs no unknown-key check like the one for tasks: a
misspelled `image_path` or `transcript` fails the content check. `tasks.image_path`
stays, as the plan lists it; nothing fills it here.

**D14. Settings are JSON values under typed keys.** `src/db/settings.ts`:

```ts
export interface Settings {
  working_hours: { start: string; end: string };
}
export type SettingKey = keyof Settings;
getSetting<K extends SettingKey>(db: Database, key: K): Settings[K] | undefined
setSetting<K extends SettingKey>(db: Database, key: K, value: Settings[K]): void
```

`value` is `JSON.stringify` of the value; get parses it. Set is one statement that
inserts the key or replaces its value (`ON CONFLICT (key) DO UPDATE`). A job that adds
a setting adds its key to `Settings` (job 008 adds the slot rules). Working hours are
`HH:MM` on a 24-hour clock, `start` `09:00` and `end` `22:00`.

Rejected: plain strings under two keys (`working_hours_start`, `working_hours_end`).
The slot rules are structured, so JSON arrives with job 008 anyway, and then there
would be two encodings. The helpers do not check that a value has the right shape
beyond its type; the settings page (022) validates what a user types.

**D15. `confidence` is a number from 0 to 1, or `NULL` when there is none.** The check
pins the scale, so an analyzer that answers `85` fails loudly and is not stored as
"very sure". Where "low" begins is job 006's decision.

**D16. Tests.** New files only; the nine test files that exist are not edited.
`openDatabase(':memory:')` gives each helper test its own empty, migrated database.
Every handle a test opens is closed in `afterEach`, before the temp folder is removed.
One test loads the four modules in plain Node, as 001 does for the app, because Vitest
transforms TypeScript and Node only strips types. It follows the two error-log entries
for child processes: a `timeout` on `spawnSync`, and an assertion on the exit code
only. Stderr is never asserted empty; here it holds the experimental warning.

## Files

Created:

- `src/db/database.ts`: `Database` (the type of an open database) and
  `openDatabase(file: string): Database` (D4, D6, D9).
- `src/db/migrations.ts`: `migrations` and `migrate(db, list = migrations)` (D6, D7).
- `src/db/timestamps.ts`: `nowTimestamp()` and `isTimestamp(value)` (D10).
- `src/db/tasks.ts`: `taskStatuses`, the types of D11 and the five task helpers (D12).
- `src/db/sources.ts`: `sourceKinds`, `Source`, `NewSource` and the three source
  helpers (D12, D13).
- `src/db/settings.ts`: `Settings`, `SettingKey`, `getSetting`, `setSetting` (D14).
- `src/config.database.test.ts`, `src/db/database.test.ts`, `src/db/schema.test.ts`,
  `src/db/timestamps.test.ts`, `src/db/tasks.test.ts`, `src/db/sources.test.ts`,
  `src/db/settings.test.ts`: see `plan.md`.

Changed:

- `src/config.ts`: add `getDatabasePath(env: NodeJS.ProcessEnv = process.env): string`
  (D4). Nothing else in the file changes.
- `.env.example`: add a comment line and `DATABASE_PATH=data/app.db`.
- `.gitignore`: add the line `/data/`.
- `vitest.config.ts`: add `env: { DATABASE_PATH: ':memory:' }` under `test` (D5).

Not touched: `src/app.ts`, `src/server.ts`, `src/ui.ts`, the nine existing test files,
`package.json`, `yarn.lock`, `tsconfig.json`, `CLAUDE.md` (the language and the
commands are the same), `src/db/.gitkeep`, `docs/` unless the builder logs an error,
and everything under `factory/` except this job's `build.md`.

## Risks

- **A later Node changes `node:sqlite`.** The calls are the ones listed in D2. Every
  test under `src/db/` runs them, so an upgrade that breaks one fails `yarn test`.
- **The design was run on Node 25.4.0 only.** `package.json` allows 22.18 and newer.
  The calls of D2 are in the Node 22 documentation, but nothing here ran on 22. If the
  builder has a Node 22 or 24 at hand, running `yarn test` on it once is worth a line
  in `build.md`; if not, say so under Not done.
- **`src/ui.ts` gains or loses a priority or slot and the table does not follow.**
  `src/db/schema.test.ts` accepts a value exactly when `src/ui.ts` has that id, in both
  directions. It fails, and the fix is a new migration, never an edit to migration 1.
- **Someone edits a merged migration.** No test can see that from inside one checkout.
  D6 states the rule and `migrations.ts` carries it as a comment.
- **A failed migration leaves half a schema.** The runner tests in
  `src/db/database.test.ts` give `migrate` a list whose second entry fails and check
  that the version and the tables are as before.
- **Foreign keys are off on a connection, and a task points at nothing.** The AC3 tests
  insert a task with a missing source and a missing parent, on a first open and on a
  second open of the same file.
- **A named parameter or a column default is used later and writes `NULL`.** The AC4
  test compares the whole created row, so a `NULL` status or a missing default shows.
- **A timestamp is written in another format and sorting breaks without an error.** The
  helper tests reject five wrong formats; the schema tests reject `datetime('now')`
  written with raw SQL into each of the eight columns.
- **Two updates in the same millisecond get the same `updated_at`, and a test that
  expects a change is flaky.** The tests set the clock (D10) and never wait.
- **A test opens the real database.** D5: the configured path is `:memory:` under
  Vitest, and `openDatabase` refuses a relative path. Both are tested in
  `src/config.database.test.ts` and `src/db/database.test.ts`.
- **A new environment variable is read but not listed.** The existing 001 test in
  `src/project.test.ts` scans `src/` and fails when `DATABASE_PATH` is missing from
  `.env.example`.
- **The modules pass in Vitest but plain Node cannot load them**, or an open database
  keeps a process from exiting. The plain-Node test in `src/db/database.test.ts` loads
  them, opens a database, leaves it open and expects exit code 0 within its timeout
  (checked: the process exits).
- **The warning line on stderr breaks a check that expects silence.** Nothing in the
  repo asserts that: `docs/errors/child-stderr-must-be-empty-assertion.md` already
  removed the one test that did.
- **Changing an allowed value later means rebuilding a table**, and a table that others
  point at can only be rebuilt with foreign keys off, which cannot be switched inside a
  transaction. The runner of D6 does not do that yet. The job that first needs it
  extends the runner; nothing in this job does.
