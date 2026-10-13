# 009-scheduler: plan

Decision numbers (D1, D2, …) refer to `design.md`.

Run each check once, with the default reporter. `src/review-schedule.test.ts` and the
review tests use supertest; in a loop they run out of ports
(`docs/errors/repeated-test-runs-run-out-of-ports.md`). If
`vitest run src/services/scheduler.test.ts` does not come back within a few seconds, the
search loop is not moving on: stop it and read D7.

## Steps

1. **The Dubai clock.** Files: `src/dubai.ts`, `src/dubai.test.ts`. Serves AC1, AC11.
   - Create `src/dubai.ts` with the text under Files in `design.md` (D2, D14).
   - Write `src/dubai.test.ts` (Tests: AC1 and AC11, the parts in that file).
   - Check: `yarn -s vitest run src/dubai.test.ts` passes, 32 tests.

2. **The scheduler.** Files: `src/services/scheduler.ts`,
   `src/services/scheduler.test.ts`. Serves AC1 to AC9, AC13.
   - Create `src/services/scheduler.ts` with the text under Files in `design.md`
     (D1, D3 to D11).
   - Write `src/services/scheduler.test.ts` (Tests: AC1 to AC9).
   - Check: `yarn build` is clean and `yarn -s vitest run src/services/scheduler.test.ts`
     passes, 76 tests.
   - Check, once, that the zone tests can fail on this machine: in `dubaiDayStart` of
     `src/dubai.ts` replace the body with
     `const d = new Date(day * DAY_MS); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();`,
     run the same command, see the three "reads the hours on the Dubai clock with TZ=…"
     tests fail, and put the line back.

3. **The confirm schedules.** Files: `src/services/drafts.ts`, `src/routes/review.ts`
   (the confirm handler only), `src/review-actions.test.ts`. Serves AC10, AC13.
   - `src/services/drafts.ts`: the import, the doc comment and `confirmDrafts` of D13.
   - `src/routes/review.ts`, confirm handler: `const now = new Date();` with its comment
     (D12), directly after the `if (source === undefined)` block, and
     `confirmDrafts(deps.db, drafts, edits, now);`. The call of `renderReview` in the
     400 branch is changed in step 4.
   - Check: `yarn build` is clean. `yarn -s vitest run src/review-actions.test.ts` now
     fails in exactly five tests, all under "POST /review/:sourceId/confirm (AC12)":
     "confirms the form as it was served: every draft becomes pending with its stored
     values", "stores the posted title, trimmed, the minutes, the priority and the slot",
     "confirms a draft the body has no fields for as it is stored", "keeps the stored
     value of a field that is not posted", "confirms every draft as stored for a post
     with no body at all". If another test fails, the code is wrong, not the test.
   - Edit those five tests as D16 says: the helper `scheduled`, the two constants, and
     the expected rows. Touch nothing else in the file.
   - Check: `yarn -s vitest run src/review-actions.test.ts` passes, with the same
     number of tests as before the step.

4. **The landing preview.** Files: `src/routes/review.ts`,
   `src/views/pages/review.ejs`, `public/css/base.css`. Serves AC11, AC12.
   - `src/routes/review.ts`: the two imports, `NOT_SCHEDULED`, `land` on `DraftCard`
     and in `cardOf`, `renderReview` with `now` (D14), the `GET` handler and the 400
     branch of the confirm handler (D12), and the two doc-comment sentences (Files).
   - `src/views/pages/review.ejs`: the line of D15 and the sentence in the header
     comment (Files).
   - `public/css/base.css`: the rule of D15, between `.stepper__unit` and `.choices`.
   - Check: `yarn build` is clean, and
     `yarn -s vitest run src/review-page.test.ts src/review-actions.test.ts src/stylesheet.test.ts src/components.test.ts src/add-rules.test.ts src/add-text.test.ts`
     passes with none of those files edited in this step.

5. **The tests of the routes.** File: `src/review-schedule.test.ts`. Serves AC10, AC11,
   AC12.
   - Write the file (Tests: AC10, AC11, AC12).
   - Check: `yarn -s vitest run src/review-schedule.test.ts` passes, 30 tests.

