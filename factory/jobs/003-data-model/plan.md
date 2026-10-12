# 003-data-model: plan

Decision numbers (D1, D2, ...) refer to `design.md`.

There is no Parallel tasks section. The three helper files are small, and each needs
the schema, the `Task` type and the timestamp functions first, so splitting them would
cost more in merging than it saves in building.

## Steps

After each step, `yarn test` and `yarn build` must pass, including the nine test files
that exist before this job, which are never edited (D16).

1. **Path, environment and ignore rules.** Files: `src/config.ts`, `.env.example`,
   `.gitignore`, `vitest.config.ts`, `src/config.database.test.ts`. Serves AC1 (the
   path), AC8 (the guard).
   - `getDatabasePath(env)` (D4).
   - `DATABASE_PATH=data/app.db` with a comment line in `.env.example`; `/data/` in
     `.gitignore`.
   - `env: { DATABASE_PATH: ':memory:' }` in `vitest.config.ts` (D5).
   - Check: `src/config.database.test.ts` passes; the 001 test ".env.example lists
     every environment variable the app reads" still passes; `git check-ignore
     data/app.db` prints the path.

2. **Open and migrate.** Files: `src/db/migrations.ts`, `src/db/database.ts`,
   `src/db/database.test.ts`. Serves AC1, AC8.
   - `migrations` with migration 1 exactly as in D7, and `migrate(db, list)` (D6).
   - `openDatabase(file)`: the path rule, the parent folder, foreign keys on, migrate,
     close on failure (D4, D6, D9).
   - Only the driver calls listed in D2.
   - Check: `src/db/database.test.ts` passes, without its plain-Node test, which needs
     the modules of steps 5 to 7 and is added in step 7.

3. **Schema tests.** Files: `src/db/schema.test.ts`. Serves AC2, AC3, AC6 (the seed),
   AC7 (the table rules).
   - The tests that talk to the tables in SQL, with no helper: columns, allowed values,
     foreign keys, strict types, timestamp shape, the seeded row.
   - Check: `src/db/schema.test.ts` passes. If one fails, fix migration 1 now, while it
     is still unmerged; after the merge it is frozen (D6).

4. **Timestamps.** Files: `src/db/timestamps.ts`, `src/db/timestamps.test.ts`. Serves
   AC7.
   - `nowTimestamp()` and `isTimestamp(value)` (D10).
   - Check: `src/db/timestamps.test.ts` passes.

5. **Task helpers.** Files: `src/db/tasks.ts`, `src/db/tasks.test.ts`. Serves AC4, and
   AC2, AC3 and AC7 as seen through the helpers.
   - `taskStatuses`, `TaskStatus`, `Task`, `TaskFields`, `NewTask`, `TaskChanges`
     (D11).
   - `createTask`, `getTask`, `listTasks`, `updateTask`, `deleteTask` with the rules of
     D12 and the timestamp check of D10.
   - Check: `src/db/tasks.test.ts` passes.

6. **Source helpers.** Files: `src/db/sources.ts`, `src/db/sources.test.ts`. Serves
   AC5, and AC3 and AC7 for sources.
   - `sourceKinds`, `SourceKind`, `Source`, `NewSource` (D11, D13).
   - `createSource`, `getSource`, `listSourceTasks` (D12).
   - Check: `src/db/sources.test.ts` passes.

7. **Settings helpers and the plain-Node test.** Files: `src/db/settings.ts`,
   `src/db/settings.test.ts`, `src/db/database.test.ts`. Serves AC6, AC8.
   - `Settings`, `SettingKey`, `getSetting`, `setSetting` (D14).
   - Add the plain-Node test to `src/db/database.test.ts` (D16).
   - Check: `src/db/settings.test.ts` and `src/db/database.test.ts` pass.

8. **Verify.** No files. Serves AC8.
   - `yarn build` and `yarn test`, then the verification loop.
   - `git diff --stat main -- src/app.test.ts src/config.test.ts src/server.test.ts src/project.test.ts src/ui.test.ts src/stylesheet.test.ts src/shell.test.ts src/components.test.ts src/testing/css.test.ts src/app.ts src/server.ts src/ui.ts package.json yarn.lock tsconfig.json`
     prints nothing.
   - `git status --short` shows no `data/` folder and no database file anywhere in the
     repo after the test run.
   - `grep -rn "node:sqlite" src --include=*.ts -l` lists files under `src/db/` only
     (D2).
   - Record in `build.md` which Node version ran the suite (see Risks in `design.md`).

## Tests

Shared setup.

- A helper test opens `openDatabase(':memory:')` in `beforeEach` and closes it in
  `afterEach`.
- A test that needs a file makes a folder with `mkdtempSync(path.join(tmpdir(),
  'mtask-db-'))`, closes every handle it opened, and removes the folder in `afterEach`.
- A test that looks at `created_at` or `updated_at` sets the clock with
  `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(...)`; `afterEach`
  calls `vi.useRealTimers()`. No test sleeps.
- "Rejected with `<name>`" means the call throws and the error message contains that
  constraint name, and a count of the table's rows (or a read of the row) shows that
  nothing changed.
- "Raw SQL" means `db.prepare(...).run(...)` in the test, with every `NOT NULL` column
  given a valid value except the one under test.
- `T` is a valid stored timestamp, `2026-03-04T05:06:07.089Z`.

### AC1: `src/config.database.test.ts` and `src/db/database.test.ts`

`src/config.database.test.ts`:
- `getDatabasePath({})` is `path.join(rootDir, 'data', 'app.db')`. The same for
  `{ DATABASE_PATH: '' }` and `{ DATABASE_PATH: '   ' }`.
- `getDatabasePath({ DATABASE_PATH: 'var/x.db' })` is `path.join(rootDir, 'var',
  'x.db')`: a relative value starts at the repo root, not at the working folder.
- An absolute value is returned unchanged. `:memory:` is returned unchanged.
- `.env.example`, parsed with `parseEnv`, has the key `DATABASE_PATH`, and
  `getDatabasePath` of the parsed file equals `getDatabasePath({})`: the example and
  the default name the same file.
- `.gitignore` has the line `/data/`, and the folder of `getDatabasePath({})` is
  `<rootDir>/data`: the ignored folder is the one the default file lives in.

`src/db/database.test.ts`:
- Opening a path whose parent folders do not exist creates the folders and the file.
  The database then has the tables `tasks`, `sources` and `settings` (read from
  `sqlite_schema`), and `PRAGMA user_version` equals `migrations.length`.
- Opening an existing empty file (0 bytes) creates the same schema.
- Open a new file and close it; read its bytes. Open it and close it again. The bytes
  are equal, and the folder holds that one file.
- A task and a source written before a close are read back unchanged after a second
  open; the second open adds no row to any of the three tables.
- `openDatabase(':memory:')` returns a database with the three tables.
- `openDatabase('relative.db')` and `openDatabase('')` throw, and no file named
  `relative.db` exists in the working folder afterwards.
- A file whose `user_version` was set to `migrations.length + 1` cannot be opened: the
  call throws, and the file's bytes are unchanged.
- The runner, on a `:memory:` database with a list given to `migrate`:
  - a list of two migrations applies both, in order, and sets `user_version` to 2;
  - calling `migrate` again with the same list runs nothing (a table the first
    migration created with plain `CREATE TABLE` does not make it throw);
  - a database at version 1 given a list of two runs only the second;
  - a list whose second migration creates a table and then fails rethrows the error,
    leaves `user_version` at 1, has no table from the second migration, and leaves no
    transaction open (a following `BEGIN` succeeds).

### AC2: `src/db/schema.test.ts` and `src/db/tasks.test.ts`

`src/db/schema.test.ts`:
- `PRAGMA table_info(tasks)` lists exactly these names, in this order: `id`, `title`,
  `description`, `image_path`, `category`, `estimated_minutes`, `actual_minutes`,
  `priority`, `time_slot`, `scheduled_start`, `scheduled_end`, `status`, `started_at`,
  `completed_at`, `reminder_at`, `recurrence_rule`, `parent_task_id`, `source_id`,
  `confidence`, `created_at`, `updated_at`.
- Status: raw SQL inserts with `draft`, `pending`, `in_progress` and `done` succeed;
  `nope`, `Draft` and the empty string are rejected with `tasks_status`; `NULL` is
  rejected. A raw insert that leaves `status` out stores `draft`.
- `taskStatuses` equals `['draft', 'pending', 'in_progress', 'done']`.
- Priority: for each candidate in `urgent`, `high`, `medium`, `low`, `nope`, `Urgent`
  and the empty string, plus every id in `priorities` of `src/ui.ts`, a raw insert
  succeeds exactly when `priorities` has that id; a failure is rejected with
  `tasks_priority`. The test first asserts that `priorities` is not empty.
- Time slot: the same with `morning`, `afternoon`, `evening`, `night`, `nope`,
  `Morning`, the empty string and every id in `slots`; rejected with `tasks_time_slot`.
- `NULL` is accepted for `priority` and for `time_slot` (D8).
- Strict types: the text `thirty` and the number `30.5` in `estimated_minutes` are
  rejected; `30` is stored as the integer 30.
- `confidence`: `0`, `0.5` and `1` are stored; `1.5`, `-0.1` and `85` are rejected with
  `tasks_confidence`; `NULL` is accepted.
- `title`: `NULL` is rejected.

`src/db/tasks.test.ts`:
- `createTask` with a status, priority or time slot that is not allowed throws with the
  constraint name, and `listTasks(db)` has the same length as before.
- `updateTask` with one of those throws, and `getTask` returns the row as it was,
  `updated_at` included.

### AC3: `src/db/schema.test.ts`, `src/db/tasks.test.ts` and `src/db/sources.test.ts`

`src/db/schema.test.ts`:
- `PRAGMA table_info(sources)` lists exactly `id`, `kind`, `image_path`, `transcript`,
  `created_at`.
- `sourceKinds` equals `['photo', 'voice', 'text']`. A raw insert succeeds for each of
  them (with the column its kind needs) and is rejected with `sources_kind` for
  `video`, `Photo` and the empty string.
- A photo without `image_path` is rejected with `sources_content`. A voice source and a
  text source without `transcript` are rejected with `sources_content`.
- `created_at` set to `NULL` is rejected.
- `PRAGMA foreign_keys` is 1 on a `:memory:` database, on a new file, and on a second
  open of that file.
- A raw insert of a task with a `source_id` that is no source throws
  `FOREIGN KEY constraint failed`. The same for a `parent_task_id` that is no task. Both
  are repeated on a second open of a file database.
- Deleting a source that a task points at, with raw SQL, throws and the source is still
  there. Deleting a source with no tasks succeeds (D9).

`src/db/tasks.test.ts`:
- `createTask` with a missing `source_id`, or a missing `parent_task_id`, throws and
  stores nothing.
- `createTask` with the id of an existing source and of an existing task stores both
  ids.
- `updateTask` that sets `source_id` or `parent_task_id` to a missing id throws and
  leaves the row as it was.
- After `deleteTask` of a parent, its child still exists and its `parent_task_id` is
  `null` (D9).

`src/db/sources.test.ts`:
- `createSource` with a kind that is not allowed throws with `sources_kind` or
  `sources_content` and stores nothing. A photo input without `image_path`, and a voice
  input without `transcript`, passed with a cast, throw and store nothing.

### AC4: `src/db/tasks.test.ts`

- `createTask(db, { title: 'Buy milk' })` returns, compared with `toStrictEqual`, an
  object with `id: 1`, the title, `status: 'draft'`, `created_at` and `updated_at`
  equal to the clock, and `null` in each of the other 16 columns. Its prototype is
  `Object.prototype`. `getTask(db, 1)` returns an equal object.
- `createTask` with `status: 'pending'` returns a pending task.
- `createTask` with every one of the 18 fields set returns those values, and `getTask`
  returns the same.
- `createTask` without a title (a cast) throws and stores nothing.
- `listTasks(db)` on an empty database is `[]`. With one task of each status and a
  second draft, it returns all five in `id` order.
- For each of the four statuses, `listTasks(db, { status })` returns exactly the tasks
  with that status, and `[]` when there are none.
- `updateTask(db, id, { priority: 'high', estimated_minutes: 15 })` returns, compared
  with `toStrictEqual`, the task as it was with those two fields and `updated_at`
  replaced. `getTask` returns the same. Another task in the table is unchanged.
- A field given as `undefined` is left alone. A field given as `null` is cleared.
- `updateTask(db, id, {})` changes `updated_at` and nothing else.
- `updateTask(db, 999, { title: 'x' })` returns `undefined`, and `listTasks(db)` is
  unchanged.
- `getTask(db, 999)` returns `undefined`.
- `deleteTask(db, 999)` returns `false` and `listTasks(db)` is unchanged.
- `deleteTask(db, id)` returns `true`; `getTask(db, id)` is then `undefined`; the other
  tasks are still there; a second `deleteTask(db, id)` returns `false`.
- After the newest task is deleted, the next `createTask` gets a higher id, not the
  deleted one (D7).
- `createTask` and `updateTask` with a key that is no task field (`{ titel: 'x' }`
  through a cast) throw an error that names the key, and nothing is stored or changed.

### AC5: `src/db/sources.test.ts`

- `createSource(db, { kind: 'photo', image_path: 'uploads/a.jpg' })` returns, compared
  with `toStrictEqual`, `{ id: 1, kind: 'photo', image_path: 'uploads/a.jpg',
  transcript: null, created_at: <the clock> }`.
- `createSource` with `kind: 'voice'` and with `kind: 'text'` returns the transcript and
  `image_path: null`.
- `getSource(db, id)` returns an object equal to the one `createSource` returned.
  `getSource(db, 999)` returns `undefined`.
- With two sources, two tasks on the first (a draft and a pending one), one on the
  second and one task with no source: `listSourceTasks(db, first.id)` returns exactly
  the first two, in `id` order, equal to what `getTask` returns for them;
  `listSourceTasks(db, second.id)` returns the third.
- `listSourceTasks` returns `[]` for a source with no tasks and for id 999.
- `listTasks(db, { source_id: first.id, status: 'draft' })` returns only the draft of
  the first source.

### AC6: `src/db/settings.test.ts` and `src/db/schema.test.ts`

`src/db/schema.test.ts`:
- `PRAGMA table_info(settings)` lists exactly `key`, `value`, and `key` is the primary
  key.
- A newly created database has exactly one row in `settings`: key `working_hours`,
  whose value parses to `{ start: '09:00', end: '22:00' }`.
- A raw insert of a value that is not JSON is rejected with `settings_value`.

`src/db/settings.test.ts`:
- On a new database `getSetting(db, 'working_hours')` equals
  `{ start: '09:00', end: '22:00' }`.
- After `setSetting(db, 'working_hours', { start: '08:00', end: '20:00' })`,
  `getSetting` returns the new value, and `settings` still has one row for the key.
- `getSetting` with a key that does not exist (a cast) returns `undefined`.
- On a file database: set the working hours, close, open again. `getSetting` returns
  the changed value, and `settings` has one row.

### AC7: `src/db/timestamps.test.ts`, `src/db/tasks.test.ts`, `src/db/sources.test.ts` and `src/db/schema.test.ts`

`src/db/timestamps.test.ts`:
- With the clock at `T`, `nowTimestamp()` is `T`.
- `isTimestamp` is true for `T` and for `2026-12-31T23:59:59.999Z`.
- `isTimestamp` is false for `2026-10-12 08:00:00`, `2026-10-12T08:00:00Z` (no
  milliseconds), `2026-10-12T12:00:00.000+04:00` (an offset), `2026-10-12T08:00:00.000`
  (no zone), `2026-02-30T08:00:00.000Z` (no such day), the empty string, `null`,
  `undefined`, a number and a `Date`.

`src/db/tasks.test.ts`:
- With the clock at `T`, a created task has `created_at` and `updated_at` equal to `T`.
  Read with raw SQL, both columns hold that same text.
- With the clock moved an hour on, `updateTask` sets `updated_at` to the new time and
  leaves `created_at` at `T`.
- `createTask` and `updateTask` given `created_at`, `updated_at` or `id` (through a
  cast, with `null` and with a valid timestamp) throw, and the row is not created or
  not changed.
- For each of `scheduled_start`, `scheduled_end`, `started_at`, `completed_at` and
  `reminder_at`: `updateTask` with a valid timestamp stores exactly that text; with
  `null` it clears the column; with each of the wrong strings above, or a `Date`
  through a cast, it throws a `RangeError` whose message names the field, and the row
  is unchanged. `createTask` with a wrong value throws the same and stores nothing.

`src/db/sources.test.ts`:
- With the clock at `T`, a created source has `created_at` equal to `T`.
- `createSource` given `created_at` through a cast still stores the clock's time.

`src/db/schema.test.ts`:
- A raw insert into `tasks` that leaves out `created_at`, or `updated_at`, is rejected.
  A raw update that sets either to `NULL` is rejected.
- For each of the seven timestamp columns of `tasks`, a raw update that sets it to
  `datetime('now')` is rejected with `tasks_<column>`, and one that sets it to `T`
  succeeds.
- A raw insert into `sources` with `created_at` set to `datetime('now')` is rejected
  with `sources_created_at`.

### AC8: `src/config.database.test.ts`, `src/db/database.test.ts` and step 8

`src/config.database.test.ts`:
- `getDatabasePath()` with no argument, which reads the real environment of the test
  run, is `:memory:`. This fails if the `env` line is taken out of `vitest.config.ts`.

`src/db/database.test.ts`:
- `openDatabase` refuses a relative path (listed under AC1).
- Plain Node can load the database modules: `spawnSync(process.execPath,
  ['--input-type=module', '-e', script], { cwd: rootDir, encoding: 'utf8', timeout:
  10_000 })`, where the script imports `./src/db/database.ts`, `./src/db/tasks.ts`,
  `./src/db/sources.ts` and `./src/db/settings.ts`, opens `:memory:`, creates a source
  and a task on it, reads the working hours, and does not close the database. The test
  asserts `result.status` is 0, with the failure described as in `src/project.test.ts`,
  and has its own timeout of 15 s. It does not assert anything about stderr.

Step 8:
- "`yarn build` passes" and "the tests that exist before this job still pass" are
  proved by running the two commands; `build.md` records their real output. Before
  this job the suite has 9 files and 291 tests, and none of them may be missing,
  skipped or edited afterwards.
- The `git diff --stat` and `git status` commands of step 8 show that no existing test
  was edited and that the run left no database file in the repo.

### Checked by hand, not by tests

Listed under Not done in `build.md`, each marked as done or not:

- `git check-ignore data/app.db` prints `data/app.db`.
- `yarn test` on a second Node version (22 or 24), if one is installed.
