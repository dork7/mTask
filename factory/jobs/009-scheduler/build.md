# 009-scheduler: build

Branch `factory/009-scheduler`, code commit `e76b31e`. Built on Node 26.8.2 and yarn
1.22.22.

This build was finished in a second session. The first session was cut off after it
had written every file of the plan, uncommitted. The second session read that work
against `design.md` and `plan.md`, found it matched, re-ran every check of the plan,
broke each behaviour again to see its tests fail, added one test case (Not done), and
made the two commits.

## What changed

Created:

| File | Why |
|---|---|
| `src/dubai.ts` | The Dubai clock as arithmetic on UTC milliseconds: `dubaiDay`, `dubaiDayStart`, `clockMinutes`, `dayTimeLabel` (D2, D14). The text of the design. |
| `src/services/scheduler.ts` | `placeTasks`, which only reads, and `storeSchedule`, which writes (D1, D3 to D11). The text of the design. |
| `src/dubai.test.ts` | AC1 (clock minutes, the Dubai day) and AC11 (the labels), 32 tests. |
| `src/services/scheduler.test.ts` | AC1 to AC9 and `storeSchedule`, 77 tests (the plan's 76 and one more, see Not done). |
| `src/review-schedule.test.ts` | AC10, AC11 and AC12 through the app, 30 tests. |

Changed:

| File | Why |
|---|---|
| `src/services/drafts.ts` | `confirmDrafts` takes `now` and places and stores the confirmed rows in its transaction (D13). |
| `src/routes/review.ts` | `new Date()` read once per request (D12); `renderReview` previews the stored drafts in one call and each card gets `land` (D14). |
| `src/views/pages/review.ejs` | The `.land` line with its `aria-hidden` arrow, and the header comment (D15). |
| `public/css/base.css` | The `.land` rule, between `.stepper__unit` and `.choices` (D15). |
| `src/review-actions.test.ts` | The five tests that compare a confirmed row gain its exact times, through `scheduled`, `SEEDED_TIMES` and `EDITED_TIMES` (D16). |

## Acceptance criteria

"Fails when" is the change made to the code for the check. Each was applied alone, the
named test file run, and the file put back. Counts are of that file's run.

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1 never reads the clock | "follows the argument when the system clock is on another day", "gives the same result at two times of the system clock" | `place(task, Date.now(), taken)` for a task that is not urgent | 55 failed |
| AC1 `HH:MM` on the Dubai clock whatever `TZ` | "reads the hours on the Dubai clock with TZ=…" (3) | `dubaiDayStart` from `new Date(year, month, day)` (the plan's step 2 check) | 3 failed, exactly those |
| AC1 the zone tests mean something | "changes the zone of the process when TZ is set" | (checks the runner; it passes because `TZ` does change `getHours()` here) | passes |
| AC1 stored timestamp format | "returns stored timestamps" and every placement test | `scheduled_start: String(entry.start)` | 71 failed |
| AC2 start on a 5-minute mark, `now` rounded up | "at %s it starts at %s" (5), "gives a 15-minute task … next 5-minute mark" | `nextMark` returns `at`; and, separately, rounds down | 37 failed; 36 failed |
| AC2 end = start + minutes | every placement test | end is start + minutes + 5 | 64 failed |
| AC2 whole length inside one day's hours | "ends a task at the end of the working hours, and takes one that is 5 minutes longer to the next day" | the loop tests `start <= windowEnd` | 13 failed |
| AC3 earliest gap, may start where another ends | "puts a 30-minute task in the gap …", "skips a gap that is 5 minutes too short" | overlap counts touching tasks | 27 failed, in a second (D7's guard held: no hang) |
| AC3 `in_progress` takes time | "is kept out by an in_progress task" | only `pending` is read | 3 failed |
| AC3 `draft` and `done` take none | "takes the time of a draft task", "… a done task" | every task is read as taking time | 4 failed |
| AC3 a task being placed is not in its own way | "ignores the time a task that is being placed already has" | handed-in tasks are not left out | 1 failed |
| AC3 others not moved | "does not move the tasks that are not being placed" | covered by the AC7 "every task after is moved" row | — |
| AC4 by priority then id | "places them by priority and then by id …", "goes by id, not by the order …" | no sort | 2 failed |
| AC4 no priority is `low` | "places them by priority and then by id …" | no priority ranks as `urgent` | 1 failed |
| AC4 each takes time from the next | "lets no two of them overlap …" and others | a placed task is not added to the taken list | 11 failed |
| AC5 inside the slot's window | "puts a 40-minute night task at 8:00 PM today", "… morning task at 9:00 AM tomorrow …" | slot ignored | 13 failed |
| AC5 rule by `time_slot` | "goes by the slot of the task, not by its category" | rule found by category | 13 failed |
| AC5 first rule wins | "takes the window of the first rule that names the slot" | `findLast` | 1 failed |
| AC5 window cut to the hours (D6) | "cuts a window to the working hours, and drops one that lies outside them" | window not cut | 1 failed |
| AC5 longer than its window → no slot | "places a task that is longer than its window as one with no slot" | the window is returned whatever its length | 2 failed |
| AC6 later days | "passes over a full day to the day after it", the second `morning` task | the search ends on the day after the first day | 4 failed |
| AC7 urgent ignores lower pending tasks | "gives an urgent task the nearest gap …" | the urgent task has every task in its way | 14 failed |
| AC7 kept out by urgent and `in_progress` | "is kept out by an urgent task and by an in_progress task" | `in_progress` not in its way | 2 failed |
| AC7 only overlapped tasks move | "gives an urgent task the nearest gap and moves the medium task …, not the low one after it" | every task starting after the urgent one is bumped | 3 failed |
| AC7 placed again at or after the urgent end | "places a bumped task at or after the end of the urgent task …" | bumped tasks placed from `now` | 1 failed |
| AC7 order priority, old start, id (D8) | "places the bumped tasks again by priority, then by their old start, then by id" | old start dropped from the sort | 1 failed |
| AC7 bumped give up times together (D8) | "lets no bumped task stand in the way of another" | each bumped task freed and placed one at a time | 1 failed |
| AC7 / D8 an unplaceable bumped task stays | "places a bumped task around a task with no minutes / with more minutes than the working day …" | every overlapped task is bumped | 2 failed |
| AC8 too long is not placed | "reports a task with 781 / 1440 minutes …", "goes by the working hours of the setting", the 781-minute D8 case | the too-long check removed from `windowOf`, and the search throws when it finds nothing | 4 failed |
| AC8 too long cannot be bumped (D8) | "places a bumped task around a task with more minutes than the working day …" | the too-long check removed from `windowOf` | 1 failed (see Not done) |
| AC9 from `settings`, read at the call | the three AC9 tests | hours written as 540 to 1320 | 4 failed |
| AC10 a confirm stores the times | "stores the start and the end of every draft …" and 10 more | `storeSchedule` call removed from `confirmDrafts` | 11 failed |
| AC10 the posted values | "places the drafts with the posted minutes, priority and slot" | the drafts as read, not as stored, are placed | 2 failed |
| AC10 moved tasks stored | "moves a pending task of another source for an urgent draft …" | `storeSchedule` writes only `placed` | 2 failed |
| AC10 all or none | "stores nothing when the new times of a moved task cannot be written" | the schedule stored after the transaction | 1 failed |
| AC10 time of the request | "goes by the time of the request …" and 9 more | the confirm is placed at a fixed 9:00 AM | 10 failed |
| AC10 400, remove, discard, no drafts change no times | "what changes no start and no end" (5) | the preview stores its schedule (AC12 row) | among 4 failed |
| AC11 one call for all drafts | "names the day after tomorrow by its date", "places all the drafts in one call" | each draft placed alone | 5 failed |
| AC11 `Not scheduled` | "shows Not scheduled for a draft with %s …" (2) | the text is empty | 3 failed |
| AC11 `Today` / `Tomorrow` / `D Mon`, Dubai day, no leading zero | the `dayTimeLabel` table (19), "names every month", "gives the same labels with TZ=…" | day by UTC; leading zero; month off by one; hour by `getHours()` | 9; 14; 9; 3 failed |
| AC11 arrow `aria-hidden`, inside the element | "has one land element in each card …" | arrow not hidden; arrow outside `.land` | 12; 1 failed |
| AC11 refused confirm previews stored values | "shows the preview of the stored values, not of the posted ones …" | the preview places the posted slot, priority and minutes | 1 failed |
| AC11 style | "is styled as muted small text" | `color: var(--text)` | 1 failed |
| AC12 the preview writes nothing | "leaves every task row as it was …", "writes nothing on the page of a refused confirm" | `renderReview` stores the schedule | 4 failed |
| AC12 a confirm stores what was shown | "stores for each draft the start its card showed …" | covered by the "each draft alone" and "time of the request" rows | — |
| AC13 existing tests changed only as D16 | the five tests of `src/review-actions.test.ts` | the file at `main` run against the new code | exactly those 5 failed, 73 passed (78) |
| AC13 build and test with no API key | step 6 | — | below |
| AC13 nothing in `data/` | — | `data/app.db` (ignored) last changed at 17:50, before this session; no new file | — |

Checked by hand: nothing (the spec names none). The review page was not looked at in a
browser in this session.

## Test run

```
$ yarn build
$ tsc --noEmit
Done in 1.09s.

$ ANTHROPIC_API_KEY= yarn test
 Test Files  41 passed (41)
      Tests  1470 passed (1470)
   Duration  2.08s
Done in 3.49s.
```

```
VERIFICATION
Build: PASS
Tests: PASS   (1470 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

The diff holds the ten files of the design's Files list and this report; no `.only`,
`.skip`, TODO, debug output or machine path.

## Not done

- One test case more than the plan: in `src/services/scheduler.test.ts`, "places a
  bumped task around a task that cannot be placed again" became an `it.each` over no
  minutes and 781 minutes, so the suite has 1470 tests, not 1469. Removing the too-long
  check from `windowOf` changed no test of the plan: AC8's results stay the same because
  the search finds no start anyway. But D8 then bumps a too-long pending task, and it
  stops standing in the way of the other bumped tasks. The new case fails for that.
- Nothing in the spec was skipped.
