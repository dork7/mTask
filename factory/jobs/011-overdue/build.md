# 011-overdue: build

Branch `factory/011-overdue`, code commit `9a8a9a5`. Built on Node 26.8.2 and yarn 1.22.22.

## What changed

Created:

| File | Why |
| --- | --- |
| `src/services/overdue.ts` | `isOverdue`, `overdueGroups`, `readPickedStart`, `pickedTimes`, `OVERDUE_PATH`, `TaskTimes`, written as given in the design (D1, D2, D3, D4, D6) |
| `src/routes/overdue.ts` | `GET /overdue` and the three posts: id first, then the overdue guard, then `start` (D5, D7, D9, D10) |
| `src/views/pages/overdue.ejs` | The groups, the cards with three forms, the per-card refusal notice, the empty state (D8) |
| `src/services/overdue.test.ts` | Unit tests of the service (35 tests) |
| `src/overdue-page.test.ts` | AC1 to AC4 through the app (10 tests) |
| `src/overdue-actions.test.ts` | AC5 to AC9 through the app (25 tests) |

Changed:

| File | Why |
| --- | --- |
| `src/services/task-actions.ts` | `moveTask`, plus the `TaskTimes` type import (D6) |
| `src/routes/tasks.ts` | `findListedTask` is now exported. Nothing else changed (D9) |
| `src/app.ts` | Mounts `createOverdueRouter(deps)` right after the tasks router (D1) |
| `public/css/base.css` | `.overdue-group` and `.pick-form` styles, placed before the style guide block (D8) |

## Acceptance criteria

To fill in "Fails when", I applied each break by itself, ran the three new test files, and then restored the file. Every break failed at least one test. Each one failed between 1 and 11 of the 70 tests, so none of them failed just because the code stopped compiling. The test names below are shortened.