6. **The whole.** Serves AC13.
   - Check: `yarn build` is clean.
   - Check: `ANTHROPIC_API_KEY= yarn test` passes: 41 files and, with the tests written
     as listed below, 1469 tests (1331 of before, and 32, 76 and 30 new).
   - Check: `git status --short` lists `src/dubai.ts`, `src/dubai.test.ts`,
     `src/services/scheduler.ts`, `src/services/scheduler.test.ts`,
     `src/review-schedule.test.ts`, `src/services/drafts.ts`, `src/routes/review.ts`,
     `src/views/pages/review.ejs`, `public/css/base.css`, `src/review-actions.test.ts`
     and this job's `build.md`, and nothing else: no `data/`, no `.vitest/`.

## Tests

### Shared setup

No test imports `src/dubai.ts` to build what it expects (D17). Times below are on the
Dubai clock of 12 Oct 2026 unless a full timestamp is given; `09:00+1` is the next day,
`09:00+2` the day after.

`src/services/scheduler.test.ts`, on a database of its own, with no app:

```ts
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = new Date('2026-10-12T09:36:00.000Z');

let db: Database;
const zone = process.env.TZ;

beforeEach(() => {
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

/** A Dubai clock time, `HH:MM`, of 12 Oct 2026 or of a day after it, as a stored timestamp. */
function dubai(time: string, daysAhead = 0): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12 + daysAhead, hours - 4, minutes)).toISOString();
}

/** A task to place: pending, with no time. */
function todo(minutes: number | null, extra: Partial<NewTask> = {}): Task {
  return createTask(db, { title: 'To do', status: 'pending', estimated_minutes: minutes, ...extra });
}

/** A task that has a time today, pending and `medium` unless `extra` says otherwise. */
function booked(start: string, end: string, extra: Partial<NewTask> = {}): Task {
  return createTask(db, {
    title: 'Booked',
    status: 'pending',
    priority: 'medium',
    estimated_minutes: (Date.parse(dubai(end)) - Date.parse(dubai(start))) / 60_000,
    scheduled_start: dubai(start),
    scheduled_end: dubai(end),
    ...extra,
  });
}

function place(tasks: Task[], now: Date = NOW): Schedule {
  return placeTasks(db, tasks, now);
}

/** Places and stores, as a confirm does. */
function commit(tasks: Task[], now: Date = NOW): Schedule {
  const schedule = place(tasks, now);
  storeSchedule(db, schedule);
  return schedule;
}

function slot(id: number, start: string, end: string): Placement {
  return { id, scheduled_start: start, scheduled_end: end };
}
```

A test that says "the schedule is" compares the whole object with `toEqual`:
`{ placed, moved, unplaced }`.

`src/review-schedule.test.ts`, through the app with supertest. Only `Date` is faked. The
drafts are stored at `STORED`; `rows()` moves the clock to `NOW`, so a request after it
is made at 1:36 PM and any write shows in `updated_at`.

```ts
/** 9:00 AM on 12 Oct 2026 in Dubai. */
const STORED = '2026-10-12T05:00:00.000Z';
/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(STORED));
  testApp = createTestApp({ analyze: vi.fn<Analyze>() });
});

afterEach(() => {
  testApp.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
```

- `dubai(time, daysAhead)` as above; `times(start, end)` gives the two columns.
- `photoSource()`, `tasks()`, `task(id)`, `served(sourceId)`, `fieldsOf(sourceId)`,
  `post(address, fields)` and `refuse(write, taskId)` as in
  `src/review-actions.test.ts`.
- `draft(sourceId, extra)`: `createTask` with `title: 'A draft'`, `status: 'draft'`,
  the source and `extra`.
- `seed()`: a photo source, which is source 1, with tasks 1, 2 and 3: `high` `morning`
  90 minutes, `medium` `night` 40 minutes, `low` with no slot 15 minutes.
- `booked(start, end, extra)`: as in the scheduler tests, with `source_id` of a new
  photo source of its own.
- `rows(at = NOW)`: returns `tasks()` and then sets the clock to `at`.
- `lands(document)`: for every `[data-draft]`, `visibleText(one(card, '.land'))`.

### AC1: `src/services/scheduler.test.ts`, "placeTasks is handed the time (AC1)"; `src/dubai.test.ts`

In `src/services/scheduler.test.ts`:

- follows the argument when the system clock is on another day: `Date` faked to
  `2031-01-01T00:00:00.000Z`; `place([todo(15)])` gives `placed` of
  `2026-10-12T09:40:00.000Z` to `2026-10-12T09:55:00.000Z`.
