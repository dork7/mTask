# 016-recurring: daily, weekly and monthly recurring tasks

## Goal

A task such as "weekly groceries" has to be entered again every week, because nothing
repeats (`docs/plan.md`, task 9, and the recurrence pickers of U4 and U8). This job adds
recurrence rules: daily, weekly (on the instance's weekday or on chosen days), and
monthly. A user sets the rule with a picker on the review card or the task sheet. When
an instance is completed, or a periodic job runs after the instance's end has passed,
the next instance is created exactly once and placed by the scheduler. The plan's "Done
when" becomes a test: a completed weekly groceries task at 8 PM on a Monday gets a new
instance at 8:00 PM on the next Monday.

It builds on what is there. The `recurrence_rule` and `parent_task_id` columns have been
in `tasks` since 003. The scheduler is `placeTasks` / `storeSchedule` of
`src/services/scheduler.ts` (009). Every Done goes through `markDone` of
`src/services/task-actions.ts` (010, 013), which `POST /tasks/:id/done` (list, sheet,
mini-bar) and `POST /overdue/:id/done` (011) call. The review card and its form fields
come from `src/routes/review.ts`, `src/views/pages/review.ejs` and `src/services/drafts.ts`
(006). The sheet comes from `src/routes/tasks.ts` and
`src/views/partials/task-sheet-body.ejs` (013). The app has no cron yet, and `node-cron`
is not a dependency. The plan gives no rule format, field names, texts or interval, so
the ones below are this spec's choices. Unless a criterion says otherwise, examples use
`now` = `2026-10-12T09:36:00.000Z` (1:36 PM on Monday 12 Oct in Asia/Dubai), the seeded
settings, and Dubai dates and times.

## Acceptance criteria

- **AC1**: Rule format. A rule is stored in `recurrence_rule` as exactly one of these:
  - `FREQ=DAILY`;
  - `FREQ=WEEKLY`, meaning the instance's own weekday;
  - `FREQ=WEEKLY;BYDAY=<days>`, where `<days>` is one or more of `MO,TU,WE,TH,FR,SA,SU`,
    comma-separated, in that order, with no repeats;
  - `FREQ=MONTHLY`.

  `null` means the task does not repeat. Any other stored value, for example
  `FREQ=YEARLY` or `FREQ=WEEKLY;BYDAY=TH,MO`, is treated like `null`. It never makes an
  instance and shows as "Does not repeat". A module, `src/services/recurrence.ts`, parses
  and writes these strings, and has a unit test for each form and for a refused one.
- **AC2**: The instance's date and the next date. An instance's date is the Dubai day of
  its `scheduled_start`. When the instance has no start, its date is the Dubai day it is
  completed. The next date is the first day after the instance's date that fits the rule
  and is not before the Dubai day of `now`:
  - **Daily**: dated 12 Oct and done on 12 Oct gives 13 Oct. Dated 10 Oct and done on
    12 Oct gives 12 Oct.
  - **`FREQ=WEEKLY;BYDAY=MO,TH`**: 12 Oct (Mon) gives 15 Oct (Thu), and 15 Oct gives
    19 Oct.
  - **`FREQ=WEEKLY`**: 12 Oct gives 19 Oct. Dated 12 Oct and done on 20 Oct gives 26 Oct.
  - **Monthly**: the instance's day of the month, 1, 2, 3 ... months on, set to the
    month's last day when the month is shorter. 12 Oct 2026 gives 12 Nov 2026. 31 Jan
    2027 gives 28 Feb 2027. 31 Jan 2027 done on 1 Mar 2027 gives 31 Mar 2027.

  The function that computes this takes `now` as an argument and never reads the clock.
- **AC3**: The next instance. It is a new `pending` task with these fields:
  - `parent_task_id` is the instance's id;
  - `title`, `description`, `category`, `image_path`, `estimated_minutes`, `priority`,
    `time_slot` and `recurrence_rule` are copied from the instance;
  - `source_id`, `confidence`, `started_at`, `completed_at`, `actual_minutes` and
    `reminder_at` are null.

  It is placed by `placeTasks` on its own, with its time taken as the later of `now` and
  00:00 Dubai on the next date, and its times and any task it bumps are stored (009 AC7).
  - A daily 30-minute task with no slot, dated and done on 12 Oct, gets
    `2026-10-13T05:00:00.000Z` (9:00 AM on 13 Oct).
  - One dated 10 Oct and done at `now` gets `2026-10-12T09:40:00.000Z`.
  - A next instance that the scheduler cannot place (009 AC8) is still created, as
    `pending` with no times.
- **AC4**: Completing makes the next one. When `markDone` makes a task with a rule (AC1)
  `done`, it creates the task's next instance in the same transaction. Either both are
  stored or neither is. A test covers each route that marks a task done:
  `POST /tasks/<id>/done`, `POST /tasks/<id>/done?from=sheet` and
  `POST /overdue/<id>/done`. Take `Weekly groceries`: `shopping`, `medium`, `night`, 40
  minutes, `FREQ=WEEKLY`, pending at `2026-10-12T16:00:00.000Z` to
  `2026-10-12T16:40:00.000Z`. Done at `2026-10-12T17:00:00.000Z`, it gets a next instance
  at `2026-10-19T16:00:00.000Z` to `2026-10-19T16:40:00.000Z` (8:00 PM on Monday 19 Oct).
  A Done on a task with no rule, or on a task that is already `done`, creates no task.
  The redirects stay as they were.
- **AC5**: The periodic run. `src/services/recurrence.ts` exports a function that takes
  the database and `now` and creates the next instance of every task that meets all of
  these:
  - its status is not `draft`;
  - it has a rule (AC1);
  - it has a `scheduled_end` before `now`;
  - it has never made a next instance.

  It handles the tasks in `id` order, one transaction each, and returns the ids of the
  tasks it created. With the `Weekly groceries` task of AC4 left `pending`:
  - at `2026-10-12T16:30:00.000Z`, it creates nothing;
  - at `2026-10-12T18:00:00.000Z`, it creates the same next instance as AC4, and the old
    task stays `pending`, with its times unchanged.
- **AC6**: Exactly once. A task makes at most one next instance, ever. These cases each
  end with one next instance:
  - Done, then the periodic run;
  - the periodic run, then Done;
  - two periodic runs.

  After the next instance is deleted, neither a Done nor a later run makes another, so
  deleting the newest instance ends the series. Whether this is tracked through
  `parent_task_id` plus a marker, or a new column added by an appended migration, is the
  architect's choice. The next instance carries the rule, so it makes its own next
  instance in turn.
- **AC7**: Running the job. `src/services/recurrence.ts` also exports a starter that
  takes the database. It runs AC5 once at once, at the time it reads then, and again
  every 15 minutes. It returns a function that stops it. Whether it uses `node-cron` or a
  timer is the architect's choice. A test with fake timers checks three things:
  - a task whose end has passed gets its next instance right after the start;
  - one whose end passes later gets its next instance within 15 minutes of fake time;
  - after the stop, no further run happens.

  `src/server.ts` calls the starter once, after it opens the database. `createApp` does
  not, so the existing app tests are not affected.
- **AC8**: The sheet's picker. The sheet's form (013 AC3) also has:
  - a `<select name="repeat">` labelled `Repeat`, with the options `""` "Does not repeat",
    `daily` "Daily", `weekly` "Weekly" and `monthly` "Monthly";
  - seven checkboxes named `repeat-days`, with the values `MO` to `SU` and the labels
    `Mon` to `Sun`.

  They show the stored rule: the matching option selected, and the days of `BYDAY`
  checked.
- **AC9**: Saving the picker. A valid sheet post stores the rule like this:
  - `""` stores null;
  - `daily` stores `FREQ=DAILY`;
  - `weekly` with no day checked stores `FREQ=WEEKLY`;
  - `weekly` with days stores `FREQ=WEEKLY;BYDAY=` and the days in the order of AC1, so
    `TH` and `MO` store `FREQ=WEEKLY;BYDAY=MO,TH`;
  - `monthly` stores `FREQ=MONTHLY`.

  Days posted with anything but `weekly` are ignored. A post with no `repeat` field
  leaves the stored rule as it is. A rule change alone does not move the task (013 AC4's
  rescheduling rule is unchanged). A `repeat` that is not one of the four values, posted
  more than once, or a day that is not one of the seven, answers 400. It stores nothing
  and shows `Choose a repeat from the ones offered.` once, after the other messages, with
  the posted values in the fields.
- **AC10**: The review card's picker. Each draft card on `GET /review/<source id>` has the
  same controls as AC8, named `repeat-<id>` and `repeat-days-<id>`, showing the draft's
  stored rule. Confirm (006 AC12) and Remove (006 AC14) store a posted `repeat-<id>` by
  the mapping of AC9. A missing field keeps the stored rule, as for the other draft
  fields. A bad value answers the confirm with 400 and `Choose every repeat from the ones
  offered.`, shown after the other messages, and stores nothing. A draft confirmed with
  `weekly` is a `pending` task with `FREQ=WEEKLY` and its scheduled times. A draft never
  makes an instance.
- **AC11**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. Tests run
  against a temporary or in-memory database, leave nothing in `data/`, and make no
  network request. There are tests for:
  - the rule forms (AC1);
  - each next-date example of AC2;
  - the copied and cleared fields and the placement (AC3);
  - each Done route (AC4);
  - the run before and after the end (AC5);
  - the three cases and the deleted next instance (AC6);
  - the starter (AC7);
  - the sheet picker shown, stored and refused (AC8, AC9);
  - the review picker confirmed and refused (AC10).

  No existing assertion changes. A test helper, for example `formFields` of
  `src/testing/dom.ts`, may be extended to skip unchecked checkboxes.

## Out of scope

- The plan's "Done when" through the live analyzer. The analyzer does not guess a
  rule from "weekly groceries"; the user picks it on the review card.
- Showing that a task repeats on `/`, `/tasks`, `/timeline` or `/overdue` (the mockup's
  "· repeats" and "↻ Weekly" chips), and a picker on the 010 edit page.
- Any other kind of rule: every N days, end dates, counts, a day of the month other than
  the instance's own, or yearly. Monthly drift is accepted: a series that starts on the
  31st and lands on 28 Feb continues from the 28th.
- Making the instances ahead of time, or more than one per run, and catching up on missed
  dates (AC2 skips to today).
- Carrying `reminder_at` over to the next instance (018 handles reminders).
- Editing or deleting a whole series at once. Each instance is its own task.
- `.ics` RRULE output (021 exports the instances).
- Checked by hand: nothing. The backlog lists no device or live-model check for 016.
