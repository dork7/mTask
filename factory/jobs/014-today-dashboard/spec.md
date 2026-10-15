# 014-today-dashboard: Today page with Next up, progress and quick add

## Goal

The nav's Today link (`/`) still shows the placeholder of 001: a `Today` heading and
`No tasks yet.`. This job makes it the dashboard of `docs/plan.md` U2 and the Today
screen of `docs/mockUps.html`. The page answers "what should I do now?". It shows the
date, a Next up card with a Start button, the planned and done minutes of the day, a
banner linking to the overdue view when tasks were missed, the rest of today's tasks,
and quick-add links to the three tabs of the Add page.

It only reads. It builds on what is there:
- the `tasks` helpers of `src/db/tasks.ts` (003);
- `isOverdue` and `OVERDUE_PATH` of `src/services/overdue.ts` (011);
- the Start route `POST /tasks/<id>/start` and the sheet `/tasks/<id>` (013), with the
  mini-bar that already shows a task in progress on this page;
- `clockLabel` and `dubaiDay` of `src/dubai.ts`;
- the page-header, priority-badge, button and empty-state partials (002);
- the Add page's `?tab=` addresses (004, 007).

The plan names no texts or rules beyond its five bullets, so the ones below are this
spec's choices, taken from the mockup where it shows them. The page is plain HTML and
CSS, with no client-side script. The route reads the time once per request from the same
test-settable clock that 010 to 013 use (`requestTime`).

Unless a criterion says otherwise, its examples use `now` = `2026-10-12T09:36:00.000Z`
(1:36 PM on Monday 12 Oct in Asia/Dubai) and Dubai clock times. "Today's tasks" are the
tasks with the status `pending`, `in_progress` or `done` whose `scheduled_start` is on
the Dubai day of `now`. This is the same rule as a timeline block (012 AC5). A `draft`
and a task with no `scheduled_start` are never one of them.

## Acceptance criteria

- **AC1**: Page. `GET /` answers 200 with the app layout and the title `Today`. The nav's
  Today link is marked `aria-current="page"`. The page header is the page-header partial,
  so `main` still contains `<h1>Today</h1>` exactly. Its sub-line is the Dubai date of
  `now`, written as full weekday, day and short month: `Monday, 12 Oct`. The text
  `No tasks yet.` is gone. All task text on the page is escaped, so a title of `<b>x</b>`
  is rendered as text.
- **AC2**: Next up. The Next up task is the first of today's `pending` tasks whose
  `scheduled_end` is not earlier than `now`, in `scheduled_start` order with ties by
  `id`. An `in_progress` task is never Next up. A pending task whose end has passed is
  never Next up either: it is overdue (AC5). When there is a Next up task, the page has
  one element with the id `next-up`. It holds:
  - the text `Next up · <clockLabel of scheduled_start>`, such as `Next up · 2:00 PM`;
  - the priority-badge partial for its priority, or no badge when the priority is null;
  - its title as a link to `/tasks/<id>`;
  - a meta line that joins its `category` and `about <estimated_minutes> min` with
    ` · `, such as `Admin · about 45 min`. A null `category` or a null
    `estimated_minutes` is left out, together with its separator.

  Example: pending tasks at 9:00 to 9:30 AM (overdue), 2:00 to 2:45 PM and 4:00 to
  5:00 PM. The 2:00 PM task is Next up. A task running from 1:00 to 2:00 PM today is
  Next up ahead of the 2:00 PM one, because its end has not passed.
- **AC3**: Start. The `#next-up` card has a Start button. It is a form that posts to
  `/tasks/<id>/start`, the route of 013 AC6, unchanged. So the post starts the task and
  answers 303 to its sheet `/tasks/<id>`. After the task is started, `GET /` shows the
  next pending task as Next up, or the empty state of AC4.
- **AC4**: Nothing next. When there is no Next up task, there is no `#next-up`. The page
  renders the empty-state partial instead, with the heading `Nothing up next` and a link
  to `/add`.
