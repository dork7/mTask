# 003-data-model: tasks, sources and settings tables with CRUD helpers

## Goal

Task Image AI stores its tasks in SQLite (`docs/plan.md`, task 2). This job adds the
database and the helpers every later job reads and writes through: tasks, the sources
they were extracted from, and settings. Nothing in the app shows the data yet.

The plan's `tasks` columns are kept. Three things are added because later jobs in the
plan need them: a `sources` table, since the review screen pins the source photo or
transcript and a transcript has no column in `tasks`; `confidence` on a task, for the
low-confidence marker; and `updated_at`.

The plan names `better-sqlite3` as the driver. The Node version in use also ships a
built-in SQLite module. Which one to use is the architect's decision. The code lives in
`src/db/`, in TypeScript.

## Acceptance criteria

- **AC1**: Opening the database creates the schema when it is missing, and opening it
  again changes nothing. The file path comes from `DATABASE_PATH` and is `data/app.db`
  when that is not set. `.env.example` lists `DATABASE_PATH`, and the data folder is
  git-ignored.
- **AC2**: A `tasks` table holds the plan's columns (`id`, `title`, `description`,
  `image_path`, `category`, `estimated_minutes`, `actual_minutes`, `priority`,
  `time_slot`, `scheduled_start`, `scheduled_end`, `status`, `started_at`,
  `completed_at`, `reminder_at`, `recurrence_rule`, `parent_task_id`, `source_id`,
  `created_at`) plus `confidence` and `updated_at`. It rejects a `status` other than
  `draft`, `pending`, `in_progress` or `done`, a `priority` other than the four ids in
  `src/ui.ts`, and a `time_slot` other than the four slot ids there.
- **AC3**: A `sources` table holds what a task came from: its kind (`photo`, `voice` or
  `text`), the image path or the transcript, and when it was created. A task cannot
  point at a source or at a parent task that does not exist.
- **AC4**: Task helpers create, get, list, update and delete a task. A new task has the
  status `draft` unless another is given. List returns every task, or only those with a
  given status. Update changes only the fields it is given and sets `updated_at`. Get
  and delete report that nothing was found for an id that does not exist.
- **AC5**: Source helpers create a source, get one by id, and list the tasks that belong
  to one.
- **AC6**: A `settings` table stores values by key, with helpers to get one and to set
  one. Working hours are seeded when the database is first created, as 09:00 to 22:00.
  Opening the database later does not overwrite a value that was changed.
- **AC7**: Timestamps are stored as UTC ISO 8601 strings. The helpers set `created_at`
  and `updated_at` themselves; a caller cannot leave them unset.
- **AC8**: `yarn build` passes and the tests that exist before this job still pass. The
  new tests run against a temporary database and never touch `data/app.db`.

## Out of scope

- Slot rules and the settings that hold them (job 008). Only working hours are seeded.
- Any route, page or service that reads or writes tasks.
- Scheduling, recurrence logic and reminders. Their columns exist; nothing fills them.
- Deleting uploaded image files when a task or source is deleted (job 023).
