# 011-overdue: overdue view with reschedule and mark done

## Goal

A pending task whose time has passed keeps its times (009 leaves it there), and nothing
shows that it was missed. This job adds `/overdue` (`docs/plan.md`, task 10 for the
overdue view, and U6): a list of the pending tasks whose end has passed, grouped by the
day they were due, each with Reschedule, either auto-fit or at a time the user picks,
and Mark done, and a friendly empty state when nothing is overdue. The Today page's
overdue banner that links here is 014's.

It builds on what 010 left: `markDone` and `rescheduleTask` of
`src/services/task-actions.ts`, `isListed` of `src/services/task-list.ts`, `readId` of
`src/routes/review.ts`, `dayTimeLabel` and the Dubai clock of `src/dubai.ts`, the
priority-badge and empty-state partials, and the app's not-found page. The plan names
no routes, field names or texts, so the ones below are this spec's choices. The page is
plain HTML: links and forms, with no htmx and no client-side script.

Unless a criterion says otherwise, its examples use `now` = `2026-10-12T09:36:00.000Z`
(1:36 PM on 12 Oct in Asia/Dubai), the seeded settings, and Dubai clock times. The
routes read the time once per request from the same test-settable clock 009 AC10 and
010 use.

## Acceptance criteria

- **AC1**: `GET /overdue` answers 200 with the app layout and the title `Overdue`. The
  nav has no Overdue item, so no nav link is marked `aria-current="page"`. It shows one
  card per overdue task, an element with the id `task-<id>`. A task is overdue when its
  status is `pending` and its `scheduled_end` is earlier than `now`. A task whose end
  is exactly `now` or later, a task with no `scheduled_end`, and every `draft`,
  `in_progress` and `done` task are not shown.
- **AC2**: Groups. The cards are grouped by the Dubai day of their `scheduled_end`, in
  this order, each group under a heading with its name: `Today` (the Dubai day of
  `now`), `Yesterday` (the day before), and `Earlier` (any day before that). The plan
  names only Yesterday and Earlier; `Today` is this spec's choice, so a task missed
  earlier today has a group. A group with no task is not rendered. Within a group the
  cards are in `scheduled_start` order, ties by `id`. A pending task at
  `2026-10-12T05:00:00.000Z` to `05:30` is under `Today`, one at
  `2026-10-11T05:00:00.000Z` to `05:30` under `Yesterday`, one at
  `2026-10-09T05:00:00.000Z` to `05:30` under `Earlier`, and one at
  `2026-10-12T09:00:00.000Z` to `09:36:00.000Z` is not shown.
- **AC3**: A card shows the title, the duration as `<n> min` (or `No estimate` when
  `estimated_minutes` is null), the priority badge of
  `src/views/partials/priority-badge.ejs` (none when the priority is null), and when
  it was due as `dayTimeLabel(scheduled_start, now)` (`Today 9:00 AM`, `11 Oct 9:00 AM`).
  All text is escaped, so a title of `<b>x</b>` is rendered as text.
- **AC4**: Empty state. With no overdue task, the page renders the empty-state partial
  with the heading `Nothing overdue` and a link to `/tasks`, and no group heading.
- **AC5**: Mark done. Each card has a Mark done button: a form that posts to
  `/overdue/<id>/done`. The post does what 010 AC8's Done does (`status` `done`,
  `completed_at` the request time, the minutes and the times left as they are) and
  answers 303 to `/overdue`.
- **AC6**: Auto-fit. Each card has a Reschedule button: a form that posts to
  `/overdue/<id>/reschedule`. The post places the task again as 010 AC9 does, all in
  one transaction, and answers 303 to `/overdue`. A 30-minute pending task with no
  slot, scheduled yesterday 9:00-9:30 AM, gets `2026-10-12T09:40:00.000Z` to
  `2026-10-12T10:10:00.000Z` and is no longer on the page. A task the scheduler cannot
  place keeps its times and stays on the page.
- **AC7**: Pick a time. Each card has a second form that posts to
  `/overdue/<id>/reschedule-at`, with an `input` of type `datetime-local` named `start`
  and a submit button. A posted `start` of the form `YYYY-MM-DDTHH:MM` is read on the
  Dubai clock. When it is a real date and time and not before `now`, the post sets
  `scheduled_start` to it and `scheduled_end` to it plus the task's current length
  (`scheduled_end` − `scheduled_start`), changes nothing else and no other task, and
  answers 303 to `/overdue`. It does not move other tasks and may overlap them (a
  conflict, drawn by 012), and is not held to the working hours or a slot. For the
  yesterday 9:00-9:30 AM task, `start` = `2026-10-12T18:00` stores
  `2026-10-12T14:00:00.000Z` to `2026-10-12T14:30:00.000Z`; `2026-10-12T13:36` is
  accepted.
- **AC8**: Pick refused. A `start` that is missing, blank, posted more than once, not
  of the form of AC7, not a real date (`2026-02-30T10:00`), or before `now`
  (`2026-10-12T13:30`) answers 400 with the overdue page, stores nothing, and shows
  `Pick a date and time that has not passed.` once, inside the card `task-<id>`.
- **AC9**: Unknown ids, and tasks that are no longer overdue. A post to any route of
  AC5 to AC7 for an id that names no task, names a `draft`, or is not written as an id
  (`readId` of `src/routes/review.ts`) answers 404 with the app's not-found page and
  changes no row. A post for a listed task that is not overdue at the request time (not
  `pending`, or its end has not passed) changes nothing and answers 303 to `/overdue`;
  for AC7 this holds before `start` is checked.
- **AC10**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. Tests run
  against a temporary or in-memory database and leave nothing in `data/`. There are
  tests for: which tasks are shown and the end exactly at `now` (AC1), each group
  (AC2), the empty state (AC4), mark done (AC5), auto-fit (AC6), a picked time (AC7),
  a refused time before `now` (AC8), and a 404 for a draft and a 303 no-op for a task
  that is not overdue (AC9). No existing test changes.

## Out of scope

- The overdue banner on the Today page and its count (014), and overdue items in the
  digest (020).
- An Overdue item in the nav or a link from `/tasks`; the page is reached by its URL
  until 014 adds the banner.
- Overdue `in_progress` tasks and a running timer (013). Only `pending` tasks are shown.
- Computing `actual_minutes` on Mark done (013), editing or deleting from this page
  (010's `/tasks/<id>/edit` does it), and an undo toast (023).
- Refusing a picked time outside the working hours or one that overlaps another task;
  the timeline (012) shows the conflict.
- Prefilling or limiting the time picker (`value`, `min`) and updating the page without
  a reload.
- Checked by hand: nothing. The backlog lists no device or live-model check for 011.
