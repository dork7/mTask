# 014-today-dashboard: design

No spec problem blocks the job. Five readings cover what the spec leaves open:

- **"Today's tasks" is `isShownOn(task, dubaiDay(now))` of `src/services/timeline.ts`**,
  the timeline's own test (D2). The spec calls it "the same rule as a timeline block
  (012 AC5)". 012 AC5 also asks for a `scheduled_end`, so a task with a start and no
  end is not one of today's tasks. The app never stores such a task (the scheduler
  writes both times), and Next up needs an end anyway.
- **The home view renders its header alone when it gets no model** (D6).
  `src/shell.test.ts` renders `renderView('layout', { title: 'x', page: 'home', nav })`
  with no route locals, and AC10 says no existing test changes. So `home.ejs` reads
  `locals.today`. Without it the page is the page-header partial with `Today` and no
  sub-line, which is still the `<h1>Today</h1>` those tests read.
- **The progress element gets an accessible name**, `aria-label="Today's progress"`.
  ARIA requires a name on a `progressbar`, and the spec's four attributes give none
  (D7).
- **A `category` that is the empty string counts as missing**, the same as `null`, in
  both meta lines. The sheet stores an empty category as `null`, so this only guards
  data written some other way (D4).
- **A Later today dot is named by its priority**: `role="img"` and
  `aria-label="High priority"`. A dot with a null priority is `aria-hidden="true"`. The
  spec asks only for the classes, and colour alone would hide the priority from a
  screen reader (D8).

Checked in a throwaway folder under `$TMPDIR` (deleted afterwards), on Node 26.8.2 and
yarn 1.22.22. The EJS check read the repo's `node_modules` (EJS 7.0.1) and wrote
nothing.

- The Dubai date arithmetic of D3: `2026-10-12T09:36:00.000Z` gives `Monday, 12 Oct`,
  `2026-10-11T20:00:00.000Z` gives `Monday, 12 Oct`, `2026-10-11T19:59:00.000Z` gives
  `Sunday, 11 Oct`, and `2026-10-12T20:30:00.000Z` gives `Tuesday, 13 Oct`.
- `Math.round(75 * 100 / 240)` is `31`, `Math.round(20 * 100 / 30)` is `67` and
  `Math.round(1 * 100 / 200)` is `1` (D4).
- EJS: `<% if (!locals.today) { %>` renders without error when `today` is not a local,
  and `<%= %>` escapes `<b>` (D6).

Not checked: Node 22 and 24, and how the page looks in a browser. The spec asks for no
check by hand.

## Approach

`/` stays on its own router, which now takes the app's deps: `createHomeRouter(deps)`
takes the place of `homeRouter`. Its one handler reads every task once with
`listTasks(deps.db)` and the time with `requestTime(res)`, the instant the mini-bar
middleware set for this request (013 D9). It hands both to `buildToday` and renders
`pages/home.ejs` with the result as the local `today`. It writes nothing.

`buildToday` is a pure function in a new module, `src/services/today.ts`, like
`buildTimeline` in 012. It reads no clock and no database. It returns everything the
page shows, as strings and flags: the date line, the Next up card or `null`, the
progress numbers and texts, the overdue banner or `null`, the Later today items and the
three quick-add links. It uses rules that already exist and adds none of its own for
"today" or "overdue". `isShownOn` (012) says which tasks are today's. `isOverdue` (011)
says which are missed, on any day, and also keeps a missed task out of Next up and
Later today. `taskPath` (013) gives every link to a sheet, and `clockLabel` writes the
times. The one new piece of date formatting, the full weekday line, goes into
`src/dubai.ts` beside `dayTimeLabel`.

The view uses the 002 partials (page header, priority badge, button, empty state), as
the overdue and timeline pages do. Its new blocks are classes styled in `base.css` with
the tokens only. The progress bar is a track and a fill whose width is an inline
percent, the way the timeline places its blocks. No custom property is needed, and the
page needs no script. Start is the 013 form posting to `/tasks/<id>/start`. That route
is not touched.

## Decisions

**D1. `src/routes/home.ts` exports `createHomeRouter(deps: AppDeps): Router` in place of
`homeRouter`.** The page needs the database, and every other router that reads it takes
`deps` (`createOverdueRouter`, `createTimelineRouter`). `src/app.ts` is the only
importer. It mounts the new router where `homeRouter` was: after the mini-bar
middleware, which must run first for `requestTime(res)`. Rejected: a module-level router
that reaches the database some other way.

