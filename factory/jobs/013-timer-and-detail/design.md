# 013-timer-and-detail: design

No spec problem blocks the job. One reading is forced by the code, and five readings
cover what the spec leaves open:

- **AC8 against the existing tests: the layout loads `/js/timer.js` only on a page that
  has a task in progress** (D9). Loading it on every page breaks tests that AC11 says
  must not change: `src/shell.test.ts` takes `one(document, 'script')` on `/` (the
  inline theme script must be the only one), `src/add-page.test.ts` and
  `src/add-voice.test.ts` expect the exact list of three `script[src]` of `/add`, and
  `src/review-page.test.ts` expects no `script[src]` on a review page without drafts. A
  page with a timer always has the mini-bar (a timer is only shown for an `in_progress`
  task, and then the mini-bar is there), so the rule is: the layout writes the
  `<script src="/js/timer.js" defer>` exactly when it writes `#mini-bar`.
- An `in_progress` task with a null `started_at` cannot be made by the app, but existing
  010 tests write one straight into the database (`src/tasks-actions.test.ts`, "makes an
  in progress task done the same way", expects `actual_minutes` to stay null). Such a
  task's Done leaves `actual_minutes` as it is, its sheet has no `Started` line and no
  timer, and the mini-bar can show it without a timer; for "latest `started_at`" it
  counts as started before any task that has a start (D5, D6).
- AC5, "A missing `category`, `description` or `reminder` field counts as empty, so a post
  from the 010 edit page form still works there unchanged": the 010 route
  `POST /tasks/<id>/edit` keeps its own reader and writer and is not changed; the sheet's
  route `POST /tasks/<id>` accepts a post that lacks the three fields and stores them as
  null (D7). A field among the three that is posted more than once also counts as empty.
- AC7, `from=sheet`: only `from` given once with exactly `sheet` sends Done back to the
  sheet. A repeated or other `from` gives the list redirect, without `from` (D8).
- AC9, where the mini-bar goes: in `body`, right after `main`, never inside it, so every
  existing assertion on `main` (`main a`, `main form`, the text of `main`) holds on a
  page with a task in progress (D10).
- AC4, the description: its line breaks are stored as `\n` (a browser posts a textarea
  with `\r\n`), as 007 does for a transcript, then it is trimmed (D7).

Checked, in a throwaway folder under `$TMPDIR` importing the repo's `node_modules` by
absolute path (nothing installed, nothing written in the repo), on Node 26.8.2, yarn
1.22.22, jsdom 30.1.1, Express 5.3.0, EJS 7.0.1:

- In a `JSDOM` with `runScripts: 'dangerously'`, setting `window.Date.now` and
  `window.setInterval` from the test before `window.eval(script)` makes the script's bare
  `Date.now()` and `setInterval(…)` use them: a timer started at 09:23:55 showed `12:05`
  at 09:36:00, the recorded interval was 1000 ms, and calling it after moving the stub
  clock a second gave `12:06`. The host's `Date.now` was not changed (D14).
- A middleware that sets `res.locals.a` makes `a` visible to the view of a later
  `res.render`; `app.render` (what `renderView` of `src/testing/page.ts` uses) does not
  see it, and `locals.a` is then `undefined` without an error (D9, D10).

Not checked: Node 22 and 24, and the look of the sheet and the bar in a browser (the spec
asks for no check by hand).

## Approach

The sheet is one more page of the tasks router, at `GET /tasks/<id>`, beside the 010
edit page, which stays as it is. It renders the 002 bottom-sheet partial open, with the
id `task-sheet` and the title as its heading. Its body (state, timer, summary, the
error notice and the edit form) and its actions (Start, Done, Close) are two partials of
their own, included into the sheet's `body` and `actions` strings. The edit form posts to
`POST /tasks/<id>`; Start posts to `POST /tasks/<id>/start`; Done is the 010 route with a
new redirect for `?from=sheet`. Every write is a service function of
`src/services/task-actions.ts`, as in 010: `startTask` is new, `markDone` gains
`actual_minutes`, `readSheetEdit` reads the sheet's form on top of `readTaskEdit`, and
`saveTaskEdit` writes the sheet's three extra fields with the 010 rescheduling rule.

The mini-bar is on every page, so it cannot come from one route. An app-level
middleware, mounted after the two static handlers and before every router, reads the
clock once (`res.locals.requestTime`), reads the `in_progress` tasks, picks the one the
bar shows and puts the bar's view model in `res.locals.miniBar`. Express hands
`res.locals` to every `res.render`, so the layout sees it on every page, the 404 page
included. The routes of this job read the time from `res.locals.requestTime` through
`requestTime(res)`, so the sheet, its timer and the bar's timer use one instant.

The timer is server text first: the route writes the elapsed time at the request into an
element `.timer[data-started-at]`. `public/js/timer.js`, loaded only where there is a
mini-bar, rewrites every `[data-started-at]` element on load and once a second, with the
same format, reading the time with `Date.now()` alone, so a test gives the page a stub
clock. Dubai date and time arithmetic for the reminder goes into `src/dubai.ts`, the
elapsed time, the worked minutes and the choice of the bar's task into a new pure module
`src/services/timer.ts`.

## Decisions

**D1. The sheet lives in `src/routes/tasks.ts`, as `GET /tasks/:taskId` and
`POST /tasks/:taskId`.** It needs `findListedTask`, `STATUS_LABELS`, `messagesOf` and the
form-value rule of `renderEdit`, all in that file. Express 5's `/tasks/:taskId` matches
one segment only, so it never takes `/tasks/1/edit` or `/tasks/1/done`, and the list's
`GET /tasks` has no segment. An id that `findListedTask` refuses calls `next()`, which
ends at the app's 404 handler (010 D13), before any write. Rejected: a router of its own,
which would have to export those four or copy them.

**D2. The page: `pages/task-sheet.ejs` renders `partials/bottom-sheet.ejs` with
`{ id: 'task-sheet', heading: title, body, actions, open: true }`.** `title` is the
task's title, the same local the layout writes into `<title>`; both escape it with
`<%= %>`. `body` is `include('../partials/task-sheet-body', { sheet })` and `actions` is
`include('../partials/task-sheet-actions', { sheet })`: the bottom sheet takes HTML
strings, and these two are too long to build by concatenation. The page belongs to the
`tasks` nav item. The page has no `h1`; the dialog's `h2` is its heading (the partial
writes it). The 002 partial is used as it is: no script opens or closes it, `Close` is a
link to `/tasks#task-<id>` (spec, out of scope).

