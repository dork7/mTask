# 012-timeline: design

One spec problem, and four readings of things the spec leaves open:

- **AC12 against the code: two existing test lines have to change.** `src/shell.test.ts`
  has `it.each(['/no-such-page', '/timeline', '/_styleguide'])('marks no link as current
  on %s', …)` and `it.each(['/timeline', '/more'])('%s answers with the not-found page
  until its job builds it', …)`. AC1 makes `/timeline` answer 200 with the Timeline link
  marked `aria-current="page"`, so both `/timeline` cases fail (checked: with the code of
  this design and the file as it is, exactly those two tests fail, 1557 of 1559 pass).
  The reading, as 010 did for `/tasks` (010 D14): `'/timeline'` is removed from those two
  lists and nothing else in any existing test file changes (D15). If "No existing test
  changes" is meant to the letter, the job is blocked; nothing else stands in the way.
- AC9, "inside the axis": both ends count. At exactly the axis start or end the now line
  is drawn, at `0%` or `100%` (D9).
- AC5, the times a block shows: the stored start and end on the Dubai clock, also when
  the end is after midnight and the block itself is cut there (D7).
- AC1, a `date` is accepted for any year `0000` to `9999` that round-trips (D3). The
  "Next day" link of `9999-12-31` is then not in the `YYYY-MM-DD` form and falls back to
  today; nothing is done about that one day.
- AC10, where `Nothing scheduled` goes: an empty-state above the axis, with a button link
  `Add a task` to `/add` (D11).

Everything marked "checked" was run in a throwaway copy of the repo under `$TMPDIR`
(`git archive HEAD`, the repo's `node_modules` linked in): Node 26.8.2, yarn 1.22.22,
TypeScript 5.9.3, Vitest 5.0.1, Express 5.3.0, jsdom 30.1.1. The code below was built
there in full (the `src/dubai.ts` changes, the service, the route, the page, the CSS, the
wiring) with a prototype test of the spec's own numbers: every percent of AC3, AC4, AC5
and AC9, the conflict example of AC8, the switcher across the year end, the fallbacks of
AC1, the widened axis and the empty day. `yarn build` was clean; the prototype test
passed; the existing suite gave exactly the two `src/shell.test.ts` failures above and no
other (`src/stylesheet.test.ts` passes with the new rules). The copy is deleted. Not
checked: Node 22 and 24, and the look in a browser (the spec asks for no check by hand).

## Approach

The job adds one read-only page. `src/routes/timeline.ts` mounts `GET /timeline` after
the tasks router. It reads `new Date()` once (009 D12), the `working_hours` setting and
every task with `listTasks(db)`, picks the day from the query, and hands all of it to
one pure function, `buildTimeline` in `src/services/timeline.ts`. That function returns
everything the page shows, positions already written as CSS (`23.08%`), so
`pages/timeline.ejs` only loops and escapes. No SQL, no migration, no write.

**The day.** A day is the whole number of `dubaiDay` (009 D2). `src/dubai.ts` gains the
two conversions between a day and its `YYYY-MM-DD` date, and `clockLabel` (the time of
day part of `dayTimeLabel`, which now calls it). Day `d` starts at `dubaiDayStart(d)`
and its calendar date is the UTC date of `d * DAY_MS`, so the switcher's previous and
next days are `d - 1` and `d + 1`, and month and year ends roll over by themselves.

**The axis.** Every time is a number of minutes after that day's Dubai midnight. The
axis starts at the earlier of the working hours' start and each block's start floored
to the hour, and ends at the later of the working hours' end and each block's end,
already cut at 1440, ceiled to the hour. A minute `m` lies at
`(m − start) / (end − start) × 100` percent. Hour labels, bands, blocks and the now line
are all placed with that one function.

**The blocks.** Shown tasks are sorted by start, end, id. A sweep groups the runs of
overlapping blocks and gives each block the first free column of its group; the group's
column count sets the width. Conflict is a separate test among the blocks that are not
`done`. The page is plain HTML and CSS: the bands come first in `.tl`, then the hour
labels, then an `ol` of blocks, then the now line, so later elements are drawn over
earlier ones without a `z-index`.

## Decisions

**D1. Two new modules and one page: `src/services/timeline.ts` (pure),
`src/routes/timeline.ts`, `src/views/pages/timeline.ejs`.** The service is handed the
tasks, the hours, the day and `now`; it reads neither the clock nor the database, so
its unit tests need no app. This follows 010 D1 (`task-list.ts` pure, the route only
reads the request). Rejected: building the layout in the template; percent arithmetic
in EJS cannot be unit-tested and would be repeated per element.

**D2. `src/dubai.ts` gains `clockLabel`, `dayOfDate`, `dateOfDay`, and exports `DAY_MS`
and `MONTHS`.** They are Dubai calendar arithmetic, which that file owns (009 D2).
`dayTimeLabel` keeps its behaviour and calls `clockLabel` for its time part; the
`src/dubai.test.ts` cases pass unchanged (checked). Rejected: a second copy of the
month names and the time format in the service.

**D3. `?date` is read once, strictly, and anything else is today.** `readDay(query,
today)`: when `query.date` is a string and `dayOfDate` accepts it, that day; otherwise
`today`. Express 5's default query parser gives an array for a repeated name (010 D3,
checked there), which is not a string, so `date=a&date=a` is today. `dayOfDate(text)`
requires `/^\d{4}-\d{2}-\d{2}$/`, parses `${text}T00:00:00.000Z`, and requires that
`toISOString().slice(0, 10)` gives `text` back. Checked on Node 26.8.2: `Date.parse`
does not refuse `2026-02-30`, it rolls it to `2026-03-02` (and `2026-02-29` to
`2026-03-01`); `2026-13-01` is `NaN`; `0000-01-01` and `9999-12-31` round-trip. So the
round-trip is what rejects a day past the month's end. The day is `at / DAY_MS`, an
integer since `at` is a UTC midnight.

