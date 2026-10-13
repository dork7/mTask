# 009-scheduler: design

The spec can be built as written. It leaves five things open or unsaid, and each is
settled under Decisions:

- AC7, "in the order of AC4 and then of their old start". AC4's own order ends in the
  `id`, which no two tasks share, so read word for word the old start could never decide
  anything. The reading: the bumped tasks are placed again by priority, then by their old
  start, then by `id` (D8).
- AC5 with AC2. A window of `slot_rules` can reach outside `working_hours` once either
  setting is changed. The reading: the window is cut to the working hours, and "longer
  than its window" means longer than what is left of it (D6).
- AC7 with AC8. An urgent task can land on a pending task that cannot be placed again: it
  has no `estimated_minutes`, or more than the working day holds. The spec does not say
  what happens to it. The reading: it is not bumped and keeps its times (D8).
- AC1, the database or the data. The function is handed the database. It writes nothing;
  a second function stores what it returns (D1).
- AC10, the clock. The routes read `new Date()` once per request, the faked `Date` of the
  existing tests. `createApp` and `AppDeps` do not change (D12).

Everything marked "checked" below was run in a throwaway copy of the repo under
`$TMPDIR`, with the repo's own `node_modules`, `tsconfig.json` and Vitest config: Node
26.8.2, yarn 1.22.22, TypeScript 5.9.3, Vitest 5.0.1, Express 5.3.0, supertest 7.3.1,
jsdom 30.1.1. The design was built there once as a prototype: the two new modules, the
changes to the drafts service, the route, the view and the stylesheet, the five edited
tests and the three new test files. `yarn build` was clean and `yarn test` passed with
`ANTHROPIC_API_KEY` unset: 41 files, 1469 tests, which are the 1331 of before and the
138 of `plan.md`. The scheduler was also run in plain Node, started with `TZ` set to
`America/New_York`, `Pacific/Kiritimati`, `UTC` and `Asia/Dubai`: the same times and
labels all four times. The review page of the prototype was looked at in headless Chrome
154, at 375px and at 1000px, in both themes. The copy is deleted.

Fifty-one ways of breaking that code were tried, one at a time, and each made tests of
`plan.md` fail; Risks names them. On the way there the design changed twice for what
the breaking showed. A wrong overlap test, and a mark rounded down, made the search loop
for ever and hung the test run (D7). Two conditions in the bump step could be removed
with every test still green, so one was dropped and the other got a test of its own
(D8).

This machine's own time zone is Asia/Dubai. A scheduler that read the hours on the
clock of the process would pass every test here that does not change `TZ`. The tests
that do are in `plan.md` (AC1), and they failed for such a scheduler (checked).

Not checked: Node 22 and 24 (26.8.2 is the only Node on this machine).

## Approach

The job has four parts.

**The clock.** `src/dubai.ts` is new. Dubai is four hours ahead of UTC all year, so the
user's clock is arithmetic on UTC milliseconds: which Dubai day an instant is in, when a
Dubai day starts, the minutes after midnight of an `HH:MM` setting, and the text
`Today 8:00 PM` for an instant. It asks the system for nothing, neither the time nor the
time zone. The scheduler and the review route both use it.

**The scheduler.** `src/services/scheduler.ts` is new. `placeTasks(db, tasks, now)` reads
the two settings and the tasks that take time, finds a time for each task it was handed,
and returns a `Schedule`: the tasks it placed, the tasks an urgent one moved, and the ids
it could not place. It writes nothing and never reads the clock. `storeSchedule(db,
schedule)` writes the two columns of the placed and the moved tasks.

**The confirm.** `confirmDrafts` in `src/services/drafts.ts` gains the time of the
request. In its one transaction it makes the drafts `pending` with their edits, as
before, hands the rows it just stored to `placeTasks`, and stores the schedule. A
failure anywhere undoes all of it.

**The preview.** `renderReview` in `src/routes/review.ts` gains the time of the request
and calls `placeTasks` with the stored drafts of the source. Each card gets a text,
`land`, and `pages/review.ejs` shows it in an element with the mockup's class. Because
the preview and the confirm call the same function with the same rows at the same time,
a confirm of the form as served stores what the cards showed.

## Decisions

**D1. The scheduler is handed the database, and placing and storing are two functions.**

```ts
export function placeTasks(db: Database, tasks: readonly SchedulableTask[], now: Date): Schedule
export function storeSchedule(db: Database, schedule: Schedule): void
```

`placeTasks` is "the function that places tasks" of AC1. It only reads. The preview
needs exactly that (AC12), and the confirm calls `storeSchedule` with the result (AC10).
`storeSchedule` opens no transaction, because `inTransaction` cannot be nested (006 D4):
the caller wraps it.

It is handed the database, not the settings and the tasks, because it has two callers
and both would otherwise repeat the same three reads, and because the confirm has to
read the tasks that take time inside its own transaction. The settings are read at
every call (AC9). Rejected: a pure function in the way of 008 D3, with a reader beside
it; `applyRules` had one caller, this has two. Rejected: one function with a `store`
flag, which would make the preview one wrong argument away from writing.

`now` is a `Date`. The function uses `now.getTime()` and nothing else of it. It contains
no `new Date()` without an argument and no `Date.now()`. `storeSchedule` goes through
`updateTask`, which sets `updated_at` from the clock as it does for every write; that is
the database helper's clock, not the scheduler's.

The whole file is under Files.

**D2. The Dubai clock is a fixed offset of four hours, in `src/dubai.ts`.** Asia/Dubai
has no daylight saving and the spec fixes the zone (Out of scope: a time zone setting).
So:

- the Dubai day of an instant is `Math.floor((at + 4 h) / 24 h)`, a whole number that
  grows by one at every Dubai midnight;
- that day starts at `day * 24 h - 4 h`;
- an `HH:MM` value is `hours * 60 + minutes` minutes after that start.

Nothing calls `getHours`, `getDate`, `new Date(year, month, day)` or `Intl`, so the `TZ`
of the process cannot matter (AC1). Checked: the tests of AC1 set `process.env.TZ` to
`America/New_York`, `Pacific/Kiritimati` and `UTC` at run time and get the same times;
with the day start computed from `new Date(year, month, day)` they fail, and with the
label's hour read by `getHours()` the label tests fail.

Rejected: `Intl.DateTimeFormat` with `timeZone: 'Asia/Dubai'`. Its text is whatever
the locale data of the Node build gives, where AC11 fixes the text to the character.
Checked on Node 26.8.2 it gives `9:00 AM` with a plain space, but the label would be
only as stable as that data, and the scheduler needs the day arithmetic anyway.

The module is at `src/` beside `src/ui.ts`, not in `src/services/`, because a route
uses it too and the later pages that show a time (010, 012, 020, 021) will. The whole
file is under Files.

**D3. A start is on a mark: a multiple of five minutes of UTC.** The offset of D2 is a
whole number of five-minute steps, so the marks of the Dubai clock are the instants
whose UTC milliseconds divide by 300000. `nextMark(at)` is
`Math.ceil(at / STEP_MS) * STEP_MS`: `09:36:00.000Z` gives `09:40`, `09:40:00.000Z`
gives itself, `09:40:00.001Z` gives `09:45` (AC2). The lower bound of every search goes
through it, and so does the end of a task that stands in the way, so a task after one
that ends at 2:02 PM starts at 2:05 PM.

**D4. Time is taken by the `pending` and `in_progress` tasks that have both columns,
except the tasks handed in.** They are read with the existing helper, twice:
`listTasks(db, { status: 'pending' })` and `listTasks(db, { status: 'in_progress' })`,
and filtered in code. No helper is added to `src/db/tasks.ts` and no SQL is written
outside `src/db/` (003). `draft` and `done` tasks are never read (AC3).

A task that is handed in is left out of this list by its `id`. The confirm hands in
rows that are `pending` already and have no time, so there it changes nothing. It makes
the function mean one thing for any caller: a time that a task being placed already has
is ignored, and the task cannot stand in its own way. AC3 only says what happens to the
tasks that are not being placed.

**D5. The order of placing is priority, then `id`.**
`RANK = { urgent: 0, high: 1, medium: 2, low: 3 }`, and a task without a priority has
the rank of `low` (AC4). The list handed in is copied before it is sorted. Each placed
task is added to the list of D4 before the next is placed, so no two overlap.

**D6. The window of a task, in this order.** `windowOf(task, hours, rules)`:

| # | Condition | Window |
|---|---|---|
| 1 | no `estimated_minutes`, not above 0, or more than the working hours hold | none: the task cannot be placed (D9) |
| 2 | `priority` is `urgent`, or `time_slot` is `null` | the working hours |
| 3 | no rule in `slot_rules` has this `time_slot` | the working hours |
| 4 | the first such rule's `start` to `end`, cut to the working hours, holds the task | that window |
| 5 | otherwise | the working hours |

Row 4 is the reading named at the top: the window is from the later of the two starts to
the earlier of the two ends, so a placed task is inside its window (AC5) and inside the
working hours (AC2) at once. With the seeded settings the cut changes nothing. Without
it, working hours of 10:00 to 18:00 and a `night` task would have no start that meets
both criteria on any day. Row 5 then covers a window that lies outside the hours as
well: its length is below zero. Rows 3 and 5 are AC5's last sentence.