**D2. Today's tasks, and what is left of them, are worked out in
`src/services/today.ts`.**
- `todaysTasks(tasks, now)` is the tasks for which `isShownOn(task, dubaiDay(now))`
  holds. That means `pending`, `in_progress` or `done`, with both times, and a
  `scheduled_start` on the Dubai day of `now`.
- `tasksLeft(tasks, now)` keeps those that are `pending` and not `isOverdue(task, now)`,
  sorted by `scheduled_start` (compared as text, which is time order for stored
  timestamps) and then by `id`. `isOverdue` is `scheduled_end < now`, so an end equal to
  `now` is still left.
- Next up is `tasksLeft[0]`, and Later today is the rest, in the same order.
- The overdue count is `tasks.filter((task) => isOverdue(task, now)).length` over every
  task, so it covers any day and only `pending` tasks.

Rejected: a second "today" or "overdue" test written here, which could drift from the
timeline's and the overdue view's.

**D3. The date line is `weekdayDateLabel(now)`, a new export of `src/dubai.ts`.** It
reads the instant on the Dubai clock and writes the full weekday, a comma, the day of
the month and the short month: `Monday, 12 Oct`. It uses the existing `MONTHS` and a new
private `WEEKDAY_NAMES` (`Sunday` first, to match `getUTCDay`). It uses no local-time
method and no `Intl`, like the rest of the module. Rejected: putting it in `today.ts`.
The digest of 020 will want the same line, and `dubai.ts` is where every Dubai clock
label lives.

**D4. Numbers and texts, as `buildToday` writes them.**
- Next up `when`: `` `Next up · ${clockLabel(new Date(task.scheduled_start))}` ``.
- Next up `meta`: `metaLine(category, about)`, where `about` is
  `` `about ${estimated_minutes} min` `` or `null`.
- Later `meta`: `metaLine(category, minutes)`, where `minutes` is
  `` `${estimated_minutes} min` `` or `null`.
- `metaLine` drops each part that is `null` or `''` and joins the rest with `' · '`. Both
  parts missing give `''`, and then the view writes no meta element.
- Later `time` is `clockLabel` of `scheduled_start`.
- Progress, over `todaysTasks`:
  - `planned` is the sum of `estimated_minutes ?? 0`.
  - `doneMinutes` is the same sum over the `done` ones. It uses the estimate, never
    `actual_minutes`.
  - `percent` is `0` when `planned` is `0`, else `Math.round((doneMinutes * 100) / planned)`.
    The multiplication comes first, so an exact half is not lost to floating point.
  - The texts are `` `${doneMinutes} of ${planned} min done` `` and
    `` `${doneCount} of ${todays.length} tasks finished` ``. The second always says
    "tasks", as the spec writes it.
- Banner: `` `${count} overdue task${count === 1 ? '' : 's'}` ``, `href` `OVERDUE_PATH`,
  and `null` when the count is 0.

**D5. The Start action is `` `${taskPath(id)}/start` ``, the address 013's route serves.**
The route is not touched, so a post starts the task and answers 303 to `/tasks/<id>`.
The next `GET /` drops the task from Next up, because it is no longer `pending`.

**D6. `pages/home.ejs` reads `locals.today`, and the page is in this order:** page header
(with the date as `sub`), the Next up card or the empty state, progress, the overdue
banner when there is one, Later today when it has items, then quick add. This is the
mockup's order. Everything but the header sits inside `<% if (locals.today) { %>`. All
text goes through `<%= %>`. The empty state is the 002 partial with the heading
`Nothing up next`, the text `No task is left to start today.`, and a button link
`Add a task` to `today.emptyHref` (`/add`), the label the tasks and timeline empty
states use.

**D7. Progress is one card with the ARIA of the spec and a bar drawn by an inline
width.** The element is `div.card.progress#progress`, with `role="progressbar"`,
`aria-label="Today's progress"`, `aria-valuemin="0"`, `aria-valuemax="100"` and
`aria-valuenow="<percent>"`. It holds:
- `p.progress__percent` with `<percent>%`;
- `p.progress__minutes` with the minutes text;
- `p.progress__tasks` with the tasks text;
- `div.progress__track` holding `div.progress__fill` with `style="width: <percent>%"`.

