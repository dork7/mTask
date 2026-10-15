# 016-recurring: design

No spec problem blocks the job; the earlier `BLOCKED` is resolved by the revised AC11
and AC6. Five readings are needed, and each is a decision below:

- **AC11, the helper that is not named.** AC11 allows "the card's slot select is found by
  its name" and names `src/review-page.test.ts:376` and `:393` (in the file as it is now,
  the `one(…, 'select')` calls are at `:378` and `:394`). The same change is needed in
  the helper `selectedSlots` of `src/add-rules.test.ts:118`, which reads every
  `[data-draft] select` and so would return two entries per card. Its assertion at
  `src/add-rules.test.ts:182` is not touched; only the helper's selector becomes
  `select[name^="slot-"]`. A helper whose result the same assertion reads is a helper
  change, not an assertion change, so this is inside AC11 (D15).
- **`src/server.test.ts` gains a mock, no assertion changes.** AC7 makes `src/server.ts`
  call the starter; that test builds the app with `openDatabase` replaced by a stand-in
  `{ name: … }`, so the starter would throw at import. The fix is a
  `vi.doMock('./services/recurrence.ts', …)` and one new test, neither of which changes an
  existing assertion (D9).
- **AC6, the marker.** "Made a next instance" is recorded by clearing the instance's own
  `recurrence_rule` to `null` when it makes the next one; the next instance carries the
  rule. No migration, no extra column (D1). Then AC5's "has a rule" and "has never made a
  next instance" are one condition.
- **AC9, repeated posted days.** AC1 fixes the stored string to the seven days "in that
  order, with no repeats", and AC9's 400 list names only a repeat that is not one of the
  four, a repeat posted twice, and a day that is not one of the seven. So repeated day
  boxes are de-duplicated into the order of AC1, not refused (D3).
- **The view lists.** `repeats` and `weekdays` reach the views as
  `app.locals.recurrence`, not from `src/ui.ts`: `src/ui.test.ts:48` asserts the `ui`
  object exactly (D11).

Checked in a throwaway folder under `$TMPDIR` importing the repo's own `node_modules` by
absolute path (nothing installed, nothing written in the repo), on Node 26.8.2,
yarn 1.22.22, Express 5.3.0:

- `express.urlencoded({ extended: false })` turns a repeated key into an array and leaves
  a single one a string: the body `repeat=weekly&repeat-days=TH&repeat-days=MO&repeat-days=MO&title=hi`
  parsed to `{ repeat: 'weekly', 'repeat-days': ['TH','MO','MO'], title: 'hi' }`. So the
  reader of the day boxes must look at an array (D10).
- supertest serialises an array field as repeated keys: `.type('form').send({ 'repeat-days': ['MO','TH'] })`
  arrived as `['MO','TH']`, so the picker tests can post the day boxes as an array (Tests).
- The Dubai day arithmetic of `src/dubai.ts`: `dubaiDay('2026-10-12T09:36:00.000Z')` is
  the day of `2026-10-12`, a Monday (`getUTCDay` 1); `2026-10-15` is a Thursday (4);
  `dubaiDayStart(day of 2026-10-13)` is `2026-10-12T20:00:00.000Z`; February has 28 days
  in 2027 and 29 in 2028; `Date.UTC(2027, 2, 0)` is 28; `dayOfDate('2027-03-31')` round
  trips. These are the arithmetic of D2.

Not checked: a live browser (the spec asks for no check by hand), and Node 22 and 24
(26.8.2 is the only Node here). No prototype of the design was built and the project's
build and test commands were not run; the block was reviewed by reading the code.

## Approach

`src/services/recurrence.ts` is new. It holds the rule as the app reads and writes it
(AC1), the date of the next instance (AC2), the one function that makes one instance and
places it (AC3), the periodic run over every due task (AC5), and the starter that
`src/server.ts` calls (AC7). It never reads the clock: `now` is an argument everywhere.

The marker of "has made a next instance" (AC6) is the instance's own rule: making the next
instance clears it, and the new instance carries it, so the series moves forward and an
instance can never make two. Deleting the newest instance therefore ends the series, and
AC5's "has a rule" is also "has never made one". No schema change is needed; the
`recurrence_rule` and `parent_task_id` columns have existed since 003.

Every route that marks a task done goes through `markDone` of
`src/services/task-actions.ts` (`POST /tasks/:id/done`, list, sheet and mini-bar, and
`POST /overdue/:id/done`). `markDone` gains one transaction: it writes the done row and
the next instance together (AC4). The next instance is placed by the existing
`placeTasks` / `storeSchedule` of `src/services/scheduler.ts` (009), on its own, from the
later of `now` and Dubai midnight of its next date.

The two pickers reuse the reads of the two forms. `readSheetEdit` gets the sheet's repeat
fields; `readDraftEdits` gets each review card's. Both call `repeatRule` of the new module
for the mapping of AC9, and both read the day boxes with a new `postedStrings` helper
beside `postedValue`. `DraftProblems` gains a `repeat` flag so a bad repeat refuses the
confirm of AC10, and each route's messages list gains its own repeat message last. The
views show the stored (or last posted) rule; the options and the day list come from
`app.locals.recurrence`.

