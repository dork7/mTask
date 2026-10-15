# 014-today-dashboard: build

Branch `factory/014-today-dashboard`, code commit `b462e9a`. Built on Node 26.8.2 and
yarn 1.22.22.

## What changed

Created:

| File | Why |
| --- | --- |
| `src/services/today.ts` | `buildToday` and its parts: today's tasks, tasks left, Next up, Later today, progress, the overdue count, quick add. Copied from the design (D2, D4, D5, D8, D10). |
| `src/services/today.test.ts` | Unit tests: id tie-break, input order kept, rounding, nothing planned, banner count, empty category, Later dot tone and name, `quickAdd` identity (D2, D4, D8, D10). |
| `src/today-page.test.ts` | Page tests for AC1 to AC9 over `createTestApp` (plan, Tests). |
| `src/dubai-weekday.test.ts` | `weekdayDateLabel` in the process time zone and in `Pacific/Kiritimati` (D3). |
| `docs/errors/inline-style-on-home-page-fails-the-style-guide-test.md` | The error the design's inline progress width raised, and its fix (see Not done). |

Changed:

| File | Why |
| --- | --- |
| `src/dubai.ts` | `WEEKDAY_NAMES` and `weekdayDateLabel` (D3). |
| `src/routes/home.ts` | `createHomeRouter(deps)` reads every task once and `requestTime(res)`, renders `home` with `today` (D1). |
| `src/app.ts` | Imports and mounts `createHomeRouter(deps)` where `homeRouter` was, right after the mini-bar middleware (D1). |
| `src/views/pages/home.ejs` | The dashboard template of the design (D6 to D10), with the progress fill drawn as an SVG `rect` instead of an inline-styled `div` (D7, see Not done). |
| `public/css/base.css` | The Today rules of D11, after `.mini-bar__title` and before the style guide; `.progress__track` and `.progress__fill` adjusted for the SVG bar. |

## Acceptance criteria

All tests below are in `src/today-page.test.ts` unless named otherwise. Each break was
made in the source, the named test seen failing, and the file restored.

| Criterion | Test | Fails when | Result |
| --- | --- | --- | --- |
| AC1 | "the page (AC1)": title, `<h1>Today</h1>` in `main`, one `aria-current` to `/`, `Monday, 12 Oct`, no `No tasks yet`; `Tuesday, 13 Oct` at 00:30 Dubai; escaping | Sub-line hard-coded to `'Monday, 12 Oct'`: "writes the date of the Dubai day of the request" failed. `<%= today.nextUp.title %>` made `<%-`: "escapes the task text" failed. `getUTCDay` made `getDay`: 3 cases of `src/dubai-weekday.test.ts` failed. | PASS |
| AC2 | "Next up (AC2)": spec example, 1:00 PM task created last, end equal to now, never in progress/done/draft, meta parts, no badge for null priority | Overdue filter removed from `tasksLeft`: "is the first pending task…", "goes by start time…" (and AC4, AC7 tests) failed. `join(' · ')` made `join('')`: the spec example, escaping and Later tests failed. | PASS |
| AC3 | "Start (AC3)": form method/action/button; post gives 303 to `/tasks/1`, task in progress at NOW, task 2 becomes Next up; last one started gives the empty state | `startAction` made `/tasks/<id>/begin`: "is a form that posts…" and "starts the task…" failed. | PASS |
| AC4 | "nothing next (AC4)": empty state with no task; none from overdue/running/done/tomorrow; absent with a Next up task | Heading made `Nothing next`: "renders the empty state with no task" and "takes no overdue…" failed. | PASS |
| AC5 | "overdue banner (AC5)": `2 overdue tasks Review` over two days and five statuses; singular; absent | `overdueCount` counted `todaysTasks` only: "counts the pending tasks whose end has passed, on any day" failed. | PASS |
| AC6 | "progress (AC6)": spec example `75 of 240 min done`, `2 of 5 tasks finished`, `31%`, ARIA and fill width; zero cases. `src/services/today.test.ts` "progressOf" for 67% and 0% | Counted `actual_minutes ?? estimated_minutes`: the spec example failed. `Math.round` made `Math.ceil`: the spec example failed. Fill width fixed at `100%`: all three progress tests failed. | PASS |
| AC7 | "later today (AC7)": order `later-4, later-1, later-3`, item parts, `d-high`/`d-none`, absent cases, `.d-<p>` stylesheet rules | `later` built from all of `left` (Next up included): order test and "is not rendered with only the Next up task" failed. Sort by id instead of start: order test and AC2 "goes by start time" failed. `.d-high` given `var(--medium)`: "colours the dot of a high task" failed. Tie-break removed: `src/services/today.test.ts` "breaks a tie of start times by id" failed. | PASS |
| AC8 | "quick add (AC8)": three links in order, each with one `aria-hidden` glyph, with and without tasks | Voice and Type swapped in `QUICK_ADD`: both cases failed. `aria-hidden` removed from the glyph: both cases failed. | PASS |
| AC9 | "reading only (AC9)": tasks and settings equal before and after two `GET /` an hour later, with an in-progress task so the mini-bar renders | Route ran `UPDATE tasks SET updated_at = …` before rendering: "leaves every task and setting as it was" failed. | PASS |
| AC10 | The whole suite below, with `ANTHROPIC_API_KEY` unset | `data/` listed the same before and after the run, and `git status --short data/` was empty. No existing test file was edited. | PASS |

Checked by hand: nothing in a browser. The spec asks for no check by hand beyond the
plan's "Done when", which is left to the user.

## Test run

`yarn build` (with `ANTHROPIC_API_KEY` unset):

```
yarn run v1.22.22
$ tsc --noEmit
Done in 2.04s.
```

`yarn test` (with `ANTHROPIC_API_KEY` unset):

```
 Test Files  59 passed (59)
      Tests  1862 passed (1862)
   Start at  17:09:59
   Duration  2.78s (tests 61%, import 31%, transform 7%)

Done in 3.20s.
```

```
VERIFICATION
Build: PASS
Tests: PASS   (1862 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped. One departure from the design:

- **The progress fill is an SVG `rect` with a `width` attribute, not a `div` with
  `style="width: N%"` (D7).** The first full run failed one existing test,
  `src/components.test.ts` "has no inline style outside the style guide", which allows no
  `[style]` element on `/`. Following the plan, the existing test was left as it is and
  the design changed instead. The bar is now
  `<svg class="progress__track" aria-hidden="true" focusable="false"><rect class="progress__fill" width="<percent>%" height="100%"></rect></svg>`,
  and `.progress__fill` has `fill: var(--accent)` in place of `height` and
  `background`. `.progress__track` gained `display: block` and `width: 100%`. The
  progressbar ARIA stays on `#progress`, as the spec asks. The plan's AC6 check of
  `style="width: 31%"` on `.progress__fill` reads the `width` attribute (`31%`)
  instead. Logged as
  `docs/errors/inline-style-on-home-page-fails-the-style-guide-test.md`.
- The AC9 test moves the clock straight to one hour after `NOW` rather than through
  `rows()` first, as the plan's wording does. The before state is still taken before
  the move.