**D3. What the sheet shows, in order.** In the body: `p.task-sheet__status` with
`Pending`, `In progress` or `Done`; for an `in_progress` task with a start,
`p.task-sheet__started` with `Started <dayTimeLabel(started_at, now)>` and
`p.task-sheet__timer` holding the timer partial; for a `done` task,
`p.task-sheet__completed` with `Completed <dayTimeLabel(completed_at, now)>` when
`completed_at` is set and `p.task-sheet__summary` with
`Estimated <estimated_minutes> min, actual <actual_minutes> min` when both are set; the
error notice of 006 (`div.notice.notice--error[role=alert]`, one `p` per message) when a
post was refused; the edit form (D4). In the actions: a Start form for a `pending` task
(`method="post"`, `action="/tasks/<id>/start"`, primary submit `Start`); a Done form for
a task that is not `done` (`action="/tasks/<id>/done?from=sheet"`, submit `Done`, ghost
on a pending task beside Start, primary on an `in_progress` task); a ghost button link
`Close` to `/tasks#task-<id>`. All text goes through `<%= %>`.

**D4. The edit form: `form.edit-form` posting to `/tasks/<id>`, with the 010 fields and
three more.** In order: `Title` (`input.field#sheet-title[type=text][name=title][required]`),
`Minutes` (`input.field#sheet-minutes[type=number][name=minutes][min=1][max=1440][required]`),
the `Priority` and `Time slot` fieldsets of `pages/task-edit.ejs` (the same radios, `No
slot` first with `value=""`), `Category` (`input.field#sheet-category[type=text][name=category]`),
`Description` (`textarea.field.task-sheet__description#sheet-description[name=description][rows=3]`),
`Reminder` (`input.field#sheet-reminder[type=datetime-local][name=reminder]`), then
`div.edit-form__actions` with the submit `Save`. Every field has a `label` with `for`.
The values: on a `GET`, the stored ones (`reminder` as D11's `dateTimeValue`, empty when
null; a null category or description as empty). After a refused post: title and minutes
as posted, or stored when missing or repeated; priority and slot as posted when the page
has that radio, else stored (the 010 rule, D9 of 010); category, description and reminder
exactly as posted, or empty when missing or repeated. The form is copied into
`partials/task-sheet-body.ejs`, not shared with `pages/task-edit.ejs`, which this job
leaves untouched (spec, out of scope). The four 010 values are worked out by one helper,
`shownEdit(task, body)`, that both `renderEdit` and `renderSheet` call; the 010 page's
output does not change.

**D5. The timer: server text, the same format in TS and in the script.**
`elapsedLabel(from, to)` in `src/services/timer.ts` takes whole seconds
`Math.max(0, Math.floor((to − from) / 1000))` and writes `m:ss` under 3600 s and
`h:mm:ss` from 3600 s on, with no leading zero on the first number: `12:05`, `59:59`,
`1:00:00`, `1:02:05`. `timerOf(task, now)` is `{ startedAt: task.started_at, text }`, or
`null` when `started_at` is null. The element is `partials/timer.ejs`:
`<span class="timer" role="timer" data-started-at="<startedAt>"><text></span>`, used by
the sheet and the mini-bar. `public/js/timer.js` (D14) repeats the arithmetic in ES5; the
tests hold both to the same examples.

**D6. The task of the mini-bar: `runningTask(tasks)`.** Among the tasks handed in whose
status is `in_progress`, the one with the latest `started_at`; on equal `started_at`, the
highest id. Timestamps compare as text in time order (`src/db/timestamps.ts`); a null
`started_at` comes before every timestamp. `undefined` when there is none. Pure, in
`src/services/timer.ts`.

**D7. The sheet's post: `readSheetEdit(body)` is `readTaskEdit(body)` plus the three
fields.** In `src/services/task-actions.ts`:

- `category`, `description`: `postedValue`; a value that is not one string (missing or
  repeated) counts as `''`; `\r\n` becomes `\n`, then `trim()`; `''` is stored as `null`.
- `reminder`: the same `''` rule and `trim()`; `''` is `null`; anything else must be
  accepted by `instantOfDateTime` (D11), else it is the problem `reminder`.
- `problems` is `{ ...readTaskEdit(body).problems, reminder }` (`SheetProblems`). `edit`
  is `undefined` exactly when one of the four is set, else
  `{ ...taskEdit, category, description, reminder_at }` (`SheetEdit`), `reminder_at` being
  `instant.toISOString()` or `null`.

The route renders the sheet with 400 and the messages of 010 in their order, then
`Set the reminder as a date and time, or leave it empty.` last. A valid post is stored by
`saveTaskEdit(db, task, edit, now)` (D12) and answered `303` to `/tasks/<id>`. A past
reminder is a valid instant like any other. The 010 route `POST /tasks/:taskId/edit` is
not changed.

**D8. Done: one route, two redirects, and `actual_minutes`.** `POST /tasks/:taskId/done`
stays where it is. After `markDone`, when `req.query.from === 'sheet'` (a string, so a
repeated `from`, which Express gives as an array, is not it) it answers
`303` to `/tasks/<id>`; otherwise the 010 redirect,
`${withQuery('/tasks', readListQuery(req.query))}#task-<id>`. `readListQuery` reads only
`priority`, `slot` and `sort`, so `from` never reaches a list redirect. `markDone(db,
task, now)`: a `done` task is not written; otherwise `status: 'done'`,
`completed_at: now.toISOString()`, and, when the task is `in_progress` and has a
`started_at`, `actual_minutes: workedMinutes(started_at, now)`. `workedMinutes` is
`Math.max(1, Math.round((now − Date.parse(started_at)) / MINUTE_MS))`: 75 for 08:21 to
09:36, 1 for 20 seconds, 2 for 149 s and 3 for 151 s. A `pending` task's
`actual_minutes` is not in the update, so it stays as stored.

