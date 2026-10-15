# 011-overdue: design

No spec problems. Four readings of things the spec leaves open:

- AC3, AC7: a pending task can have a `scheduled_end` and no `scheduled_start` (the
  table allows it; the app never writes it). Such a task is overdue by AC1. Its card is
  labelled by its end, its group sorts it last (D3), and a picked time keeps its
  `estimated_minutes` as its length, or none when that is null too (D6).
- AC7, a picked start whose end would be past the year 9999. The end cannot be stored
  (`tasks_scheduled_end` and `updateTask` refuse it; checked: the post answered 500).
  It is refused with the 400 of AC8 (D6).
- AC7: "not before `now`" is to the millisecond. `start` has whole minutes, so at
  1:36:30 PM a posted `13:36` is before `now` and refused.
- Labels the spec leaves open: the Mark done and Reschedule buttons say exactly that;
  the pick form's label is `Pick a time` and its button `Set time`; the empty state's
  text is `Every task whose time has passed is done or has a new time.` and its link is a
  button `See all tasks` (D8).

Everything marked "checked" was run in a throwaway copy of the repo under `$TMPDIR`
(`git archive HEAD`, the repo's `node_modules` linked in), on Node 26.8.2, yarn 1.22.22,
TypeScript 5.9.3, Vitest 5.0.1, Express 5.3.0, supertest 7.3.1. The whole design below
was built there with one prototype test file (14 tests over every criterion). `yarn
build` was clean and `yarn test` passed: 46 files, 1573 tests (1559 of before plus the
14). Twelve breaks were tried one at a time; eleven failed a prototype test, and the
twelfth (no sort within a group) passed because each group held one task, so the plan
has a test for the order (Risks). The copy is deleted. Not checked: Node 22 and 24, and
the look in a browser (the spec asks for no check by hand).

## Approach

The job adds one router, `src/routes/overdue.ts`, mounted after the tasks router, and
one pure service, `src/services/overdue.ts`, the way 010 split `task-list.ts` from its
route.

**The view** reads every task with `listTasks(db)` and hands them, with the time of the
request, to `overdueGroups`: it keeps the overdue ones (`isOverdue`: `pending` and an
end before `now`), puts each into `Today`, `Yesterday` or `Earlier` by the Dubai day of
its end against the Dubai day of `now` (`dubaiDay` of `src/dubai.ts`), sorts each group
by start then id, and leaves out the empty groups. No SQL is added (010 D2).

**The posts** reuse 010: `markDone` and `rescheduleTask` of `task-actions.ts`, and
`findListedTask` of `src/routes/tasks.ts` for the 404 (now exported). Each handler finds
the task, reads `new Date()` once, and writes only when the task is overdue at that
instant. The pick post reads `start` with `postedValue` (006), turns it into an instant
on the Dubai clock with `readPickedStart`, and keeps the task's length with
`pickedTimes`; a new `moveTask` of `task-actions.ts` stores the two columns. A refused
pick renders the view again with 400 and the message in that one card, as the review and
edit pages do.

**The page** is plain HTML: one `div.overdue-group` per group with an `h2` and an
`ol.task-list` of `li.card.task#task-<id>`, reusing the 010 card classes. Each card has
three one-action `POST` forms. The page is rendered without `nav`, so no nav link is
current.

## Decisions

**D1. One service, `src/services/overdue.ts`, pure; one router, `src/routes/overdue.ts`;
one write added to `src/services/task-actions.ts`.** As 010 D1: the logic is tested
without a request, and every write is a service function. Rejected: putting the overdue
rules in `task-list.ts`, which is the `/tasks` query.

**D2. Overdue is `status === 'pending' && scheduled_end !== null &&
Date.parse(scheduled_end) < now.getTime()`** (`isOverdue`). Strictly earlier, so an end
exactly at `now` is not overdue (AC1). The same function decides what the page shows and
whether a post writes (AC9), so the two cannot disagree.

**D3. Groups by `dubaiDay(now) - dubaiDay(end)`: 0 (or less) `Today`, 1 `Yesterday`,
more `Earlier`; within a group by `scheduled_start`, a task without one last, then by
`id`.** `dubaiDay` is the existing Dubai clock (009); an overdue end is never on a later
day than `now`, and `<= 0` keeps the function total. The comparator is the `byStart` of
`task-list.ts`, written again in `overdue.ts` (eight lines) rather than exported from
there: it is that file's private sort. The groups are `{ id, label, tasks }` with ids
`today`, `yesterday`, `earlier`; the ids name the headings' `id` attributes (D8).
Rejected: grouping by `scheduled_start`; AC2 names the end.

**D4. Reading `start`: `readPickedStart(value, now)`.** `value` is
`postedValue(req.body, 'start')`, so missing is `undefined` and posted twice is `null`;
anything but a string is refused. The string must match `/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/`
whole (JavaScript's `\d` is ASCII only and `$` has no newline allowance; checked:
`' 2026-10-12T18:00'`, a trailing `\n`, Arabic-Indic digits and `…T18:00:00` are refused).
The date is real when `new Date(Date.UTC(y, m - 1, d))` reads back the same year, month
and day (30 Feb rolls into March; a year below 100 is moved to the 1900s by `Date.UTC`,
so it is refused too, and would be before `now` anyway); hours `<= 23`, minutes
`<= 59`. The instant is `dubaiDayStart(dubaiDay(Date.UTC(y, m - 1, d))) + (h * 60 + min)
* MINUTE_MS`: `dubaiDay` of a UTC midnight is that date's index, and `dubaiDayStart` is
its Dubai midnight, so `src/dubai.ts` is not changed. Refused when the instant is before
`now`. Checked: `2026-10-12T18:00` → `14:00Z`, `2026-10-12T13:36` → `NOW`,
`2026-10-13T00:00` → `2026-10-12T20:00Z`, `2028-02-29` accepted, `2027-02-29`, `24:00`,
`23:60` refused.

**D5. The order of checks in every post: id (404), then overdue at the request (303,
no write), then, for the pick, `start` (400).** AC9 puts the no-op before the check of
`start`. The pick route's `express.urlencoded({ extended: false })` runs before the id
check, as on 010's edit post. Done and Reschedule have no parser: they read no field.

**D6. The new times keep the task's length: `pickedTimes(task, start)`.** Length is
`Date.parse(scheduled_end) - Date.parse(scheduled_start)` when both are set, else
`(estimated_minutes ?? 0) * MINUTE_MS` (the first reading above). It returns
`{ scheduled_start, scheduled_end }` as `toISOString()` strings, or `undefined` when
either is not `isTimestamp` (`src/db/timestamps.ts`): past 9999 `toISOString()` writes
`+010000-…`. The route treats `undefined` as a refused pick. Checked: a 5-hour task
picked at `9999-12-31T23:59` answered 500 without the guard and 400 with it.
`moveTask(db, task, times)` is `updateTask(db, task.id, times)`: one row, two columns
(plus the `updated_at` that `updateTask` sets), no transaction needed, no scheduler, so
no other task moves and overlaps are allowed (AC7). The type `TaskTimes` is
`Omit<Placement, 'id'>` of `scheduler.ts`.

**D7. Done and Reschedule are 010's functions behind `isOverdue`.** `markDone` sets
`done` and `completed_at` (010 D10); `rescheduleTask` places the task with `placeTasks`
and `storeSchedule` in one `inTransaction`, including the tasks an urgent one moves, and
leaves a task it cannot place as it is (AC6). Each redirects with `303` to `/overdue`,
with no fragment (AC5 to AC7 name the bare path).

**D8. The page.** `renderPage(res, 'overdue', { title: 'Overdue', overdue })` with no
`nav` (AC1; `render.ts` marks nothing then). In order: the page header `Overdue`; with
no group, the empty-state partial (`Nothing overdue`, the text above, a primary button
link `See all tasks` to `LIST_PATH`); else per group
`div.overdue-group > h2#overdue-<group id>` and `ol.task-list[aria-labelledby=overdue-<group id>]`.
A `div`, not a `section`: a labelled `section` is a region landmark, and the page needs
none. A card is `li.card.task#task-<id>` holding `h3.task__title` (the group heading is
the `h2`); `p.task__meta` with `span.task__minutes` (`<n> min` / `No estimate`), the
priority badge partial (left out when null), `span.task__due`
(`dayTimeLabel(new Date(scheduled_start ?? scheduled_end), now)`); `div.task__actions`
with a `Mark done` primary submit in a form posting to `/overdue/<id>/done` and a
`Reschedule` ghost submit in a form posting to `/overdue/<id>/reschedule`; then
`form.pick-form` posting to `/overdue/<id>/reschedule-at` with
`<label for="pick-<id>">Pick a time</label>`,
`input.field#pick-<id>[type=datetime-local][name=start][required]` and a ghost submit
`Set time`. On a refused pick, that card's input gets `aria-invalid="true"` and
`aria-describedby="pick-<id>-error"`, and after the form comes
`div.notice.notice--error#pick-<id>-error[role=alert]` with one `p` holding
`Pick a date and time that has not passed.`. `required` is not one of the limits the
spec leaves out (`value`, `min`); a post without it is still refused by the server. All
text goes through `<%= %>`.

**D9. The 404 reuses `findListedTask` of `src/routes/tasks.ts`.** It becomes `export
function findListedTask`: `readId`, `getTask`, `isListed`. AC9 names exactly that rule.
Routes already import from routes (010 D13). Rejected: a copy in the new router.

**D10. The clock.** Each request reads `new Date()` once: `GET /overdue` for the groups
and the labels; each post after the task is found, for `isOverdue`, the write and, for a
refused pick, the page it renders. The tests fake it with
`vi.useFakeTimers({ toFake: ['Date'] })` (009 D12).

**D11. Existing tests are not changed.** No test asserts that `/overdue` is not found
(checked: `grep -ri overdue src` finds only the analyzer prompt), and the full suite
passed with the router mounted (checked).

## Files

Created:

- `src/services/overdue.ts`, the whole file:

```ts
import type { Task } from '../db/tasks.ts';
import { isTimestamp } from '../db/timestamps.ts';
import { MINUTE_MS, dubaiDay, dubaiDayStart } from '../dubai.ts';
import type { Placement } from './scheduler.ts';

/*
 * The overdue view: which tasks were missed, the day each was due in, and the time a
 * user picks for one. A task is missed when it is still `pending` and its end has
 * passed; the scheduler leaves such a task where it was.
 */

/** The path of the overdue view. */
export const OVERDUE_PATH = '/overdue';

/** The groups of the view, in the order they are shown. */
const GROUPS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'earlier', label: 'Earlier' },
] as const;

export type OverdueGroupId = (typeof GROUPS)[number]['id'];

/** The overdue tasks of one Dubai day or of the days before yesterday. */
export interface OverdueGroup {
  id: OverdueGroupId;
  label: string;
  /** In `scheduled_start` order, a task without one last, then by `id`. Never empty. */
  tasks: Task[];
}

/** The two times of a task, as the two columns hold them. */
export type TaskTimes = Omit<Placement, 'id'>;

/** A picked time as a `datetime-local` input posts it: `YYYY-MM-DDTHH:MM`. */
const PICKED_SHAPE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Whether a task is overdue at `now`: `pending`, with a `scheduled_end` earlier than `now`. */
export function isOverdue(task: Task, now: Date): boolean {
  return task.status === 'pending' && task.scheduled_end !== null && Date.parse(task.scheduled_end) < now.getTime();
}

/** The group of an end that has passed: its Dubai day, against the Dubai day of `now`. */
function groupOf(end: string, now: Date): OverdueGroupId {
  const daysAgo = dubaiDay(now.getTime()) - dubaiDay(Date.parse(end));
  if (daysAgo <= 0) return 'today';
  return daysAgo === 1 ? 'yesterday' : 'earlier';
}

function byStart(a: Task, b: Task): number {
  if (a.scheduled_start !== b.scheduled_start) {
    if (a.scheduled_start === null) return 1;
    if (b.scheduled_start === null) return -1;
    // Stored timestamps sort as text in time order (`src/db/timestamps.ts`).
    return a.scheduled_start < b.scheduled_start ? -1 : 1;
  }
  return a.id - b.id;
}

/**
 * The overdue tasks among these at `now`, grouped by the Dubai day of their end:
 * `Today`, `Yesterday`, `Earlier`. A group without a task is left out. The list handed
 * in is not changed.
 */
export function overdueGroups(tasks: readonly Task[], now: Date): OverdueGroup[] {
  const groups: OverdueGroup[] = GROUPS.map((group) => ({ ...group, tasks: [] }));
  for (const task of tasks) {
    if (!isOverdue(task, now) || task.scheduled_end === null) continue;
    const id = groupOf(task.scheduled_end, now);
    groups.find((group) => group.id === id)?.tasks.push(task);
  }
  for (const group of groups) group.tasks.sort(byStart);
  return groups.filter((group) => group.tasks.length > 0);
}

/**
 * The instant a posted `start` names on the Dubai clock, or `undefined` when it is not
 * one string of the form `YYYY-MM-DDTHH:MM`, is not a real date and time, or is before
 * `now`. `value` is what `postedValue` read: `undefined` when missing, `null` when
 * posted more than once.
 */
export function readPickedStart(value: string | null | undefined, now: Date): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const match = PICKED_SHAPE.exec(value);
  if (match === null) return undefined;

  const [year, month, day, hours, minutes] = match.slice(1).map(Number);
  // `Date.UTC` rolls 30 Feb over to March and a year below 100 into the 1900s; either
  // way the date read back is not the one posted.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  if (hours > 23 || minutes > 59) return undefined;

  const start = dubaiDayStart(dubaiDay(date.getTime())) + (hours * 60 + minutes) * MINUTE_MS;
  return start < now.getTime() ? undefined : new Date(start);
}

/**
 * The times of a task moved to start at `start`, keeping its length: `scheduled_end`
 * minus `scheduled_start`, or its `estimated_minutes` (none: 0) when it has no start.
 * `undefined` when the end would not be a stored timestamp, past the year 9999.
 */
export function pickedTimes(task: Task, start: Date): TaskTimes | undefined {
  const length =
    task.scheduled_start !== null && task.scheduled_end !== null
      ? Date.parse(task.scheduled_end) - Date.parse(task.scheduled_start)
      : (task.estimated_minutes ?? 0) * MINUTE_MS;
  const times = {
    scheduled_start: start.toISOString(),
    scheduled_end: new Date(start.getTime() + length).toISOString(),
  };
  return isTimestamp(times.scheduled_start) && isTimestamp(times.scheduled_end) ? times : undefined;
}
```

- `src/routes/overdue.ts`. Exports `createOverdueRouter(deps: AppDeps): Router`. The
  whole file:

```ts
import express, { Router, type Response } from 'express';
import type { AppDeps } from '../app.ts';
import type { Database } from '../db/database.ts';
import { listTasks, type Task } from '../db/tasks.ts';
import { dayTimeLabel } from '../dubai.ts';
import { renderPage } from '../render.ts';
import { postedValue } from '../services/drafts.ts';
import {
  OVERDUE_PATH,
  isOverdue,
  overdueGroups,
  pickedTimes,
  readPickedStart,
  type OverdueGroupId,
} from '../services/overdue.ts';
import { markDone, moveTask, rescheduleTask } from '../services/task-actions.ts';
import { LIST_PATH } from '../services/task-list.ts';
import type { Priority } from '../ui.ts';
import { findListedTask } from './tasks.ts';

const BAD_PICK = 'Pick a date and time that has not passed.';
const NO_ESTIMATE = 'No estimate';

/** One overdue task as a card of `pages/overdue.ejs` shows it. */
interface OverdueCard {
  id: number;
  title: string;
  /** `25 min`, or `No estimate`. */
  minutes: string;
  /** `null`: no badge. */
  priority: Priority | null;
  /** When it was due: `Today 9:00 AM`, `11 Oct 9:00 AM`. */
  due: string;
  doneAction: string;
  rescheduleAction: string;
  pickAction: string;
  /** The message of a refused pick for this card, or `null`. */
  error: string | null;
}

/** One group of `pages/overdue.ejs`: its heading and its cards. */
interface GroupView {
  id: OverdueGroupId;
  label: string;
  cards: OverdueCard[];
}

/** A pick the page refused: the task it was for and what to tell the user. */
interface Refusal {
  taskId: number;
  message: string;
}

function cardOf(task: Task, now: Date, refusal: Refusal | undefined): OverdueCard {
  const path = `${OVERDUE_PATH}/${task.id}`;
  // An overdue task has an end; a task with an end and no start is labelled by its end.
  const due = task.scheduled_start ?? task.scheduled_end;
  return {
    id: task.id,
    title: task.title,
    minutes: task.estimated_minutes === null ? NO_ESTIMATE : `${task.estimated_minutes} min`,
    priority: task.priority,
    due: due === null ? '' : dayTimeLabel(new Date(due), now),
    doneAction: `${path}/done`,
    rescheduleAction: `${path}/reschedule`,
    pickAction: `${path}/reschedule-at`,
    error: refusal?.taskId === task.id ? refusal.message : null,
  };
}

/** Renders the overdue view at `now`, with the message of a refused pick on its card. */
function renderOverdue(res: Response, db: Database, now: Date, status = 200, refusal?: Refusal): void {
  const groups = overdueGroups(listTasks(db), now).map(
    (group): GroupView => ({
      id: group.id,
      label: group.label,
      cards: group.tasks.map((task) => cardOf(task, now, refusal)),
    }),
  );
  res.status(status);
  renderPage(res, 'overdue', { title: 'Overdue', overdue: { groups, emptyHref: LIST_PATH } });
}

/**
 * The overdue view and what it does to one task: Mark done, Reschedule, and a move to a
 * picked time. An id that names no task, names a draft or is not written as an id falls
 * through to the app's not-found page. A task that is no longer overdue at the request
 * is not written. Every post that is not refused goes back to the view.
 */
export function createOverdueRouter(deps: AppDeps): Router {
  const router = Router();
  // The pick form posts one flat field, so the simple parser is enough.
  const form = express.urlencoded({ extended: false });

  router.get(OVERDUE_PATH, (_req, res) => {
    renderOverdue(res, deps.db, new Date());
  });

  router.post(`${OVERDUE_PATH}/:taskId/done`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const now = new Date();
    if (isOverdue(task, now)) markDone(deps.db, task, now);
    res.redirect(303, OVERDUE_PATH);
  });

  router.post(`${OVERDUE_PATH}/:taskId/reschedule`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const now = new Date();
    if (isOverdue(task, now)) rescheduleTask(deps.db, task, now);
    res.redirect(303, OVERDUE_PATH);
  });

  router.post(`${OVERDUE_PATH}/:taskId/reschedule-at`, form, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const now = new Date();
    if (!isOverdue(task, now)) {
      res.redirect(303, OVERDUE_PATH);
      return;
    }
    const start = readPickedStart(postedValue(req.body, 'start'), now);
    const times = start === undefined ? undefined : pickedTimes(task, start);
    if (times === undefined) {
      renderOverdue(res, deps.db, now, 400, { taskId: task.id, message: BAD_PICK });
      return;
    }
    moveTask(deps.db, task, times);
    res.redirect(303, OVERDUE_PATH);
  });

  return router;
}
```

- `src/views/pages/overdue.ejs`, the whole file:

```ejs
<%#
  The overdue view: the pending tasks whose end has passed, grouped by the Dubai day it
  was in.
  overdue: { groups, emptyHref }
  `groups` are the groups that hold a task, in the order Today, Yesterday, Earlier, each
  with its cards. A card says where its three forms post; `error` is the message of a
  refused pick for that card, or null. With no group, the empty state links to `emptyHref`.
-%>
<%- include('../partials/page-header', { pageHeader: { heading: 'Overdue' } }) -%>

<% if (overdue.groups.length === 0) { -%>
<%- include('../partials/empty-state', { emptyState: {
  heading: 'Nothing overdue',
  text: 'Every task whose time has passed is done or has a new time.',
  actions: include('../partials/button', { button: { label: 'See all tasks', href: overdue.emptyHref } }),
} }) -%>
<% } -%>
<% for (const group of overdue.groups) { -%>
<div class="overdue-group">
  <h2 id="overdue-<%= group.id %>"><%= group.label %></h2>
  <ol class="task-list" aria-labelledby="overdue-<%= group.id %>">
<% for (const card of group.cards) { -%>
    <li class="card task" id="task-<%= card.id %>">
      <h3 class="task__title"><%= card.title %></h3>
      <p class="task__meta">
        <span class="task__minutes"><%= card.minutes %></span>
<% if (card.priority !== null) { -%>
        <%- include('../partials/priority-badge', { priorityBadge: { priority: card.priority } }) -%>
<% } -%>
        <span class="task__due"><%= card.due %></span>
      </p>
      <div class="task__actions">
        <form method="post" action="<%= card.doneAction %>">
          <%- include('../partials/button', { button: { label: 'Mark done', type: 'submit' } }) -%>
        </form>
        <form method="post" action="<%= card.rescheduleAction %>">
          <%- include('../partials/button', { button: { label: 'Reschedule', variant: 'ghost', type: 'submit' } }) -%>
        </form>
      </div>
      <form class="pick-form" method="post" action="<%= card.pickAction %>">
        <label for="pick-<%= card.id %>">Pick a time</label>
        <input class="field" id="pick-<%= card.id %>" type="datetime-local" name="start" required<% if (card.error !== null) { %> aria-invalid="true" aria-describedby="pick-<%= card.id %>-error"<% } %>>
        <%- include('../partials/button', { button: { label: 'Set time', variant: 'ghost', type: 'submit' } }) -%>
      </form>
<% if (card.error !== null) { -%>
      <div class="notice notice--error" id="pick-<%= card.id %>-error" role="alert">
        <p><%= card.error %></p>
      </div>
<% } -%>
    </li>
<% } -%>
  </ol>
</div>
<% } -%>
```

- Tests: `src/services/overdue.test.ts`, `src/overdue-page.test.ts`,
  `src/overdue-actions.test.ts`: see `plan.md`.

Changed:

- `src/services/task-actions.ts`: after the `./drafts.ts` import add
  `import type { TaskTimes } from './overdue.ts';`, and at the end of the file:

```ts

/** Gives a task these times. Nothing else of it, and no other task, is written. */
export function moveTask(db: Database, task: Task, times: TaskTimes): void {
  updateTask(db, task.id, times);
}
```

- `src/routes/tasks.ts`: `function findListedTask(` becomes `export function
  findListedTask(`. Nothing else.
- `src/app.ts`: `import { createOverdueRouter } from './routes/overdue.ts';` after the
  import of `./routes/home.ts`, and `app.use(createOverdueRouter(deps));` right after
  `app.use(createTasksRouter(deps));`.
- `public/css/base.css`: one insertion, before `/* ---------- Style guide ---------- */`:

```css
/* Overdue: the tasks grouped by the day they were due, and the form that picks a new time. */
.overdue-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.pick-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.pick-form .field {
  width: auto;
}

```

Not touched:

- `package.json`, `yarn.lock`: no package.
- `src/db/*`, `src/services/scheduler.ts`: no SQL, no helper; `listTasks`, `updateTask`,
  `placeTasks`, `storeSchedule` as they are.
- `src/dubai.ts`: `dubaiDay`, `dubaiDayStart`, `MINUTE_MS` and `dayTimeLabel` are enough
  (D4). `DUBAI_OFFSET_MS` stays private.
- `src/services/task-list.ts`: `byStart` stays private (D3); `isListed` and `LIST_PATH`
  are used as they are.
- `src/ui.ts`, `src/views/partials/nav.ejs`: no Overdue nav item (out of scope).
- `src/views/pages/tasks.ejs`, `src/views/pages/home.ejs`: no link to `/overdue`
  (014's banner).
- `src/views/partials/*`: the badge, button, page-header and empty-state partials are
  used as they are.
- `public/js/*`: no script (spec).
- Every existing test file (AC10).
- `docs/` unless the builder logs an error; everything under `factory/` but this job's
  `build.md`; `data/`.

## Risks

- **An end exactly at `now` is shown, or a post writes it.** AC1 test with a task ending
  at `NOW`; AC9 no-op test with the same task. Checked: `<` → `<=` failed two prototype
  tests.
- **Groups by the wrong day.** AC2 test with the spec's task in each group, and a
  boundary test: a task ending at `2026-10-11T20:00:00.000Z` (00:00 on 12 Oct in Dubai,
  `Today`) and one ending at `2026-10-11T19:55:00.000Z` (11:55 PM on 11 Oct,
  `Yesterday`); a grouping on the UTC day puts both under `Yesterday`. Checked:
  `yesterday` → `earlier` failed a prototype test.
- **Within a group the order is the database's.** The order test stores three tasks of
  one group with starts out of `id` order and two with the same start. The prototype
  missed this break (Approach); the plan's AC2 order test is there for it.
- **A post acts on a task that is not overdue.** AC9 303 tests compare every row,
  `updated_at` included, for an `in_progress` task, a `done` task and a pending task
  ending at `now`. Checked: dropping the `isOverdue` guard of Done, of Reschedule, or of
  the pick each failed a prototype test.
- **`start` is checked before the no-op.** AC9 posts `start=bogus` for a task that is
  not overdue and expects 303. Checked.
- **A picked time is read on UTC, or the Dubai midnight is off by a day.** AC7 spec
  example (`18:00` → `14:00Z`) and the unit test `2026-10-13T00:00` →
  `2026-10-12T20:00Z`. Checked: without the Dubai offset three tests failed.
- **A refused pick shows its message on every card, or twice.** AC8 tests count the
  message in the whole response (exactly once) and find it inside `#task-<id>` with two
  overdue cards on the page. Checked: an error on every card failed seven tests.
- **An unstorable end answers 500.** Unit test of `pickedTimes` and a route test with a
  5-hour task at `9999-12-31T23:59`. Checked (D6).
- **Drafts are acted on.** AC9 404 test with a draft. Checked: `isListed` returning
  `true` failed a test.
- **Ports run out when test files are run in a loop**
  (`docs/errors/repeated-test-runs-run-out-of-ports.md`). Run each check once; wait
  between runs when breaking code to see a test fail.
- **A reporter writes into the repo**
  (`docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md`). Default reporter
  only.
- **Test data hides the rule it tests**
  (`docs/errors/test-data-with-its-own-space-hides-a-missing-separator.md`). Each order
  and group test holds more than one task per place it checks.