**D4. The heading.** `dayHeading(day, today)`: `Today`, `Tomorrow`, `Yesterday` for an
offset of 0, 1, −1, otherwise the short weekday of `WEEKDAYS = ['Sun', 'Mon', 'Tue',
'Wed', 'Thu', 'Fri', 'Sat']` from `getUTCDay()` of `day * DAY_MS`; then ` · ` (a middle
dot U+00B7 between plain spaces), the day of the month with no leading zero, a space and
`MONTHS[getUTCMonth()]`. It is an `h2.day-switcher__day`; the page's `h1` is
`Timeline` (the page header).

**D5. The switcher links.** Previous and next are ghost button links (the 002 button
partial, so 44px high) with the labels `‹` and `›` and `aria-label` `Previous day` /
`Next day`; their `href` is `dayHref(day ∓ 1)` = `/timeline?date=<YYYY-MM-DD>`. The
`Today` link is a ghost button link to `/timeline` in the page header's actions, and is
left out when the day is today. Neither switcher link points at the bare `/timeline`, so
on today `main` holds no `a[href="/timeline"]`.

**D6. Which tasks are blocks: `isShownOn(task, day)`.** Status `pending`, `in_progress`
or `done`; `scheduled_start` and `scheduled_end` both not null; and
`dubaiDay(Date.parse(scheduled_start)) === day`. It is a type guard to
`ScheduledTask = Task & { scheduled_start: string; scheduled_end: string }`, so no cast
is needed later. A task that starts on the day before and runs past midnight is not on
this day (spec, out of scope).

**D7. A block's span and its text.** `start` = minutes after this day's midnight of
`scheduled_start`; `end` = the same of `scheduled_end`, raised to `start` if it is
earlier and cut at 1440. The span (not the stored times) sets `top`, `height`, the
overlaps and the axis. The text shows the stored times: `clockLabel(start)–clockLabel(end)`
with an en dash U+2013 and no spaces, so a block cut at midnight still says when its
task ends. Then ` · Done` or ` · In progress` for those statuses. The title is escaped
with `<%= %>`. An urgent block's title starts with `<span aria-hidden="true">▲</span> `
(the glyph from `ui.priority('urgent')`). Classes: `blk k-<priority>` or `blk k-none`.
`id="block-<task id>"`.

**D8. The axis.** `axis.start = min(clockMinutes(hours.start), …floor(span.start / 60) * 60)`
and `axis.end = max(clockMinutes(hours.end), …ceil(span.end / 60) * 60)`. Since a span
ends by 1440, the axis never passes midnight. Hour labels for every whole hour `h` with
`axis.start ≤ 60h ≤ axis.end`, text `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`, so
midnight is `12 AM` at either end. The axis element is `div.tl` with an inline `height`
of `round2(hours of the axis × 3)rem` (`39rem` for 13 hours, about the mockup's 44px an
hour); every position inside it is a percent of that height. A `working_hours` whose end
is not after its start is not handled; the seed and every value a test writes are sane,
and checking the setting is the settings page's job (022).