Rejected:
- The mockup's conic-gradient ring. It needs the percent as a custom property or an
  inline colour gradient. `base.css` allows custom properties only in the token blocks,
  and `src/app.test.ts` requires every `var()` the stylesheet uses to be declared on
  `:root`.
- An animated ring, which is out of scope.

**D8. Later today is an `ol` of items, each with a dot, a title link, a meta line and a
time.** Each item is `li.later__item#later-<id>`. It holds, in order:
- `span.dot.d-<tone>`, where `tone` is the priority or `none`. With a priority it carries
  `role="img" aria-label="<Label> priority"` (`Urgent priority` … `Low priority`, the
  labels of `src/ui.ts`). With a null priority it carries `aria-hidden="true"`.
- `div.later__text`, holding `a.later__title` (the title, to `/tasks/<id>`) and, when
  the meta is not empty, `p.later__meta`.
- `span.later__time`.

The list sits in `section.later` under `h2.later__heading#later-heading` with the text
`Later today`. The section is left out when the list is empty. The stylesheet gives each
of `.d-urgent`, `.d-high`, `.d-medium` and `.d-low` exactly one declaration,
`background: var(--<priority>)`. `.d-none` gets `background: var(--border)`.

**D9. The Next up card and the banner.**
- The card is `section.card.next-up#next-up`, labelled by its title heading. It holds,
  in order:
  - `div.next-up__head`, holding `p.next-up__when` and the priority-badge partial when
    the priority is not null;
  - `h2.next-up__title#next-up-title`, holding `<a href="/tasks/<id>">title</a>`;
  - `p.next-up__meta` when the meta is not empty;
  - `form.next-up__actions`, `method="post"`, `action="/tasks/<id>/start"`, with the
    button partial `{ label: 'Start', type: 'submit' }`.
- The banner is `a.overdue-banner#overdue-banner` to `/overdue`, holding
  `<span><text></span>` and `<span>Review <span aria-hidden="true">→</span></span>`,
  with white space between the two spans. Its visible text is then
  `2 overdue tasks Review`.

The banner is not a `nav`, and neither is the quick-add group. `src/shell.test.ts` wants
exactly one navigation landmark on `/`.

**D10. Quick add is a fixed list in `today.ts`, written as plain links with a hidden
glyph.** `QUICK_ADD` is:
- `{ label: 'Photo', href: '/add?tab=photo', glyph: '📷' }`
- `{ label: 'Voice', href: '/add?tab=voice', glyph: '🎤' }`
- `{ label: 'Type', href: '/add?tab=text', glyph: '⌨️' }`

The glyphs are the mockup's. The view writes `div.quick-add#quick-add` with
`role="group"` and `aria-label="Quick add"`. Each link is
`a.quick-add__link`, holding `<span class="quick-add__glyph" aria-hidden="true">glyph</span><span>label</span>`.
The button partial is not used here because it escapes its label and so cannot hold the
hidden glyph. Rejected: exporting `TABS` from `src/routes/add.ts`, because no route
module imports another route module for data (013 D16).

**D11. Styles: tokens only, after the mini-bar rules and before
`/* ---------- Style guide ---------- */`.** No new media query, custom property, id
selector, colour literal or px spacing. Every font size comes from the scale. The rules
are listed under Files.

## Files

Created:

- `src/services/today.ts`:

```ts
import type { Task } from '../db/tasks.ts';
import { clockLabel, dubaiDay, weekdayDateLabel } from '../dubai.ts';
import { priorities, type Priority } from '../ui.ts';
import { OVERDUE_PATH, isOverdue } from './overdue.ts';
import { taskPath } from './task-list.ts';
import { isShownOn, type ScheduledTask } from './timeline.ts';

/*
 * The Today dashboard: what to do now. Today's tasks are the ones the timeline shows on
 * the Dubai day of `now`. Of those, the pending ones whose end has not passed are left
 * to do: the first is Next up, the others are Later today. A missed task, on any day,
 * is counted for the overdue banner. Nothing here reads the clock or the database.
 */

/** The path of the dashboard. */
export const TODAY_PATH = '/';

const ADD_PATH = '/add';

/** One quick-add link: a tab of the Add page. The glyph is decoration. */
export interface QuickAddLink {
  label: string;
  href: string;
  glyph: string;
}

/** The quick-add links, in the order they are shown. */
export const QUICK_ADD: readonly QuickAddLink[] = [
  { label: 'Photo', href: `${ADD_PATH}?tab=photo`, glyph: '📷' },
  { label: 'Voice', href: `${ADD_PATH}?tab=voice`, glyph: '🎤' },
  { label: 'Type', href: `${ADD_PATH}?tab=text`, glyph: '⌨️' },
];

/** The task to do next, as the Next up card shows it. */
export interface NextUpCard {
  id: number;
  title: string;
  /** Its sheet. */
  href: string;
  /** `Next up · 2:00 PM`. */
  when: string;
  /** `null`: no badge. */
  priority: Priority | null;
  /** `Admin · about 45 min`, or '' when there is nothing to say. */
  meta: string;
  /** Where its Start form posts. */
  startAction: string;
}

/** One task of Later today. */
export interface LaterItem {
  id: number;
  title: string;
  href: string;
  /** `Coding · 60 min`, or ''. */
  meta: string;
  /** `4:00 PM`. */
  time: string;
  /** The class `d-<tone>` of its dot: the priority, or `none`. */
  tone: Priority | 'none';
  /** `High priority`, the name of its dot, or `null` for no priority. */
  priorityLabel: string | null;
}

/** Planned against done minutes of today's tasks. */
export interface TodayProgress {
  /** 0 to 100, whole. */
  percent: number;
  /** `75 of 240 min done`. */
  minutesText: string;
  /** `2 of 5 tasks finished`. */
  tasksText: string;
}

/** The banner that leads to the overdue view. */
export interface OverdueBanner {
  href: string;
  /** `1 overdue task`, `2 overdue tasks`. */
  text: string;
}

/** Everything `pages/home.ejs` shows. */
export interface Today {
  /** `Monday, 12 Oct`. */
  date: string;
  /** `null`: the empty state is shown. */
  nextUp: NextUpCard | null;
  /** Where the empty state's link goes. */
  emptyHref: string;
  progress: TodayProgress;
  /** `null`: nothing is overdue. */
  overdue: OverdueBanner | null;
  /** In `scheduled_start` order, then by id. May be empty. */
  later: LaterItem[];
  quickAdd: readonly QuickAddLink[];
}

/** Today's tasks at `now`: those the timeline shows on the Dubai day of `now`. */
export function todaysTasks(tasks: readonly Task[], now: Date): ScheduledTask[] {
  const today = dubaiDay(now.getTime());
  return tasks.filter((task): task is ScheduledTask => isShownOn(task, today));
}

function byStart(a: ScheduledTask, b: ScheduledTask): number {
  if (a.scheduled_start !== b.scheduled_start) {
    // Stored timestamps sort as text in time order (`src/db/timestamps.ts`).
    return a.scheduled_start < b.scheduled_start ? -1 : 1;
  }
  return a.id - b.id;
}

/**
 * Today's tasks still to do at `now`: pending, with an end that is not earlier than
 * `now`, in `scheduled_start` order and then by id. The first is Next up. The list
 * handed in is not changed.
 */
export function tasksLeft(tasks: readonly Task[], now: Date): ScheduledTask[] {
  return todaysTasks(tasks, now)
    .filter((task) => task.status === 'pending' && !isOverdue(task, now))
    .sort(byStart);
}

/** How many tasks are overdue at `now`, on any day. */
export function overdueCount(tasks: readonly Task[], now: Date): number {
  return tasks.filter((task) => isOverdue(task, now)).length;
}

function minutesOf(tasks: readonly Task[]): number {
  return tasks.reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0);
}

/**
 * Planned and done minutes of today's tasks at `now`, by their estimates. A null
 * estimate counts as 0, and the percent is 0 when nothing is planned.
 */
export function progressOf(tasks: readonly Task[], now: Date): TodayProgress {
  const todays = todaysTasks(tasks, now);
  const done = todays.filter((task) => task.status === 'done');
  const planned = minutesOf(todays);
  const doneMinutes = minutesOf(done);
  return {
    percent: planned === 0 ? 0 : Math.round((doneMinutes * 100) / planned),
    minutesText: `${doneMinutes} of ${planned} min done`,
    tasksText: `${done.length} of ${todays.length} tasks finished`,
  };
}

/** The parts that are there, joined with ` · `. */
function metaLine(...parts: (string | null)[]): string {
  return parts.filter((part): part is string => part !== null && part !== '').join(' · ');
}

function nextUpOf(task: ScheduledTask): NextUpCard {
  return {
    id: task.id,
    title: task.title,
    href: taskPath(task.id),
    when: `Next up · ${clockLabel(new Date(task.scheduled_start))}`,
    priority: task.priority,
    meta: metaLine(task.category, task.estimated_minutes === null ? null : `about ${task.estimated_minutes} min`),
    startAction: `${taskPath(task.id)}/start`,
  };
}

function laterItemOf(task: ScheduledTask): LaterItem {
  const label = priorities.find((item) => item.id === task.priority)?.label;
  return {
    id: task.id,
    title: task.title,
    href: taskPath(task.id),
    meta: metaLine(task.category, task.estimated_minutes === null ? null : `${task.estimated_minutes} min`),
    time: clockLabel(new Date(task.scheduled_start)),
    tone: task.priority ?? 'none',
    priorityLabel: label === undefined ? null : `${label} priority`,
  };
}

/** The dashboard at `now`, from every task. The ones it does not show are dropped here. */
export function buildToday(tasks: readonly Task[], now: Date): Today {
  const left = tasksLeft(tasks, now);
  const overdue = overdueCount(tasks, now);
  return {
    date: weekdayDateLabel(now),
    nextUp: left.length === 0 ? null : nextUpOf(left[0]),
    emptyHref: ADD_PATH,
    progress: progressOf(tasks, now),
    overdue: overdue === 0 ? null : { href: OVERDUE_PATH, text: `${overdue} overdue task${overdue === 1 ? '' : 's'}` },
    later: left.slice(1).map(laterItemOf),
    quickAdd: QUICK_ADD,
  };
}
```