## Decisions

**D1. The marker is the rule itself; there is no migration.** When a task makes its next
instance, `makeNextInstance` sets the task's `recurrence_rule` to `null` and copies the
rule onto the new instance. So an instance that has made its next one carries no rule,
AC5's "has a rule" and "has never made a next instance" are the same test, and the three
cases of AC6 each end with one instance: Done clears the rule, so the run finds none; the
run clears it, so a later Done finds none; a second run finds none. Deleting the newest
instance leaves the older one without a rule, so neither a Done nor a run makes another.
Rejected: an appended column or a marker in another column, which would change
`src/db/migrations.test.ts` (`toHaveLength(2)`) and `src/db/schema.test.ts` (the exact
column list) that AC11 keeps; and `parent_task_id` alone, which is cleared when the child
is deleted (`ON DELETE SET NULL`), so it cannot survive AC6's delete case.

**D2. The next date is counted in Dubai days, from `src/dubai.ts`.** `nextDay(rule, day,
notBefore)` returns the first day after `day` that fits the rule and is at least
`notBefore` (the Dubai day of `now`). Daily is `max(day + 1, notBefore)`. Weekly walks
forward to the first day whose weekday is one of the rule's (the instance's own weekday
when `BYDAY` is absent), then on by weeks until it is not before `notBefore`. Monthly
takes the instance's own day of the month, one month on and on, capped to that month's
last day, and starts the search at the month before `notBefore`'s so the loop runs once or
twice. The weekday of a day is `new Date(day * DAY_MS).getUTCDay()` and the calendar date
is `dateOfDay(day)`; the cap uses `new Date(Date.UTC(y, m + 1, 0)).getUTCDate()`, checked
above. Nothing calls `getHours`/`getDate`/`Intl`, so the process's zone cannot matter
(009 D2).

**D3. The four rule forms, read and written in one place.** `readRule(stored)` gives
`{ frequency, days }` for `FREQ=DAILY`, `FREQ=WEEKLY`, `FREQ=WEEKLY;BYDAY=<days>` and
`FREQ=MONTHLY`, and `null` for `null` and for anything else (a `BYDAY` list that is not
one of the seven, has a repeat, or is out of the order of AC1 included), so an unknown
value shows as "Does not repeat" and never makes an instance. `repeatRule(value, days)`
maps a posted picker to the stored string: `''`→`null`; `daily`/`monthly`→their form;
`weekly`+no day box→`FREQ=WEEKLY`; `weekly`+boxes→`FREQ=WEEKLY;BYDAY=` and the days in
the order of AC1, each once (a repeated box is dropped, per the reading above). A value
that is not one of the four, or a day that is not one of the seven, is `undefined`. A day
posted with anything but `weekly` is not looked at. `repeatOf` and `daysOf` are the
picker's view of a stored rule.