**D9. One clock read per request, by the mini-bar middleware.**
`createMiniBarMiddleware(deps)` in `src/routes/mini-bar.ts` sets
`res.locals.requestTime = new Date()` first. `requestTime(res)` returns it and throws
`The request time is read before the mini-bar middleware set it` when it is missing.
The routes of this job (`GET` and `POST /tasks/:taskId`, Start, Done) use
`requestTime(res)` and read no clock of their own. The 010 and 012 routes keep their own
`new Date()`: under the tests' fake `Date` both reads give the same instant, and nothing
they show is compared with the bar. The fake clock is the one of 009 D12,
`vi.useFakeTimers({ toFake: ['Date'] })`.

**D10. The mini-bar: built by the middleware, written by the layout after `main`.** The
middleware then sets `res.locals.miniBar` to
`miniBarOf(runningTask(listTasks(deps.db, { status: 'in_progress' })), now)`, which is
`null` with no task, else `{ title, href: '/tasks/<id>', timer: timerOf(task, now),
doneAction: '/tasks/<id>/done?from=sheet' }`. It runs for every request that reaches the
routers (a static file is answered before it), so every page rendered in the layout has
it, the 404 page and a refused post's 400 included. It is read before the handler runs;
every handler that changes a status redirects (303), so the page the browser loads next
reads it afresh. The layout writes, after `</main>`, `partials/mini-bar.ejs` when
`locals.miniBar` is truthy, and in the `head`, after the stylesheet link,
`<script src="/js/timer.js" defer></script>` under the same condition. `locals.` keeps
`renderView('layout', …)` of the 002 tests working without the middleware. The bar:
`<aside class="mini-bar" id="mini-bar" aria-label="In progress">` holding
`a.mini-bar__title` (the title, escaped, to `/tasks/<id>`), the timer partial when
`timer` is not null, and a form `method="post"` to `doneAction` with a primary submit
`Done`.

**D11. Reminder times on the Dubai clock: two functions in `src/dubai.ts`.**
`dateTimeValue(at)` is `new Date(at + DUBAI_OFFSET_MS).toISOString().slice(0, 16)`:
`2026-10-12T16:00:00.000Z` gives `2026-10-12T20:00` (seconds dropped).
`instantOfDateTime(text)` requires `/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/`, a date that
`dayOfDate` accepts (so `2026-02-30` is refused, 012 D3), hours `00`–`23` and minutes
`00`–`59`, and returns `new Date(dubaiDayStart(day) + (hours × 60 + minutes) × MINUTE_MS)`:
`2026-10-12T20:00` gives `2026-10-12T16:00:00.000Z`. Refused: `2026-10-12T24:00`,
`2026-10-12T20:60`, `2026-10-12 20:00`, `2026-10-12T20:00:00`, `2026-10-12T8:00`,
`tomorrow`. Rejected: `Date.parse` of the text, which reads it in the process's time zone.

**D12. `saveTaskEdit` takes `TaskEdit | SheetEdit`.** It already writes every key the
object holds with `updateTask` and reschedules a `pending` task whose minutes, priority
or slot changed (010 D10). `SheetEdit extends TaskEdit` with `category`, `description`
and `reminder_at`, so a sheet edit writes seven fields and nothing else: status,
`started_at`, `completed_at`, `actual_minutes`, `source_id` and `confidence` are never
keys of it. Only its doc comment and its parameter type change.

**D13. Start: `startTask(db, task, now)`.** A `pending` task gets
`{ status: 'in_progress', started_at: now.toISOString() }`; any other status is not
written. No other task is read or written, so a task already in progress stays so, and
the task's own schedule stays. `POST /tasks/:taskId/start` answers `303` to
`/tasks/<id>` in every case but the 404.

**D14. `public/js/timer.js`, and a stub clock for jsdom.** The script, an IIFE in ES5 like
`public/js/review.js`, takes every `[data-started-at]` element, returns at once when
there is none, writes each one's text from `Date.now() − Date.parse(data-started-at)`
(an attribute that does not parse is skipped), and calls the same update with
`setInterval(update, 1000)`. It uses no `new Date()`, so `Date.now` is its only clock.
`stubClock(window, at)` in `src/testing/dom.ts` replaces `window.Date.now` and
`window.setInterval` before the page's scripts run (checked, see the top) and returns
`{ advance(ms) }`, which moves the clock and runs each interval as often as it falls due.
`src/testing/jsdom.d.ts` gains the two members. Rejected: Vitest's fake timers, which
fake the host's `Date` and timers, not the ones of the page's own realm.

**D15. The ways in: the card title and the block title become links.** In
`pages/tasks.ejs`, `<h2 class="task__title"><a href="<card.href>"><title></a></h2>`. In
`pages/timeline.ejs`, the `p.blk__title` keeps the urgent glyph first and wraps the title
in `<a href="<block.href>">`. `href` is `taskPath(id)`, a new export of
`src/services/task-list.ts` (`/tasks/<id>`); `TaskCard` and `TimelineBlock` gain
`href: string`. No class changes; text stays the same, so every 010 and 012 assertion on
the title text holds. In CSS the two links take the color of their text, and the block's
link covers the whole block with an `::after` (the block is positioned), so the block is
the target.

**D16. Paths in `src/services/task-list.ts`.** `taskPath(id)` moves there from
`src/routes/tasks.ts` (exported), with `sheetDoneAction(id)` =
`${taskPath(id)}/done?from=sheet`. The mini-bar middleware and the timeline service use
them, and no route module imports another route module for them.

**D17. Styles: tokens only, inside the existing blocks.** New rules go before
`/* ---------- Style guide ---------- */`; the mini-bar's wide-screen `bottom: 0` goes
into the one existing `@media (min-width: 900px)` block (`src/stylesheet.test.ts` allows
one), after `.review-bar`. The bar is `position: sticky; bottom: var(--nav-height)`, the
review bar's placement, so it sits on the tab bar. Font sizes from the scale, spacing
from the tokens, no color literal, no custom property.