The rule is found by `time_slot`, not by the task's category: a user can give a task
any slot on the review page (AC5: "the first rule in `slot_rules` whose `time_slot` is
the task's").

**D7. The search goes day by day, ends on the day after the last task in its way, and
always moves on.** `findStart(from, minutes, window, blockers)` starts on the Dubai day
of `from` (AC6: at 2:00 AM that is the day that has just begun). On each day the first
candidate is `nextMark` of the later of `from` and the window's start. While the task
still ends inside the window: if no blocker overlaps the candidate, that is the start;
otherwise the next candidate is `nextMark` of that blocker's end, and at least five
minutes later. A blocker overlaps when it starts before the candidate's end and ends
after its start, so a task may start at the instant another ends (AC3).

The last day searched is the day after the latest end among the blockers. That day is
free, and D6 has made sure the window holds the task, so a start is always found for
settings that are on the marks. The loop has an end for any data. Rejected:
`for (day = first; ; day += 1)`; a working-hours value that parses to `NaN` (out of
scope, but a typo away) would spin a request for ever.

"At least five minutes later" is `Math.max(nextMark(blocker.end), start + STEP_MS)`.
With a correct overlap test the first is always the larger. It is there because of what
was seen in the prototype: with the overlap test changed to count touching tasks, the
candidate never moved, the loop never ended, and `vitest run` hung until it was killed.
Vitest cannot stop a synchronous loop
(`docs/errors/spawnsync-without-timeout-hangs-suite.md` is the same trap). With the
`Math.max` the same mistake fails 43 tests in a second (checked).

**D8. An urgent task: what keeps it out, what it bumps, and how the bumped are placed
again.**

1. It is placed with the working hours as its window (D6, row 2) and with only these
   in its way: the tasks of D4 that are `in_progress`, and those whose priority is
   `urgent`, whatever their status. The urgent tasks placed earlier in the same call
   are among them.
2. Whatever in the list of D4 now overlaps it is bumped, unless D6 gives it no window.
   By step 1 these can only be `pending` tasks of a lower priority, so no status and no
   priority is tested here. A task with no priority is one of them.
3. The bumped tasks all give up their times, and are then placed again one at a time,
   in the order priority, old start, `id`. Each is placed as any task is (D6, D7), with
   everything in the list of D4 in its way, and with the end of the urgent task in
   place of `now`. A task with a slot goes back into its slot's window, on a later day
   if it must.
4. Then the next task of the call is placed. A second urgent task can move a task the
   first one moved; `moved` holds its last time.

The order in step 3 is the reading named at the top. With `id` before the old start,
two bumped tasks of one priority would swap places whenever the later one has the lower
`id`. They give up their times together because a bumped task that runs past the end of
the urgent one would otherwise push the bumped task before it further than needed
(checked: the test "lets no bumped task stand in the way of another").

"Unless D6 gives it no window" is the third reading. Such a task got its time by hand:
the scheduler never places one. It keeps its times, and it stays in the list of D4, so
the other bumped tasks are placed around it. The urgent task then overlaps it; the
timeline (012) shows that as the conflict it is. Rejected: clearing its times, which
throws away what the user set. Rejected: placing it again with the length it has on
the timeline; AC2 ties the length to `estimated_minutes`.

Nothing but an urgent task reaches these steps (AC7: "nothing but an urgent task
bumps").

In the prototype the bump step first also tested `status` and `priority`, and put a
task back when it could not be placed again. Removing the first changed no result, by
step 1. The second was the same as leaving the task out in step 2, except that for a
moment it stood in nobody's way; step 2 as written above has a test that fails
otherwise.

**D9. A task that cannot be placed is reported, never thrown.** That is row 1 of D6: no
`estimated_minutes`, or more than the working hours hold (AC8). Its id goes into
`unplaced`, nothing is written for it, and the call goes on. For an urgent task nothing
is bumped. "Not above 0" is not in the spec: the form and the analyzer allow 1 to 1440,
so only a row written by hand can hold 0 or less, and an interval without length would
overlap nothing.

**D10. The settings.** `working_hours` is read with `getSetting`. When the row is
missing the function throws `new Error('The working_hours setting is missing')`: the
spec leaves that case unhandled, and the type of `getSetting` forces a choice between a
message and a `TypeError`. `slot_rules` is read with `readSlotRules` of 008, which gives
an empty list for a missing row; then no task has a window (D6, row 3). Neither value is
checked for its shape (Out of scope).

With no task handed in, the function returns before it reads anything. So a page
without drafts and a confirm on a source without drafts never read a setting.

**D11. The result.**

```ts
export type SchedulableTask = Pick<Task, 'id' | 'priority' | 'time_slot' | 'estimated_minutes'>;

export interface Placement {
  id: number;
  scheduled_start: string;
  scheduled_end: string;
}

export interface Schedule {
  placed: Placement[];
  moved: Placement[];
  unplaced: number[];
}
```

`placed` and `unplaced` are in the order the tasks were handed in; `moved` is in `id`
order, one entry per task. Every task handed in is in exactly one of `placed` and
`unplaced`. The two timestamps are `new Date(ms).toISOString()`, the format of
`src/db/timestamps.ts` (AC1), and `scheduled_end` is the start plus
`estimated_minutes` (AC2). The names are the column names, so `storeSchedule` passes
them to `updateTask` as they are. It writes `placed` and then `moved`, two columns each,
and nothing for `unplaced`.

**D12. The routes read the clock with `new Date()`, once per request.** In the `GET`
handler: `renderReview(res, deps.db, source, new Date())`. In the confirm handler:
`const now = new Date();` right after the source is found, and that one value goes to
`renderReview` on a 400 and to `confirmDrafts` otherwise. The remove, discard and
analyze handlers read no time: they do not schedule and they redirect.

The existing tests fake `Date` only (`vi.useFakeTimers({ toFake: ['Date'] })`), and
that already reaches a handler behind supertest. Rejected: a clock in `AppDeps`. It
would change `createApp`, `src/server.ts`, `src/testing/app.ts` and the tests that
compare what `createApp` is called with, and AC13 allows no existing test to change but
those of `src/review-actions.test.ts`.

**D13. `confirmDrafts` gains `now` and schedules inside its transaction.**

```ts
export function confirmDrafts(db: Database, drafts: readonly Task[], edits: DraftEdits, now: Date): void {
  inTransaction(db, () => {
    const confirmed: Task[] = [];
    for (const draft of drafts) {
      const task = updateTask(db, draft.id, { ...edits.byTask.get(draft.id), status: 'pending' });
      if (task !== undefined) confirmed.push(task);
    }
    storeSchedule(db, placeTasks(db, confirmed, now));
  });
}
```

`updateTask` returns the row as it is stored, so the scheduler gets "the values it
stores" (AC10) without the edits being merged a second time. All drafts go into one
call. A draft that cannot be placed is `pending` already when the scheduler reports it,
and has no times, because a draft never had any (AC10, AC8). A task of another source
that is moved gets its two columns and `updated_at` written, and nothing else.

A placed draft is written twice in the transaction, once for its status and once for
its times. Rejected: one write per draft, with the times merged into the first; the
confirm would then hold a second copy of how a schedule is stored.

Checked: with a trigger that refuses the update of the task that would be moved, the
confirm answers 500 and every row is as it was, the drafts included. With the schedule
stored after the transaction instead of in it, that test fails.

**D14. The preview is one call with the stored drafts.** `renderReview` becomes

```ts
function renderReview(
  res: Response,
  db: Database,
  source: Source,
  now: Date,
  status = 200,
  body: unknown = undefined,
  errors: string[] = [],
): void {
  const drafts = listDrafts(db, source.id);
  // The preview is of the drafts as they are stored, all placed in one call. Nothing is written.
  const starts = new Map(placeTasks(db, drafts, now).placed.map((placed) => [placed.id, placed.scheduled_start]));
  const cards = drafts.map((draft) => {
    const start = starts.get(draft.id);
    return cardOf(source.id, draft, body, start === undefined ? NOT_SCHEDULED : dayTimeLabel(new Date(start), now));
  });
```

and the rest of it is unchanged. `cardOf` gains a fourth parameter, `land: string`, and
puts it on the card; `DraftCard` gains `land: string`.
`const NOT_SCHEDULED = 'Not scheduled';` stands with the other texts at the top of the
file.

`body` is not handed to the scheduler, so the page of a refused confirm previews the
stored values while its controls show the posted ones (AC11). Tasks an urgent draft
would move are moved in the scheduler's own list only, so the later cards land where
they will after the confirm, and no row changes (AC12).

`dayTimeLabel(at: Date, now: Date): string` gives `Today h:mm AM`, `Tomorrow h:mm AM`
or `D Mon h:mm AM` by the number of Dubai days between the two: 0, 1, anything else
(AC11). The hour is `hours % 12 || 12`, the minutes have two digits, the day of the
month has no leading zero, and the months are `Jan` to `Dec` from a list in the file.
Every space is a plain one.

**D15. The markup and the style.** In `pages/review.ejs`, one line after the closing
`</div>` of the stepper and before the `<fieldset class="choices">`:

```ejs
      <p class="land"><span aria-hidden="true">→</span> <%= card.land %></p>
```

The arrow is U+2192, as in the mockup, inside the element and hidden from a screen
reader, the way the low-confidence mark is built (006 D18). The text a user reads is
the label alone; tests read it with `visibleText`.

In `public/css/base.css`, after the `.stepper__unit` rule and before `.choices`:

```css
/* Where a draft would land if it were confirmed now. */
.land {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
```

The mockup has 12px; the type scale has 11px and 13px, and `src/stylesheet.test.ts`
allows a font size from the scale only. `--font-size-sm` is what `.stepper__unit`
beside it uses.

The mockup puts the text on the stepper's row. Here it is a line of its own, under the
stepper. At 375px a card is 317px wide inside, the stepper with its two buttons takes
about 230px, and `→ Tomorrow 12:55 PM` needs about 135px. Seen in headless Chrome at
375px and 1000px, light and dark: the line sits under the stepper, muted, and nothing
else on the card moved. Rejected: the same row with `flex-wrap`; it would be on the row
on a wide screen and under it on a phone.

**D16. Existing tests that change, and how.** Only `src/review-actions.test.ts`, and in
it only the five tests that compare the whole row of a confirmed task. No assertion is
loosened: each expected row gains the exact two timestamps.

Checked in the prototype: with the code changed and no test edited, exactly these five
tests failed and no other test of the 1331.

After `type Fields = Record<string, string>;` these are added:

```ts
/** The two columns of a task the scheduler placed on 4 March 2026, from `HH:MM` on the UTC clock. */
function scheduled(start: string, end: string): Pick<Task, 'scheduled_start' | 'scheduled_end'> {
  return { scheduled_start: `2026-03-04T${start}:00.000Z`, scheduled_end: `2026-03-04T${end}:00.000Z` };
}

/**
 * Where a confirm at `LATER` puts `bug`, `milk` and `bank` as they are seeded. `LATER` is
 * 10:06 AM in Dubai, so the first mark is 10:10 AM, which is 06:10 UTC; the tasks go by
 * priority, which is also their order, and each starts where the one before it ends.
 */
const SEEDED_TIMES = [scheduled('06:10', '07:40'), scheduled('07:40', '08:20'), scheduled('08:20', '08:35')];

/** The same with the first task at 95 minutes. */
const EDITED_TIMES = [scheduled('06:10', '07:45'), scheduled('07:45', '08:25'), scheduled('08:25', '08:40')];
```

| Test | Change |
|---|---|
| "confirms the form as it was served: every draft becomes pending with its stored values" | The first `toEqual` becomes `before.map((row, index) => ({ ...row, status: 'pending', ...SEEDED_TIMES[index], updated_at: LATER }))`. In the `toMatchObject` below it, `scheduled_start: null,` becomes `...SEEDED_TIMES[index],`. |
| "stores the posted title, trimmed, the minutes, the priority and the slot" | Each of the three expected rows gains `...EDITED_TIMES[0]`, `[1]`, `[2]` before `updated_at: LATER`. Task 1 is posted as `urgent` with the slot `morning`: it is placed first and its slot is not looked at. |
| "confirms a draft the body has no fields for as it is stored" | The same three additions, `...EDITED_TIMES[0]`, `[1]`, `[2]`. |
| "keeps the stored value of a field that is not posted" | The one expected row gains `...scheduled('16:00', '17:30')` before `updated_at: LATER`: a `night` task of 90 minutes, and 8:00 PM in Dubai is 16:00 UTC. |
| "confirms every draft as stored for a post with no body at all" | The `toEqual` becomes the one of the first row of this table. |

The header comment of the file, the helpers `rows()` and `seed()`, and every other test
of the file stay as they are. The refused confirms, the removes and the discards still
compare with rows that have no times, which is the half of AC10 that says they change
none.

**D17. The tests set the zone and name their times themselves.** Two things would let
a wrong scheduler pass here, and the tests are built against both
(`docs/errors/test-data-with-its-own-space-hides-a-missing-separator.md` is the same
kind of trap).

- The machine's zone is Dubai. The tests of AC1 and of the label assign
  `process.env.TZ` in the test and put the old value back in `afterEach`. Checked on
  Node 26.8.2 under Vitest 5.0.1: the assignment changes what `getHours()` returns in
  the same process. One test asserts exactly that, so a runner in which it stops
  working (worker threads have their own copy of the environment) fails loudly instead
  of making the other TZ tests mean nothing.
- The test files build their expected timestamps with a helper of their own,
  `dubai('13:40', daysAhead)`, written with `Date.UTC` and a literal `- 4`. They do not
  import `src/dubai.ts`. The examples the spec gives as UTC timestamps are asserted as
  those literals.

AC7's own example cannot tell "placed again at or after the urgent task's end" from
"placed again from `now`": both give 3:10 PM. A test with an `in_progress` task in
front of the urgent one can, and is in the plan.

## Files

Created:

- `src/dubai.ts` (D2, D14). Exports `MINUTE_MS`, `dubaiDay(at: number): number`,
  `dubaiDayStart(day: number): number`, `clockMinutes(time: string): number`,
  `dayTimeLabel(at: Date, now: Date): string`. The whole file:

```ts
/*
 * The user's clock. Every time of day the app reads from a setting or shows on a page is
 * on the Asia/Dubai clock, whatever the time zone of the process. Dubai is four hours
 * ahead of UTC all year and has no daylight saving, so its clock is arithmetic on UTC
 * milliseconds. Nothing here asks the system for its time zone or for the time.
 */

export const MINUTE_MS = 60_000;

const DAY_MS = 24 * 60 * MINUTE_MS;

/** How far the Dubai clock is ahead of UTC. */
const DUBAI_OFFSET_MS = 4 * 60 * MINUTE_MS;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The Dubai day an instant is in, as a whole number that grows by one at each Dubai midnight. */
export function dubaiDay(at: number): number {
  return Math.floor((at + DUBAI_OFFSET_MS) / DAY_MS);
}

/** The instant at which a Dubai day starts: 00:00 on the Dubai clock. */
export function dubaiDayStart(day: number): number {
  return day * DAY_MS - DUBAI_OFFSET_MS;
}

/** The minutes after midnight of an `HH:MM` time on a 24-hour clock. */
export function clockMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/**
 * An instant as a person reads it at `now`, on the Dubai clock: `Today 8:00 PM` on the
 * Dubai day of `now`, `Tomorrow 9:00 AM` on the next, and `14 Oct 9:00 AM` on any other.
 * The hour has no leading zero and the spaces are plain ones.
 */
export function dayTimeLabel(at: Date, now: Date): string {
  const onClock = new Date(at.getTime() + DUBAI_OFFSET_MS);
  const hours = onClock.getUTCHours();
  const time = `${hours % 12 || 12}:${String(onClock.getUTCMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;

  const days = dubaiDay(at.getTime()) - dubaiDay(now.getTime());
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  return `${onClock.getUTCDate()} ${MONTHS[onClock.getUTCMonth()]} ${time}`;
}
```

- `src/services/scheduler.ts` (D1, D3 to D11). Exports the types `SchedulableTask`,
  `Placement` and `Schedule`, and the functions `placeTasks` and `storeSchedule`. The
  whole file:

```ts
import type { Database } from '../db/database.ts';
import { getSetting, type SlotRule } from '../db/settings.ts';
import { listTasks, updateTask, type Task } from '../db/tasks.ts';
import { MINUTE_MS, clockMinutes, dubaiDay, dubaiDayStart } from '../dubai.ts';
import type { Priority } from '../ui.ts';
import { readSlotRules } from './rules.ts';

/*
 * The scheduler: finds the time a task is done at. A task goes into the first free gap
 * of the working hours, a task with a slot into the first free gap of its slot's window,
 * and what does not fit today goes to a later day. An urgent task takes the nearest gap
 * and pushes pending tasks of a lower priority later.
 *
 * The hours and the windows are data: the `working_hours` and `slot_rules` settings,
 * read on the Dubai clock (`src/dubai.ts`). `placeTasks` is handed the time and never
 * reads the clock, and it writes nothing: `storeSchedule` stores what it returns.
 */

/** A task starts on a mark of the clock: every five minutes, counted from the hour. */
const STEP_MS = 5 * MINUTE_MS;

/** What the scheduler reads of a task. A row of `tasks` fits as it is. */
export type SchedulableTask = Pick<Task, 'id' | 'priority' | 'time_slot' | 'estimated_minutes'>;

/** The time found for one task, as the two columns hold it: UTC timestamps. */
export interface Placement {
  id: number;
  scheduled_start: string;
  scheduled_end: string;
}

/** What one call decided. Nothing of it is stored until `storeSchedule` is called. */
export interface Schedule {
  /** The tasks handed in that got a time, in the order they were handed in. */
  placed: Placement[];
  /** The tasks that were not handed in and were pushed later by an urgent one, with their new times, in `id` order. */
  moved: Placement[];
  /** The ids of the tasks handed in that cannot be placed, in the order they were handed in. */
  unplaced: number[];
}

/** A part of every day, in minutes after midnight on the Dubai clock. */
interface DayWindow {
  start: number;
  end: number;
}

/** A task that has a time, in UTC milliseconds. */
interface Entry {
  task: SchedulableTask;
  /** `in_progress`: an urgent task does not move it. */
  started: boolean;
  start: number;
  end: number;
}

/** The order tasks are placed in. A task without a priority counts as `low`. */
const RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function rankOf(task: SchedulableTask): number {
  return RANK[task.priority ?? 'low'];
}

/** The first mark of the clock at or after an instant. Dubai is a whole number of steps from UTC. */
function nextMark(at: number): number {
  return Math.ceil(at / STEP_MS) * STEP_MS;
}

/**
 * The part of the day a task may lie in, or `undefined` when it cannot be placed at all:
 * it has no duration, or one that is longer than the working hours. A task with a slot
 * gets the window of the first rule of that slot, cut to the working hours. An urgent
 * task, a task whose slot no rule names and a task longer than its window get the
 * working hours.
 */
function windowOf(task: SchedulableTask, hours: DayWindow, rules: readonly SlotRule[]): DayWindow | undefined {
  const minutes = task.estimated_minutes;
  if (minutes === null || !(minutes > 0) || !(minutes <= hours.end - hours.start)) return undefined;
  if (task.priority === 'urgent' || task.time_slot === null) return hours;

  const rule = rules.find((item) => item.time_slot === task.time_slot);
  if (rule === undefined) return hours;

  const window = {
    start: Math.max(hours.start, clockMinutes(rule.start)),
    end: Math.min(hours.end, clockMinutes(rule.end)),
  };
  return minutes <= window.end - window.start ? window : hours;
}

/** The first of `entries` that shares time with `start` to `end`. One that ends at `start` or starts at `end` does not. */
function firstOverlap(entries: readonly Entry[], start: number, end: number): Entry | undefined {
  return entries.find((entry) => entry.start < end && entry.end > start);
}

/**
 * The earliest start on a mark, at or after `from`, at which `minutes` lie inside the
 * window of one day and overlap none of `blockers`. A task may start at the instant
 * another ends. The day after the last blocker is free, so the search ends there;
 * `undefined` only when the window cannot hold the task on a free day.
 */
function findStart(
  from: number,
  minutes: number,
  window: DayWindow,
  blockers: readonly Entry[],
): number | undefined {
  const length = minutes * MINUTE_MS;
  const firstDay = dubaiDay(from);
  const lastDay = blockers.reduce((day, blocker) => Math.max(day, dubaiDay(blocker.end)), firstDay) + 1;

  for (let day = firstDay; day <= lastDay; day += 1) {
    const midnight = dubaiDayStart(day);
    const windowEnd = midnight + window.end * MINUTE_MS;
    let start = nextMark(Math.max(from, midnight + window.start * MINUTE_MS));

    while (start + length <= windowEnd) {
      const blocker = firstOverlap(blockers, start, start + length);
      if (blocker === undefined) return start;
      // At least one step on, so the search ends whatever the blocker holds.
      start = Math.max(nextMark(blocker.end), start + STEP_MS);
    }
  }
  return undefined;
}

function placementOf(entry: Entry): Placement {
  return {
    id: entry.task.id,
    scheduled_start: new Date(entry.start).toISOString(),
    scheduled_end: new Date(entry.end).toISOString(),
  };
}

/**
 * Finds a time for each of these tasks, as if `now` were the current time, and returns
 * what it found. Nothing is written and the clock is not read.
 *
 * Time is taken by every `pending` and `in_progress` task that has a start and an end,
 * except the tasks handed in: a time one of those already has is ignored. The tasks are
 * placed one at a time, the most pressing first and then by `id`, and each takes time
 * from the next.
 *
 * An urgent task is placed without regard to its slot and to the pending tasks of a
 * lower priority. The ones it then overlaps are placed again, at or after its end, before
 * the next task of the call. One of them that cannot be placed stays where it is.
 *
 * Reads the `working_hours` and `slot_rules` settings at the call. Throws when there is
 * no `working_hours` setting. With no task, nothing is read.
 */
export function placeTasks(db: Database, tasks: readonly SchedulableTask[], now: Date): Schedule {
  const schedule: Schedule = { placed: [], moved: [], unplaced: [] };
  if (tasks.length === 0) return schedule;

  const setting = getSetting(db, 'working_hours');
  if (setting === undefined) throw new Error('The working_hours setting is missing');
  const hours: DayWindow = { start: clockMinutes(setting.start), end: clockMinutes(setting.end) };
  const rules = readSlotRules(db);

  const given = new Set(tasks.map((task) => task.id));
  const taken: Entry[] = [];
  for (const status of ['pending', 'in_progress'] as const) {
    for (const task of listTasks(db, { status })) {
      if (given.has(task.id) || task.scheduled_start === null || task.scheduled_end === null) continue;
      taken.push({
        task,
        started: status === 'in_progress',
        start: Date.parse(task.scheduled_start),
        end: Date.parse(task.scheduled_end),
      });
    }
  }

  /** Every task this call gave a time, with the last time it got. */
  const timed = new Map<number, Entry>();

  /** Gives a task the earliest time at or after `from` that is free of `blockers`. */
  function place(task: SchedulableTask, from: number, blockers: readonly Entry[]): Entry | undefined {
    const window = windowOf(task, hours, rules);
    if (window === undefined || task.estimated_minutes === null) return undefined;

    const start = findStart(from, task.estimated_minutes, window, blockers);
    if (start === undefined) return undefined;

    const entry: Entry = { task, started: false, start, end: start + task.estimated_minutes * MINUTE_MS };
    taken.push(entry);
    timed.set(task.id, entry);
    return entry;
  }

  const ordered = [...tasks].sort((a, b) => rankOf(a) - rankOf(b) || a.id - b.id);
  for (const task of ordered) {
    if (task.priority !== 'urgent') {
      place(task, now.getTime(), taken);
      continue;
    }

    const urgent = place(
      task,
      now.getTime(),
      taken.filter((entry) => entry.started || entry.task.priority === 'urgent'),
    );
    if (urgent === undefined) continue;

    // Whatever the urgent task now lies on is a pending task of a lower priority: the
    // urgent and the in_progress ones kept it out. Those that can be placed again all give
    // up their times first, so none of them stands in the way of another.
    const bumped = taken
      .filter(
        (entry) =>
          entry !== urgent &&
          firstOverlap([entry], urgent.start, urgent.end) !== undefined &&
          windowOf(entry.task, hours, rules) !== undefined,
      )
      .sort((a, b) => rankOf(a.task) - rankOf(b.task) || a.start - b.start || a.task.id - b.task.id);
    for (const entry of bumped) taken.splice(taken.indexOf(entry), 1);
    for (const entry of bumped) place(entry.task, urgent.end, taken);
  }

  for (const task of tasks) {
    const entry = timed.get(task.id);
    if (entry === undefined) schedule.unplaced.push(task.id);
    else schedule.placed.push(placementOf(entry));
  }
  for (const [id, entry] of timed) {
    if (!given.has(id)) schedule.moved.push(placementOf(entry));
  }
  schedule.moved.sort((a, b) => a.id - b.id);
  return schedule;
}

/**
 * Stores the times of a schedule: the two columns of every placed and every moved task.
 * A task that was not placed is not written. It opens no transaction: the caller wraps
 * it, with whatever else has to be stored or not at all.
 */
export function storeSchedule(db: Database, schedule: Schedule): void {
  for (const { id, scheduled_start, scheduled_end } of [...schedule.placed, ...schedule.moved]) {
    updateTask(db, id, { scheduled_start, scheduled_end });
  }
}
```

- Tests: `src/dubai.test.ts`, `src/services/scheduler.test.ts`,
  `src/review-schedule.test.ts`: see `plan.md`.

Changed:

- `src/services/drafts.ts`: after the import of `./rules.ts`, the line
  `import { placeTasks, storeSchedule } from './scheduler.ts';`. `confirmDrafts` becomes
  the function of D13, and its doc comment becomes:

```ts
/**
 * Stores the edits of these drafts, makes each of them a `pending` task and gives it a
 * time, all or none. A draft without an edit is confirmed as stored. The times are those
 * the scheduler finds at `now` for the values that are stored; a task it pushes later
 * for an urgent one gets its new time in the same write. A draft the scheduler cannot
 * place is confirmed with no time.
 */
```

- `src/routes/review.ts`:
  - imports: `import { dayTimeLabel } from '../dubai.ts';` after the import of
    `../db/tasks.ts`, and `import { placeTasks } from '../services/scheduler.ts';` after
    the import from `../services/drafts.ts`;
  - after `BAD_CHOICE`: `/** What a card shows for a draft the scheduler cannot place. */`
    and `const NOT_SCHEDULED = 'Not scheduled';`;
  - `DraftCard` gains, after `lowConfidence`:
    ``/** Where the stored draft would land if it were confirmed now: `Today 8:00 PM`, or `Not scheduled`. */``
    and `land: string;`;
  - `cardOf(sourceId: number, draft: Task, body: unknown, land: string): DraftCard`
    returns `land,` after `lowConfidence`; its doc comment gains the sentence
    "`land` is the text of its landing preview.";
  - `renderReview` as in D14; its doc comment gains the sentence "`now` is the time of
    the request: each card says where its stored draft would land if the drafts were
    confirmed at it.";
  - the `GET` handler and the confirm handler as in D12. The comment above
    `const now = new Date();` is
    `// Read once: the preview of a refused confirm and the times of an accepted one are of this instant.`
- `src/views/pages/review.ejs`: the line of D15. In the header comment, the sentence
  about `cards` becomes "`cards` are its drafts, each with the values of its controls,
  the names they post under (`fields`) and where it would land if it were confirmed now
  (`land`)."
- `public/css/base.css`: the rule of D15.
- `src/review-actions.test.ts`: D16.

Not touched:

- `package.json`, `yarn.lock`: no package is added.
- `src/db/migrations.ts`: no migration (the two columns exist; 008's test pins
  migration 1 by its hash and the count of migrations at two).
- `src/db/tasks.ts`, `src/db/settings.ts`, `src/db/transaction.ts`,
  `src/db/timestamps.ts`, `src/db/sources.ts`, `src/db/database.ts`: the scheduler uses
  `listTasks`, `updateTask`, `getSetting` as they are. No `listScheduledTasks`, no new
  setting, no time zone setting.
- `src/services/rules.ts`: `readSlotRules` is imported as it is. `applyRules` does not
  run on confirm (008 D5).
- `src/app.ts`, `src/server.ts`, `src/testing/app.ts`, `src/config.ts`, `.env.example`,
  `vitest.config.ts`: no clock in `AppDeps`, no environment variable (D12).
- `src/routes/add.ts`: an analysis stores drafts, and a draft has no time.
- `removeDraft`, `discardDrafts`, `analyzeSource`, `readDraftEdits` in
  `src/services/drafts.ts`, and the remove, discard and analyze handlers.
- `public/js/review.js`: the preview does not follow an edit before the form is posted
  (Out of scope).
- `src/ui.ts`: the order of the priorities is written in the scheduler (D5).
- `src/review-page.test.ts`, `src/add-rules.test.ts`, `src/add-text.test.ts`,
  `src/add-analysis.test.ts` and every other existing test file: they pass unedited
  (checked). `src/review-page.test.ts` runs at the real time of day; the preview has a
  text at any time and none of its tests reads it.
- `src/views/pages/styleguide.ejs`: `.land` is a part of the review card, not a
  component of 002.
- `tsconfig.json`, `.gitignore`, `CLAUDE.md`, `README.md`; `docs/` unless the builder
  logs an error; everything under `factory/` except this job's `build.md`; `data/`.

## Risks

Each line names what goes wrong and the tests of `plan.md` that failed for it in the
prototype.

- **The scheduler reads the clock.** AC1: "follows the argument when the system clock
  is on another day" and "gives the same result at two times of the system clock".
- **The hours are read on the clock of the process.** AC1: the three
  "reads the hours on the Dubai clock with TZ=…" tests; for the label, the three "gives
  the same labels with TZ=…" tests. On this machine nothing else fails for it (D17).
- **`now` is not rounded up, or is rounded down.** AC2: the "at … it starts at …"
  tests, and some 48 more.
- **A task may not start where another ends, or may overlap it by a step.** AC3: the
  gap test with 2:30 PM and 4:00 PM, and "skips a gap that is 5 minutes too short".
- **The search loop does not move on and the test run hangs.** D7. If
  `vitest run src/services/scheduler.test.ts` does not come back within seconds, look
  at the line that sets the next candidate before anything else.
- **`draft` or `done` tasks take time, or `in_progress` ones do not.** AC3: "takes the
  time of a draft task", "of a done task", "is kept out by an in_progress task".
- **The tasks of one call are placed in the order they were handed in, or a task
  without a priority goes first.** AC4: both order tests.
- **The slot is ignored, the rule is found by category, the last rule of a slot wins,
  the window is not cut to the hours, or a task too long for its window never lands.**
  AC5: one test each, by those names.
- **Only today, or only today and tomorrow, are searched.** AC6: "passes over a full
  day to the day after it"; AC5: the second `morning` task.
- **An urgent task waits behind pending tasks, or lands on an urgent or an
  `in_progress` one.** AC7: the first test, and "is kept out by an urgent task and by
  an in_progress task".
- **Every pending task after the urgent one is moved, not only those it overlaps.**
  AC7: the first test compares the whole row of the `low` task.
- **The bumped tasks are placed from `now`, in `id` order, or one at a time while the
  others still hold their times.** AC7: one test each (D17, D8).
- **A bumped task that cannot be placed again loses its time or lets another task land
  on it.** AC7: "leaves a task it cannot place again where it is" and "places a bumped
  task around a task that cannot be placed again".
- **A task that cannot be placed throws, and the page or the confirm answers 500.**
  AC8, and the two `Not scheduled` tests of AC11.
- **The hours are written into the code.** AC9, all three tests.
- **The confirm does not schedule, schedules the stored values instead of the posted
  ones, forgets the moved task, or schedules after its transaction.** AC10: the first
  test; "places the drafts with the posted minutes, priority and slot"; "moves a
  pending task of another source…"; "stores nothing when the new times of a moved task
  cannot be written".
- **The preview writes.** AC12: both "writes nothing" tests, and every "changes no
  task" test of 006 in `src/review-actions.test.ts`.
- **The preview places each draft alone, or the confirm does.** AC11: "two cards never
  show the same time"; AC12: the confirm of the form as served.
- **The page of a refused confirm previews the posted values.** AC11: the test of that
  name posts a priority, minutes and two slots that would each move a card.
- **`Today` and `Tomorrow` go by the UTC day.** AC11: "goes by the Dubai day of the
  request" (2:00 AM in Dubai is still the day before in UTC), and six label tests.
- **The label has a leading zero, `0:30 PM` at noon, or `9:5 AM`.** The label table of
  `src/dubai.test.ts`.
- **The arrow is read out, or is outside the element.** AC11: "has one land element in
  each card…".
- **A later job changes the offset or adds a zone setting.** Every instant in the
  scheduler goes through the three functions of `src/dubai.ts`; that file is the one
  place to change.
- **Two confirms at the same moment.** Out of scope by the spec. The driver is
  synchronous and the app has one connection, so within one process a confirm's
  transaction cannot be interleaved with another's.
- **Every preview reads all pending tasks.** Two `SELECT`s per request on a table of
  one user's tasks. Left as it is; 010 can add a filter by time when it needs one.
- **Test files run in a loop run out of ports**
  (`docs/errors/repeated-test-runs-run-out-of-ports.md`). `src/review-schedule.test.ts`
  uses supertest. The plan runs each check once.
- **A reporter writes into the repo**
  (`docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md`). The plan uses the
  default reporter only.
- **Nothing here ran on Node 22 or 24.** The new code uses `Map`, `Set`,
  `Array.prototype.find`, `reduce` and `sort`, `Math`, `Date.parse`, `toISOString` and
  `String.prototype.padStart`.