- gives the same result at two times of the system clock: a task with no slot, a 90-minute
  `morning` task and a 30-minute `urgent` task placed with the clock at
  `2026-03-04T03:00:00.000Z` and again at `2027-08-09T19:30:00.000Z`; the two schedules
  are equal.
- `it.each(['America/New_York', 'Pacific/Kiritimati', 'UTC'])`, reads the hours on the
  Dubai clock with TZ=%s: sets `process.env.TZ`; a 30-minute task and a 40-minute `night`
  task at `2026-10-12T19:30:00.000Z` get `2026-10-13T05:00:00.000Z` to `05:30` and
  `2026-10-13T16:00:00.000Z` to `16:40`.
- changes the zone of the process when TZ is set: with `TZ` set to `America/New_York`,
  `new Date('2026-10-12T19:30:00.000Z').getHours()` is 15; with `Pacific/Kiritimati` it
  is 9. It fails when the three tests above have stopped testing anything.
- returns stored timestamps: for `todo(15)`, `todo(600)`, `todo(600)` there are three
  placements, and `isTimestamp` is true for every start and end.
- writes nothing: with a booked task at 13:40 to 14:40, a task and an `urgent` task are
  placed; `listTasks(db)` is equal to what it was before.
- reads nothing and returns an empty schedule for no task: after `DELETE FROM settings`,
  `place([])` is `{ placed: [], moved: [], unplaced: [] }`.
- throws when there is no `working_hours` setting: the row deleted; `place([todo(15)])`
  throws `The working_hours setting is missing`.
- places by the working hours alone when there is no `slot_rules` setting: the row
  deleted; a 40-minute `night` task gets 13:40 to 14:20.

In `src/dubai.test.ts`, "clockMinutes" and "the Dubai day":

- `it.each`, reads %s as %i minutes after midnight: `00:00` 0, `09:00` 540, `11:00` 660,
  `20:05` 1205, `22:00` 1320, `23:59` 1439.
- changes at 20:00 UTC: `dubaiDay` of `2026-10-12T20:00:00.000Z` is one more than of
  `2026-10-12T19:59:59.999Z`, which is that of `2026-10-11T20:00:00.000Z`.
- starts at 00:00 on the Dubai clock: `dubaiDayStart(dubaiDay(NOW))` is
  `2026-10-11T20:00:00.000Z`, and of the next day `2026-10-12T20:00:00.000Z`.

### AC2: `src/services/scheduler.test.ts`, "the start and the end of a placed task (AC2)"

- gives a 15-minute task with no slot the next 5-minute mark and an end 15 minutes
  later: the schedule is one placement, `2026-10-12T09:40:00.000Z` to
  `2026-10-12T09:55:00.000Z`, nothing moved, nothing unplaced.
- `it.each`, at %s it starts at %s: `09:40:00.000Z` gives `09:40:00.000Z`;
  `09:40:00.001Z` gives `09:45`; `09:39:59.999Z` gives `09:40`; `09:44:00.000Z` gives
  `09:45`; `09:58:30.000Z` gives `10:00` (all on `2026-10-12`, UTC).
- ends a task at the end of the working hours, and takes one that is 5 minutes longer
  to the next day: at 21:40 a 20-minute task gets 21:40 to 22:00, a 25-minute task
  09:00+1 to 09:25+1.
- does not start before the working hours: at 07:00 a 15-minute task gets 09:00 to
  09:15.
- places a task as long as the working day from its first minute to its last:
  `todo(780)` gets 09:00+1 to 22:00+1.

### AC3: `src/services/scheduler.test.ts`, "gap filling (AC3)"

- puts a 30-minute task in the gap between two pending tasks and a 45-minute task after
  them: booked 13:40 to 14:30 and 15:00 to 16:00; the 30-minute task alone gets 14:30
  to 15:00, the 45-minute task alone gets 16:00 to 16:45.
- does not move the tasks that are not being placed: the same two booked tasks;
  `commit` of a 30-minute and a 45-minute task; `moved` is empty and both booked rows
  are equal to what they were, `updated_at` included.
- is kept out by an `in_progress` task: booked 13:40 to 14:30 as `in_progress`; a
  30-minute task starts at 14:30.
- `it.each(['draft', 'done'])`, takes the time of a %s task: booked 13:40 to 14:30 with
  that status; a 30-minute task starts at 13:40.