## Files

Created:

- `src/services/timer.ts`:

```ts
import type { Task } from '../db/tasks.ts';
import { MINUTE_MS } from '../dubai.ts';

/*
 * The time a task in progress has run: as a timer shows it, and as the minutes Done
 * stores. And which task the mini-bar shows. Nothing here reads the clock.
 */

/** A running timer as the views write it. */
export interface TaskTimer {
  /** The task's `started_at`, which the page's script counts from. */
  startedAt: string;
  /** The time elapsed at the request: `12:05`, `1:02:05`. */
  text: string;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** The time from `from` to `to`, in ms, as a timer shows it: `m:ss` under an hour, `h:mm:ss` from an hour on. Less than nothing is `0:00`. */
export function elapsedLabel(from: number, to: number): string {
  const total = Math.max(0, Math.floor((to - from) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = twoDigits(total % 60);
  return hours > 0 ? `${hours}:${twoDigits(minutes)}:${seconds}` : `${minutes}:${seconds}`;
}

/** The timer of a task at `now`, or `null` when it has no start. */
export function timerOf(task: Task, now: Date): TaskTimer | null {
  if (task.started_at === null) return null;
  return { startedAt: task.started_at, text: elapsedLabel(Date.parse(task.started_at), now.getTime()) };
}

/** The minutes from `startedAt` to `now`, rounded to the nearest whole minute and at least 1. */
export function workedMinutes(startedAt: string, now: Date): number {
  return Math.max(1, Math.round((now.getTime() - Date.parse(startedAt)) / MINUTE_MS));
}

/** Whether `a` was started after `b`: a later `started_at`, or the same and a higher id. No start is before any start. */
function startedAfter(a: Task, b: Task): boolean {
  if (a.started_at === b.started_at) return a.id > b.id;
  if (b.started_at === null) return true;
  if (a.started_at === null) return false;
  // Stored timestamps sort as text in time order (`src/db/timestamps.ts`).
  return a.started_at > b.started_at;
}

/** The task the mini-bar shows: of the `in_progress` ones, the one started last. `undefined` when none is in progress. */
export function runningTask(tasks: readonly Task[]): Task | undefined {
  let latest: Task | undefined;
  for (const task of tasks) {
    if (task.status !== 'in_progress') continue;
    if (latest === undefined || startedAfter(task, latest)) latest = task;
  }
  return latest;
}
```

- `src/routes/mini-bar.ts`. Exports `createMiniBarMiddleware(deps: AppDeps):
  RequestHandler`, `requestTime(res: Response): Date`, and the type `MiniBar`:

```ts
import type { RequestHandler, Response } from 'express';
import type { AppDeps } from '../app.ts';
import { listTasks, type Task } from '../db/tasks.ts';
import { sheetDoneAction, taskPath } from '../services/task-list.ts';
import { runningTask, timerOf, type TaskTimer } from '../services/timer.ts';

/** The bar every page shows while a task is in progress, as `partials/mini-bar.ejs` takes it. */
export interface MiniBar {
  title: string;
  href: string;
  /** `null` for a task without a start. */
  timer: TaskTimer | null;
  doneAction: string;
}

function miniBarOf(task: Task | undefined, now: Date): MiniBar | null {
  if (task === undefined) return null;
  return { title: task.title, href: taskPath(task.id), timer: timerOf(task, now), doneAction: sheetDoneAction(task.id) };
}

/**
 * Reads the clock once for the request, as `res.locals.requestTime`, and puts the
 * mini-bar of the task in progress, or `null`, in `res.locals.miniBar`, where the
 * layout of every page finds it. Mounted before every router.
 */
export function createMiniBarMiddleware(deps: AppDeps): RequestHandler {
  return (_req, res, next) => {
    const now = new Date();
    res.locals.requestTime = now;
    res.locals.miniBar = miniBarOf(runningTask(listTasks(deps.db, { status: 'in_progress' })), now);
    next();
  };
}

/** The time of this request, as the middleware read it. */
export function requestTime(res: Response): Date {
  const at: Date | undefined = res.locals.requestTime;
  if (at === undefined) throw new Error('The request time is read before the mini-bar middleware set it');
  return at;
}
```

- `src/views/partials/timer.ejs`:

```ejs
<%#
  timer: { startedAt, text }
  The time elapsed since `startedAt`, as the server wrote it. `/js/timer.js` keeps it
  running.
-%>
<%
  if (typeof timer.startedAt !== 'string' || timer.startedAt === '') throw new Error('timer: startedAt is required');
-%>
<span class="timer" role="timer" data-started-at="<%= timer.startedAt %>"><%= timer.text %></span>
```

- `src/views/partials/mini-bar.ejs`:

```ejs
<%#
  miniBar: { title, href, timer, doneAction }
  The task in progress, on every page: its title as a link to its sheet, its timer when
  it has a start, and Done. The layout writes it after `main`.
-%>
<aside class="mini-bar" id="mini-bar" aria-label="In progress">
  <a class="mini-bar__title" href="<%= miniBar.href %>"><%= miniBar.title %></a>
<% if (miniBar.timer !== null) { -%>
  <%- include('timer', { timer: miniBar.timer }) -%>
<% } -%>
  <form method="post" action="<%= miniBar.doneAction %>">
    <%- include('button', { button: { label: 'Done', type: 'submit' } }) -%>
  </form>
</aside>
```

- `src/views/pages/task-sheet.ejs`:

```ejs
<%#
  The detail sheet of one task, as a page of its own, open over nothing else.
  sheet: { status, started, timer, completed, summary, startAction, doneAction, closeHref, form, errors }
  The heading is the page's title, the task's title. The body and the actions are built
  by the two task-sheet partials.
-%>
<%- include('../partials/bottom-sheet', { bottomSheet: {
  id: 'task-sheet',
  heading: title,
  body: include('../partials/task-sheet-body', { sheet }),
  actions: include('../partials/task-sheet-actions', { sheet }),
  open: true,
} }) -%>
```

