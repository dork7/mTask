# 010-task-list: task list with filters, sort, edit and delete

## Goal

Confirmed tasks are stored and scheduled (006, 009), but no page shows them; the nav's
Tasks link (`/tasks` in `src/ui.ts`) leads to the not-found page. This job adds that
page (`docs/plan.md`, task 10 for the list, and U5). It lists the tasks as cards. You can
filter them by priority and by time slot, and sort them. The filters and the sort are
kept in the query string, so a URL can be shared. Each task can be edited, which
overrides what the AI chose, and deleted. Each card has Done and Reschedule actions.

It builds on what is there: the `tasks` helpers of `src/db/tasks.ts` (003), the priority
and slot lists and labels of `src/ui.ts`, the chip, card, badge and empty-state
partials (002), the scheduler `placeTasks` / `storeSchedule` of
`src/services/scheduler.ts` (009), and `dayTimeLabel` of `src/dubai.ts`. The plan names
no sort keys, parameters, routes for the actions or texts, so the ones below are this
spec's choices. The page is plain HTML: links and forms, with no htmx and no
client-side script.

Unless a criterion says otherwise, its examples use `now` = `2026-10-12T09:36:00.000Z`
(1:36 PM on 12 Oct in Asia/Dubai), the seeded settings, and Dubai clock times. The
routes read the time once per request from the same test-settable clock that 009 AC10
uses.

## Acceptance criteria

- **AC1**: `GET /tasks` answers 200 with the app layout, the title `Tasks`, and the nav's
  Tasks link marked `aria-current="page"`. It shows one card per task with the status
  `pending`, `in_progress` or `done`. A `draft` task is never shown (006). Each card is
  an element with the id `task-<id>`.
- **AC2**: A card shows:
  - the title;
  - the duration as `<n> min`, or `No estimate` when `estimated_minutes` is null;
  - the priority badge of `src/views/partials/priority-badge.ejs`, or no badge when
    the priority is null;
  - the slot's label from `src/ui.ts` (`Morning` … `Night`), or `No slot`;
  - the status as `Pending`, `In progress` or `Done`;
  - the start as `dayTimeLabel(scheduled_start, now)` (`Today 2:30 PM`), or
    `Not scheduled` when there is no `scheduled_start`.

  All text is escaped, so a title of `<b>x</b>` is rendered as text.
- **AC3**: Filters. The query parameters are `priority` and `slot`. Each may be given
  more than once, and each value is an id from `src/ui.ts`. Values of one parameter are
  OR'd, and the two parameters are AND'd. So `?priority=urgent&priority=high&slot=night`
  shows the urgent or high tasks whose slot is `night`. A task with a null priority or
  slot never matches a filter on that parameter. A value that is not an id is ignored,
  and the page still answers 200. With no valid value, that parameter filters nothing.
- **AC4**: Sort. The `sort` parameter takes one of these values:
  - `start` (the default): `scheduled_start` ascending, then tasks with no start; ties
    by `id`.
  - `priority`: urgent, high, medium, low, then no priority; within each, as `start`.
  - `newest`: `created_at` descending, then `id` descending.

  Any other value, or none, is `start`.
- **AC5**: Filter bar. The bar has one link per priority and one per slot, in the order
  of `src/ui.ts`, each with the class `chip` and the item's label. The chip of an active
  value also has the class `chip--on` and `aria-current="true"`. A chip's `href` is
  `/tasks` with its own value toggled: added if absent, removed if present. The other
  values and the sort are kept. Every link and form the page builds writes its query in
  one canonical order: `priority` values in `src/ui.ts` order, then `slot` values in
  `src/ui.ts` order, then `sort`, which is left out when it is `start`. Unknown values
  are dropped.
- **AC6**: Active filters and sort control. Each active value also appears in a list of
  removable chips, labelled like its bar chip, whose link is the current URL without that
  value. The list is absent when no filter is active. A `GET` form to `/tasks` has a
  `select` named `sort`, with the options `start` (`Time`), `priority` (`Priority`) and
  `newest` (`Newest`); the current sort is selected. The form also has hidden inputs for
  the active filters and a submit button.
- **AC7**: Empty states. With no shown task at all, the page renders the empty-state
  partial with the heading `No tasks yet` and a link to `/add`. When there are tasks but
  the filters match none, the heading is `No tasks match these filters`, with a link
  `Clear filters` to `/tasks`.
