# 012-timeline: build

Branch `factory/012-timeline`, code commit `bfe3291`. Built on Node 26.8.2, yarn 1.22.22.

## What changed

Created:

| File | Why |
|---|---|
| `src/services/timeline.ts` | The pure timeline builder: day from the query, heading, switcher links, axis, hour labels, slot bands, blocks, columns, conflicts, now line (D1, D3 to D12). Copied from the design. |
| `src/routes/timeline.ts` | `GET /timeline`: reads the clock once, `working_hours` and `listTasks`, renders the page; writes nothing (D1, D16). |
| `src/views/pages/timeline.ejs` | The page: header with Today link, switcher, empty state, `.tl` with bands, hours, `ol.tl__blocks`, now line (D5, D7, D11, D14). |
| `src/services/timeline.test.ts` | Unit tests: `readDay`, an axis off the hour, seven overlapping blocks, column reuse. |
| `src/timeline-page.test.ts` | Page tests for AC1 to AC11. |

Changed:

| File | Why |
|---|---|
| `src/dubai.ts` | Exports `DAY_MS` and `MONTHS`; adds `clockLabel`, `dayOfDate`, `dateOfDay`; `dayTimeLabel` calls `clockLabel` (D2). |
| `src/app.ts` | Mounts the timeline router after the tasks router (Files). |
| `public/css/base.css` | Timeline rules before the style guide section (D13, D14). |
| `src/shell.test.ts` | `'/timeline'` removed from two `it.each` lists (D15). |

## Acceptance criteria

All tests below are in `src/timeline-page.test.ts` (page) or `src/services/timeline.test.ts` (unit).

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1 200, layout, title, nav current | page: "answers with the layout, the title and the Timeline link current, on today" | (route mounted; before it, `/timeline` was a 404) | PASS |
| AC1 `?date` shows that day | page: "shows the day a date names", "shows the tasks of the day it names, not only its heading"; unit: "reads a date given once", "accepts a leap day" | — | PASS |
| AC1 bad `date` falls back | page: "falls back to today for %s" (6 cases); unit: "falls back to today for %s" (5 cases) | `dayOfDate` without the round-trip: `?date=2026-02-30` and `2026-02-29` fail | PASS |
| AC1 Dubai clock in any TZ | page: "reads the day and the times on the Dubai clock in another time zone" | `clockLabel` with `getHours`: fails (and the AC5 times test) | PASS |
| AC2 heading Today/Tomorrow/Yesterday/weekday | page: "on %s says %s and links back to today", "shows the day a date names", "rolls over…" | — | PASS |
| AC2 prev/next links, Today link only off today | page: "links the day before and after, and has no Today link on today" | `todayHref` always set: fails | PASS |
| AC2 month and year roll over | page: "rolls over the end of a year and of a month" | — | PASS |
| AC3 axis from working hours, labels and tops | page: "runs over the working hours with a label per hour"; unit: "labels only the whole hours of an axis that is off the hour" | — | PASS |
| AC3 widened to hold blocks | page: "widens to the hour before a block that starts early" | `axis.start` without the blocks: fails (and the widened now-line test) | PASS |
| AC3 never past midnight | page: "widens up to midnight and no further, cutting a block there" | — | PASS |
| AC3 setting read at the request | page: "follows the working hours setting read at the request" | — | PASS |
| AC4 four bands, labels, top/height | page: "draws the four bands in percent of the axis" | band start not cut to the axis: fails | PASS |
| AC4 cut to axis, empty band dropped | page: "cuts the bands to the axis and leaves out a band with nothing left" | same break: fails | PASS |
| AC4 bands before blocks, slot tokens | page: "puts the bands before the blocks, inside the axis", "colors each band with its slot token and stacks it without a z-index" | — | PASS |
| AC5 top/height, classes, escaped title, times | page: "places a block by its start and length…", "places an afternoon block" | — | PASS |
| AC5 Done / In progress | page: "says In progress and Done for those statuses" | — | PASS |
| AC5 ▲ for urgent, `k-none` | page: "marks an urgent block with a hidden ▲ and a null priority with k-none" | — | PASS |
| AC5 drafts, no times, other days hidden | page: "shows only confirmed tasks with both times that start on the Dubai day" | `isShownOn` without the status check: fails | PASS |
| AC6 priority tokens, `k-none` uses none | page: "tints each priority with its tokens, and k-none with none of them" | `.k-high` with `color` in place of `border-color`: fails | PASS |
| AC7 side by side, touching pair and lone block full width | page: "lays overlapping blocks side by side and a touching or lone block full width"; unit: seven blocks, column reuse | `overlaps` with `<=`: the touching-pair conflict test fails; columns with `end < span.start`: column reuse fails; width as `round2(100 / count)`: seven-block test fails | PASS |
| AC8 conflict class, ⚠, hidden `Conflict` | page: "marks two open overlapping blocks as conflicts and a touching one not" | — | PASS |
| AC8 done makes no conflict | page: "makes no conflict of a done task over a pending one, but lays them side by side" | conflict not excluding `done`: fails | PASS |
| AC8 hatch over the tint | page: "hatches a conflict over the priority tint" | `.conflict` moved before the `.k-*` rules: fails | PASS |
| AC9 now line today | page: "is drawn on today at the request time", "is drawn inside an axis widened by a block" | — | PASS |
| AC9 none on another day | page: "is not drawn on %s", "is not drawn at midnight on the day before, whose axis ends at that midnight" | now line without `day === today`: only the midnight test fails (see below) | PASS |
| AC9 none outside the axis | page: "is not drawn at %s, outside the axis" | — | PASS |
| AC9 `.now` colored urgent | page: "is colored urgent" | — | PASS |
| AC10 empty day | page: the three tests of "the empty day (AC10)" | empty state on every day: "has no empty state with a block today" fails | PASS |
| AC11 writes nothing | page: "leaves every task and settings row as it was" | the route calling `updateTask(deps.db, id, {})` for each scheduled task: fails | PASS |
| AC12 build, tests, no `data/` | the full run below | — | PASS |