- Tests (see `plan.md`): `src/today-page.test.ts`, `src/services/today.test.ts`,
  `src/dubai-weekday.test.ts`.

Changed:

- `src/dubai.ts` (D3). After `MONTHS`, add:

```ts
/** The days of the week, in the order `getUTCDay` counts them. */
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
```

  and after `clockLabel`, add:

```ts
/** An instant's date on the Dubai clock, with its full weekday: `Monday, 12 Oct`. */
export function weekdayDateLabel(at: Date): string {
  const onClock = new Date(at.getTime() + DUBAI_OFFSET_MS);
  return `${WEEKDAY_NAMES[onClock.getUTCDay()]}, ${onClock.getUTCDate()} ${MONTHS[onClock.getUTCMonth()]}`;
}
```

- `src/routes/home.ts` (D1). Replace the whole file with:

```ts
import { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { listTasks } from '../db/tasks.ts';
import { renderPage } from '../render.ts';
import { TODAY_PATH, buildToday } from '../services/today.ts';
import { requestTime } from './mini-bar.ts';

/**
 * The Today dashboard. It reads every task once, and the time of the request as the
 * mini-bar middleware read it, and writes nothing.
 */
export function createHomeRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(TODAY_PATH, (_req, res) => {
    renderPage(res, 'home', {
      title: 'Today',
      nav: 'today',
      today: buildToday(listTasks(deps.db), requestTime(res)),
    });
  });

  return router;
}
```

- `src/app.ts`. Change `import { homeRouter } from './routes/home.ts';` to
  `import { createHomeRouter } from './routes/home.ts';`, and change
  `app.use(homeRouter);` to `app.use(createHomeRouter(deps));`, in the same place, right
  after `app.use(createMiniBarMiddleware(deps));`. Nothing else changes.

- `src/views/pages/home.ejs`. Replace the whole file with:

