# 009-scheduler: auto-scheduler with gap filling, bumping and overflow

## Goal

A confirmed task has a priority and a slot but no time (`docs/plan.md`, task 8, and the
landing preview of U4). This job adds the service that gives it one,
`src/services/scheduler.ts`: it puts a task in the first free gap inside the working
hours, keeps a slotted task inside its slot's window, lets an urgent task push lower
priorities later, and rolls what does not fit today to a later day. Confirming drafts
then stores `scheduled_start` and `scheduled_end`, and each review card says where its
task will land, as "Today 8:00 PM" does in `docs/mockUps.html`.

It reads what is already there: `working_hours` (003) and the `start` and `end` of each
`slot_rules` rule (008) from `settings`, and the `priority`, `time_slot` and
`estimated_minutes` of a task. It is called from the confirm of 006
(`POST /review/:sourceId/confirm`, `confirmDrafts` in `src/services/drafts.ts`) and from
the review page (`src/routes/review.ts`, `src/views/pages/review.ejs`). No migration is
needed: the two columns exist. The plan gives one sentence per behaviour, so the step
size, the order of placing, what bumping moves, and the texts below are this spec's
choices. The backlog's open decision 3 is taken at its default, as 008 seeded it.

Unless a criterion says otherwise, its examples use `now` = `2026-10-12T09:36:00.000Z`,
which is 1:36 PM on 12 Oct in Asia/Dubai (UTC+4, no daylight saving), the seeded
settings, no other task, and Dubai clock times.

## Acceptance criteria