Every break above was made on its own, the named test file was run once, and the file
was put back. No run reported `EADDRNOTAVAIL`.

The plan's AC9 break (`day === today` dropped) at first failed no test: on any other day
the request time lies outside that day's axis, since an axis stays within 0 to 1440
minutes. The one case where the check matters is a request at exactly 00:00 viewing the
day before, when a block runs to midnight and that day's axis ends at `12 AM`. I added
the test "is not drawn at midnight on the day before…" for that case, and it fails under
the break.

Nothing was checked by hand; the spec asks for no check by hand.

## Test run

```
$ env -u ANTHROPIC_API_KEY yarn build
$ tsc --noEmit
Done in 1.07s.

$ env -u ANTHROPIC_API_KEY yarn test
 Test Files  47 passed (47)
      Tests  1611 passed (1611)
   Duration  2.71s (tests 63%, import 28%, transform 8%)
Done in 3.14s.
```

`git status --short` showed only the job's files. Nothing new under `data/` (the existing
`data/app.db` dates from 13 Oct and is gitignored), and no `.vitest/` folder.

```
VERIFICATION
Build: PASS
Tests: PASS   (1611 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped. Departures from the plan:

- I added one test beyond the plan's list, the midnight now-line case described above.
  Without it the plan's AC9 break went uncaught.
- An extra break that no test catches: `dayHeading` using `getDay()` in place of
  `getUTCDay()`. The time-zone test runs under `Pacific/Kiritimati` (UTC+14), where the
  local weekday of a UTC midnight is the same day, and it checks only the `Today`
  heading. A zone west of UTC would catch it. Neither the plan nor the spec asks for
  this, so I left it as it is.
- `src/shell.test.ts` changes in the two lines D15 names, which the design takes as its
  reading of "No existing test changes".