- **AC8**: Done. A card whose status is not `done` has a Done button. It is a form that
  posts to `/tasks/<id>/done`, followed by the list's canonical query. The post sets
  `status` to `done` and `completed_at` to the request time. `actual_minutes`,
  `scheduled_start` and `scheduled_end` are left as they are. It answers 303 to
  `/tasks?<same query>#task-<id>`, or `/tasks#task-<id>` with no query. A Done on a task
  that is already `done` changes nothing and answers the same 303.
- **AC9**: Reschedule. A `pending` card has a Reschedule button that posts to
  `/tasks/<id>/reschedule`, with the query as in AC8. The post places the task again
  with the scheduler at the request time. Its own current times do not count as taken.
  It stores the new times, and the new times of any task the scheduler moved for an
  urgent one (009 AC7), all in one transaction. A 30-minute pending task with no slot,
  scheduled yesterday 9:00-9:30 AM, gets `2026-10-12T09:40:00.000Z` to
  `2026-10-12T10:10:00.000Z`. A task the scheduler cannot place (009 AC8) keeps its
  times. The answer is the 303 of AC8. A Reschedule on an `in_progress` or `done` task
  changes nothing and answers the same 303.
- **AC10**: Edit page. Each card has an Edit link to `/tasks/<id>/edit`. That page
  answers 200 with a form that posts to the same path. The form has:
  - a title text field;
  - a minutes field;
  - priority radios, one per `src/ui.ts` priority;
  - slot radios, one per slot plus `No slot` (value empty).

  The fields are filled with the stored values. The page also has a Delete button
  (AC13) and a link back to `/tasks`.
- **AC11**: Edit post. A valid post stores the title (trimmed), `estimated_minutes`,
  `priority` and `time_slot` (an empty slot is null), and answers 303 to
  `/tasks#task-<id>`. When a `pending` task's minutes, priority or slot changed, it is
  placed again as in AC9, in the same transaction. Otherwise, and for an `in_progress`
  or `done` task, the scheduled times are left as they are. The status, `category`,
  `description`, `source_id` and `confidence` never change.
- **AC12**: Edit refused. A post answers 400 with the edit page and stores nothing when
  it has any of these problems:
  - a blank title gives `Give the task a title.`;
  - minutes that are not a whole number from 1 to 1440 give
    `Set the duration to a whole number of minutes from 1 to 1440.`;
  - a priority that is missing or not in `src/ui.ts`, or a slot that is neither empty
    nor in `src/ui.ts`, gives `Choose a priority and a slot from the ones offered.`

  Each message present is shown once, in that order. The fields show the posted values.
- **AC13**: Delete. A Delete button on each card and on the edit page posts to
  `/tasks/<id>/delete`. The card's form carries the list's query as in AC8. The post
  deletes the task row and answers 303 to `/tasks?<same query>`, or `/tasks`. Its source
  and its file are left as they are.
- **AC14**: Unknown and draft tasks. A `GET /tasks/<id>/edit`, or a post to any route of
  AC8, AC9, AC11 or AC13, for an id that names no task, names a `draft`, or is not
  written as an id (the `ID_SHAPE` of `src/routes/review.ts`) answers 404 with the
  app's not-found page and changes no row. Every redirect target is built by the app
  and starts with `/tasks`. A query value posted to an action is kept only when it is
  valid under AC3 to AC5.
- **AC15**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. Tests run
  against a temporary or in-memory database and leave nothing in `data/`. There are
  tests for:
  - each filter alone and both combined (AC3), with a repeated value;
  - each sort (AC4);
  - a chip's `href` (AC5);
  - done, reschedule, a valid edit, a refused edit, delete (AC8 to AC13);
  - a 404 for a draft (AC14).

  No existing test changes.

## Out of scope

- The `/overdue` view, its Yesterday / Earlier groups and its pick-a-time reschedule
  (011). Reschedule here is auto-fit only.
- Setting a start time by hand, the reminder time, and Start with a running timer
  (013). Done here does not compute `actual_minutes`; 013 does.
- Editing the category, the description or the recurrence (013, 016).
- Swipe gestures on cards. The backlog lists them under "Left out"; the buttons are
  shown at every width.
- Updating the list without a page load (htmx or script). Scroll position is kept by
  the `#task-<id>` fragment of the AC8 and AC9 redirects.
- A status filter, search, and paging.
- An undo toast for delete and done, and confirming a delete (023).
- Checked by hand: nothing. The backlog lists no device or live-model check for 010.