**D9. Percent precision and the now line.** Every percent is `Math.round(x × 100) / 100`
written with `%` (`0%`, `23.08%`, `100%`), within 0.005 of the exact value. The now line
is `div.now` inside `.tl`, drawn when `dubaiDay(now) === day` and
`axis.start ≤ nowMinute ≤ axis.end` (both ends included), with `top` its percent; it
holds a visually hidden `Now`. Because the test is against the axis, not the working
hours, a now inside a widened axis is drawn.

**D10. Side by side: groups and columns.** The spans are sorted by `start`, then `end`,
then `id`. The sweep keeps `groupEnd`, the latest end so far in the group; a span with
`start ≥ groupEnd` starts a new group. In a group a span takes the first column whose
last end is `≤` its start, or a new column. Every span of a group then gets
`columns = number of columns of the group`, `left = round2(column / columns × 100)` and
`width = round2(round2((column + 1) / columns × 100) − left)`. Writing the width as the
difference of the two rounded edges means one column's `left + width` equals the next
one's `left`, so rounding never makes ranges intersect (with 1/7 widths rounded alone,
`14.29 + 14.29 > 28.57` would). A span that overlaps nothing is alone in its group:
`left: 0%; width: 100%`. Two spans in one column never overlap (the column's end is at
or before the next start). Overlap is `a.start < b.end && b.start < a.end`, so a span
that ends where another starts is neither in its group nor a conflict. Sorting by end
second keeps a zero-length span at a group's first minute out of the group, so the
sweep's groups are exactly the runs of overlapping spans. Rejected: equal columns over
the whole day, or a column per block of a group without reuse, which make blocks
narrower than needed.