- `src/views/partials/task-sheet-body.ejs`:

```ejs
<%#
  sheet: as pages/task-sheet.ejs. The state of the task, its timer while it is in
  progress, what it took once done, then its edit form. `started`, `timer`,
  `completed` and `summary` are null when they are not shown. `form.slot` is '' for
  No slot.
-%>
<p class="task-sheet__status"><%= sheet.status %></p>
<% if (sheet.started !== null) { -%>
<p class="task-sheet__started"><%= sheet.started %></p>
<% } -%>
<% if (sheet.timer !== null) { -%>
<p class="task-sheet__timer"><%- include('timer', { timer: sheet.timer }) -%></p>
<% } -%>
<% if (sheet.completed !== null) { -%>
<p class="task-sheet__completed"><%= sheet.completed %></p>
<% } -%>
<% if (sheet.summary !== null) { -%>
<p class="task-sheet__summary"><%= sheet.summary %></p>
<% } -%>
<% if (sheet.errors.length > 0) { -%>
<div class="notice notice--error" role="alert">
<% for (const message of sheet.errors) { -%>
  <p><%= message %></p>
<% } -%>
</div>
<% } -%>
<form class="edit-form" method="post" action="<%= sheet.form.action %>">
  <label class="edit-form__label" for="sheet-title">Title</label>
  <input class="field" id="sheet-title" type="text" name="title" value="<%= sheet.form.title %>" required>
  <label class="edit-form__label" for="sheet-minutes">Minutes</label>
  <input class="field" id="sheet-minutes" type="number" name="minutes" value="<%= sheet.form.minutes %>" min="1" max="1440" required>
  <fieldset class="choices">
    <legend class="edit-form__label">Priority</legend>
<% for (const item of ui.priorities) { -%>
    <label class="choice">
      <input type="radio" name="priority" value="<%= item.id %>"<% if (sheet.form.priority === item.id) { %> checked<% } %>>
      <span><span aria-hidden="true"><%= item.glyph %></span> <%= item.label %></span>
    </label>
<% } -%>
  </fieldset>
  <fieldset class="choices">
    <legend class="edit-form__label">Time slot</legend>
    <label class="choice">
      <input type="radio" name="slot" value=""<% if (sheet.form.slot === '') { %> checked<% } %>>
      <span>No slot</span>
    </label>
<% for (const item of ui.slots) { -%>
    <label class="choice">
      <input type="radio" name="slot" value="<%= item.id %>"<% if (sheet.form.slot === item.id) { %> checked<% } %>>
      <span><%= item.label %></span>
    </label>
<% } -%>
  </fieldset>
  <label class="edit-form__label" for="sheet-category">Category</label>
  <input class="field" id="sheet-category" type="text" name="category" value="<%= sheet.form.category %>">
  <label class="edit-form__label" for="sheet-description">Description</label>
  <textarea class="field task-sheet__description" id="sheet-description" name="description" rows="3"><%= sheet.form.description %></textarea>
  <label class="edit-form__label" for="sheet-reminder">Reminder</label>
  <input class="field" id="sheet-reminder" type="datetime-local" name="reminder" value="<%= sheet.form.reminder %>">
  <div class="edit-form__actions">
    <%- include('button', { button: { label: 'Save', type: 'submit' } }) -%>
  </div>
</form>
```

- `src/views/partials/task-sheet-actions.ejs`:

```ejs
<%#
  sheet: as pages/task-sheet.ejs. Start for a pending task, Done for one that is not
  done, and Close back to the task's card. Each post is a form of its own.
-%>
<% if (sheet.startAction !== null) { -%>
<form method="post" action="<%= sheet.startAction %>">
  <%- include('button', { button: { label: 'Start', type: 'submit' } }) -%>
</form>
<% } -%>
<% if (sheet.doneAction !== null) { -%>
<form method="post" action="<%= sheet.doneAction %>">
  <%- include('button', { button: { label: 'Done', type: 'submit', variant: sheet.startAction === null ? 'primary' : 'ghost' } }) -%>
</form>
<% } -%>
<%- include('button', { button: { label: 'Close', variant: 'ghost', href: sheet.closeHref } }) -%>
```

- `public/js/timer.js`:

```js
/*
 * The running timers. Every element with `data-started-at` shows the time since that
 * instant, `m:ss` under an hour and `h:mm:ss` from an hour on, as the server wrote it.
 * This brings each one up to date when it loads and once a second after. Loaded with
 * `defer` by the layout on a page with a task in progress. Its only clock is
 * `Date.now()`.
 */
(function () {
  var timers = document.querySelectorAll('[data-started-at]');
  if (timers.length === 0) return;

  function twoDigits(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function label(milliseconds) {
    var total = Math.max(0, Math.floor(milliseconds / 1000));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var seconds = twoDigits(total % 60);
    return hours > 0 ? hours + ':' + twoDigits(minutes) + ':' + seconds : minutes + ':' + seconds;
  }

  function update() {
    var now = Date.now();
    var index;
    var startedAt;
    for (index = 0; index < timers.length; index += 1) {
      startedAt = Date.parse(timers[index].getAttribute('data-started-at'));
      if (!isNaN(startedAt)) timers[index].textContent = label(now - startedAt);
    }
  }

  update();
  setInterval(update, 1000);
})();
```

- Tests (see `plan.md`): `src/dubai-datetime.test.ts`, `src/services/timer.test.ts`,
  `src/task-sheet.test.ts`, `src/task-sheet-edit.test.ts`, `src/task-start-done.test.ts`,
  `src/timer-and-mini-bar.test.ts`.

Changed:

- `src/dubai.ts`: append (D11):

