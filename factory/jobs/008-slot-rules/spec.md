# 008-slot-rules: priority and time-slot rules

## Goal

A task's category and urgency decide its priority and the part of the day it belongs to
(`docs/plan.md`, task 7): coding goes to the morning deep-work slot, groceries and
shopping go to the 8 PM slot, and an urgent task is not held back for a slot at all. This
job adds the service that makes that choice, `src/services/rules.ts`, and stores the
category rules in the `settings` table so they are data and not code. The service is
deterministic: it reads no clock and calls no model.

It sits between the analyzer of 005, whose `category` and `urgency` are its input, and
the scheduler of 009, which reads its output. The rules are a new `slot_rules` setting
beside `working_hours` from 003, read with `getSetting`. 003 left this setting to this
job, so it is seeded here by a new migration; the merged one is not edited. The slot ids
are the four of `src/ui.ts`; the mockup's "8 PM slot" is the id `night`. The backlog's
open decision 3 is taken at its default: coding at 9-11 AM, groceries and shopping at
8 PM. The plan gives no shape for the setting, no end for the 8 PM slot and no rule for
priority, so those below are this spec's choices.

## Acceptance criteria

- **AC1**: A newly created database has a `slot_rules` setting, and
  `getSetting(db, 'slot_rules')` returns exactly
  `[{ category: 'coding', time_slot: 'morning', start: '09:00', end: '11:00' },
  { category: 'shopping', time_slot: 'night', start: '20:00', end: '22:00' }]`.
  `start` and `end` are `HH:MM` on a 24-hour clock, as `working_hours` is. The end
  `22:00` is the end of the 8 PM band in `docs/mockUps.html`; the plan names only the
  start. `slot_rules` is a key of `Settings` in `src/db/settings.ts`, so `getSetting` and
  `setSetting` are typed for it.
- **AC2**: The setting is added by a migration appended to `src/db/migrations.ts`; the
  text of migration 1 is unchanged. A database that is at schema version 1 with
  `working_hours` changed gets `slot_rules` when it is opened and keeps its
  `working_hours`. Opening a database again does not overwrite a `slot_rules` value that
  was changed with `setSetting`.
- **AC3**: `src/services/rules.ts` exports a function that takes a category (one of
  `taskCategories` of `src/services/analyzer.ts`) and an urgency (one of the four
  priority ids of `src/ui.ts`) and returns an object with `priority` and `time_slot`.
  The rules it applies are the value of the `slot_rules` setting. Whether it is handed
  the database or the rules already read is the architect's choice. It reads no clock:
  the same input and the same setting always give the same result.
- **AC4**: The priority rule: `priority` is the urgency, unchanged, for each of `urgent`,
  `high`, `medium` and `low` and whatever the category. The plan has no rule that
  changes a priority, so this keeps what 006 stores today.
- **AC5**: The coding rule: with the seeded setting, category `coding` with urgency
  `high`, `medium` or `low` gives `time_slot` `morning`.
- **AC6**: The shopping rule: with the seeded setting, category `shopping` with urgency
  `high`, `medium` or `low` gives `time_slot` `night`. Groceries are `shopping` (005).
- **AC7**: The urgent rule: urgency `urgent` gives `priority` `urgent` and `time_slot`
  `null` for every category, `coding` and `shopping` included. This is the simplest
  reading of "urgent goes to the next available slot today": an urgent task is not made
  to wait for its category's slot, and finding the next free gap is the scheduler's
  (009). This rule is in code, not in the setting, and wins over the category rules.
- **AC8**: A category with no rule in the setting (`work`, `home`, `personal`, `other`
  with the seeded value) gives `time_slot` `null`.
- **AC9**: The rules are read from the setting, not written into the service. After
  `setSetting(db, 'slot_rules', [{ category: 'coding', time_slot: 'afternoon', start:
  '13:00', end: '15:00' }])`, category `coding` with urgency `medium` gives `afternoon`
  and category `shopping` with urgency `medium` gives `null`. With the setting set to
  `[]`, or with no `slot_rules` row at all, every category gives `time_slot` `null` and
  the function does not throw. When two rules name the same category, the first in the
  list is the one applied.
- **AC10**: A draft gets its priority and slot from the rules. When the analysis of a
  source stores drafts (006 AC2, and the text sources of 007), each draft's `priority`
  and `time_slot` are what the rules give for its `category` and `urgency`, with the
  `slot_rules` setting of that database: with the seeded value a `coding` task of
  urgency `high` is stored with `priority` `high` and `time_slot` `morning`, a
  `shopping` task of urgency `medium` with `time_slot` `night`, a `personal` task with
  `time_slot` unset, and an `urgent` `shopping` task with `time_slot` unset. On
  `/review/<source id>` the slot picker of the coding draft then has `Morning` selected
  and that of the personal draft `No slot`. The backlog row names only the service; this
  criterion is here because the specs of 006 and 007 leave this step to 008. The user
  can still change both on the card, and a confirm stores what was posted, as before.
- **AC11**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. The rules
  have one unit test or more for each of the priority rule, the coding rule, the
  shopping rule, the urgent rule and the no-rule case. The tests run against a temporary
  or in-memory database and leave nothing in `data/`. The existing tests that expect
  `working_hours` to be the only settings row (`src/db/settings.test.ts`,
  `src/db/schema.test.ts`) and those that expect an analysis to leave `time_slot` unset
  for a coding or shopping task (`src/add-analysis.test.ts`, `src/add-text.test.ts`) are
  changed to fit AC1 and AC10; no other existing test changes.

## Out of scope

- Placing a task at a time: free gaps inside working hours, bumping lower priorities for
  an urgent task, overflow to the next day, `scheduled_start` and `scheduled_end`, and
  the "Today 8:00 PM" landing preview on a review card (009). The `start` and `end` of a
  rule are stored here for the scheduler to read; nothing in this job uses them.
- "Today" in the urgent rule. This job only keeps an urgent task out of a category slot
  (AC7); which gap it takes today is 009.
- The hours of the four slots themselves (when Morning ends and Afternoon begins), for
  the timeline's slot bands (012). A rule carries only its own window.
- Showing the rules on `/settings`, read-only (022), and a rules editor, which the
  backlog lists under Left out. The setting can be changed with `setSetting` only.
- Checking the shape of a `slot_rules` value. Nothing but the migration and tests writes
  it, so a value with an unknown category, slot id or a malformed time is not handled.
- Applying the rules again when the user edits a draft's priority on the review page, or
  to tasks that are already stored. The rules run once, when the drafts are made.
- Rules for the next instance of a recurring task (016).
- Confirming the backlog's open decision 3 with the user. The defaults are used; a
  different answer is a changed `slot_rules` value, not a code change.
