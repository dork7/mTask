BLOCKED: AC8 and AC10 put new `<select>` controls into forms whose exact contents existing tests assert, and AC11 forbids changing any existing assertion.

# 016-recurring: design

## Why the job is blocked

AC8 puts a `<select name="repeat">` (and seven `repeat-days` checkboxes) into the sheet's
`form.edit-form`. AC10 puts the same controls, named `repeat-<id>` and
`repeat-days-<id>`, on each draft card of `GET /review/<source id>`, inside `main form`.
AC11 says "No existing assertion changes" and allows only a helper extension, for
example `formFields` skipping unchecked checkboxes.

That extension takes care of the checkboxes but not the selects. `formFields` in
`src/testing/dom.ts` (lines 263-274) reads every named `select` as its selected option,
or its first one. A browser posts a select the same way, so a new select always adds a
key. These existing tests then fail:

1. `src/task-sheet.test.ts:161`:
   `expect(formFields(form)).toEqual({ title, minutes, priority, slot, category, reminder })`.
   With AC8 the form also yields `repeat: ''`, and exact equality fails.
2. `src/review-page.test.ts:432` ("posts exactly the four fields of each draft"):
   `toEqual` with the twelve `title-`/`minutes-`/`priority-`/`slot-` keys of three
   drafts. With AC10 it also yields `repeat-<id>: ''` for each draft.
3. `src/review-page.test.ts:376` and `:393`: `one(cardOf(document, draft), 'select')`.
   `one` throws when it finds more than one match (`dom.ts:244-250`), and with AC10
   each card has two selects, the slot one and the repeat one. Both tests fail before
   their assertions run.

No honest change to the helper fixes this. The only way to keep `repeat` out of
`formFields` is to make it skip a select that a browser does post, and then the helper
no longer models a post. The other ways are just as bad: moving the sheet's select
outside the `<form>` element with a `form="…"` attribute, or making the review card's
repeat control something other than a select. Both bend the markup around a test, and
both break "the same controls as AC8". So the spec cannot be built as written: AC8 and
AC10 contradict AC11, and they contradict the tests already in the code.

Everything else in the spec can be built on the current code. That includes `markDone`,
which no caller wraps in a transaction, so it can open its own. It also includes
`placeTasks` / `storeSchedule` and the Dubai day helpers of `src/dubai.ts`.

## What the spec needs to say instead

Pick one of these:

- **A. Allow the forced updates by name.** In AC11, replace "No existing assertion
  changes" with: "No existing assertion changes, except that the exact-shape
  assertions on the forms gain the new fields with their default values, and that the
  card's slot select is found by its name. These are `src/task-sheet.test.ts:161`, which
  gains `repeat: ''`, `src/review-page.test.ts:432`, which gains `repeat-<id>: ''` for
  each draft, and `src/review-page.test.ts:376` and `:393`, which find the select as
  `select[name^="slot-"]`. No other existing assertion changes." This is the smallest
  fix, and it keeps the controls of AC8 and AC10 as specified.
- **B. Keep "No existing assertion changes" and change the controls.** For example, use a
  radio group instead of a select, on both the sheet and the card. This still adds a
  `repeat` key to the two `toEqual` assertions above, because "Does not repeat" has to
  show as chosen. So B does not work on its own, and A is the recommended fix.

## A second conflict of the same kind, for the same edit

AC6 offers "a new column added by an appended migration" as one way to remember that a
task has already made its next instance. That choice would also change existing
assertions:

- `src/db/migrations.test.ts:67-69`: `expect(migrations).toHaveLength(2)`.
- `src/db/schema.test.ts:88-112`: the exact column list of `tasks`.

Neither blocks the job, because AC6 also allows a marker without a migration. Remembering
"made" through a child's `parent_task_id` alone is not enough: AC6 requires that
deleting the next instance does not let the old task make another. So the marker has to
live outside the deleted row. If AC11 keeps its rule, the spec should drop the migration
option. If it is relaxed, it should name these two assertions too.

## Checks run

None. The block rests only on the code quoted above (`src/testing/dom.ts`,
`src/task-sheet.test.ts`, `src/review-page.test.ts`, `src/db/migrations.test.ts`,
`src/db/schema.test.ts`), read in full where cited. No throwaway copy was made.