```ts
/** An instant on the Dubai clock as a `datetime-local` value, `YYYY-MM-DDTHH:MM`: `2026-10-12T16:00:00.000Z` is `2026-10-12T20:00`. */
export function dateTimeValue(at: Date): string {
  return new Date(at.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * The instant a Dubai date and time written `YYYY-MM-DDTHH:MM` names, or `undefined`
 * when the text is not in that form or names no real date and time.
 */
export function instantOfDateTime(text: string): Date | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(text);
  if (match === null) return undefined;
  const day = dayOfDate(match[1]);
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (day === undefined || hours > 23 || minutes > 59) return undefined;
  return new Date(dubaiDayStart(day) + (hours * 60 + minutes) * MINUTE_MS);
}
```

- `src/services/task-list.ts` (D16): append

```ts
/** The address of one task: its sheet, and the prefix of its actions. */
export function taskPath(id: number): string {
  return `${LIST_PATH}/${id}`;
}

/** Where Done posts from the sheet and the mini-bar, so that it answers with the sheet. */
export function sheetDoneAction(id: number): string {
  return `${taskPath(id)}/done?from=sheet`;
}
```

- `src/services/task-actions.ts`:
  - imports gain `instantOfDateTime` from `../dubai.ts` and `workedMinutes` from
    `./timer.ts`.
  - The header comment gains "start it" in its list.
  - After `readTaskEdit`, add:

```ts
/** What the sheet's edit form stores: the fields of the edit page and three more. */
export interface SheetEdit extends TaskEdit {
  category: string | null;
  description: string | null;
  reminder_at: string | null;
}

/** What was wrong in a posted sheet: the problems of the edit page, and a reminder that is no date and time. */
export interface SheetProblems extends DraftProblems {
  reminder: boolean;
}

export interface SheetEditReading {
  edit: SheetEdit | undefined;
  problems: SheetProblems;
}

/** An optional text field: one posted string, line breaks as `\n`, trimmed. Missing or posted more than once is empty. */
function optionalText(body: unknown, name: string): string {
  const value = postedValue(body, name);
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
}

/**
 * Reads the edit form of the sheet: the fields of `readTaskEdit`, and a category, a
 * description and a reminder, each of which may be empty and is then stored as null.
 * The reminder is a Dubai date and time, `YYYY-MM-DDTHH:MM`.
 */
export function readSheetEdit(body: unknown): SheetEditReading {
  const base = readTaskEdit(body);
  const reminderText = optionalText(body, 'reminder');
  const reminder = reminderText === '' ? null : instantOfDateTime(reminderText);
  const problems: SheetProblems = { ...base.problems, reminder: reminder === undefined };
  if (base.edit === undefined || reminder === undefined) return { edit: undefined, problems };

  const category = optionalText(body, 'category');
  const description = optionalText(body, 'description');
  return {
    edit: {
      ...base.edit,
      category: category === '' ? null : category,
      description: description === '' ? null : description,
      reminder_at: reminder === null ? null : reminder.toISOString(),
    },
    problems,
  };
}

/** Starts a `pending` task at `now`. A task of any other status is not written. */
export function startTask(db: Database, task: Task, now: Date): void {
  if (task.status !== 'pending') return;
  updateTask(db, task.id, { status: 'in_progress', started_at: now.toISOString() });
}
```

  - `markDone` becomes:

```ts
/**
 * Makes a task `done` at `now`. A task in progress with a start also gets the minutes
 * it ran, as `actual_minutes`; any other keeps its minutes. Its scheduled times are
 * left as they are. A task that is `done` already is not written.
 */
export function markDone(db: Database, task: Task, now: Date): void {
  if (task.status === 'done') return;
  const worked =
    task.status === 'in_progress' && task.started_at !== null
      ? { actual_minutes: workedMinutes(task.started_at, now) }
      : {};
  updateTask(db, task.id, { status: 'done', completed_at: now.toISOString(), ...worked });
}
```

  - `saveTaskEdit(db: Database, task: Task, edit: TaskEdit | SheetEdit, now: Date)`; its
    doc comment's last sentence becomes "Only the fields of the edit are written: the
    four of the edit page, and for a sheet edit its category, description and
    reminder." The body is unchanged.

- `src/routes/tasks.ts`:
  - Imports: `dateTimeValue` from `../dubai.ts` beside `dayTimeLabel`; `readSheetEdit`,
    `startTask`, `type SheetProblems` from `../services/task-actions.ts`; `sheetDoneAction`
    and `taskPath` from `../services/task-list.ts`; `timerOf, type TaskTimer` from
    `../services/timer.ts`; `requestTime` from `./mini-bar.ts`.
  - The local `function taskPath` is removed (D16).
  - `const BAD_REMINDER = 'Set the reminder as a date and time, or leave it empty.';` after
    `BAD_CHOICE`.
  - `TaskCard` gains `href: string;` (first after `title`), and `cardOf` sets
    `href: path`.
  - `shownEdit` is extracted from `renderEdit`, which then spreads it:

```ts
/** The four fields of the edit page as a form shows them: as posted where a value was posted, else as stored. */
function shownEdit(task: Task, body: unknown): Pick<EditForm, 'title' | 'minutes' | 'priority' | 'slot'> {
  const postedPriority = postedValue(body, 'priority');
  const postedSlot = postedValue(body, 'slot');
  return {
    title: postedValue(body, 'title') ?? task.title,
    minutes: postedValue(body, 'minutes') ?? (task.estimated_minutes === null ? '' : String(task.estimated_minutes)),
    priority: priorities.find((item) => item.id === postedPriority)?.id ?? task.priority,
    slot: postedSlot === '' ? '' : (slots.find((item) => item.id === postedSlot)?.id ?? task.time_slot ?? ''),
  };
}
```

    `renderEdit` builds `edit` as `{ ...shownEdit(task, body), action, deleteAction,
    backHref }`.
  - New, after `renderEdit`:

```ts
/** The sheet's edit form as `partials/task-sheet-body.ejs` shows it. */
interface SheetForm extends Pick<EditForm, 'title' | 'minutes' | 'priority' | 'slot'> {
  action: string;
  category: string;
  description: string;
  /** `YYYY-MM-DDTHH:MM` on the Dubai clock, or as posted, or ''. */
  reminder: string;
}

/** The detail sheet of a task as `pages/task-sheet.ejs` shows it. `null`: not shown. */
interface TaskSheet {
  status: string;
  /** `Started Today 1:23 PM`. */
  started: string | null;
  timer: TaskTimer | null;
  /** `Completed Today 1:36 PM`. */
  completed: string | null;
  /** `Estimated 30 min, actual 75 min`. */
  summary: string | null;
  startAction: string | null;
  doneAction: string | null;
  closeHref: string;
  form: SheetForm;
  errors: string[];
}

/** The messages of a refused sheet: those of the edit page, then the reminder's. */
function sheetMessages(problems: SheetProblems): string[] {
  const messages = messagesOf(problems);
  if (problems.reminder) messages.push(BAD_REMINDER);
  return messages;
}

/** What an optional field shows: the stored value on a GET; after a post, what was posted, or '' when it was missing or repeated. */
function shownOptional(body: unknown, name: string, stored: string): string {
  if (body === undefined) return stored;
  const posted = postedValue(body, name);
  return typeof posted === 'string' ? posted : '';
}

/** Renders the sheet of a task at `now`, with the values of a refused post when there is one. */
function renderSheet(res: Response, task: Task, now: Date, status = 200, body: unknown = undefined, errors: string[] = []): void {
  const path = taskPath(task.id);
  const running = task.status === 'in_progress';
  const done = task.status === 'done';
  const sheet: TaskSheet = {
    status: STATUS_LABELS[task.status],
    started: running && task.started_at !== null ? `Started ${dayTimeLabel(new Date(task.started_at), now)}` : null,
    timer: running ? timerOf(task, now) : null,
    completed: done && task.completed_at !== null ? `Completed ${dayTimeLabel(new Date(task.completed_at), now)}` : null,
    summary:
      done && task.estimated_minutes !== null && task.actual_minutes !== null
        ? `Estimated ${task.estimated_minutes} min, actual ${task.actual_minutes} min`
        : null,
    startAction: task.status === 'pending' ? `${path}/start` : null,
    doneAction: done ? null : sheetDoneAction(task.id),
    closeHref: `${LIST_PATH}#task-${task.id}`,
    form: {
      ...shownEdit(task, body),
      action: path,
      category: shownOptional(body, 'category', task.category ?? ''),
      description: shownOptional(body, 'description', task.description ?? ''),
      reminder: shownOptional(body, 'reminder', task.reminder_at === null ? '' : dateTimeValue(new Date(task.reminder_at))),
    },
    errors,
  };
  res.status(status);
  renderPage(res, 'task-sheet', { title: task.title, nav: 'tasks', sheet });
}
```

  - In `createTasksRouter`: the doc comment says it also serves the sheet, its post and
    Start, and that Done from the sheet goes back to the sheet. The Done handler
    becomes:

```ts
  router.post(`${LIST_PATH}/:taskId/done`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    markDone(deps.db, task, requestTime(res));
    const back =
      req.query.from === 'sheet' ? taskPath(task.id) : `${withQuery(LIST_PATH, readListQuery(req.query))}#task-${task.id}`;
    res.redirect(303, back);
  });
```

    and three handlers are added after the Delete handler:

```ts
  router.get(`${LIST_PATH}/:taskId`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    renderSheet(res, task, requestTime(res));
  });

  router.post(`${LIST_PATH}/:taskId`, form, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const now = requestTime(res);
    const { edit, problems } = readSheetEdit(req.body);
    if (edit === undefined) {
      renderSheet(res, task, now, 400, req.body, sheetMessages(problems));
      return;
    }
    saveTaskEdit(deps.db, task, edit, now);
    res.redirect(303, taskPath(task.id));
  });

  router.post(`${LIST_PATH}/:taskId/start`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    startTask(deps.db, task, requestTime(res));
    res.redirect(303, taskPath(task.id));
  });
```

- `src/views/pages/tasks.ejs`: `<h2 class="task__title"><%= card.title %></h2>` becomes
  `<h2 class="task__title"><a href="<%= card.href %>"><%= card.title %></a></h2>`. Nothing
  else.
- `src/services/timeline.ts`: import `taskPath` from `./task-list.ts`; `TimelineBlock`
  gains `/** The task's sheet. */ href: string;` after `title`; the block object gains
  `href: taskPath(task.id),` after `title`. Nothing else.
- `src/views/pages/timeline.ejs`: the `p.blk__title` line becomes
  `<p class="blk__title"><% if (block.urgent) { %><span aria-hidden="true"><%= ui.priority('urgent').glyph %></span> <% } %><a href="<%= block.href %>"><%= block.title %></a></p>`.
  Nothing else.
- `src/views/layout.ejs`: after the stylesheet link,

```ejs
<% if (locals.miniBar) { -%>
  <script src="/js/timer.js" defer></script>
<% } -%>
```

  and right after `</main>`,

```ejs
<% if (locals.miniBar) { -%>
  <%- include('partials/mini-bar', { miniBar: locals.miniBar }) -%>
<% } -%>
```

- `src/app.ts`: `import { createMiniBarMiddleware } from './routes/mini-bar.ts';` in
  import order (after `./routes/home.ts`), and `app.use(createMiniBarMiddleware(deps));`
  right after the uploads `app.use(UPLOADS_URL_PATH, …)` and before
  `app.use(homeRouter);`.
- `src/testing/dom.ts`: append

```ts
/** A clock given to a page by `stubClock`. */
export interface StubClock {
  /** Moves the clock on by `ms`, running each interval of the page every time it falls due, in time order. */
  advance(ms: number): void;
}

/**
 * Gives a page a clock that stands still until the test moves it: `Date.now()` answers
 * it and `setInterval` records its callbacks. Call it before the page's scripts run.
 * `new Date()` in the page still reads the real clock.
 */
