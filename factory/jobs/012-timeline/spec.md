# 012-timeline: day timeline with slot bands, now line and conflicts

## Goal

Confirmed tasks get times from the scheduler (009) and are listed on `/tasks` (010), but
nothing draws a day; the nav's Timeline link (`/timeline` in `src/ui.ts`) leads to the
not-found page. This job adds that page (`docs/plan.md`, task 11 and U7, and the
Timeline screen of `docs/mockUps.html`): one Dubai day as a vertical hour axis, with the
four slot bands labelled behind the blocks, one block per scheduled task placed at its
start, sized by its duration and colored by its priority, a hatched style where tasks
overlap, a now line, and a switcher to the day before and after.

It reads what is there: the `tasks` helpers of `src/db/tasks.ts`, the `working_hours`
setting (003), the priority and slot lists and labels of `src/ui.ts`, the priority and
slot color tokens of `public/css/base.css` (002), and `dubaiDay` / `dubaiDayStart` of
`src/dubai.ts`. The page writes nothing. It is plain HTML and CSS, with no client-side
script. The plan gives no slot hours, scale, parameter format or texts, so those below
are this spec's choices; the slot hours follow the mockup's bands. The routes read the
time once per request from the same test-settable clock 009 AC10 and 010 use.

Unless a criterion says otherwise, its examples use `now` = `2026-10-12T09:36:00.000Z`
(1:36 PM on Monday 12 Oct in Asia/Dubai), the seeded settings (working hours 9:00 to
22:00, so the axis spans 780 minutes), and Dubai clock times. A "percent" below is a
number within 0.01 of the exact value, written in the element's inline `style`.

## Acceptance criteria

- **AC1**: `GET /timeline` answers 200 with the app layout, the title `Timeline`, and the
  nav's Timeline link marked `aria-current="page"`. With no `date` parameter it shows the
  Dubai day of the request. `?date=YYYY-MM-DD` shows that Dubai day. A `date` that is not
  a real calendar date in that form (`2026-13-01`, `2026-02-30`, `tomorrow`, repeated
  values) shows the Dubai day of the request and still answers 200.
- **AC2**: Day switcher. The page has a heading with the day: `Today · 12 Oct`,
  `Tomorrow · 13 Oct`, `Yesterday · 11 Oct`, and otherwise the short weekday, as
  `Wed · 14 Oct`. It has a link with `aria-label="Previous day"` to
  `/timeline?date=2026-10-11` and one with `aria-label="Next day"` to
  `/timeline?date=2026-10-13` (for the day shown, here 12 Oct). When the day shown is not
  today, it also has a link `Today` to `/timeline`; on today it has none. Months and
  years roll over: the next day of `2026-12-31` is `2027-01-01`.
- **AC3**: Axis. The axis runs from the `working_hours` start to its end, read at the
  request, widened to whole hours to hold every block of the day (AC5): a task at
  7:30-8:00 AM makes it start at 7:00 AM; it never runs past midnight. The axis is one
  element with the class `tl`. It has one label with the class `hour` per whole hour from
  its start to its end, both included, with the text `9 AM`, `12 PM`, `10 PM` (`12 AM`
  for midnight) and `top` the percent of the axis at which that hour lies: `12 PM` at
  `23.08%`. After `setSetting(db, 'working_hours', { start: '10:00', end: '18:00' })` the
  labels run from `10 AM` to `6 PM`.