```ejs
<%#
  The Today dashboard: what to do now.
  today: { date, nextUp, emptyHref, progress, overdue, later, quickAdd }, built by
  `buildToday` of src/services/today.ts. `nextUp` and `overdue` are null when there is
  none; `later` may be empty. Rendered without `today`, as the layout tests of 002 do,
  the page is its header alone.
-%>
<%- include('../partials/page-header', { pageHeader: { heading: 'Today', sub: locals.today ? today.date : undefined } }) -%>
<% if (locals.today) { -%>

<% if (today.nextUp !== null) { -%>
<section class="card next-up" id="next-up" aria-labelledby="next-up-title">
  <div class="next-up__head">
    <p class="next-up__when"><%= today.nextUp.when %></p>
<% if (today.nextUp.priority !== null) { -%>
    <%- include('../partials/priority-badge', { priorityBadge: { priority: today.nextUp.priority } }) -%>
<% } -%>
  </div>
  <h2 class="next-up__title" id="next-up-title"><a href="<%= today.nextUp.href %>"><%= today.nextUp.title %></a></h2>
<% if (today.nextUp.meta !== '') { -%>
  <p class="next-up__meta"><%= today.nextUp.meta %></p>
<% } -%>
  <form class="next-up__actions" method="post" action="<%= today.nextUp.startAction %>">
    <%- include('../partials/button', { button: { label: 'Start', type: 'submit' } }) -%>
  </form>
</section>
<% } else { -%>
<%- include('../partials/empty-state', { emptyState: {
  heading: 'Nothing up next',
  text: 'No task is left to start today.',
  actions: include('../partials/button', { button: { label: 'Add a task', href: today.emptyHref } }),
} }) -%>
<% } -%>

<div class="card progress" id="progress" role="progressbar" aria-label="Today's progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="<%= today.progress.percent %>">
  <p class="progress__percent"><%= today.progress.percent %>%</p>
  <div class="progress__text">
    <p class="progress__minutes"><%= today.progress.minutesText %></p>
    <p class="progress__tasks"><%= today.progress.tasksText %></p>
  </div>
  <div class="progress__track"><div class="progress__fill" style="width: <%= today.progress.percent %>%"></div></div>
</div>

<% if (today.overdue !== null) { -%>
<a class="overdue-banner" id="overdue-banner" href="<%= today.overdue.href %>">
  <span><%= today.overdue.text %></span>
  <span>Review <span aria-hidden="true">→</span></span>
</a>
<% } -%>

<% if (today.later.length > 0) { -%>
<section class="later" aria-labelledby="later-heading">
  <h2 class="later__heading" id="later-heading">Later today</h2>
  <ol class="later__list">
<% for (const item of today.later) { -%>
    <li class="later__item" id="later-<%= item.id %>">
      <span class="dot d-<%= item.tone %>"<% if (item.priorityLabel !== null) { %> role="img" aria-label="<%= item.priorityLabel %>"<% } else { %> aria-hidden="true"<% } %>></span>
      <div class="later__text">
        <a class="later__title" href="<%= item.href %>"><%= item.title %></a>
<% if (item.meta !== '') { -%>
        <p class="later__meta"><%= item.meta %></p>
<% } -%>
      </div>
      <span class="later__time"><%= item.time %></span>
    </li>
<% } -%>
  </ol>
</section>
<% } -%>

<div class="quick-add" id="quick-add" role="group" aria-label="Quick add">
<% for (const link of today.quickAdd) { -%>
  <a class="quick-add__link" href="<%= link.href %>"><span class="quick-add__glyph" aria-hidden="true"><%= link.glyph %></span><span><%= link.label %></span></a>
<% } -%>
</div>
<% } -%>
```

- `public/css/base.css` (D11). Insert right after the `.mini-bar__title { … }` rule and
  before `/* ---------- Style guide ---------- */`:

```css
/* Today: the task to do next, the day's progress, the way to the overdue view, the rest of the day, and quick add. */
.next-up {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.next-up__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.next-up__when,
.next-up__meta {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.next-up__title {
  font-size: var(--font-size-lg);
  overflow-wrap: anywhere;
}

.next-up__title a {
  color: inherit;
}

.next-up__actions {
  display: flex;
  gap: var(--space-2);
}

.next-up__actions .btn {
  flex: 1;
}

/* The bar's fill is as wide as the share of minutes done; the route writes the width. */
.progress {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.progress__percent {
  font-size: var(--font-size-xl);
  font-weight: 700;
}

.progress__minutes {
  font-weight: 700;
}

.progress__tasks {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.progress__track {
  grid-column: 1 / -1;
  height: var(--space-2);
  overflow: hidden;
  background: var(--border);
  border-radius: 999px;
}

.progress__fill {
  height: 100%;
  background: var(--accent);
}

.overdue-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: var(--touch-target);
  padding: var(--space-2) var(--space-3);
  background: var(--urgent-bg);
  color: var(--urgent);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 700;
  text-decoration: none;
}

.later__heading {
  color: var(--muted);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.later__list {
  padding: 0;
  list-style: none;
}

.later__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}

.later__item:last-child {
  border-bottom: 0;
}

.later__text {
  flex: 1;
  min-width: 0;
}

.later__title {
  color: var(--text);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.later__meta,
.later__time {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.later__time {
  white-space: nowrap;
}

/* A task's priority as a dot. The name is on the dot for screen readers; the color repeats it. */
.dot {
  flex: none;
  width: var(--space-3);
  height: var(--space-3);
  border-radius: 50%;
}

.d-urgent {
  background: var(--urgent);
}

.d-high {
  background: var(--high);
}

.d-medium {
  background: var(--medium);
}

.d-low {
  background: var(--low);
}

.d-none {
  background: var(--border);
}

.quick-add {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.quick-add__link {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: var(--touch-target);
  padding: var(--space-2) var(--space-1);
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 700;
  text-decoration: none;
}

.quick-add__glyph {
  font-size: var(--font-size-lg);
}
```