- `it.each`, takes the time of a pending task with no end / with no start: booked
  13:40 to 14:30 with `scheduled_end: null`, then with `scheduled_start: null`; a
  30-minute task starts at 13:40.
- is kept out by a pending task that started before now and has not ended: booked 13:00
  to 14:00; a 30-minute task starts at 14:00.
- starts on the next mark after a task that ends off the marks: booked 13:40 to 14:02;
  a 30-minute task starts at 14:05.
- skips a gap that is 5 minutes too short: booked 13:40 to 14:30 and 14:55 to 16:00; a
  30-minute task starts at 16:00.
- ignores the time a task that is being placed already has: a pending task booked 13:40
  to 14:10 is itself handed in; it gets 13:40 to 14:10 (D4).

### AC4: `src/services/scheduler.test.ts`, "several tasks in one call (AC4)"

- places them by priority and then by id, each after the one before: six 30-minute
  tasks created in the order `low`, no priority, `medium`, `high`, `urgent`, `high`,
  handed in in that order; `placed` in that order is 15:40, 16:10, 15:10, 14:10, 13:40,
  14:40, each 30 minutes long.
- goes by id, not by the order the tasks are handed in: two 30-minute tasks handed in
  second first; `placed` is the second at 14:10 and the first at 13:40.
- lets no two of them overlap, around the tasks that are there: booked 14:00 to 14:30
  and 15:00 to 15:10; tasks of 20, 20, 30, 45 and 10 minutes; sorted by start the
  placements are 13:40 to 14:00, 14:30 to 14:50, 14:50 to 15:00, 15:10 to 15:40, 15:40
  to 16:25.

### AC5: `src/services/scheduler.test.ts`, "the slot window (AC5)"

- puts a 40-minute night task at 8:00 PM today: `2026-10-12T16:00:00.000Z` to
  `2026-10-12T16:40:00.000Z`.
- puts a 90-minute morning task at 9:00 AM tomorrow, and a second one the day after:
  `commit` of the first gives `2026-10-13T05:00:00.000Z` to `06:30`; `place` of the
  second then gives `2026-10-14T05:00:00.000Z` to `06:30`.
- places two morning tasks of one call on two days when the window holds only one: two
  90-minute `morning` tasks in one call start at 09:00+1 and 09:00+2.
- fills a gap inside the window: booked 20:00 to 20:30 and 21:10 to 21:30; a 40-minute
  `night` task gets 20:30 to 21:10.
- starts at now inside the window, and goes to the next day when the rest of it is too
  short: at 21:18 a 40-minute `night` task gets 21:20 to 22:00, a 45-minute one 20:00+1
  to 20:45+1.
- `it.each(['afternoon', 'evening'])`, places an %s task, whose slot no rule names, as
  one with no slot: 40 minutes; 13:40 to 14:20.
- places a task that is longer than its window as one with no slot: a 120-minute
  `night` task gets 20:00 to 22:00; a 125-minute one gets 13:40 to 15:45.
- takes the window of the first rule that names the slot: `slot_rules` set to the two
  seeded rules and a third, `errand`, `night`, 18:00 to 19:00; a 40-minute `night` task
  starts at 20:00.
- goes by the slot of the task, not by its category: a 40-minute task with
  `category: 'shopping'` and `time_slot: 'morning'` starts at 09:00+1.
- cuts a window to the working hours, and drops one that lies outside them (D6): with
  hours 10:00 to 21:00, at 07:00, a 60-minute `morning` task gets 10:00 to 11:00 and a
  90-minute one 10:00 to 11:30; with hours 09:00 to 18:00, at `NOW`, a 40-minute
  `night` task gets 13:40 to 14:20.

### AC6: `src/services/scheduler.test.ts`, "overflow (AC6)"

- `it.each`, takes a 30-minute task at 9:40 PM / at 11:30 PM to 9:00 AM tomorrow: `now`
  `2026-10-12T17:40:00.000Z`, then `2026-10-12T19:30:00.000Z`; both give
  `2026-10-13T05:00:00.000Z` to `2026-10-13T05:30:00.000Z`.
- takes a task at 2:00 AM to 9:00 AM of the same Dubai day: `now`
  `2026-10-12T22:00:00.000Z`; `2026-10-13T05:00:00.000Z` to `05:30`.
- takes a task to the first gap of tomorrow when today is full until 10:00 PM: booked
  13:40 to 22:00, and a pending task at 09:00+1 to 10:00+1; a 30-minute task gets
  10:00+1 to 10:30+1.