- **AC4**: Slot bands. The slot hours are fixed in code: `morning` until 12:00,
  `afternoon` 12:00-17:00, `evening` 17:00-20:00, `night` from 20:00. Each band is cut
  to the axis, and a band with nothing left is not rendered. A band is an element with
  the class `band` and `data-slot="<slot id>"`, holding the slot's label from `src/ui.ts`
  (`Night`, not the mockup's `8 PM slot`), with `top` and `height` in percent of the
  axis: `Morning` 0% and 23.08%, `Afternoon` 23.08% and 38.46%, `Evening` 61.54% and
  23.08%, `Night` 84.62% and 15.38%. The stylesheet gives `.band[data-slot="<id>"]` the
  background `var(--slot-<id>)` for each of the four slots. The bands come before the
  blocks in the document and sit behind them.
- **AC5**: Blocks. The day shows one block per task with the status `pending`,
  `in_progress` or `done` that has a `scheduled_start` and a `scheduled_end` and whose
  `scheduled_start` is on that Dubai day; a `draft`, and a task with no times, is never
  shown. A block is an element with the id `block-<task id>`, the class `blk` and the
  class `k-<priority>` (`k-none` for a null priority). Its `top` is the percent of the
  axis at its start and its `height` the percent its length is of the axis, its end cut
  at midnight: a 9:00-10:30 AM task has `top: 0%` and `height: 11.54%`, a 4:00-5:00 PM
  task `top: 53.85%` and `height: 7.69%`. It holds the title, escaped (`<b>x</b>` is
  text), the times as `9:00 AM–10:30 AM`, and `Done` or `In progress` for those statuses.
  An urgent block starts with `▲` marked `aria-hidden="true"`.
- **AC6**: Priority colors. The stylesheet gives `.k-<priority>` the background
  `var(--<priority>-bg)` and the border color `var(--<priority>)` for each of `urgent`,
  `high`, `medium` and `low`, so the colors follow the light and dark tokens. `.k-none`
  uses no priority token.
- **AC7**: Overlaps are laid out side by side. Two blocks of the day overlap when they
  share time; one that ends at the minute another starts does not. Each block's inline
  `style` also has `left` and `width` in percent of the area beside the hour labels. A
  block that overlaps no other has `left: 0%` and `width: 100%`. Blocks that overlap
  each other get ranges of `left` to `left + width` that do not intersect, and each
  stays within 0% to 100%.
- **AC8**: Conflicts. A block whose task is not `done` and overlaps another block whose
  task is not `done` also has the class `conflict`, and so does that other block. It
  ends with `⚠` marked `aria-hidden="true"` and holds the visually hidden text
  `Conflict`. A `done` task overlapping a pending one makes neither a conflict (009
  places pending tasks over a done task's old time). The stylesheet gives `.conflict` a
  `background-image` that is a `repeating-linear-gradient`. With pending tasks at
  2:00-2:45 PM and 2:30-3:00 PM, both blocks have `conflict`; with a third at
  3:00-3:30 PM, that one does not.
- **AC9**: Now line. When the day shown is the Dubai day of the request and the request
  time is inside the axis, the axis holds one element with the class `now` whose `top`
  is the percent of the axis at that time: `35.38%` at 1:36 PM. On any other day, and at
  a time before the axis starts or after it ends (8:00 AM or 11:00 PM today), there is
  no `now` element. The stylesheet gives `.now` the background `var(--urgent)`.
- **AC10**: Empty day. With no block on the day, the axis, its hour labels and its bands
  are still shown, with the text `Nothing scheduled` and a link to `/add`.
- **AC11**: The page writes nothing: after any `GET /timeline`, every task and settings
  row is as it was, `updated_at` included.
- **AC12**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. Tests run
  against a temporary or in-memory database and leave nothing in `data/`. There are
  tests for: the `date` parameter and its fallback (AC1), the switcher links across a
  month end (AC2), a widened axis (AC3), the four bands (AC4), a block's `top` and
  `height` and a hidden draft (AC5), two overlapping blocks not intersecting and their
  `conflict` class, with a touching pair and a done task that have none (AC7, AC8), and
  the now line present today and absent on another day (AC9). No existing test changes.

## Out of scope

- Tapping a block to open the task's detail sheet, and Start and Done from the timeline
  (013). Blocks are not links.
- Auto-scrolling to the now line; the plan lists it under UI feature ideas, which the
  backlog leaves out. Moving the now line without a page load.
- Placing `afternoon` and `evening` tasks in the band hours of AC4. The scheduler is
  unchanged: with the seeded rules it still places them as tasks with no slot (009 AC5).
  No backlog job takes this on; the bands are only drawn here.
- Making the slot hours a setting, or showing them on `/settings` (022).
- A task that starts before midnight and ends after it is shown on its start day only,
  cut at midnight.
- Dragging blocks to new times, and resolving a conflict from the page; Reschedule is on
  `/tasks` (010) and `/overdue` (011).
- A priority legend, and the Today page's own day view (014).
- A week or month view, and days off (009 treats every day as a working day).
- Checked by hand: nothing. The backlog lists no device or live-model check for 012.