export function stubClock(window: DomWindow, at: number): StubClock {
  let now = at;
  const intervals: { run: () => void; every: number; next: number }[] = [];
  window.Date.now = () => now;
  window.setInterval = (run, every) => {
    const step = Math.max(1, every);
    intervals.push({ run, every: step, next: now + step });
    return intervals.length;
  };
  return {
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = intervals.filter((interval) => interval.next <= end).sort((a, b) => a.next - b.next)[0];
        if (due === undefined) break;
        now = due.next;
        due.next += due.every;
        due.run();
      }
      now = end;
    },
  };
}
```

- `src/testing/jsdom.d.ts`: in `DomWindow`, add

```ts
    /** The page's own `Date`. `stubClock` replaces `now`. */
    readonly Date: { now: () => number };
    /** The page's own `setInterval`. `stubClock` replaces it. */
    setInterval: (run: () => void, every: number) => number;
```

- `public/css/base.css` (D15, D17). Before `/* ---------- Style guide ---------- */`:

```css
/* The ways to a task's sheet: its title on a card, and a block of the timeline, whose link covers the block. */
.task__title a,
.blk__title a {
  color: inherit;
}

.blk__title a::after {
  content: "";
  position: absolute;
  inset: 0;
}

/* The detail sheet of a task: its state, its timer, what it took, then its edit form. */
.task-sheet__status,
.task-sheet__started,
.task-sheet__completed {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.task-sheet__timer {
  font-size: var(--font-size-2xl);
  font-weight: 700;
}

.task-sheet__summary {
  font-weight: 700;
}

.task-sheet__description {
  resize: vertical;
}

/* A running timer: its digits keep their width as they change. */
.timer {
  font-variant-numeric: tabular-nums;
}

/* The task in progress, on every page: it sits on the tab bar, and at the bottom on wide screens. */
.mini-bar {
  position: sticky;
  bottom: var(--nav-height);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  max-width: var(--content-width);
  margin: 0 auto;
  padding: var(--space-2) var(--space-4);
  background: var(--surface-2);
  border-top: 1px solid var(--border);
}

.mini-bar__title {
  flex: 1;
  min-width: 0;
  color: var(--text);
  font-weight: 700;
  overflow-wrap: anywhere;
}
```

  and inside `@media (min-width: 900px)`, right after its `.review-bar { bottom: 0; }`:

```css
  .mini-bar {
    bottom: 0;
  }
```

Not touched:

- `src/views/pages/task-edit.ejs` and the routes `GET`/`POST /tasks/:taskId/edit`: the 010
  edit page stays (spec). Only `renderEdit`'s body is refactored onto `shownEdit`.
- `src/views/partials/bottom-sheet.ejs`, `button.ejs`, and every other 002 partial: used
  as they are. `src/views/pages/styleguide.ejs`: no new component is added to it.
- `src/render.ts`: `renderPage` is unchanged; the bar reaches the layout through
  `res.locals`.
- `src/db/*`: no migration, no helper, no SQL; `listTasks` with its `status` filter,
  `getTask`, `updateTask` as they are. `reminder_at`, `started_at`, `completed_at` and
  `actual_minutes` already exist (003).
- `src/services/scheduler.ts`, `src/services/drafts.ts`: as they are.
- `src/ui.ts`: no nav item.
- `src/routes/home.ts`, `src/views/pages/home.ejs` (014).
- `package.json`, `yarn.lock`: no package.
- Every existing `*.test.ts` file, `src/dubai.test.ts` included: the new functions are
  tested in new files (AC11).
- `docs/` unless the builder logs an error; everything under `factory/` but this job's
  `build.md`; `data/`.

## Risks

- **An existing test breaks on the script or the bar.** The script and the bar appear
  only with a task in progress (D9, D10), and no test that counts scripts has one. The
  pages with a task in progress in existing tests (`/tasks`, `/timeline`, a review page)
  assert on `main`, on a card or on a block, and the bar is outside `main`. The AC9 test
  asserts that `/` without a task in progress has exactly one `script`, as
  `src/shell.test.ts` needs. The builder runs the whole suite once; any existing failure
  means the design is wrong, not the test.
- **The 010 Done of an in-progress task without a start writes `actual_minutes`.** Guarded
  by `task.started_at !== null` (D8); the existing test "makes an in progress task done
  the same way" compares the whole row and fails without the guard.
- **Rounding: floor or ceil instead of round, or no 1-minute floor.** AC7 tests 75, 20 s
  giving 1, and the service tests 149 s giving 2 and 151 s giving 3.
- **The reminder read or written in UTC or in the process's zone.** AC3 and AC4 expect
  `2026-10-12T20:00` against `2026-10-12T16:00:00.000Z`; the `src/dubai-datetime.test.ts`
  cases run under `TZ=Pacific/Kiritimati` as well (as 012 did), which catches local-time
  methods.
- **`2026-02-30T10:00` or `24:00` accepted.** AC5 and the unit tests list them.
- **The sheet's edit post writes a field it must not, or skips the reschedule.** AC4
  compares the whole row against `before` with only the seven fields and `updated_at`
  changed, on an `in_progress` task with `started_at`, `source_id` and `confidence` set;
  a second test changes a pending task's minutes and expects the 010 new times.
- **Start writes an already started task.** AC6 compares the whole rows, `updated_at`
  included, for `in_progress` and `done`; another test has a task in progress beside the
  one started and expects it unchanged.
- **`from` leaks into a list redirect.** AC7 posts `?from=x&priority=high` and expects
  `/tasks?priority=high#task-1`.
- **The bar shows the wrong task.** AC9 has two tasks in progress with different starts,
  then two with the same start, and expects the later, then the higher id.
- **The script writes only on the tick, or only on load.** The jsdom test blanks the
  timers before the script runs and expects `12:05` at once, then `12:06` after one
  second; a second case crosses `59:59` to `1:00:00`.
- **A script error passes unseen** (`docs/errors/jsdom-page-script-error-does-not-fail-test.md`).
  The jsdom test asserts `scriptErrors(window)` is empty for every window it opens.
- **The script uses `new Date()`**, which the stub clock does not reach: the tick test
  fails then, since the text would follow the real clock.
- **Ports run out when test files are run in a loop**
  (`docs/errors/repeated-test-runs-run-out-of-ports.md`). Run each check once.
- **A reporter writes into the repo**
  (`docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md`). Default reporter
  only.