- passes over a full day to the day after it: booked 13:40 to 22:00, and a pending task
  at 09:00+1 to 22:00+1; a 30-minute task gets 09:00+2 to 09:30+2.
- rolls the tasks of one call that do not fit today over, in their order: three
  300-minute tasks start at 13:40, 09:00+1 and 14:00+1.

### AC7: `src/services/scheduler.test.ts`, "bumping (AC7)"

- gives an urgent task the nearest gap and moves the medium task it lies on, not the
  low one after it: booked `medium` 13:40 to 14:40 and `low` 14:40 to 15:10; `commit`
  of a 30-minute `urgent` task; the schedule is the urgent task at 13:40 to 14:10, the
  `medium` task moved to 15:10 to 16:10, nothing unplaced; the stored row of the
  `medium` task has those times and the row of the `low` task is equal to what it was.
  Then `commit` of a second 30-minute `urgent` task: 14:10 to 14:40, nothing moved.
- is kept out by an urgent task and by an `in_progress` task: booked `urgent` 13:40 to
  14:00 and `low` `in_progress` 14:00 to 14:20; a 30-minute `urgent` task gets 14:20 to
  14:50 and moves nothing.
- places an urgent task without regard to its slot: `urgent` with `time_slot: 'night'`,
  30 minutes; 13:40 to 14:10.
- `it.each(['high', 'medium', 'low'])`, does not bump for a %s task: booked `low` 13:40
  to 14:40; a 30-minute task of that priority gets 14:40 to 15:10 and moves nothing.
- moves a task with no priority: booked 13:40 to 14:40 with `priority: null`; an
  `urgent` 30-minute task moves it to 14:10 to 15:10.
- places a bumped task again inside its slot window: booked `night` tasks at 20:00 to
  20:40 and 20:40 to 21:30; at 19:58 a 30-minute `urgent` task gets 20:00 to 20:30, and
  the first booked task moves to 20:00+1 to 20:40+1; the second is not moved.
- places the bumped tasks again by priority, then by their old start, then by id (D8):
  booked, in this order of creation, `low` 14:00 to 14:20, `low` 13:40 to 14:00, `high`
  14:20 to 14:40, `high` 14:20 to 14:40; a 60-minute `urgent` task gets 13:40 to 14:40;
  `moved` in `id` order starts at 15:40, 15:20, 14:40 and 15:00.
- lets no bumped task stand in the way of another: booked `high` 13:40 to 14:00 and
  `low` 14:00 to 15:00; a 30-minute `urgent` task moves them to 14:10 to 14:30 and
  14:30 to 15:30.
- places a bumped task around the tasks that stay: booked `medium` 13:40 to 14:40,
  `high` `in_progress` 14:20 to 15:00, `urgent` 15:00 to 15:30; a 30-minute `urgent`
  task gets 13:40 to 14:10 and moves the `medium` one to 15:30 to 16:30.
- places a bumped task at or after the end of the urgent task, not in a gap before it
  (D17): booked `high` `in_progress` 13:50 to 14:20 and `low` 14:20 to 14:30; a
  30-minute `urgent` task gets 14:20 to 14:50 and moves the `low` one to 14:50 to
  15:00, although 13:40 to 13:50 is free.
- places a bumped task around a task that cannot be placed again (D8): booked `high`
  13:40 to 14:00, and `low` 14:00 to 15:00 with `estimated_minutes: null`; a 30-minute
  `urgent` task gets 13:40 to 14:10, and `moved` is only the `high` task, at 15:00 to
  15:20.
- places two urgent tasks of one call one after the other, and moves a task they both
  reach twice: booked `medium` 13:40 to 14:00; two 30-minute `urgent` tasks and a
  30-minute `high` task in one call; the schedule is 13:40 to 14:10, 14:10 to 14:40 and
  15:00 to 15:30 placed, the `medium` task moved to 14:40 to 15:00, once.
- moves a bumped task to the next day when today has no room after the urgent task:
  booked `medium` 21:00 to 22:00; at 21:00 a 30-minute `urgent` task gets 21:00 to
  21:30 and moves it to 09:00+1 to 10:00+1.
