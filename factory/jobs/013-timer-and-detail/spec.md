# 013-timer-and-detail: task detail sheet, Start and Done, running timer

## Goal

Tasks are listed on `/tasks` (010) and drawn on `/timeline` (012), but nothing opens one
task, nothing starts it, and Done records no time worked. This job adds that
(`docs/plan.md`, task 12 for Start and Done, and U8). It adds a detail sheet for each task.
The sheet has edit fields and a reminder time. It also has a Start button that records
`started_at` and a running timer. Done then records `completed_at` and `actual_minutes`.
While a task is in progress, a mini-bar shows on every page. When the task is finished,
the sheet shows an "estimated vs. actual" summary. Jobs 014 (Next up with Start), 015
(the learning loop on `actual_minutes`) and 018 (reminders at `reminder_at`) build on
what this job stores.

It builds on what is there: the `tasks` helpers and columns of `src/db/tasks.ts` (003),
the routes, `findListedTask`, the Done of `src/routes/tasks.ts` and the edit rules of
`src/services/task-actions.ts` (010), the bottom-sheet and button partials (002), the
layout `src/views/layout.ejs`, and `dayTimeLabel` of `src/dubai.ts`. The plan names no
routes, field names, formats or texts for the sheet, so the ones below are this spec's
choices. The sheet is a server-rendered page. The only client-side script is the one
that makes the timer tick.

Unless a criterion says otherwise, its examples use `now` = `2026-10-12T09:36:00.000Z`
(1:36 PM on 12 Oct in Asia/Dubai), the seeded settings, and Dubai clock times. The
routes read the time once per request from the same test-settable clock that 010 and 012
use.

## Acceptance criteria

- **AC1**: Detail sheet. `GET /tasks/<id>` answers 200 with the app layout, the task's
  title as the page title, and the nav's Tasks link marked `aria-current="page"`. The
  page renders `src/views/partials/bottom-sheet.ejs` open, with the id `task-sheet`
  and the task's title as its heading, escaped (`<b>x</b>` is text). The sheet shows the
  status as `Pending`, `In progress` or `Done`, and has a link `Close` to
  `/tasks#task-<id>`. An unknown id, a `draft`, or an id not written in `ID_SHAPE` form
  answers 404 with the not-found page, as in 010 AC14.
- **AC2**: Ways in. On `/tasks`, each card's title is a link to `/tasks/<id>`. On
  `/timeline`, each block (`#block-<id>`) holds a link to `/tasks/<id>`. Their other
  content and classes stay the same.
- **AC3**: Edit fields. The sheet has a form that posts to `/tasks/<id>`. It has the
  fields of the 010 edit page (`title`, `minutes`, `priority` radios, `slot` radios with
  `No slot`), plus:
  - a text field `category`;
  - a textarea `description`;
  - an `<input type="datetime-local">` named `reminder`.

  The fields are filled with the stored values. `reminder` holds `reminder_at` as a
  Dubai date and time, `YYYY-MM-DDTHH:MM`: `2026-10-12T16:00:00.000Z` is shown as
  `2026-10-12T20:00`. When `reminder_at` is null, the field is empty.
- **AC4**: Edit post. A valid post stores the same four fields as 010 AC11, with the same
  rescheduling rule, and also:
  - `category` and `description`, trimmed, with an empty value stored as null;
  - `reminder_at`, read as a Dubai time (`2026-10-12T20:00` is stored as
    `2026-10-12T16:00:00.000Z`), with an empty value stored as null.

  It answers 303 to `/tasks/<id>`. The status, `started_at`, `completed_at`,
  `actual_minutes`, `source_id` and `confidence` do not change. A past reminder time is
  accepted.
- **AC5**: Edit refused. A post with any of the three problems of 010 AC12, or a
  `reminder` that is neither empty nor a real date and time in `YYYY-MM-DDTHH:MM` form,
  answers 400 with the sheet and stores nothing. The bad reminder gives
  `Set the reminder as a date and time, or leave it empty.` Each message present is shown
  once, in the order of 010 AC12, with the reminder message last. The fields show the
  posted values. A missing `category`, `description` or `reminder` field counts as empty,
  so a post from the 010 edit page form still works there unchanged.