| Criterion | Test | Fails when | Result |
| --- | --- | --- | --- |
| AC1: 200, layout, title `Overdue` | page: "is served in the layout with the title Overdue and no current nav item" | `nav: 'tasks'` passed to `renderPage` | PASS |
| AC1: no nav link is `aria-current` | same | same | PASS |
| AC1: one `task-<id>` card per overdue task | page: "shows only the pending tasks whose end is before now" | `isOverdue` without the status check, or with `status !== 'draft'` (the `isListed` rule) | PASS |
| AC1: end exactly at `now`, or later, is not shown | same, plus unit `isOverdue` "is false … ends exactly at now" | `<` changed to `<=` in `isOverdue` (5 tests fail) | PASS |
| AC1: no `scheduled_end`, draft, in_progress, done are not shown | same, plus unit `isOverdue` it.each | status check dropped (7 tests fail) | PASS |
| AC2: Today / Yesterday / Earlier, in that order | page and unit: "puts the spec examples …" | `GROUPS` in reverse order; `yesterday` mapped to `earlier` | PASS |
| AC2: grouped by the Dubai day of `scheduled_end` | unit: "groups by the Dubai day of the end, not the UTC day"; page: "groups a task by the Dubai day of its end, not of its start" | grouping on the UTC day; grouping on `scheduled_start` | PASS |
| AC2: an empty group is not rendered | page: "renders no group without a task"; unit: "leaves out the groups without a task" | the `filter` on empty groups removed | PASS |
| AC2: within a group, by `scheduled_start`, ties by `id` | page: "orders a group by start, ties by id"; unit order test | no sort; ties reversed (`b.id - a.id`); a null start sorted first | PASS |
| AC2: the spec's fourth task (ends at `now`) is not shown | page and unit spec-example tests | `<=` in `isOverdue` | PASS |
| AC3: title, escaped | page: "shows the escaped title, the minutes, the badge and when it was due" | `<%-` for the title | PASS |
| AC3: `<n> min` / `No estimate` | that test, and "says No estimate, has no badge …" | ` min` dropped; `NO_ESTIMATE` set to `''` | PASS |
| AC3: priority badge, none when null | the same two tests | the badge `if` set to `false` | PASS |
| AC3: due as `dayTimeLabel(scheduled_start, now)` | the same two tests | label taken from `scheduled_end`; the raw timestamp shown | PASS |
| AC4: empty state `Nothing overdue`, link to `/tasks`, no group heading | page: "says Nothing overdue and links to the task list …" | the empty-state `if` set to `false`; `emptyHref` set to `/` | PASS |
| AC4: no empty state when a task is overdue | page: "is not there when a task is overdue" | the empty-state `if` set to `true` | PASS |
| AC5: a Mark done form posting to `/overdue/<id>/done` | actions: "is one form on each card that posts to /overdue/<id>/done" | action path changed | PASS |
| AC5: `done`, `completed_at` = request time, the rest kept, other task untouched | actions: "makes the task done at the time of the request …" | `completed_at: null` in `markDone` | PASS |
| AC5: 303 to `/overdue` | same | redirect to `/overdue#task-<id>` (4 tests fail) | PASS |
| AC6: a Reschedule form posting to `/overdue/<id>/reschedule` | actions: "is one form on each card that posts to /overdue/<id>/reschedule" | action path changed | PASS |
| AC6: spec example to `09:40Z`–`10:10Z`, then gone from the page, 303 | actions: "places the task again at the time of the request, and it leaves the page" | guard inverted (`!isOverdue`) | PASS |
| AC6: one transaction, tasks an urgent one moves are stored | actions: "stores the new times of a task an urgent one moves" | `moved` dropped from the stored schedule | PASS |
| AC6: a task that can't be placed keeps its times and stays on the page | actions: "keeps a task the scheduler cannot place, and it stays on the page" | not broken separately: this is 010's `rescheduleTask` behaviour, and the test passes against it as it is | PASS |
| AC7: a form with a labelled `datetime-local` `start` and a submit button | actions: "is one form on each card with a labelled datetime-local start …" | `type="text"`; the label's `for` no longer matching | PASS |
| AC7: read on the Dubai clock (`18:00` to `14:00Z`–`14:30Z`) | actions: "moves the task to the picked Dubai time …"; unit `readPickedStart` "reads …" | Dubai offset dropped (11 tests fail) | PASS |
| AC7: keeps the current length, changes no other task, overlap allowed | same, plus "keeps the scheduled length over the estimate, outside the working hours"; unit `pickedTimes` | length taken from `estimated_minutes`; scheduler called in place of `moveTask` | PASS |
| AC7: `13:36` (= `now`) is accepted | actions: "accepts the minute of now"; unit | `<=` in `readPickedStart` | PASS |
| AC8: missing, blank, posted twice, wrong form, not a real date, before `now` give 400 | actions: AC8 it.each (6 cases); unit `readPickedStart` "refuses …" (15 cases) | `start < now` check dropped; round-trip check dropped (fails on `2027-02-29`); hour and minute limits dropped; `m` flag; leading `\s*`; repeated field read as its first value | PASS |
| AC8: the message once, inside `task-<id>` only, on the overdue page | AC8 it.each | message put on every card (6 tests fail); `aria-invalid` dropped | PASS |
| AC8: stores nothing | AC8 it.each | a refusal that writes the row (7 tests fail) | PASS |
| AC8: answers 400 | AC8 it.each | refusal answered with 200 (7 tests fail) | PASS |
| AC8 (design D6): an end past the year 9999 is refused, not a 500 | actions: "refuses a time whose end could not be stored …"; unit `pickedTimes` | `isTimestamp` guard dropped | PASS |
| AC9: unknown, draft, or malformed id gives 404 not-found and no row changes | actions: "answers 404 for /overdue/%s/…" (`2` draft, `99`, `01`, `1e0`, `abc`) | `findListedTask` without `isListed` (draft case fails); the route answering its own 404 instead of `next()` (5 tests fail) | PASS |
| AC9: a task that is not overdue gives 303 and no change (in_progress, done, pending ending at `now`) | actions: "changes nothing on %s and goes back to the view" | Done guard dropped; Reschedule guard dropped; pick guard dropped | PASS |
| AC9: for AC7, the no-op comes before the `start` check | same, posting `start=bogus` | `start` checked before the guard (3 tests fail) | PASS |
| AC10: build and test with `ANTHROPIC_API_KEY` unset; nothing in `data/`; tests for each listed item; no existing test changed | the whole suite | n/a | PASS. `data/` held only `app.db`, last modified 17:50, before and after the run. `git diff --stat main...HEAD -- '*.test.ts'` lists only the three new files. |

Checked by hand: port 3000 was already held by a process I did not start, so I left it alone. I ran `PORT=3011 DATABASE_PATH=:memory: node src/server.ts` instead. `curl localhost:3011/overdue` showed `<title>Overdue - Task Image AI</title>`, `Nothing overdue` and `See all tasks`. Afterwards I stopped that server, and `lsof` showed nothing on port 3011.

## Test run

```
$ yarn build
$ tsc --noEmit
Done in 1.51s.

$ env -u ANTHROPIC_API_KEY yarn test
 Test Files  48 passed (48)
      Tests  1629 passed (1629)
Done in 3.01s.
```

```
VERIFICATION
Build: PASS
Tests: PASS   (1629 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

The diff against `main` contains the job's spec, design, plan and the `backlog.md` line, all committed before this build, plus exactly the files listed in the design. It has no `.only`, `.skip`, TODO, debug output or machine paths.

## Not done

Nothing in the spec was skipped. There are two small differences from the plan:

- **Step 3 check.** The plan says to run `yarn dev` on port 3000. Port 3000 was held by a process I did not start, so I ran the server on port 3011 against an in-memory database, as described above.
- **AC2 order test.** The plan's three-task order test holds only one tie and no null start. The page test follows the plan. The unit test adds a fourth and fifth task: a second tie and a task without a start, which must sort last.