- leaves a task it cannot place again where it is (D8): booked 13:40 to 14:40 with
  `estimated_minutes: null`; `commit` of a 30-minute `urgent` task; the schedule is the
  urgent task at 13:40 to 14:10 with nothing moved, and the booked row is equal to what
  it was.

### AC8: `src/services/scheduler.test.ts`, "a task that cannot be placed (AC8)"

- `it.each`, reports a task with no minutes / 781 minutes / 1440 minutes as not placed
  and places the others: a 15-minute task, that task with `priority: 'high'`, a
  15-minute task; `commit`; the schedule is the first at 13:40 to 13:55 and the third
  at 13:55 to 14:10 placed, nothing moved, `unplaced` the id of the second; the stored
  row of the second has `scheduled_start` and `scheduled_end` of `null`, and the other
  two rows have their times.
- reports an urgent task that cannot be placed and moves nothing for it: booked 13:40
  to 14:40; an `urgent` task with no minutes; the schedule is nothing placed, nothing
  moved, its id unplaced.
- goes by the working hours of the setting: hours 10:00 to 18:00; a 480-minute task
  gets 10:00+1 to 18:00+1 and a 485-minute task is unplaced.

### AC9: `src/services/scheduler.test.ts`, "the hours and the windows come from the settings (AC9)"

- goes by working hours that were changed: after
  `setSetting(db, 'working_hours', { start: '10:00', end: '18:00' })`, a 30-minute task
  at 07:00 gets 10:00 to 10:30, and one at 17:40 gets 10:00+1 to 10:30+1.
- goes by a window that was changed: `slot_rules` set to the seeded rules with `coding`
  at `start: '10:00', end: '12:00'`; a 90-minute `morning` task at 07:00 gets 10:00 to
  11:30.
- reads the settings at each call: a 30-minute task at 07:00 starts at 09:00; after the
  hours are set to 11:00 to 18:00, the same call gives 11:00.

Also in this file, "storeSchedule":

- stores the times of the placed and the moved tasks, and nothing else of them: booked
  13:40 to 14:40, a 30-minute `urgent` task and a task with no minutes;
  `storeSchedule(db, place([urgent, stuck]))`; the booked row differs from before only
  in 14:10 to 15:10 and `updated_at`, the urgent row only in 13:40 to 14:10 and
  `updated_at`, and the third row is equal to what it was.

### AC10: `src/review-schedule.test.ts`, "a confirm schedules the drafts (AC10)" and "what changes no start and no end (AC10)"

- stores the start and the end of every draft, placed at the time of the request, and
  answers 303: `seed()`, `rows()`, the form as served is posted; 303 to `/review/1`; the
  three rows are equal to what they were with `status: 'pending'`, `updated_at: NOW` and
  `2026-10-13T05:00:00.000Z` to `06:30`, `2026-10-12T16:00:00.000Z` to `16:40`,
  `2026-10-12T09:40:00.000Z` to `09:55`.
- goes by the time of the request, not by the time the drafts were stored or served:
  the form is read at 9:00 AM and posted with the clock at `2026-10-12T19:30:00.000Z`;
  the starts are 09:00+1, 20:00+1 and 10:30+1.
- places the drafts with the posted minutes, priority and slot: posted with `slot-1`
  empty, `minutes-2` 50, `priority-3` `urgent`, `minutes-3` 30; the rows hold 90 `high`
  no slot at 14:10 to 15:40, 50 `medium` `night` at 20:00 to 20:50, 30 `urgent` at
  13:40 to 14:10.
- places all the drafts in one call: three `medium` 30-minute drafts confirmed as
  served get 13:40, 14:10 and 14:40, each 30 minutes.
- `it.each`, confirms a draft with 1000 minutes / with no minutes as pending with no
  times, and places the others: `low` 15, that draft as `high`, `low` 15. The first is
  posted as served; the second is posted with `title-2` only, because a blank minutes
  field is refused. 303; the rows are `pending` with 13:40 to 13:55, no times, and
  13:55 to 14:10.
- places a draft after a scheduled pending task of another source, which keeps its
  times: booked 13:40 to 14:30; a `low` 15-minute draft gets 14:30 to 14:45; the booked
  row is equal to what it was.
- moves a pending task of another source for an urgent draft, and stores its new times:
  booked `medium` 13:40 to 14:40 and `low` 14:40 to 15:10; a `low` 30-minute draft is
  posted as `urgent`; the rows are the first booked with 15:10 to 16:10 and
  `updated_at: NOW` and nothing else changed, the second booked equal to what it was,
  the draft `pending`, `urgent`, 13:40 to 14:10.