**D11. Conflict, and the empty day.** A block is `conflict` when its task is not `done`
and it overlaps (D10's test) another block whose task is not `done`. The block's meta
line then ends with ` <span class="visually-hidden">Conflict</span><span
aria-hidden="true">⚠</span>`, so the block's text ends with `⚠`. A `done` block is laid
out side by side like any other, but takes part in no conflict. With no block, the
empty-state partial (`h2` `Nothing scheduled`, a primary button link `Add a task` to
`/add`) comes after the switcher and before `.tl`; the axis, its labels and its bands
are drawn as on any day, and the `ol` is left out.

**D12. Slot bands: `SLOT_HOURS` in the service.** `morning` 0–720, `afternoon`
720–1020, `evening` 1020–1200, `night` 1200–1440, in minutes. Each is cut to the axis
and dropped when nothing is left. A band is `div.band[data-slot=<id>]` holding the label
of `src/ui.ts`, with `top` and `height` in percent. The scheduler does not read these
hours (spec, out of scope); they live next to the code that draws them, not in
`src/ui.ts`.

**D13. The stylesheet: tokens only, and no new token.** `src/stylesheet.test.ts` holds
three rules that shape this: no color literal outside `:root` (and `transparent` counts
as one), no color token beyond the 20 of the mockup plus `scrim` and `shadow`, and no
custom property outside the token blocks. So the mockup's hatch
(`transparent` and an `rgba` stripe) cannot be copied. `.conflict` is
`background-image: repeating-linear-gradient(135deg, var(--urgent-bg) 0 var(--space-1),
var(--surface) var(--space-1) var(--space-2))`: stripes of the urgent tint and the
surface, in both themes. It covers the block's priority tint; the priority stays on the
block's border. `.k-<priority>` uses the `background` shorthand, which resets
`background-image`, so `.conflict` comes after the five `.k-*` rules (same specificity,
later wins), and the `.k-*` rules come after `.blk`, whose `border` shorthand they color.
A block's text is `var(--text)`, readable on the tints and the hatch. Checked: the full
suite's stylesheet tests pass with the rules of Files.

**D14. Layering without `z-index`.** In `.tl` the order is bands, hour labels, the
`ol.tl__blocks`, the now line; all are positioned, so each is painted over the ones
before it. `.tl__blocks` is the area "beside the hour labels" of AC7: absolutely placed
from `5.5rem` (clear of the band labels) to the right edge, top to bottom, and a block's
`left` and `width` are percent of it. The hour labels sit in `.tl`'s left margin
(`margin-left: var(--space-12)`, the labels at `left: calc(var(--space-12) * -1)`).

**D15. Existing tests: two lines of `src/shell.test.ts`.**
`it.each(['/no-such-page', '/timeline', '/_styleguide'])('marks no link as current on %s'`
becomes `it.each(['/no-such-page', '/_styleguide'])(…`, and
`it.each(['/timeline', '/more'])(` becomes `it.each(['/more'])(`. Nothing else in any
existing test file changes (checked: nothing else fails).

**D16. The clock and the setting.** The handler reads `new Date()` once and uses it for
today, the heading and the now line (009 D12; tests fake `Date` only). It reads
`working_hours` with `getSetting` at the request, so a `setSetting` before the request
shows; with no row it throws `The working_hours setting is missing`, as `placeTasks`
does (009 D10), and Express answers 500. The handler calls only `getSetting` and
`listTasks`, so it writes nothing (AC11).

## Files

Created:

- `src/services/timeline.ts`. The whole file:

```ts
import type { Settings } from '../db/settings.ts';
import type { Task, TaskStatus } from '../db/tasks.ts';
import {
  DAY_MS,
  MINUTE_MS,
  MONTHS,
  clockLabel,
  clockMinutes,
  dateOfDay,
  dayOfDate,
  dubaiDay,
  dubaiDayStart,
} from '../dubai.ts';
import { slots, type Priority, type Slot } from '../ui.ts';

/*
 * The timeline of one Dubai day: an hour axis from the working hours, widened to hold
 * the day's tasks, the slot bands behind them, one block per scheduled task, the tasks
 * that share time side by side, and the now line. Everything is placed in percent of the
 * axis, so the page needs no script. Nothing here reads the clock or the database.
 */

/** The path of the timeline. */
export const TIMELINE_PATH = '/timeline';

/** A part of a day, in minutes after midnight on the Dubai clock. */
export interface DayPart {
  start: number;
  end: number;
}

/** The hours each slot band covers. They are drawn only; the scheduler does not read them. */
export const SLOT_HOURS: Readonly<Record<Slot, DayPart>> = {
  morning: { start: 0, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 17 * 60 },
  evening: { start: 17 * 60, end: 20 * 60 },
  night: { start: 20 * 60, end: 24 * 60 },
};

const DAY_MINUTES = 24 * 60;

/** How tall the axis is drawn, per hour of it. */
const REM_PER_HOUR = 3;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** The statuses a block is drawn for. A draft is not on any day. */
const SHOWN_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'done'];

/** What a block says of its status; a pending task says nothing. */
const STATUS_TEXT: Readonly<Partial<Record<TaskStatus, string>>> = { in_progress: 'In progress', done: 'Done' };

/** One hour label of the axis. */
export interface AxisHour {
  /** `9 AM`, `12 PM`, `12 AM`. */
  label: string;
  /** Percent of the axis, as CSS: `23.08%`. */
  top: string;
}

/** One slot band, cut to the axis. */
export interface AxisBand {
  slot: Slot;
  label: string;
  top: string;
  height: string;
}

/** One task as a block of the timeline. */
export interface TimelineBlock {
  id: number;
  title: string;
  /** The class `k-<tone>`: the priority, or `none`. */
  tone: Priority | 'none';
  urgent: boolean;
  /** `9:00 AM–10:30 AM`. */
  time: string;
  /** `Done`, `In progress`, or `null` for a pending task. */
  status: string | null;
  conflict: boolean;
  /** The inline style: `top`, `height`, `left` and `width`, each in percent. */
  style: string;
}

/** Everything `pages/timeline.ejs` shows. */
export interface Timeline {
  /** `Today · 12 Oct`, `Wed · 14 Oct`. */
  heading: string;
  previousHref: string;
  nextHref: string;
  /** The link back to today, or `null` on today. */
  todayHref: string | null;
  /** The inline height of the axis: `39rem`. */
  height: string;
  hours: AxisHour[];
  bands: AxisBand[];
  /** In document order: by start, then end, then id. */
  blocks: TimelineBlock[];
  /** The `top` of the now line, or `null` when there is none. */
  now: string | null;
}

/** A task with both its times. */
export type ScheduledTask = Task & { scheduled_start: string; scheduled_end: string };

/** A shown task and the part of its day it covers, cut at midnight. */
interface Span {
  task: ScheduledTask;
  start: number;
  end: number;
}

/** A number rounded to two decimals, the precision every percent is written with. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function percent(value: number): string {
  return `${round2(value)}%`;
}

/**
 * The day the query asks for: `date` given once as a real `YYYY-MM-DD` date. Anything
 * else (no `date`, a repeated one, one in another form, a date that does not exist) is
 * `today`.
 */
export function readDay(query: unknown, today: number): number {
  if (typeof query !== 'object' || query === null || !Object.hasOwn(query, 'date')) return today;
  const value: unknown = (query as Record<string, unknown>).date;
  return typeof value === 'string' ? (dayOfDate(value) ?? today) : today;
}

/** The address of the timeline of a day. */
export function dayHref(day: number): string {
  return `${TIMELINE_PATH}?date=${dateOfDay(day)}`;
}

/** The heading of a day as it is read on `today`: `Today · 12 Oct`, `Tomorrow · 13 Oct`, `Wed · 14 Oct`. */
export function dayHeading(day: number, today: number): string {
  const date = new Date(day * DAY_MS);
  const offset = day - today;
  const name =
    offset === 0
      ? 'Today'
      : offset === 1
        ? 'Tomorrow'
        : offset === -1
          ? 'Yesterday'
          : WEEKDAYS[date.getUTCDay()];
  return `${name} · ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** An hour of the axis as its label reads: `12 AM` at midnight, at either end of the day. */
function hourLabel(hour: number): string {
  return `${hour % 12 || 12} ${hour % 24 < 12 ? 'AM' : 'PM'}`;
}

/** Whether a task is a block of this day: confirmed, with both times, and starting on it. */
export function isShownOn(task: Task, day: number): task is ScheduledTask {
  return (
    SHOWN_STATUSES.includes(task.status) &&
    task.scheduled_start !== null &&
    task.scheduled_end !== null &&
    dubaiDay(Date.parse(task.scheduled_start)) === day
  );
}

/** Whether two spans share time. One that ends at the minute the other starts does not. */
function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * The column of each span and how many columns its group has. A group is a run of spans
 * each of which overlaps one before it; a span takes the first column that is free at
 * its start. Spans in one column never overlap, and a span that overlaps nothing is
 * alone in its group. `sorted` is by start, then end, so a span of no length at the
 * minute a group starts comes before it and stays out of it.
 */
function columnsOf(sorted: readonly Span[]): Map<Span, { column: number; columns: number }> {
  const placed = new Map<Span, { column: number; columns: number }>();
  let group: Span[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = (): void => {
    for (const span of group) {
      const entry = placed.get(span);
      if (entry !== undefined) entry.columns = columnEnds.length;
    }
  };

  for (const span of sorted) {
    if (span.start >= groupEnd) {
      closeGroup();
      group = [];
      columnEnds = [];
    }
    let column = columnEnds.findIndex((end) => end <= span.start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = span.end;
    group.push(span);
    placed.set(span, { column, columns: 0 });
    groupEnd = Math.max(groupEnd, span.end);
  }
  closeGroup();
  return placed;
}

/**
 * The timeline of `day` at `now`, from every task (the ones it does not show are
 * dropped here) and the `working_hours` setting.
 */
export function buildTimeline(
  tasks: readonly Task[],
  hours: Settings['working_hours'],
  day: number,
  now: Date,
): Timeline {
  const today = dubaiDay(now.getTime());
  const midnight = dubaiDayStart(day);
  const minutesOf = (at: number): number => (at - midnight) / MINUTE_MS;

  const spans: Span[] = tasks
    .filter((task) => isShownOn(task, day))
    .map((task) => {
      const start = minutesOf(Date.parse(task.scheduled_start));
      const end = Math.min(Math.max(minutesOf(Date.parse(task.scheduled_end)), start), DAY_MINUTES);
      return { task, start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end || a.task.id - b.task.id);

  const axis: DayPart = {
    start: Math.min(clockMinutes(hours.start), ...spans.map((span) => Math.floor(span.start / 60) * 60)),
    end: Math.max(clockMinutes(hours.end), ...spans.map((span) => Math.ceil(span.end / 60) * 60)),
  };
  const length = axis.end - axis.start;
  const at = (minute: number): number => ((minute - axis.start) / length) * 100;
  const share = (minutes: number): number => (minutes / length) * 100;

  const hourMarks: AxisHour[] = [];
  for (let hour = Math.ceil(axis.start / 60); hour * 60 <= axis.end; hour += 1) {
    hourMarks.push({ label: hourLabel(hour), top: percent(at(hour * 60)) });
  }

  const bands: AxisBand[] = [];
  for (const item of slots) {
    const start = Math.max(SLOT_HOURS[item.id].start, axis.start);
    const end = Math.min(SLOT_HOURS[item.id].end, axis.end);
    if (end > start) {
      bands.push({ slot: item.id, label: item.label, top: percent(at(start)), height: percent(share(end - start)) });
    }
  }

  const columns = columnsOf(spans);
  const open = spans.filter((span) => span.task.status !== 'done');
  const blocks = spans.map((span): TimelineBlock => {
    const { column, columns: count } = columns.get(span) ?? { column: 0, columns: 1 };
    const left = round2((column / count) * 100);
    const right = round2(((column + 1) / count) * 100);
    const conflict =
      span.task.status !== 'done' && open.some((other) => other !== span && overlaps(span, other));
    const { task } = span;
    return {
      id: task.id,
      title: task.title,
      tone: task.priority ?? 'none',
      urgent: task.priority === 'urgent',
      time: `${clockLabel(new Date(task.scheduled_start))}–${clockLabel(new Date(task.scheduled_end))}`,
      status: STATUS_TEXT[task.status] ?? null,
      conflict,
      style: [
        `top: ${percent(at(span.start))}`,
        `height: ${percent(share(span.end - span.start))}`,
        `left: ${left}%`,
        `width: ${round2(right - left)}%`,
      ].join('; '),
    };
  });

  const nowMinute = minutesOf(now.getTime());
  return {
    heading: dayHeading(day, today),
    previousHref: dayHref(day - 1),
    nextHref: dayHref(day + 1),
    todayHref: day === today ? null : TIMELINE_PATH,
    height: `${round2((length / 60) * REM_PER_HOUR)}rem`,
    hours: hourMarks,
    bands,
    blocks,
    now: day === today && nowMinute >= axis.start && nowMinute <= axis.end ? percent(at(nowMinute)) : null,
  };
}
```

- `src/routes/timeline.ts`. Exports `createTimelineRouter(deps: AppDeps): Router`. The
  whole file:

```ts
import { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { getSetting } from '../db/settings.ts';
import { listTasks } from '../db/tasks.ts';
import { dubaiDay } from '../dubai.ts';
import { renderPage } from '../render.ts';
import { TIMELINE_PATH, buildTimeline, readDay } from '../services/timeline.ts';

/**
 * The timeline of one Dubai day: today, or the day `?date=YYYY-MM-DD` names. It reads
 * the tasks and the working hours, and the clock once, and writes nothing.
 */
export function createTimelineRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(TIMELINE_PATH, (req, res) => {
    const now = new Date();
    const hours = getSetting(deps.db, 'working_hours');
    if (hours === undefined) throw new Error('The working_hours setting is missing');
    const day = readDay(req.query, dubaiDay(now.getTime()));
    renderPage(res, 'timeline', {
      title: 'Timeline',
      nav: 'timeline',
      timeline: buildTimeline(listTasks(deps.db), hours, day, now),
    });
  });

  return router;
}
```

- `src/views/pages/timeline.ejs`. The whole file:

```ejs
<%#
  The timeline of one Dubai day.
  timeline: { heading, previousHref, nextHref, todayHref, height, hours, bands, blocks, now }
  Every position is worked out by the route, in percent of the axis, and written as an
  inline style. The bands come first so that the blocks are drawn over them. `todayHref`
  and `now` are null when there is no Today link or no now line.
-%>
<%- include('../partials/page-header', { pageHeader: {
  heading: 'Timeline',
  actions: timeline.todayHref === null ? undefined : include('../partials/button', { button: { label: 'Today', variant: 'ghost', href: timeline.todayHref } }),
} }) -%>

<div class="day-switcher">
  <%- include('../partials/button', { button: { label: '‹', variant: 'ghost', href: timeline.previousHref, attrs: { 'aria-label': 'Previous day' } } }) -%>
  <h2 class="day-switcher__day"><%= timeline.heading %></h2>
  <%- include('../partials/button', { button: { label: '›', variant: 'ghost', href: timeline.nextHref, attrs: { 'aria-label': 'Next day' } } }) -%>
</div>

<% if (timeline.blocks.length === 0) { -%>
<%- include('../partials/empty-state', { emptyState: {
  heading: 'Nothing scheduled',
  actions: include('../partials/button', { button: { label: 'Add a task', href: '/add' } }),
} }) -%>
<% } -%>

<div class="tl" style="height: <%= timeline.height %>">
<% for (const band of timeline.bands) { -%>
  <div class="band" data-slot="<%= band.slot %>" style="top: <%= band.top %>; height: <%= band.height %>"><%= band.label %></div>
<% } -%>
<% for (const hour of timeline.hours) { -%>
  <span class="hour" style="top: <%= hour.top %>"><%= hour.label %></span>
<% } -%>
<% if (timeline.blocks.length > 0) { -%>
  <ol class="tl__blocks">
<% for (const block of timeline.blocks) { -%>
    <li class="blk k-<%= block.tone %><% if (block.conflict) { %> conflict<% } %>" id="block-<%= block.id %>" style="<%= block.style %>">
      <p class="blk__title"><% if (block.urgent) { %><span aria-hidden="true"><%= ui.priority('urgent').glyph %></span> <% } %><%= block.title %></p>
      <p class="blk__meta"><%= block.time %><% if (block.status !== null) { %> · <%= block.status %><% } %><% if (block.conflict) { %> <span class="visually-hidden">Conflict</span><span aria-hidden="true">⚠</span><% } %></p>
    </li>
<% } -%>
  </ol>
<% } -%>
<% if (timeline.now !== null) { -%>
  <div class="now" style="top: <%= timeline.now %>"><span class="visually-hidden">Now</span></div>
<% } -%>
</div>
```

- Tests: `src/services/timeline.test.ts`, `src/timeline-page.test.ts`: see `plan.md`.

Changed:

- `src/dubai.ts` (D2):
  - `const DAY_MS = 24 * 60 * MINUTE_MS;` becomes `export const DAY_MS = …`.
  - `const MONTHS = [` becomes `export const MONTHS = [`.
  - In `dayTimeLabel`, the two lines `const hours = onClock.getUTCHours();` and
    `const time = \`${hours % 12 || 12}:…\`;` become `const time = clockLabel(at);`.
    `onClock` stays (the date part uses it).
  - Appended at the end of the file:

```ts
/** An instant's time of day on the Dubai clock, as a person reads it: `9:00 AM`, `12:30 PM`. */
export function clockLabel(at: Date): string {
  const onClock = new Date(at.getTime() + DUBAI_OFFSET_MS);
  const hours = onClock.getUTCHours();
  return `${hours % 12 || 12}:${String(onClock.getUTCMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

/**
 * The Dubai day a calendar date names, written `YYYY-MM-DD`, or `undefined` when the
 * text is not in that form or names no real date (`2026-02-30`, `2026-13-01`).
 */
export function dayOfDate(text: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const at = Date.parse(`${text}T00:00:00.000Z`);
  // Date.parse rolls a day past the month's end into the next month, so the text must come back unchanged.
  if (Number.isNaN(at) || new Date(at).toISOString().slice(0, 10) !== text) return undefined;
  return at / DAY_MS;
}

/** The calendar date of a Dubai day, as `YYYY-MM-DD`. */
export function dateOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
```

- `src/app.ts`: `import { createTimelineRouter } from './routes/timeline.ts';` right after
  the import of `./routes/tasks.ts`, and `app.use(createTimelineRouter(deps));` right
  after `app.use(createTasksRouter(deps));`.
- `public/css/base.css`: one insertion, right before `/* ---------- Style guide ---------- */`
  (D13, D14):

```css
/* Timeline: a day switcher, then one Dubai day on an hour axis. The route writes every position in percent of the axis. */
.day-switcher {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.day-switcher__day {
  text-align: center;
}

/* The axis. The hour labels sit in its left margin; the slot bands span its width, behind the blocks. */
.tl {
  position: relative;
  margin-left: var(--space-12);
}

.band {
  position: absolute;
  left: 0;
  right: 0;
  overflow: hidden;
  padding: var(--space-1) var(--space-2);
  border-top: 1px dashed var(--border);
  color: var(--muted);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.band[data-slot="morning"] {
  background: var(--slot-morning);
}

.band[data-slot="afternoon"] {
  background: var(--slot-afternoon);
}

.band[data-slot="evening"] {
  background: var(--slot-evening);
}

.band[data-slot="night"] {
  background: var(--slot-night);
}

.hour {
  position: absolute;
  left: calc(var(--space-12) * -1);
  width: var(--space-10);
  color: var(--muted);
  font-size: var(--font-size-xs);
  line-height: 1;
  text-align: right;
  transform: translateY(-50%);
}

/* The area the blocks lie in, right of the band labels. A block's left and width are percent of it. */
.tl__blocks {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 5.5rem;
  padding: 0;
  list-style: none;
}

.blk {
  position: absolute;
  overflow: hidden;
  padding: 0 var(--space-1);
  color: var(--text);
  border: 1px solid;
  border-left-width: var(--space-1);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  line-height: 1.2;
}

.blk__title {
  font-weight: 700;
  overflow-wrap: anywhere;
}

/* A block's priority: its tint, and its color on the border. These come after .blk, whose border they color. */
.k-urgent {
  background: var(--urgent-bg);
  border-color: var(--urgent);
}

.k-high {
  background: var(--high-bg);
  border-color: var(--high);
}

.k-medium {
  background: var(--medium-bg);
  border-color: var(--medium);
}

.k-low {
  background: var(--low-bg);
  border-color: var(--low);
}

.k-none {
  background: var(--surface-2);
  border-color: var(--border);
}

/* Blocks that share time are hatched. This comes after the priority rules, whose background would reset it. */
.conflict {
  background-image: repeating-linear-gradient(135deg, var(--urgent-bg) 0 var(--space-1), var(--surface) var(--space-1) var(--space-2));
}

.now {
  position: absolute;
  left: calc(var(--space-2) * -1);
  right: 0;
  height: 2px;
  background: var(--urgent);
}

```

- `src/shell.test.ts`: D15, two lines.

Not touched:

- `package.json`, `yarn.lock`: no package.
- `src/db/*`: no migration, no helper, no SQL; `listTasks` and `getSetting` as they are.
- `src/services/scheduler.ts`, `src/services/rules.ts`: the bands are drawn, not
  scheduled (spec, out of scope).
- `src/ui.ts`: the nav already links `/timeline`; the slot hours live in the service
  (D12).
- `src/routes/tasks.ts`, `src/services/task-list.ts`: blocks are not links (013).
- `src/views/partials/*`: the page uses the page-header, button and empty-state partials
  as they are.
- `src/views/pages/home.ejs`, `src/routes/home.ts` (014), `src/views/pages/styleguide.ejs`.
- `src/server.ts`, `src/testing/*`, `vitest.config.ts`, `tsconfig.json`: no clock in
  `AppDeps` (009 D12).
- `public/js/*`: no script (spec).
- `src/dubai.test.ts` and every other existing test file except the two lines of
  `src/shell.test.ts`.
- `docs/` unless the builder logs an error; everything under `factory/` but this job's
  `build.md`; `data/`.

## Risks

- **The day taken in UTC, not Dubai.** A task at 2:00 AM Dubai on 12 Oct is 22:00Z on
  the 11th. The AC5 test has such a task and one at 11:55 PM on the 11th, and expects the
  first only; a test under `TZ=Pacific/Kiritimati` catches local-time methods.
- **`2026-02-30` accepted.** `Date.parse` rolls it over (checked, D3). The AC1 test
  lists it; dropping the round-trip makes it show 2 March.
- **Ranges of side-by-side blocks touch past each other after rounding.** D10 writes the
  width as the difference of rounded edges. The unit test with seven blocks that all
  overlap checks `left[i] + width[i] ≤ left[i+1]` (within 1e-9) and the last one ends at
  100.
- **A touching pair counted as an overlap.** `<` against `≤` in `overlaps`; the AC7/AC8
  tests have 2:30–3:00 PM and 3:00–3:30 PM, expect no `conflict` on the second and
  `left: 0%; width: 100%` on it.
- **A done task makes a conflict.** The AC8 test with a done and a pending task that
  overlap expects neither to be a conflict, but both to be side by side.
- **The axis not widened, or widened past midnight.** AC3 tests with a 7:30 AM task (axis
  from 7 AM), and with a task from 11:30 PM to 12:30 AM the next day (axis ends at
  `12 AM` at `100%`, the block's height is cut).
- **The now line tested against the working hours, not the axis.** AC9 test at 8:00 AM
  with a 7:30 AM block on the day: the line is drawn at the percent of the widened axis.
- **The hatch hidden by the priority background.** `.k-*` uses the `background`
  shorthand; D13 orders the rules. A stylesheet test asserts that the `.conflict` rule
  comes after each `.k-*` rule in the stylesheet's rule list.
- **Two existing tests break** (`src/shell.test.ts`, D15). Checked: exactly those two.
- **Ports run out when test files are run in a loop**
  (`docs/errors/repeated-test-runs-run-out-of-ports.md`). Run each break once; read the
  failure messages for `EADDRNOTAVAIL`.
- **A reporter writes into the repo**
  (`docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md`). Default reporter
  only.
- **A test's data hides the rule it tests**
  (`docs/errors/test-data-with-its-own-space-hides-a-missing-separator.md`). The axis
  tests use working hours on whole hours, and the widened ones use blocks off the hour
  (7:30), so floor and ceil are both exercised.