**D4. `makeNextInstance(db, task, now)` makes and places one instance, and clears the
rule.** It returns `undefined` for a task with no rule the module knows. Otherwise it
creates a `pending` task with `parent_task_id` the instance's id, `title`, `description`,
`category`, `image_path`, `estimated_minutes`, `priority`, `time_slot` and
`recurrence_rule` copied (AC3), and `source_id`, `confidence`, `started_at`,
`completed_at`, `actual_minutes` and `reminder_at` left null; it clears the instance's
rule; it places the new task with `storeSchedule(db, placeTasks(db, [instance], from))`,
`from` the later of `now` and `dubaiDayStart(next)`; and it returns the new task. A task
the scheduler cannot place is left `pending` with no times (AC3, 009 AC8). It opens no
transaction: the two callers wrap it. Checked arithmetic: a daily 30-minute task with no
slot, dated and done 12 Oct, lands at `2026-10-13T05:00:00.000Z` (the window starts at
09:00 Dubai and `from` is the 12th's 20:00Z); one dated 10 Oct and done at
`2026-10-12T09:36:00.000Z` lands at `2026-10-12T09:40:00.000Z`; the AC4 weekly groceries
(night, 40 min, end 16:40Z) lands at `2026-10-19T16:00:00.000Z`–`16:40Z`.

**D5. `markDone` opens one transaction.** Its early return for a `done` task and its
computation of `worked` are unchanged; the `updateTask` and a call to `makeNextInstance`
are wrapped in `inTransaction`. No caller of `markDone` is inside a transaction
(`confirmDrafts`, `rescheduleTask` and `saveTaskEdit` each open their own and none calls
`markDone`), so `inTransaction` cannot nest. A rule-less task takes the same writes as
before plus the read of its own (absent) rule. This is AC4's "either both are stored or
neither is"; a failing next-instance write rolls the Done back.

**D6. `runRecurrence(db, now)` is AC5.** It walks `listTasks(db)` in `id` order and takes
a task when its status is not `draft`, `readRule(task.recurrence_rule)` is not `null`, and
`task.scheduled_end` is set and before `now`. Each taken task is done in its own
`inTransaction`, and the ids of the created tasks are returned in that order. The old task
is left as it was but for its cleared rule; its times do not change.

**D7. `startRecurrence(db)` is AC7.** It calls `runRecurrence(db, new Date())` once, then
`setInterval` with `15 * MINUTE_MS`, and returns a function that calls `clearInterval`.
No `node-cron`: `setInterval` is enough and adds no dependency (`package.json` unchanged).
`src/server.ts` calls it once, right after `openDatabase`; `createApp` does not, so no app
test is affected.

**D8. The repeats and the weekdays are the module's fixed lists.** `repeats` is
`''`/`daily`/`weekly`/`monthly` with the labels of AC8; `weekdays` is `MO`..`SU` in that
order with `Mon`..`Sun`. `Repeat` and `Weekday` are their id types.

**D9. The starter is mocked in `src/server.test.ts`.** `beforeEach` adds
`vi.doMock('./services/recurrence.ts', () => ({ startRecurrence }))` with a
`const startRecurrence = vi.fn();` beside `openDatabase`, and `afterEach` adds
`vi.doUnmock('./services/recurrence.ts')`. One new test asserts `startRecurrence` was
called once with the object `openDatabase` returned (by identity). No existing assertion
changes: the mock replaces the real job, which cannot run on the stand-in database.

**D10. `postedStrings(body, name)` joins `postedValue` in `src/services/drafts.ts`.** It
returns the string values a posted name holds: one for a single value, each for a
repeated one, none when absent or when the value is not a string. The day boxes need it
(checked above); `postedValue` cannot serve, because it calls a repeated field `null`.
`recurrence.ts` does not read a body and so imports nothing from `drafts.ts`, while
`drafts.ts` and `task-actions.ts` import `repeatRule` from `recurrence.ts`; there is no
cycle.

**D11. The views get the lists as `app.locals.recurrence = { repeats, weekdays }`.** Set
in `src/app.ts` beside `app.locals.ui`. `src/ui.ts` is not changed: `src/ui.test.ts:48`
asserts the `ui` object exactly. No test reads the whole of `app.locals`.

**D12. The sheet picker: `SheetEdit` gains an optional rule, `readSheetEdit` reads it.**
`SheetEdit` gains `recurrence_rule?: string | null`, present only when the post carried a
`repeat`, so a post without one leaves the stored rule (AC9). `readSheetEdit` reads
`postedValue(body, 'repeat')`; when it is `undefined` no key is set; when it is `null`
(posted twice) or `repeatRule` gives `undefined`, `problems.repeat` is true and the edit
is `undefined`; otherwise the key is the rule. `SheetProblems` inherits `repeat` from
`DraftProblems`. `saveTaskEdit` writes the key like any other and its rescheduling check
stays minutes, priority and slot, so a rule change alone does not move the task (013 AC4).

**D13. The review picker: `DraftFieldName`, `DraftEdit` and `readDraftEdits` gain the
same.** `DraftFieldName` gains `'repeat'` and `'repeat-days'`, so `draftField` gives
`repeat-<id>` and `repeat-days-<id>` and `DraftCard.fields` holds both. `DraftEdit` gains
`recurrence_rule?: string | null`. `readDraftEdits` reads `repeat-<id>`: absent, no key;
posted twice or a bad value, `problems.repeat`; else the rule from `repeatRule` and
`postedStrings(body, draftField('repeat-days', draft.id))`. `DraftProblems` gains `repeat`
and `hasProblems` includes it, so a bad repeat refuses the confirm with 400 (AC10).

**D14. The pickers are drawn from the locals and reuse the existing classes.** In
`partials/task-sheet-body.ejs`, after the Time slot fieldset: a
`label.edit-form__label[for=sheet-repeat]` "Repeat", a
`select.field#sheet-repeat[name=repeat]` with the four options (the stored one selected),
and a `fieldset.choices` whose legend is "Repeat days" and whose seven
`input[type=checkbox][name=repeat-days]` values are `MO`..`SU`, each in a
`label.choice` with its label text, checked when the form's `days` hold it. In
`pages/review.ejs`, after the slot select of each card: a
`select.field[name=repeat-<id>][aria-label=Repeat]` with the four options, and a
`fieldset.choices` of the seven `input[type=checkbox][name=repeat-days-<id>]`. Both use
`recurrence.repeats` and `recurrence.weekdays`. No new class and no stylesheet rule, so
`public/css/base.css` is untouched. What each shows: on a GET the stored rule
(`repeatOf`/`daysOf`); after a refused post the posted value where the page has a control
for it, else the stored one, and the posted day boxes that are real — the 010 rule for a
shown field, extended to the two new controls (D16).

**D15. `formFields` skips an unchecked checkbox, and the four named lines change.**
`src/testing/dom.ts` gains one condition beside the radio one
(`if (type === 'checkbox' && !input.hasAttribute('checked')) continue;`) and its comment
names both. The named edits: `src/task-sheet.test.ts:161` gains `repeat: ''`;
`src/review-page.test.ts:432` gains `repeat-<id>: ''` for each of the three drafts; the
two `one(cardOf(…), 'select')` calls in `src/review-page.test.ts` (now `:378` and `:394`)
become `select[name^="slot-"]`; and `selectedSlots` at `src/add-rules.test.ts:118`
becomes `all(document, '[data-draft] select[name^="slot-"]')`, its assertion unchanged. No
other existing assertion changes: the exact-shape tests in `src/review-actions.test.ts`
(`:477`, `:503`) compare against a `fields` object read from the same new page, so their
extra `repeat-<id>` keys are on both sides.

**D16. The refusal messages, in order.** The sheet adds its own text
`Choose a repeat from the ones offered.` last, after the reminder's; the review adds
`Choose every repeat from the ones offered.` last. `messagesOf` of `src/routes/tasks.ts`
does not change (the 010 edit page has no repeat), so `sheetMessages` appends reminder
then repeat; `messagesOf` of `src/routes/review.ts` appends repeat. Both use
`problems.repeat`.

## Files

Created:

- `src/services/recurrence.ts`. Exports the lists `weekdays` and `repeats` (and the types
  `Weekday`, `Repeat`), the rule functions `readRule`, `repeatRule`, `repeatOf`, `daysOf`,
  the date function `nextDay`, the job `makeNextInstance`, `runRecurrence`,
  `startRecurrence`, and the type `Rule`. The whole file:

```ts
import type { Database } from '../db/database.ts';
import { createTask, listTasks, updateTask, type Task } from '../db/tasks.ts';
import { inTransaction } from '../db/transaction.ts';
import { DAY_MS, MINUTE_MS, dateOfDay, dayOfDate, dubaiDay, dubaiDayStart } from '../dubai.ts';
import { placeTasks, storeSchedule } from './scheduler.ts';

/*
 * Recurring tasks: the rule a task carries, the date of its next instance, and the job
 * that makes the instances. Nothing here reads the clock: a function that needs the time
 * is handed it.
 *
 * The rule lives in `recurrence_rule` (AC1). When an instance makes its next one its own
 * rule is cleared and the next instance carries it, so a task makes at most one next
 * instance and deleting the newest one ends the series (AC6).
 */

/** The days of the week, in the order a `BYDAY` list keeps them (AC1). */
export const weekdays = [
  { id: 'MO', label: 'Mon' },
  { id: 'TU', label: 'Tue' },
  { id: 'WE', label: 'Wed' },
  { id: 'TH', label: 'Thu' },
  { id: 'FR', label: 'Fri' },
  { id: 'SA', label: 'Sat' },
  { id: 'SU', label: 'Sun' },
] as const;

export type Weekday = (typeof weekdays)[number]['id'];

/** `getUTCDay` counts Sunday as 0; this is the same number for each day of `weekdays`. */
const DAY_INDEX: Record<Weekday, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };

/** What the Repeat picker offers: the value it posts and the text it shows (AC8). */
export const repeats = [
  { id: '', label: 'Does not repeat' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
] as const;

export type Repeat = (typeof repeats)[number]['id'];

/** A rule as this module reads it. `days` is set on a weekly rule with `BYDAY`, else `null`. */
export interface Rule {
  frequency: 'daily' | 'weekly' | 'monthly';
  days: readonly Weekday[] | null;
}

/** The day of the week of a Dubai day, as one of `weekdays`. */
function weekdayOf(day: number): Weekday {
  const index = new Date(day * DAY_MS).getUTCDay();
  const found = weekdays.find((item) => DAY_INDEX[item.id] === index);
  if (found === undefined) throw new Error(`No day of the week for ${index}`);
  return found.id;
}

/**
 * The rule a stored value holds, or `null` for `null` and for a value that is not one of
 * the forms of AC1 (`FREQ=YEARLY`, `FREQ=WEEKLY;BYDAY=TH,MO`): such a value is treated
 * like `null` everywhere.
 */
export function readRule(stored: string | null): Rule | null {
  if (stored === 'FREQ=DAILY') return { frequency: 'daily', days: null };
  if (stored === 'FREQ=WEEKLY') return { frequency: 'weekly', days: null };
  if (stored === 'FREQ=MONTHLY') return { frequency: 'monthly', days: null };
  if (stored === null || !stored.startsWith('FREQ=WEEKLY;BYDAY=')) return null;

  const days: Weekday[] = [];
  for (const text of stored.slice('FREQ=WEEKLY;BYDAY='.length).split(',')) {
    const index = weekdays.findIndex((item) => item.id === text);
    const previous = days.length === 0 ? -1 : weekdays.findIndex((item) => item.id === days[days.length - 1]);
    // One of the seven, in the order of AC1 and each once; anything else is no rule.
    if (index === -1 || index <= previous) return null;
    days.push(weekdays[index].id);
  }
  return days.length === 0 ? null : { frequency: 'weekly', days };
}

/**
 * The stored rule a posted `repeat` and its day boxes name (AC9), or `undefined` when the
 * repeat is not one of the four values or a day is not one of the seven. A day is kept
 * only for `weekly`; the days are put in the order of AC1 and each once.
 */
export function repeatRule(value: string, days: readonly string[]): string | null | undefined {
  if (value === '') return null;
  if (value === 'daily') return 'FREQ=DAILY';
  if (value === 'monthly') return 'FREQ=MONTHLY';
  if (value !== 'weekly') return undefined;
  if (days.some((day) => !weekdays.some((item) => item.id === day))) return undefined;

  const chosen = weekdays.filter((item) => days.includes(item.id)).map((item) => item.id);
  return chosen.length === 0 ? 'FREQ=WEEKLY' : `FREQ=WEEKLY;BYDAY=${chosen.join(',')}`;
}

/** The value the Repeat picker shows for a stored rule: `''`, `daily`, `weekly` or `monthly`. */
export function repeatOf(stored: string | null): Repeat {
  const rule = readRule(stored);
  return rule === null ? '' : rule.frequency;
}

/** The days the picker shows checked for a stored rule, in the order of AC1. */
export function daysOf(stored: string | null): Weekday[] {
  const rule = readRule(stored);
  return rule === null || rule.days === null ? [] : [...rule.days];
}

/** The day after `from` whose weekday is one of `days`, then on by weeks until it is not before `notBefore`. */
function nextWeeklyDay(days: readonly Weekday[], from: number, notBefore: number): number {
  let candidate = from + 1;
  while (!days.includes(weekdayOf(candidate))) candidate += 1;
  while (candidate < notBefore) candidate += 7;
  return candidate;
}

/** The same day of a later month as `day`, capped to the month's last day, not before `notBefore`. */
function nextMonthlyDay(day: number, notBefore: number): number {
  const [year, month, dayOfMonth] = dateOfDay(day).split('-').map(Number);
  const [nowYear, nowMonth] = dateOfDay(notBefore).split('-').map(Number);
  // Begin at the month before the one `notBefore` is in, so the answer is one of the next
  // two months and the loop always ends.
  const first = Math.max(1, (nowYear - year) * 12 + (nowMonth - month) - 1);
  for (let ahead = first; ; ahead += 1) {
    const months = month - 1 + ahead;
    const laterYear = year + Math.floor(months / 12);
    const laterMonth = months % 12;
    const last = new Date(Date.UTC(laterYear, laterMonth + 1, 0)).getUTCDate();
    const text = `${String(laterYear).padStart(4, '0')}-${String(laterMonth + 1).padStart(2, '0')}-${String(Math.min(dayOfMonth, last)).padStart(2, '0')}`;
    const candidate = dayOfDate(text);
    if (candidate !== undefined && candidate >= notBefore) return candidate;
  }
}

/**
 * The Dubai day of the next instance (AC2): the first day after `day` that fits the rule
 * and is not before `notBefore`, the Dubai day of `now`. `day` is the Dubai day of the
 * instance's `scheduled_start`, or of `now` when it has none.
 */
export function nextDay(rule: Rule, day: number, notBefore: number): number {
  if (rule.frequency === 'daily') return Math.max(day + 1, notBefore);
  if (rule.frequency === 'monthly') return nextMonthlyDay(day, notBefore);
  return nextWeeklyDay(rule.days ?? [weekdayOf(day)], day, notBefore);
}

/**
 * Creates the next instance of one task (AC3), places it (AC3), and clears the task's
 * rule so it never makes another (AC6). Returns the new task, or `undefined` when the
 * task carries no rule this module knows. Opens no transaction: the caller wraps it.
 */
export function makeNextInstance(db: Database, task: Task, now: Date): Task | undefined {
  const rule = readRule(task.recurrence_rule);
  if (rule === null) return undefined;

  const today = dubaiDay(now.getTime());
  const day = task.scheduled_start === null ? today : dubaiDay(Date.parse(task.scheduled_start));
  const next = nextDay(rule, day, today);

  const instance = createTask(db, {
    title: task.title,
    description: task.description,
    category: task.category,
    image_path: task.image_path,
    estimated_minutes: task.estimated_minutes,
    priority: task.priority,
    time_slot: task.time_slot,
    recurrence_rule: task.recurrence_rule,
    parent_task_id: task.id,
    status: 'pending',
  });
  updateTask(db, task.id, { recurrence_rule: null });

  // Its own day's midnight is the earliest it may start; the scheduler places it on its own.
  storeSchedule(db, placeTasks(db, [instance], new Date(Math.max(now.getTime(), dubaiDayStart(next)))));
  return instance;
}

/**
 * Creates the next instance of every task whose status is not `draft`, that carries a
 * rule, and whose `scheduled_end` is before `now` (AC5). A task that has made a next
 * instance carries no rule, so no task is made twice (AC6). Handles the tasks in `id`
 * order, one transaction each, and returns the ids of the tasks it created.
 */
export function runRecurrence(db: Database, now: Date): number[] {
  const created: number[] = [];
  for (const task of listTasks(db)) {
    if (task.status === 'draft') continue;
    if (readRule(task.recurrence_rule) === null) continue;
    if (task.scheduled_end === null || Date.parse(task.scheduled_end) >= now.getTime()) continue;

    inTransaction(db, () => {
      const instance = makeNextInstance(db, task, now);
      if (instance !== undefined) created.push(instance.id);
    });
  }
  return created;
}

/** How often the starter runs the periodic run. */
const EVERY_MS = 15 * MINUTE_MS;

/**
 * Runs the periodic run once at the time it is called, and again every 15 minutes (AC7).
 * Returns a function that stops it. `src/server.ts` calls it once after it opens the
 * database; `createApp` does not, so the app's tests are not affected.
 */
export function startRecurrence(db: Database): () => void {
  const run = (): void => {
    runRecurrence(db, new Date());
  };
  run();
  const timer = setInterval(run, EVERY_MS);
  return () => clearInterval(timer);
}
```

- Tests (see `plan.md`): `src/services/recurrence.test.ts`, `src/recurrence-done.test.ts`,
  `src/recurrence-sheet.test.ts`, `src/recurrence-review.test.ts`.

Changed:

- `src/services/drafts.ts`:
  - the import line `import { repeatRule } from './recurrence.ts';` after the import of
    `./scheduler.ts`.
  - `DraftFieldName` becomes `'title' | 'minutes' | 'priority' | 'slot' | 'repeat' | 'repeat-days'`.
  - after `postedValue`, add `postedStrings`:

```ts
/**
 * The string values a posted form has for a field: one for a single value, each for a
 * repeated one, and none when it was not posted. `body` is whatever the request carried.
 */
export function postedStrings(body: unknown, name: string): string[] {
  if (typeof body !== 'object' || body === null || !Object.hasOwn(body, name)) return [];
  const value: unknown = (body as Record<string, unknown>)[name];
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
```
  - `DraftEdit` gains `recurrence_rule?: string | null;` with the doc comment "The rule,
    or `null` for `Does not repeat`.".
  - `DraftProblems` gains `/** A repeat or a day box that is not one of the ones offered. */ repeat: boolean;`.
  - in `readDraftEdits`, the problems literal becomes
    `{ title: false, minutes: false, choice: false, repeat: false }`, and after the slot
    block of the loop:

```ts
    const repeat = postedValue(body, draftField('repeat', draft.id));
    if (repeat !== undefined) {
      const read = repeat === null ? undefined : repeatRule(repeat, postedStrings(body, draftField('repeat-days', draft.id)));
      if (read !== undefined) edit.recurrence_rule = read;
      else problems.repeat = true;
    }
```
  - `hasProblems` becomes `problems.title || problems.minutes || problems.choice || problems.repeat`.

- `src/services/task-actions.ts`:
  - the drafts import gains `postedStrings`; a new line
    `import { makeNextInstance, repeatRule } from './recurrence.ts';` after the
    `./overdue.ts` import.
  - `SheetEdit` gains `recurrence_rule?: string | null;`.
  - `readSheetEdit` as in D12:

```ts
export function readSheetEdit(body: unknown): SheetEditReading {
  const base = readTaskEdit(body);
  const reminderText = optionalText(body, 'reminder');
  const reminder = reminderText === '' ? null : instantOfDateTime(reminderText);

  const postedRepeat = postedValue(body, 'repeat');
  // `false` is a repeat that is not one of the four values, or a day that is not one of the seven.
  let rule: string | null | false | undefined = undefined;
  if (postedRepeat !== undefined) {
    const read = postedRepeat === null ? undefined : repeatRule(postedRepeat, postedStrings(body, 'repeat-days'));
    rule = read === undefined ? false : read;
  }

  const problems: SheetProblems = { ...base.problems, reminder: reminder === undefined, repeat: rule === false };
  if (base.edit === undefined || reminder === undefined || rule === false) return { edit: undefined, problems };

  const category = optionalText(body, 'category');
  const description = optionalText(body, 'description');
  const edit: SheetEdit = {
    ...base.edit,
    category: category === '' ? null : category,
    description: description === '' ? null : description,
    reminder_at: reminder === null ? null : reminder.toISOString(),
  };
  if (rule !== undefined) edit.recurrence_rule = rule;
  return { edit, problems };
}
```
  - `markDone` as in D5:

```ts
export function markDone(db: Database, task: Task, now: Date): void {
  if (task.status === 'done') return;
  const worked =
    task.status === 'in_progress' && task.started_at !== null
      ? { actual_minutes: workedMinutes(task.started_at, now) }
      : {};
  inTransaction(db, () => {
    updateTask(db, task.id, { status: 'done', completed_at: now.toISOString(), ...worked });
    makeNextInstance(db, task, now);
  });
}
```
  - `readTaskEdit`'s problems literal gains `repeat: false,`. Its doc comment and every
    other function are unchanged.

- `src/routes/tasks.ts`:
  - imports gain `postedStrings` from `../services/drafts.ts`, and
    `daysOf, repeatOf, repeats, weekdays, type Repeat, type Weekday` from
    `../services/recurrence.ts`.
  - `const BAD_REPEAT = 'Choose a repeat from the ones offered.';` after `BAD_REMINDER`.
  - `SheetForm` gains `repeat: Repeat; days: Weekday[];`.
  - `sheetMessages` gains, after the reminder line, `if (problems.repeat) messages.push(BAD_REPEAT);`.
  - after `shownOptional`:

```ts
/** The Repeat picker of the sheet: the matching option, and the day boxes. As posted where the post has them, else as stored. */
function shownRepeat(stored: string | null, body: unknown): { repeat: Repeat; days: Weekday[] } {
  const repeat = repeatOf(stored);
  if (body === undefined) return { repeat, days: daysOf(stored) };

  const posted = postedValue(body, 'repeat');
  const postedDays = postedStrings(body, 'repeat-days');
  return {
    repeat: repeats.find((item) => item.id === posted)?.id ?? repeat,
    days: weekdays.filter((item) => postedDays.includes(item.id)).map((item) => item.id),
  };
}
```
  - `renderSheet`'s `form` spreads `...shownRepeat(task.recurrence_rule, body),` after
    `...shownEdit(task, body),`.

- `src/routes/review.ts`:
  - imports gain `postedStrings` from `../services/drafts.ts`, and
    `daysOf, repeatOf, repeats, weekdays, type Repeat, type Weekday` from
    `../services/recurrence.ts`.
  - `const BAD_REPEAT = 'Choose every repeat from the ones offered.';` after `BAD_CHOICE`.
  - `DraftCard` gains `repeat: Repeat; days: Weekday[];`.
  - `cardOf`'s `fields` gains `repeat: draftField('repeat', draft.id)` and
    `'repeat-days': draftField('repeat-days', draft.id)`, and its returned object gains,
    after `slot`:

```ts
    repeat: repeats.find((item) => item.id === postedValue(body, fields.repeat))?.id ?? repeatOf(draft.recurrence_rule),
    days:
      body === undefined
        ? daysOf(draft.recurrence_rule)
        : weekdays
            .filter((item) => postedStrings(body, fields['repeat-days']).includes(item.id))
            .map((item) => item.id),
```
  - `messagesOf` gains `if (problems.repeat) messages.push(BAD_REPEAT);` after `choice`.

- `src/views/partials/task-sheet-body.ejs`, after the Time slot fieldset (D14):

```ejs
  <label class="edit-form__label" for="sheet-repeat">Repeat</label>
  <select class="field" id="sheet-repeat" name="repeat">
<% for (const item of recurrence.repeats) { -%>
    <option value="<%= item.id %>"<% if (sheet.form.repeat === item.id) { %> selected<% } %>><%= item.label %></option>
<% } -%>
  </select>
  <fieldset class="choices">
    <legend class="edit-form__label">Repeat days</legend>
<% for (const day of recurrence.weekdays) { -%>
    <label class="choice">
      <input type="checkbox" name="repeat-days" value="<%= day.id %>"<% if (sheet.form.days.includes(day.id)) { %> checked<% } %>>
      <span><%= day.label %></span>
    </label>
<% } -%>
  </fieldset>
```

- `src/views/pages/review.ejs`, after the slot `</select>` of each card (D14):

```ejs
      <select class="field" name="<%= card.fields.repeat %>" aria-label="Repeat">
<% for (const item of recurrence.repeats) { -%>
        <option value="<%= item.id %>"<% if (card.repeat === item.id) { %> selected<% } %>><%= item.label %></option>
<% } -%>
      </select>
      <fieldset class="choices">
        <legend class="visually-hidden">Repeat days</legend>
<% for (const day of recurrence.weekdays) { -%>
        <label class="choice">
          <input type="checkbox" name="<%= card.fields['repeat-days'] %>" value="<%= day.id %>"<% if (card.days.includes(day.id)) { %> checked<% } %>>
          <span><%= day.label %></span>
        </label>
<% } -%>
      </fieldset>
```
  Its header comment sentence about `cards` gains "and its repeat picker".

- `src/app.ts`: imports gain `import { repeats, weekdays } from './services/recurrence.ts';`
  (after `./render.ts`), and after `app.locals.ui = ui;`:
  `app.locals.recurrence = { repeats, weekdays };`.

- `src/testing/dom.ts`: `formFields` gains the checkbox condition of D15 and its comment
  becomes "…every named input with its `value` attribute, except a radio or a checkbox
  that is not checked, and every named select…".

- `src/server.ts`: imports gain
  `import { startRecurrence } from './services/recurrence.ts';` (after `./services/analyzer.ts`),
  and after `const db = openDatabase(getDatabasePath());`:

```ts
// The recurring job: once now and every 15 minutes. The process ending stops it.
startRecurrence(db);
```

- `src/server.test.ts`: `const startRecurrence = vi.fn();` beside `openDatabase`;
  `vi.doMock('./services/recurrence.ts', () => ({ startRecurrence }));` in `beforeEach`;
  `vi.doUnmock('./services/recurrence.ts');` in `afterEach`; and one new test (D9).

- `src/task-sheet.test.ts:161`, `src/review-page.test.ts:432`, the two
  `one(cardOf(…), 'select')` calls, and `selectedSlots` of `src/add-rules.test.ts`: D15.

Not touched:

- `src/db/`: no migration, no schema, no column, no helper. `src/db/migrations.test.ts`
  (`toHaveLength(2)`) and `src/db/schema.test.ts` (the column list) stand. `createTask`,
  `updateTask`, `deleteTask`, `listTasks`, `getTask` and `inTransaction` are used as they
  are; `recurrence_rule` and `parent_task_id` exist since 003.
- `src/services/scheduler.ts`, `src/dubai.ts`: `placeTasks`/`storeSchedule` and the Dubai
  day helpers are reused. `nextDay` is in `recurrence.ts`, not in `src/dubai.ts`.
- `src/routes/overdue.ts`: it already calls `markDone`, which now makes the next instance;
  nothing of the route changes.
- `src/views/pages/task-edit.ejs`, `src/routes/tasks.ts`'s edit-page handlers,
  `src/services/task-actions.ts`'s `readTaskEdit` (beyond `repeat: false`),
  `src/tasks-edit.test.ts`: the 010 edit page gets no picker (spec, out of scope).
- `src/ui.ts`: `repeats` and `weekdays` are not added (D11).
- `public/css/base.css` and `src/views/pages/styleguide.ejs`: the pickers reuse
  `field`, `choices`, `choice`, `edit-form__label`; no component is added.
- `package.json`, `yarn.lock`: no `node-cron`, no package (D7).
- `src/render.ts`, `src/views/layout.ejs`, `src/index.ts` or any other page: the locals
  reach the views without them.
- Every other existing `*.test.ts` file: `src/review-actions.test.ts`,
  `src/review-schedule.test.ts`, `src/add-text.test.ts`, `src/add-rules.test.ts` (but its
  `selectedSlots`) and the rest pass unedited.
- `docs/` unless the builder logs an error; everything under `factory/` but this job's
  `build.md`; `data/`.

## Risks

Each with the test or decision that catches it.

- **A task makes two next instances.** D1: the marker is the cleared rule.
  `src/services/recurrence.test.ts` has AC6's three cases and the delete case.
- **Deleting the newest instance does not end the series.** D1.
  `src/services/recurrence.test.ts`, "makes none after the newest is deleted".
- **`markDone` writes the Done but not the next instance, or the other way.** D5 wraps
  both. `src/recurrence-done.test.ts` compares the whole rows of both tasks.
- **`markDone` writes a rule-less task differently, or nests a transaction.** D5;
  `src/task-start-done.test.ts` and `src/tasks-actions.test.ts` compare whole rows and
  keep passing.
- **The next date is off by a day, a week or a month, or is "not before now" is
  forgotten.** D2; `src/services/recurrence.test.ts` has every example of AC2.
- **The monthly cap or the month arithmetic reads the process's zone.** D2 uses
  `Date.UTC` and `dateOfDay`; the AC2 monthly cases fail for a local-time month.
- **The next instance copies or clears the wrong fields.** D4 lists them;
  `src/services/recurrence.test.ts`, "copies these fields and leaves those null".
- **The next instance is placed from `now` alone, or not placed at all.** D4;
  AC3's two placement timestamps.
- **An unplaceable next instance is not created.** D4; AC3's "cannot be placed" test.
- **The run picks a draft, or an instance with no rule, or one whose end has not
  passed.** D6; AC5's two calls and an extra draft in the database.
- **The run changes the old task's times, or writes more than one instance for a task.**
  D6; AC5 compares the old row and AC6 the count.
- **The starter does not run at once, does not repeat, or ignores its stop.** D7;
  AC7's three assertions.
- **`src/server.ts` calls the starter on a stand-in database, and the app tests throw at
  import.** D9; `src/server.test.ts`.
- **`express.urlencoded` gives the day boxes as a string, not an array, and a single day
  is lost.** D10; checked above, and AC9's single-day case.
- **`postedValue` is used for the day boxes and calls two of them `null`.** D10.
- **A bad repeat is stored, or a bad repeat does not refuse the post.** D12, D13;
  AC9 and AC10 refusal tests.
- **A post without `repeat` clears the stored rule.** D12; AC9's "keeps the stored rule".
- **The repeat message is not last, or is shown twice.** D16; the AC9/AC10 tests compare
  the message list.
- **The picker does not show the stored rule, or shows the posted rule after a refusal.**
  D14; the AC8 and AC10 "shows" tests.
- **A new select breaks the exact-shape tests or the slot-select finder.** D15; the four
  named edits and the helper, and the review-actions tests that read their own `fields`.
- **`formFields` skipping a checkbox changes another form.** No other page has a
  checkbox; D15.
- **`app.locals.recurrence` is expected to be part of `ui`.** D11; `src/ui.test.ts:48`
  stays exact.
- **A test posts `formFields` for a form with two day boxes and loses one.** `formFields`
  returns one string per name; the picker tests read the DOM and post the days as an
  array (checked above), and the exact-shape tests have no box checked.
- **Test files run in a loop run out of ports**
  (`docs/errors/repeated-test-runs-run-out-of-ports.md`). The route test files use
  supertest; the plan runs each check once.
- **A reporter writes into the repo**
  (`docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md`). The plan uses the
  default reporter only.
- **`src/server.test.ts` hangs on the starter.** It is mocked (D9); no timer is made.