- stores nothing when the new times of a moved task cannot be written: booked `medium`
  13:40 to 14:40; drafts `urgent` 30 and `low` 15; `refuse('UPDATE', <the booked id>)`;
  the post with one edited title answers 500, every row is equal to what it was, and
  the two drafts are still drafts.
- stores no time when a draft cannot be written: `seed()`, `refuse('UPDATE', 3)`; 500,
  every row equal to what it was.

"what changes no start and no end", each with booked `medium` 13:40 to 14:40, a draft
`urgent` 30 that would move it, and a draft `low` 15:

- a confirm that is refused: posted with a blank `title-3`; 400; every row equal to
  what it was.
- a remove: `remove/3` posted with `minutes-2` 45; 303; the rows are the booked one as
  it was and the first draft with 45 minutes and `updated_at: NOW`, still a draft with
  no times.
- a discard: 303; the one row left is the booked one, as it was.
- a confirm on a source whose drafts are already confirmed: the first confirm is made
  at 9:00 AM (the booked task stays at 13:40; the drafts get 09:00 and 09:30); the
  clock moves to `2026-10-12T17:40:00.000Z`; the second confirm answers 303 and every
  row is equal to what it was.
- a confirm on a source with no task, even with no working hours to read: booked 13:40
  to 14:40, a source with nothing, the `working_hours` row deleted; 303; every row
  equal to what it was.

### AC11: `src/review-schedule.test.ts`, "the landing preview of a card (AC11)"; `src/dubai.test.ts`, "dayTimeLabel"

In `src/review-schedule.test.ts`, at `NOW` unless said:

- shows Tomorrow 9:00 AM, Today 8:00 PM and Today 1:40 PM for the three drafts:
  `lands` of the page of `seed()` is exactly those three.
- has one land element in each card, with an arrow that is hidden from a screen reader
  before the text: three `.land` on the page, one in each `[data-draft]`, inside the
  form; its `aria-hidden="true"` descendants are one element with the text `→`, which
  is its first child; `textOf(land)` is `→ ` followed by `visibleText(land)`.
- names the day after tomorrow by its date: three `high` `morning` 90-minute drafts
  show `Tomorrow 9:00 AM`, `14 Oct 9:00 AM`, `15 Oct 9:00 AM`.
- places all the drafts in one call: drafts `low` 15, `low` 15, `high` 60 show
  `Today 2:40 PM`, `Today 2:55 PM`, `Today 1:40 PM`.
- `it.each`, shows Not scheduled for a draft with 1000 minutes / with no minutes, and
  the time of the others: that draft as `high`, then `low` 15; `Not scheduled`,
  `Today 1:40 PM`.
- goes by the Dubai day of the request: a `low` 30-minute draft shows `Today 9:00 AM`
  with the clock at `2026-10-12T22:00:00.000Z` and `Tomorrow 9:00 AM` at
  `2026-10-12T19:30:00.000Z`.
- lands a draft after a scheduled pending task of another source: booked 13:40 to
  14:30; a `low` 15-minute draft shows `Today 2:30 PM`.
- goes by the settings: hours set to 15:00 to 21:00; `seed()` shows `Today 3:00 PM`,
  `Today 8:00 PM`, `Today 4:30 PM`.
- shows the preview of the stored values, not of the posted ones, on the page of a
  refused confirm: `seed()`; posted with a blank `title-1`, `slot-1` and `slot-2`
  empty, `priority-3` `urgent`, `minutes-3` 120; 400; the form of the answer holds the
  posted `slot-2`, `priority-3` and `minutes-3`, and `lands` is `Tomorrow 9:00 AM`,
  `Today 8:00 PM`, `Today 1:40 PM`.
- has no land element on a page without drafts, and reads no setting for it: a source
  with one pending task and a source with nothing, after `DELETE FROM settings`; both
  pages answer 200 with no `.land`.
- is styled as muted small text: in the stylesheet, `.land` has `color` of
  `var(--muted)` and `font-size` of `var(--font-size-sm)`.

In `src/dubai.test.ts`, "dayTimeLabel":