- **AC6**: Start. A `pending` task's sheet has a Start button, a form that posts to
  `/tasks/<id>/start`. The post sets `status` to `in_progress` and `started_at` to the
  request time, and answers 303 to `/tasks/<id>`. A Start on an `in_progress` or `done`
  task changes nothing and answers the same 303. Starting a task does not change any
  other task, even one that is already in progress. A Start on an id as in AC1's 404
  case answers 404 and changes no row. Neither the sheet of an `in_progress` task nor the
  sheet of a `done` task has a Start button.
- **AC7**: Done records time. The sheet of a task that is not `done` has a Done button.
  It posts to `/tasks/<id>/done?from=sheet` and answers 303 to `/tasks/<id>`. Without
  `from=sheet`, the redirect stays the one of 010 AC8. For an `in_progress` task, Done
  also sets `actual_minutes` to the minutes from `started_at` to the request time,
  rounded to the nearest whole minute and at least 1. A task started at
  `2026-10-12T08:21:00.000Z` and done at `now` gets `75`, and one done 20 seconds after
  its start gets `1`. For a `pending` task, Done stays as in 010 AC8 and `actual_minutes`
  is left as it is. `completed_at` is the request time in both cases. `from` is not part
  of the list query, so it never shows up in a list redirect.
- **AC8**: Running timer. The sheet of an `in_progress` task shows `Started <dayTimeLabel
  of started_at>` and an element with the class `timer`, with
  `data-started-at="<started_at>"`. Its text is the time elapsed at the request: `m:ss`
  under an hour and `h:mm:ss` from an hour on. Started at `2026-10-12T09:23:55.000Z`,
  it shows `12:05` at `now`. Started at `2026-10-12T08:33:55.000Z`, it shows `1:02:05`.
  The layout loads `/js/timer.js`. In a DOM, that script sets the text of every
  `[data-started-at]` element to the elapsed time in the same format, and again each
  second. A jsdom test with a fake clock sees the text go from `12:05` to `12:06`.
- **AC9**: Mini-bar. While at least one task is `in_progress`, every page rendered in the
  layout has one element with the id `mini-bar`. It shows the task with the latest
  `started_at` (ties go to the highest id). The bar holds:
  - the task's title, escaped, as a link to `/tasks/<id>`;
  - a `timer` element as in AC8;
  - a Done button that posts to `/tasks/<id>/done?from=sheet`.

  With no task `in_progress`, there is no `#mini-bar`. Tests check `/`, `/tasks`,
  `/timeline`, `/add` and the 404 page.
- **AC10**: Estimate vs. actual. The sheet of a `done` task with both `estimated_minutes`
  and `actual_minutes` shows the text `Estimated 30 min, actual 75 min` with its own
  values, and `Completed <dayTimeLabel of completed_at>` when `completed_at` is set. When
  either minutes value is null, there is no `Estimated … actual …` text. A done task's
  sheet still has the edit form.
- **AC11**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. Tests run
  against a temporary or in-memory database and leave nothing in `data/`. There are
  tests for:
  - the sheet and its 404 for a draft (AC1);
  - the card and block links (AC2);
  - the reminder shown and stored in Dubai time (AC3, AC4);
  - a refused reminder (AC5);
  - Start, and Start on a task that is not pending (AC6);
  - Done after Start giving `75` and the 1-minute floor, plus a pending Done that leaves
    `actual_minutes` null (AC7);
  - the timer text and its tick (AC8);
  - the mini-bar present and absent (AC9);
  - the summary (AC10).

  No existing test changes.

## Out of scope

- The recurrence picker on the sheet (016).
- Firing a reminder at `reminder_at`, the alarm, snooze and the permission prompt (018).
  This job only stores the time.
- Using `actual_minutes` to correct estimates (015).
- The Today page's Next up card and its Start button (014). It can post to the route of
  AC6.
- Start from a `/tasks` card or a timeline block. Start is on the sheet only.
- Pausing, resuming, or stopping a started task without finishing it. Moving a task back
  from `in_progress` to `pending`. Allowing only one task in progress at a time.
- Opening the sheet over the list or the timeline without a page load (htmx or script),
  and swipe to close. The sheet is its own page, and `Close` goes back to the list.
- Removing or changing the 010 edit page. It stays as it is.
- Setting the start time by hand (011's pick-a-time covers overdue tasks).
- Checked by hand: nothing. The backlog lists no device or live-model check for 013.