Not touched:

- `src/routes/tasks.ts` and its Start route `POST /tasks/:taskId/start`, `startTask`,
  `markDone`: Start is 013's, unchanged (D5).
- `src/routes/mini-bar.ts`: `requestTime` is used as it is. The bar already shows on `/`.
- `src/services/overdue.ts`, `src/services/timeline.ts`, `src/services/task-list.ts`:
  `isOverdue`, `OVERDUE_PATH`, `isShownOn`, `ScheduledTask` and `taskPath` are imported,
  not changed.
- `src/routes/add.ts`: `TABS` stays private (D10).
- `src/views/layout.ejs`, `src/render.ts`, `src/ui.ts`, every partial under
  `src/views/partials/`, `src/views/pages/styleguide.ejs`.
- `src/db/*`: no migration, no helper, no SQL.
- `package.json`, `yarn.lock`: no package.
- Every existing `*.test.ts` file, including `src/shell.test.ts`, `src/app.test.ts`,
  `src/dubai.test.ts` and `src/stylesheet.test.ts` (AC10). The new function of
  `src/dubai.ts` is tested in a new file.
- `docs/` unless the builder logs an error. Everything under `factory/` except this
  job's `build.md`. `data/`.

## Risks

- **The layout tests of 002 render `home` without a model.** `home.ejs` guards with
  `locals.today` (D6). `src/shell.test.ts` "marks exactly the … link when the page names
  it" and "marks no link when the page names none" throw on a template that reads
  `today` bare. They run unchanged.
- **The page header stops writing `<h1>Today</h1>` exactly.** It is the page-header
  partial with `heading: 'Today'`, which writes `<h1>Today</h1>` with no attribute.
  `src/app.test.ts` and the AC1 test both check it.
- **A second navigation landmark or a script on `/`.** The banner and quick add are an
  `a` and a `div` (D9, D10), and the page adds no script. `src/shell.test.ts` counts
  both on `/`.
- **The time is not the request's.** The route uses `requestTime(res)` (D1). The AC1
  test moves the fake clock to 00:30 on 13 Oct in Dubai and expects `Tuesday, 13 Oct`.
  The AC2 tests depend on `now` throughout.
- **A missed or running task becomes Next up, or the wrong one is first.** The AC2
  tests have an overdue 9:00 AM task, a 1:00 to 2:00 PM task created last, an end equal
  to `now`, and an in-progress, a done and a draft task earlier in the day. A
  unit test hands in tasks with the same start in reverse id order.
- **The separator or the null parts of a meta line**
  (`docs/errors/test-data-with-its-own-space-hides-a-missing-separator.md`). The tests
  read the exact text of the meta element. Their data has no space at the joint
  (`Admin`, `about 45 min`), and there are cases with a null category, with null
  minutes, and with both null.
- **Progress counts `actual_minutes`, another day, or a draft.** The AC6 test gives the
  two done tasks `actual_minutes` of 90 and 10, so counting them gives `100 of 240`. It
  also adds a done task yesterday and a draft today. Rounding is held by the example
  (`31`, where ceil gives 32) and a unit case (`67`, where floor gives 66). A done task
  with a null estimate and nothing planned gives `0%`, not `NaN%`.
- **The banner counts only today, or counts non-pending tasks.** The AC5 test has one
  overdue task yesterday and one today, plus an in-progress, a done and a draft task
  with past ends, and expects `2 overdue tasks`. Singular and absence are tested too.
- **Escaping.** The AC1 test puts `<b>x</b>` in a Next up title, `<b>y</b>` in a Later
  title and `<i>c</i>` in a category, then expects no `b` or `i` element in `main` and
  the literal text.
- **Ports run out when test files are run in a loop**
  (`docs/errors/repeated-test-runs-run-out-of-ports.md`). Run each check once.
- **A reporter writes into the repo**
  (`docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md`). Use the default
  reporter only.