- `it.each(LABELS)`, shows %s, read at %s, as %s. Read at `2026-10-12T09:36:00.000Z`:
  `10-12T16:00Z` `Today 8:00 PM`; `10-12T09:40Z` `Today 1:40 PM`; `10-12T09:05Z`
  `Today 1:05 PM`; `10-12T05:00Z` `Today 9:00 AM`; `10-12T08:00Z` `Today 12:00 PM`;
  `10-12T07:59Z` `Today 11:59 AM`; `10-11T20:00Z` `Today 12:00 AM`; `10-12T19:59Z`
  `Today 11:59 PM`; `10-12T20:00Z` `Tomorrow 12:00 AM`; `10-13T05:00Z`
  `Tomorrow 9:00 AM`; `10-13T19:59Z` `Tomorrow 11:59 PM`; `10-13T20:00Z`
  `14 Oct 12:00 AM`; `10-14T05:00Z` `14 Oct 9:00 AM`; `10-11T16:00Z` `11 Oct 8:00 PM`.
  Read at `2026-10-12T22:00:00.000Z`: `10-13T05:00Z` `Today 9:00 AM`; `10-14T05:00Z`
  `Tomorrow 9:00 AM`. Read at `2026-12-30T10:00:00.000Z`: `2027-01-01T05:00Z`
  `1 Jan 9:00 AM`. Read at `2026-12-31T10:00:00.000Z`: `2026-12-31T20:30Z`
  `Tomorrow 12:30 AM`. Read at `2026-02-27T06:10:00.000Z`: `2026-03-05T06:10Z`
  `5 Mar 10:10 AM`. Nineteen rows, each a full timestamp in the file.
- `it.each(['America/New_York', 'Pacific/Kiritimati', 'UTC'])`, gives the same labels
  with TZ=%s: sets `process.env.TZ`; the nineteen labels are the same. `afterEach` puts
  the zone back, as in the scheduler tests.
- names every month: the 15th of each month of 2027 at `05:00Z` is `15 Jan 9:00 AM` to
  `15 Dec 9:00 AM`.
- writes plain spaces: each of the nineteen labels matches `/^[A-Za-z0-9: ]+$/`.

### AC12: `src/review-schedule.test.ts`, "the preview writes nothing, and a confirm stores what it showed (AC12)"

- leaves every task row as it was, the one an urgent draft would move included: booked
  `medium` 13:40 to 14:40, `seed()` and a fourth draft, `urgent` 30; `rows()`; the
  `GET` shows `Tomorrow 9:00 AM`, `Today 8:00 PM`, `Today 3:10 PM`, `Today 1:40 PM`;
  every row is equal to what it was, `updated_at` included, and the four drafts are
  drafts with no start and no end.
- writes nothing on the page of a refused confirm: the same tasks; posted with
  `minutes-2` of `abc`; 400; every row equal to what it was.
- stores for each draft the start its card showed, when the form is confirmed as served
  at the same time: the same tasks and two more drafts, `high` 1000 minutes and `high`
  `morning` 90; the page shows `Tomorrow 9:00 AM`, `Today 8:00 PM`, `Today 3:10 PM`,
  `Today 1:40 PM`, `Not scheduled`, `14 Oct 9:00 AM`; its form is posted with the clock
  unchanged; 303; the stored starts of the six are `2026-10-13T05:00:00.000Z`,
  `2026-10-12T16:00:00.000Z`, `2026-10-12T11:10:00.000Z`, `2026-10-12T09:40:00.000Z`,
  `null`, `2026-10-14T05:00:00.000Z`.

### AC13: the whole suite, and `src/review-actions.test.ts`

- Step 6: `yarn build` and `ANTHROPIC_API_KEY= yarn test` pass.
- The unit tests of gap filling, the slot window, overflow and bumping are the sections
  AC3, AC5, AC6 and AC7 above; every one of them passes its time in.
- Every new test uses `openDatabase(':memory:')` or `createTestApp`, whose database is
  in memory; step 6 checks that nothing appeared in `data/`.
- The five edited tests of `src/review-actions.test.ts` (D16) each compare the whole
  row of every confirmed task with its exact two timestamps: a confirm at
  `2026-03-04T06:06:07.089Z` puts the seeded drafts at 06:10 to 07:40, 07:40 to 08:20
  and 08:20 to 08:35 UTC; with the first at 95 minutes, 06:10 to 07:45, 07:45 to 08:25
  and 08:25 to 08:40; the `night` draft at 16:00 to 17:30. Step 3 shows that these five
  and no others fail before the edit.