- **AC5**: Overdue banner. When at least one task is overdue at `now`, by `isOverdue`
  of 011 (on any day, not only today), the page has one link with the id
  `overdue-banner` to `/overdue`. Its text holds the count, as `1 overdue task` or
  `2 overdue tasks`, and `Review`. With no overdue task, there is no `#overdue-banner`.
  `in_progress`, `done` and `draft` tasks are never counted.
- **AC6**: Progress. The page has one element with the id `progress`. Over today's
  tasks:
  - planned minutes is the sum of their `estimated_minutes`, a null counting as 0;
  - done minutes is that sum over today's `done` tasks only. This uses the estimate, not
    `actual_minutes`, so the share never passes 100%. That is this spec's choice.
  - the percent is done minutes over planned minutes, rounded to a whole number, and 0
    when planned minutes is 0.

  The element holds the texts `<done> of <planned> min done`,
  `<done tasks> of <today's tasks> tasks finished` and `<percent>%`. It also carries
  `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"` and
  `aria-valuenow="<percent>"`.

  Example: done tasks of 45 and 30 min, a pending task of 45 min, and pending tasks of
  60 and 60 min, all today. The page shows `75 of 240 min done`, `2 of 5 tasks finished`
  and `31%`. A done task scheduled yesterday and a draft scheduled today change none of
  these numbers. With no task today, it shows `0 of 0 min done`, `0 of 0 tasks finished`
  and `0%`.
- **AC7**: Later today. The other remaining tasks are today's `pending` tasks whose
  `scheduled_end` is not earlier than `now`, without the Next up task. They are listed
  under a heading `Later today`, in `scheduled_start` order with ties by `id`. Each item
  is an element with the id `later-<id>`. It holds:
  - its title as a link to `/tasks/<id>`;
  - a meta line joining `category` and `<estimated_minutes> min` with ` · ` (such as
    `Coding · 60 min`), with a null left out as in AC2;
  - the `clockLabel` of its `scheduled_start` (`4:00 PM`);
  - an element with the class `dot` and the class `d-<priority>` (`d-none` for a null
    priority).

  The stylesheet gives `.d-<priority>` the background `var(--<priority>)` for each of
  `urgent`, `high`, `medium` and `low`. With no such task, the heading and the list are
  not rendered. Done, in-progress and overdue tasks are not listed.
- **AC8**: Quick add. The page always has three links, in this order, with their text
  and target. Any glyph sits in an `aria-hidden="true"` element, so it does not count as
  part of the text.
  - `Photo` to `/add?tab=photo`
  - `Voice` to `/add?tab=voice`
  - `Type` to `/add?tab=text`
- **AC9**: The page writes nothing. After any `GET /`, every task and settings row is as
  it was, `updated_at` included.
- **AC10**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. Tests run
  against a temporary or in-memory database and leave nothing in `data/`. There are
  tests for:
  - the header and its date (AC1);
  - Next up chosen past an overdue task, and its meta line (AC2);
  - the Start form's action, and a post that starts the task (AC3);
  - the empty state (AC4);
  - the banner's count and its absence (AC5);
  - the progress numbers of the AC6 example, and with no task today (AC6);
  - the Later today order, with a done task, an in-progress task and a draft left out
    (AC7);
  - the three quick-add links (AC8);
  - the page writing nothing (AC9).

  No existing test changes. The `<h1>Today</h1>` of `src/app.test.ts` and the `main h1`
  of `src/shell.test.ts` still hold.

## Out of scope

- The mockup's Snooze button on the Next up card. Snoozing belongs with reminders and
  the alarm (018).
- Coming back to `/` after Start. Start answers with the task's sheet, as in 013.
- Showing in-progress tasks on the dashboard. The mini-bar of 013 shows the running task
  on every page, this one included.
- A Next up taken from tomorrow or later when nothing is left today, and the morning
  digest (020).
- Counting `actual_minutes` in the progress, and estimate corrections (015).
- The mockup's `repeats` marker on a list item (016).
- A list of today's done tasks, and Done or Reschedule from this page. Those are on
  `/tasks` (010), `/overdue` (011) and the sheet (013).
- Updating the page without a reload, and an animated ring.
- Checked by hand: whether the page answers "what should I do now?" at a glance, the
  plan's own "Done when". The backlog lists no device or live-model check for 014.