- **AC1**: `src/services/scheduler.ts` exports the function that places tasks. The
  current time is one of its arguments and it never reads the clock: with the system
  clock faked to another day, the result follows the argument. Whether it is handed the
  database or the tasks and settings already read is the architect's choice. `HH:MM`
  values in `settings` are read on the Asia/Dubai clock (the plan's time zone), whatever
  the `TZ` of the process. A time it stores is a UTC timestamp in the format of
  `src/db/timestamps.ts`.
- **AC2**: A placed task has `scheduled_end` = `scheduled_start` + `estimated_minutes`.
  Its start is not before `now`, is on a 5-minute mark of the clock (`now` is rounded up
  to the next mark; a `now` on a mark is a start), and its whole length is inside the
  working hours of one day. Every day is a working day. A 15-minute task with no slot
  gets `2026-10-12T09:40:00.000Z` to `2026-10-12T09:55:00.000Z`.
- **AC3**: Gap filling, no overlaps. Time is taken by every task with the status
  `pending` or `in_progress` that has a `scheduled_start` and a `scheduled_end`; `draft`
  and `done` tasks take none. A task gets the earliest start that meets AC2 and overlaps
  none of them; a task may start at the minute another ends. With pending tasks at
  1:40-2:30 PM and 3:00-4:00 PM, a 30-minute task gets 2:30-3:00 PM and a 45-minute task
  gets 4:00-4:45 PM. Tasks that are not being placed are not moved (but see AC7).
- **AC4**: Several tasks placed in one call are placed one at a time, by priority
  (`urgent`, `high`, `medium`, `low`; no priority counts as `low`) and then by `id`, and
  each one takes time from the next. No two of them overlap.
- **AC5**: Slot window. A task with a `time_slot`, other than an urgent one, is placed
  wholly inside the window of that slot: the `start` to `end` of the first rule in
  `slot_rules` whose `time_slot` is the task's. It goes to the first day on which the
  window has a free gap for it. A 40-minute `night` task gets 8:00-8:40 PM today
  (`2026-10-12T16:00:00.000Z`); a 90-minute `morning` task gets 9:00-10:30 AM tomorrow
  (`2026-10-13T05:00:00.000Z`), because today's window has passed. A second 90-minute
  `morning` task placed after it gets 9:00 AM the day after. A task whose slot no rule
  names (`afternoon` and `evening` with the seeded rules), or that is longer than its
  window, is placed as a task with no slot.
- **AC6**: Overflow. A task that does not fit in what is left of today goes to the first
  later day with a gap for it. A 30-minute task at `now` 9:40 PM gets 9:00 AM tomorrow;
  so does one at `now` 11:30 PM. At `now` `2026-10-12T22:00:00.000Z` (2:00 AM on 13 Oct
  in Dubai) it gets `2026-10-13T05:00:00.000Z`, 9:00 AM the same Dubai day. When today
  is full of pending tasks until 10:00 PM, it gets tomorrow's first gap.
- **AC7**: Bumping. A task with the priority `urgent` is placed without regard to its
  `time_slot` (as 008's urgent rule) and to `pending` tasks of a lower priority: it gets
  the earliest start that meets AC2 and overlaps no `urgent` task and no `in_progress`
  task. Every `pending` task of a lower priority that then overlaps it is placed again
  by AC2 to AC5, at or after the urgent task's end, in the order of AC4 and then of
  their old start, before any further task of the call is placed. A task that did not
  overlap it is not moved, and nothing but an urgent task bumps. With a pending `medium`
  task at 1:40-2:40 PM and a pending `low` task at 2:40-3:10 PM, a 30-minute urgent task
  gets 1:40-2:10 PM, the `medium` task moves to 3:10-4:10 PM and the `low` task stays.
  A second 30-minute urgent task placed after that gets 2:10-2:40 PM and moves nothing.
- **AC8**: A task with no `estimated_minutes`, or one longer than the working day
  (more than 780 minutes with the seeded hours), cannot be placed. The call still
  returns and places the other tasks it was given; this one is reported as not placed
  and its `scheduled_start` and `scheduled_end` stay unset.
- **AC9**: The hours and windows come from `settings`, read at the call. After
  `setSetting(db, 'working_hours', { start: '10:00', end: '18:00' })` a task at `now`
  7:00 AM gets 10:00 AM and a 30-minute task at `now` 5:40 PM gets 10:00 AM tomorrow.
  With the seeded hours and the `coding` rule set to `start: '10:00', end: '12:00'`, a
  `morning` task at `now` 7:00 AM gets 10:00 AM.
- **AC10**: Confirming schedules. A `POST /review/:sourceId/confirm` that 006 AC12
  accepts also places every draft it confirms, in one call, with the values it stores
  (the posted minutes, priority and slot) and the time of the request, and stores each
  one's `scheduled_start` and `scheduled_end` and the new times of every task AC7 moved.
  A draft of AC8 is confirmed as `pending` with no times. All of it is stored or none
  of it. The answer is still 303 to `/review/<source id>`. A confirm that answers 400,
  a remove, a discard, and a confirm on a source with no drafts change no
  `scheduled_start` and no `scheduled_end`. Tasks of other sources that are `pending`
  and scheduled take time (AC3) and can be bumped (AC7). The routes read the time once
  per request from a clock a test can set: a clock handed to `createApp` or the faked
  `Date` the existing tests use, the architect's choice.
- **AC11**: Landing preview. On `GET /review/<source id>` every draft card has one
  element with the class `land` (the mockup's) holding where the draft would land if
  the form were confirmed as stored at the time of the request: all drafts of the
  source placed in one call. The text is `Today h:mm AM` or `PM` for the Dubai day of
  the request, `Tomorrow h:mm AM` or `PM` for the next, and `D Mon h:mm AM` or `PM`
  (`14 Oct 9:00 AM`) after that; hours have no leading zero. A draft of AC8 shows
  `Not scheduled`. An arrow before the text, as in the mockup, is `aria-hidden`. Drafts
  of a `high` `morning` 90-minute task, a `medium` `night` 40-minute task and a `low`
  15-minute task with no slot show `Tomorrow 9:00 AM`, `Today 8:00 PM` and
  `Today 1:40 PM`. The preview on the page of a refused confirm (400) is that of the
  stored values, not of the posted ones.
- **AC12**: The preview writes nothing: after the `GET`, every task row is as it was,
  `updated_at` included, and the drafts have no `scheduled_start`. A confirm of the form
  as served, at the same time, stores for each draft the start its card showed.
- **AC13**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. The
  scheduler has one unit test or more for each of gap filling (AC3), the slot window
  (AC5), overflow (AC6) and bumping (AC7), each at a time it passes in. The tests run
  against a temporary or in-memory database and leave nothing in `data/`. The existing
  tests that expect a confirmed task to have no `scheduled_start`, or compare its whole
  row (those of `src/review-actions.test.ts`), are changed to fit AC10; no assertion is
  loosened otherwise and no other existing test changes.

## Out of scope

- The hours of the slots no rule names. 008 left them to the timeline's bands (012);
  until then an `afternoon` or `evening` task is placed as one with no slot (AC5).
- Updating a card's preview when its minutes, priority or slot are edited, before the
  form is posted. The preview is of the stored draft; a `Remove` stores the other
  cards' edits (006 AC14), so the page it returns to shows them.
- Telling the user which tasks an urgent one moved. The moved tasks have their new
  times stored; `/tasks` (010) and `/timeline` (012) show them.
- Reschedule on a task card and editing a scheduled task (010); rescheduling a task
  whose time has passed (011). A pending task whose end is behind `now` keeps its times.
- Drawing the day, overlapping blocks and the hatched conflict style (012). The
  scheduler makes no overlap; a conflict can only come from a time set by hand.
- The next instance of a recurring task (016), `reminder_at` (018), and `.ics` (021).
- Days off, breaks, and splitting a task over two gaps or two days.
- A time zone setting. Asia/Dubai is fixed, as the plan's shared context says.
- Checking the shape of `working_hours` and `slot_rules`. A missing row, a malformed
  time, an end that is not after its start, or a time off the 5-minute marks is not
  handled; only migrations and tests write them until the settings page (022).
- Two confirms at the same moment. Each request schedules in its own transaction.
- Confirming the backlog's open decision 3 with the user. The seeded hours and rules
  are used; another answer is a changed setting, not a code change.
- Checked by hand: nothing. The backlog lists no device or live-model check for 009.
