# 010-task-list: design

One spec problem, and four readings of things the spec leaves open:

- **AC15 against the code: one existing test has to change.** `src/shell.test.ts` has
  `it.each(['/timeline', '/tasks', '/more'])('%s answers with the not-found page until its
  job builds it', …)`. AC1 makes `/tasks` answer 200, so that case fails (checked: with
  the code of this design and the file as it is, exactly that one test fails). The test's
  own name says it is to go when its job builds the page. The reading: `'/tasks'` is
  removed from that list and nothing else in any existing test file changes (D14). If
  "No existing test changes" is meant to the letter, the job is blocked; nothing else
  stands in the way.
- AC3/AC4, a parameter given more than once. A repeated filter value counts once; a
  repeated `sort` (even `sort=priority&sort=priority`) is `start` (D3).
- AC12, a field that is missing or posted twice. Each is a problem of its own field: a
  missing or repeated title is blank, minutes are not a number, a missing priority or slot
  is a choice problem (D9).
- AC6, the removable chips. Each is a link labelled exactly like its bar chip, with a `×`
  hidden from assistive technology, and with `chip--on` but no `aria-current` (D6).
- AC7, filters on an empty database. With no listed task at all the heading is
  `No tasks yet`, whatever the query (D11).

Everything marked "checked" below was run in a throwaway copy of the repo under
`$TMPDIR` (`git archive HEAD`, with the repo's `node_modules` linked in): Node 26.8.2,
yarn 1.22.22, TypeScript 5.9.3, Vitest 5.0.1, Express 5.3.0, supertest 7.3.1. The design
was built there as a prototype: the two services, the route, the two pages, the chip
partial, the stylesheet, the wiring in `src/app.ts`, the two exports, the one-line test
edit, and two prototype test files (20 tests) covering every criterion. `yarn build` was
clean and `yarn test` passed: 43 files, 1489 tests (the 1470 of before, less the one
`/tasks` case, plus 20). Eight ways of breaking the code were tried one at a time; seven
made a prototype test fail, and the eighth is not a real break (Risks). The copy is
deleted. Not checked: Node 22 and 24, and the look of the pages in a browser (the spec
asks for no check by hand).

## Approach

The job adds one router, `src/routes/tasks.ts`, mounted after the review router, and two
services under it.

**The list** (`src/services/task-list.ts`) is pure. `readListQuery(req.query)` turns the
query of a request into a `ListQuery`: the valid priority ids, the valid slot ids, and a
sort key. `queryPairs` / `queryString` / `withQuery` write a `ListQuery` back in the one
canonical order of AC5, and every link and form of the page, and every redirect, is built
through them. `togglePriority` / `toggleSlot` give the query of a chip. `shownTasks`
filters and sorts a list of rows in code. The route reads the rows with the existing
`listTasks(db)` and drops the drafts; no SQL is added (003).

**The actions** (`src/services/task-actions.ts`): `markDone`, `rescheduleTask`,
`readTaskEdit` and `saveTaskEdit`. Reschedule and the edit hand the one task to
`placeTasks` of 009, which already ignores the times of the tasks it is handed (009 D4),
and store the result with `storeSchedule` in one `inTransaction`, as `confirmDrafts`
does.

**The pages** are plain HTML. The filter bar and the active filters are chip links, the
sort is a `GET` form, and Done, Reschedule and Delete are one-button `POST` forms whose
`action` carries the list's query. The handler reads that query again with
`readListQuery`, so whatever was posted, the redirect holds only valid values in the
canonical order, and ends in `#task-<id>`. The edit page is a form that posts to its own
path; a refused post renders it again with 400, the way the review page does.

The routes read the clock with `new Date()` once per request, the clock that 009's tests
fake with `vi.useFakeTimers({ toFake: ['Date'] })` (009 D12).

## Decisions

**D1. Three new modules: `src/services/task-list.ts`, `src/services/task-actions.ts`,
`src/routes/tasks.ts`.** The list logic is pure and is tested without a request; the
writes follow `src/services/drafts.ts` (a service function per write, the route only
reads the request and redirects). Rejected: one `src/services/tasks.ts`, which reads like
`src/db/tasks.ts` in every import.

**D2. Listing reads every task with `listTasks(db)` and filters and sorts in code.** A
listed task is any task whose status is not `draft` (`isListed`). Filtering and sorting
in SQL would need a new helper in `src/db/tasks.ts` with SQL built from the query; one
user's tasks are few. Timestamps compare as text in time order (`src/db/timestamps.ts`),
so the sorts compare the strings.

**D3. The query is read with Express 5's default parser and kept only where valid.**
Checked: the default (`simple`, `node:querystring`) gives a string for a name given once,
an array for a name given more than once, and keeps `priority[]=x` under the key
`priority[]`, which is then never read. `valuesOf` takes the strings of one name.
`readListQuery` keeps the ids of `src/ui.ts` that appear, in `src/ui.ts` order, each once,
so a repeated or unknown value changes nothing. `sort` counts only when it is given
exactly once with a known key; anything else, a repeat included, is `start`.

**D4. One canonical writer: `queryPairs(list)`.** It writes the priorities in `src/ui.ts`
order, then the slots in that order, then `sort` unless it is `start`, whatever order the
`ListQuery` arrays hold. `queryString` is `new URLSearchParams(queryPairs(list))`;
`withQuery(path, list)` is `path`, or `path?query` when the query is not empty. The ids
are lowercase letters only, so no value is ever percent-encoded.
The sort form's hidden inputs are `queryPairs({ ...list, sort: 'start' })`, so they are
the filters alone, in the same order, and the form's own `select` adds `sort`.

**D5. The toggles append and remove; the order comes from `queryPairs`.**
`togglePriority(list, id)` removes `id` when it is on and appends it when it is off;
`toggleSlot` the same. Neither sorts. Every href goes through `withQuery`, so the order
of the arrays never reaches a URL.

**D6. The chip partial gains `href`, `current` and `removable`.** `partials/chip.ejs`
becomes `chip: { label, selected?, tone?, href?, current?, removable? }`. Without `href`
it renders exactly the `<span>` it renders now (the 002 tests of `src/components.test.ts`
pass unchanged, checked). With `href` it is `<a class="chip …" href="…">`, with
`aria-current="true"` when `current`, and a trailing ` <span aria-hidden="true">×</span>`
when `removable`. A bar chip of an active value is `selected` and `current`; a priority
chip has its priority as `tone`, so an active one takes that priority's colors. A
removable chip is `selected`, keeps its tone, and is not `current`: it is a "remove this"
link, not the current state. Its visible name (the `visibleText` helper) is the label,
which is "labelled like its bar chip".

Rejected: writing the anchors in the page. The spec builds on the 002 chip, and the
style of a selected and toned chip lives in its classes.

**D7. A chip link is a touch target.** `.chip` is about 26px high. A new rule
`.chip[href] { min-height: var(--touch-target); text-decoration: none; }` makes every
chip link 44px high (`.chip` is `inline-flex` with centred items, so `min-height` takes
effect). `.chip` outranks the `a` rule, so a chip link keeps the chip's colors.

**D8. Action URLs carry the list's query; the handler re-reads it.** Done, Reschedule
and a card's Delete post to `withQuery('/tasks/<id>/<action>', list)`. A browser keeps
the query of a `POST` form's `action`. The handler builds its redirect from
`readListQuery(req.query)`, so a hand-written query keeps only what AC3 to AC5 allow
(AC14). Done and Reschedule redirect to `${withQuery('/tasks', list)}#task-<id>`; Delete
to `withQuery('/tasks', list)`. The Edit link, the edit form and the edit page's Delete
carry no query: AC10, AC11 and AC13 name the bare paths. Checked: `res.redirect(303, …)`
sends the `Location` with `?`, `&` and `#` as written.

**D9. The edit post: every field is required, read with the 006 helpers.**
`readTaskEdit(body)` reads `title`, `minutes`, `priority` and `slot` with `postedValue`
of `src/services/drafts.ts` (a string; `undefined` when missing; `null` when repeated)
and the minutes with `readMinutes`, which `drafts.ts` now exports. Problems, in the shape
of `DraftProblems`:

| Field | A problem when | Message |
|---|---|---|
| `title` | missing, repeated, or blank after `trim()` | `Give the task a title.` |
| `minutes` | missing, repeated, or not `readMinutes` (1 to 4 digits, 1 to 1440, spaces trimmed) | `Set the duration to a whole number of minutes from 1 to 1440.` |
| `priority`, `slot` | priority missing, repeated or not an id; slot missing, repeated, or neither `''` nor an id | `Choose a priority and a slot from the ones offered.` |

It returns `{ edit, problems }`, where `edit` is `undefined` exactly when a problem is
set, so the route tests `edit === undefined` only. A valid `edit` is
`{ title: trimmed, estimated_minutes, priority, time_slot }`, with `''` as `null`.

The page of a refused post shows a title and minutes as posted (a string) or as stored
(missing or repeated), and a priority or a slot only when the posted value has a radio,
else the stored one: the rule of `cardOf` in `src/routes/review.ts` (006).

**D10. What each write stores.**

- `markDone(db, task, now)`: for a task that is not `done`,
  `updateTask(db, id, { status: 'done', completed_at: now.toISOString() })`. A `done` task
  is not written, so its `updated_at` stays.
- `rescheduleTask(db, task, now)`: for a `pending` task,
  `inTransaction(db, () => storeSchedule(db, placeTasks(db, [task], now)))`. Any other
  status: nothing. A task the scheduler cannot place is in `unplaced`, and
  `storeSchedule` writes nothing for it. The tasks an urgent one moves are in `moved` and
  are written in the same transaction.
- `saveTaskEdit(db, task, edit, now)`: in one transaction, `updateTask(db, id, edit)`;
  then, when the stored row is `pending` and its `estimated_minutes`, `priority` or
  `time_slot` differs from `task` (the row as read before the post), it stores
  `placeTasks(db, [saved], now)`. `edit` has no other key, so the status, `category`,
  `description`, `source_id` and `confidence` cannot change.
- Delete: `deleteTask(db, id)`, which removes the row only; the source row and the
  photo file are not touched.

`placeTasks` is called inside the transaction, so the tasks it reads are the ones it
writes against (009 D13).

**D11. The page.** In order: the page header `Tasks`; the filter bar
(`div.filter-bar` holding two `div.filter-bar__group` with `role="group"` and
`aria-label` `Priority` and `Time slot`, chip links in `src/ui.ts` order); the active
filters (`ul.active-filters` with `aria-label="Active filters"`, one `li` per active
value, priorities first, left out when none is active); the sort form; then either the
list (`ol.task-list`, one `li.card.task#task-<id>` per shown task) or an empty state.

The empty state is `No tasks yet` with the text
`Tasks you confirm on the review page are listed here.` and a button link `Add a task` to
`/add` when no task is listed at all (whatever the filters), and
`No tasks match these filters` with a ghost button link `Clear filters` to `/tasks` when
tasks are listed but none is shown. The filter bar and the sort form are shown in both
cases. No `nav` element is added: the page's only navigation landmark stays the app's
(002).

A card: `h2.task__title`; `p.task__meta` with `span.task__minutes` (`25 min` or
`No estimate`), the priority badge partial (left out when null), `span.task__slot` (the
slot's label or `No slot`), `span.task__status` (`Pending`, `In progress`, `Done`),
`span.task__start` (`dayTimeLabel(new Date(scheduled_start), now)` or `Not scheduled`);
`div.task__actions` with, in order: a Done form (when not `done`), a Reschedule form
(when `pending`), an Edit button link, a Delete form. Done is a primary button, the rest
ghost. All text goes through `<%= %>`.

The sort form: `form.sort-form` `method="get"` `action="/tasks"`, the hidden inputs of D4,
`<label for="sort-by">Sort by</label>`, `select.field#sort-by[name=sort]` with
`start`/`Time`, `priority`/`Priority`, `newest`/`Newest` (`sortOptions`), the current one
`selected`, and a ghost submit button `Sort`.

**D12. The edit page.** Title `Edit task`, nav `tasks`. Header `Edit task`; the error
notice of 006 (`div.notice.notice--error[role=alert]`, one `p` per message); then
`form.edit-form` `method="post"` `action="/tasks/<id>/edit"` with: label `Title` and
`input.field#edit-title[type=text][name=title][required]`; label `Minutes` and
`input.field#edit-minutes[type=number][name=minutes][min=1][max=1440][required]`;
`fieldset.choices` with legend `Priority` and one `label.choice` radio per priority
(`name=priority`, glyph hidden, label text, as on the review page); `fieldset.choices`
with legend `Time slot`, a `No slot` radio (`value=""`) first, then one per slot
(`name=slot`); `div.edit-form__actions` with the submit `Save` and a ghost button link
`Back to tasks` to `/tasks`. After the form, a second form posting to
`/tasks/<id>/delete` with a ghost submit `Delete`: forms cannot nest.

**D13. Unknown ids reuse `readId` of `src/routes/review.ts`.** It becomes `export
function readId`. `findListedTask(db, raw)` is `readId`, then `getTask`, then
`isListed`; `undefined` makes the handler call `next()`, which ends at the app's 404
handler, before any write. Routes already import from routes (`review.ts` imports
`reviewPath` from `add.ts`). Rejected: a second `ID_SHAPE`; AC14 names that one.

**D14. Existing tests: one line of `src/shell.test.ts`.** `it.each(['/timeline',
'/tasks', '/more'])(` becomes `it.each(['/timeline', '/more'])(`. Nothing else in any
existing test file changes; `src/components.test.ts`, `src/stylesheet.test.ts` and the
review tests pass as they are (checked).

**D15. The clock.** `GET /tasks` reads `new Date()` once and hands it to every card's
label. Done, Reschedule and the edit post each read `new Date()` once, after the task is
found. `GET` of the edit page and Delete read no time. `updated_at` is set by
`updateTask` from the same faked `Date`.

## Files

Created:

- `src/services/task-list.ts`:

```ts
import type { Task } from '../db/tasks.ts';
import { priorities, slots, type Priority, type Slot } from '../ui.ts';

/*
 * The task list: which tasks it shows, in which order, and the query string that says
 * so. The query is read from a request and written back into every link and form of the
 * page, always in one order, so that one list has one address.
 */

/** The orders the list can be sorted in, the default first, with the label the sort control shows. */
export const sortOptions = [
  { id: 'start', label: 'Time' },
  { id: 'priority', label: 'Priority' },
  { id: 'newest', label: 'Newest' },
] as const;

export type SortKey = (typeof sortOptions)[number]['id'];

/** What the query of the list asks for. The lists hold ids of `src/ui.ts`, each once. */
export interface ListQuery {
  priorities: Priority[];
  slots: Slot[];
  sort: SortKey;
}

/** The path of the list. */
export const LIST_PATH = '/tasks';

/** Whether a task is one the list shows and its routes act on: any but a draft. */
export function isListed(task: Task): boolean {
  return task.status !== 'draft';
}

/** The string values a query has for a name: none, one, or each of a repeated name. */
function valuesOf(query: unknown, name: string): string[] {
  if (typeof query !== 'object' || query === null || !Object.hasOwn(query, name)) return [];
  const value: unknown = (query as Record<string, unknown>)[name];
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Reads the query of a request. A value that is not an id is dropped, and so is a
 * repeated one. `sort` is `start` unless it is given once with another key.
 */
export function readListQuery(query: unknown): ListQuery {
  const givenPriorities = valuesOf(query, 'priority');
  const givenSlots = valuesOf(query, 'slot');
  const givenSort = valuesOf(query, 'sort');
  const sort = givenSort.length === 1 ? sortOptions.find((option) => option.id === givenSort[0]) : undefined;
  return {
    priorities: priorities.filter((item) => givenPriorities.includes(item.id)).map((item) => item.id),
    slots: slots.filter((item) => givenSlots.includes(item.id)).map((item) => item.id),
    sort: sort?.id ?? 'start',
  };
}

/**
 * The query as the app writes it, as name and value pairs: the priorities in the order
 * of `src/ui.ts`, then the slots in that order, then `sort` unless it is `start`.
 */
export function queryPairs(list: ListQuery): [name: string, value: string][] {
  const pairs: [string, string][] = [];
  for (const item of priorities) if (list.priorities.includes(item.id)) pairs.push(['priority', item.id]);
  for (const item of slots) if (list.slots.includes(item.id)) pairs.push(['slot', item.id]);
  if (list.sort !== 'start') pairs.push(['sort', list.sort]);
  return pairs;
}

/** The query of `queryPairs` as a query string, without the `?`. The empty string for none. */
export function queryString(list: ListQuery): string {
  return new URLSearchParams(queryPairs(list)).toString();
}

/** A path with the query of the list after it, or the path alone when the query is empty. */
export function withQuery(path: string, list: ListQuery): string {
  const query = queryString(list);
  return query === '' ? path : `${path}?${query}`;
}

/** The query with this priority turned on when it is off, and off when it is on. */
export function togglePriority(list: ListQuery, id: Priority): ListQuery {
  const on = list.priorities.includes(id);
  return { ...list, priorities: on ? list.priorities.filter((item) => item !== id) : [...list.priorities, id] };
}

/** The query with this slot turned on when it is off, and off when it is on. */
export function toggleSlot(list: ListQuery, id: Slot): ListQuery {
  const on = list.slots.includes(id);
  return { ...list, slots: on ? list.slots.filter((item) => item !== id) : [...list.slots, id] };
}

/** Where a priority comes in the `priority` sort: its place in `src/ui.ts`, and none last. */
function priorityRank(task: Task): number {
  const index = priorities.findIndex((item) => item.id === task.priority);
  return index === -1 ? priorities.length : index;
}

/** The `start` order: by `scheduled_start`, the tasks without one last, then by `id`. */
function byStart(a: Task, b: Task): number {
  if (a.scheduled_start !== b.scheduled_start) {
    if (a.scheduled_start === null) return 1;
    if (b.scheduled_start === null) return -1;
    // Stored timestamps sort as text in time order (`src/db/timestamps.ts`).
    return a.scheduled_start < b.scheduled_start ? -1 : 1;
  }
  return a.id - b.id;
}

const ORDERS: Record<SortKey, (a: Task, b: Task) => number> = {
  start: byStart,
  priority: (a, b) => priorityRank(a) - priorityRank(b) || byStart(a, b),
  newest: (a, b) => (a.created_at === b.created_at ? b.id - a.id : a.created_at < b.created_at ? 1 : -1),
};

/**
 * The tasks the query asks for, in its order. The values of one parameter are OR'd and
 * the two parameters AND'd; a task with no priority or no slot matches no filter on it.
 * The list handed in is not changed.
 */
export function shownTasks(tasks: readonly Task[], list: ListQuery): Task[] {
  return tasks
    .filter(
      (task) =>
        (list.priorities.length === 0 || (task.priority !== null && list.priorities.includes(task.priority))) &&
        (list.slots.length === 0 || (task.time_slot !== null && list.slots.includes(task.time_slot))),
    )
    .sort(ORDERS[list.sort]);
}
```

- `src/services/task-actions.ts`:

```ts
import type { Database } from '../db/database.ts';
import { updateTask, type Task } from '../db/tasks.ts';
import { inTransaction } from '../db/transaction.ts';
import { priorities, slots, type Priority, type Slot } from '../ui.ts';
import { postedValue, readMinutes, type DraftProblems } from './drafts.ts';
import { placeTasks, storeSchedule } from './scheduler.ts';

/*
 * What the task list does to one task: mark it done, place it again, and store an edit
 * that overrides what the analyzer and the rules chose. Each write of several rows is
 * one transaction.
 */

/** What the edit form of a task stores. Every field is posted, and every one is set. */
export interface TaskEdit {
  title: string;
  estimated_minutes: number;
  priority: Priority;
  /** `null` is the form's `No slot`. */
  time_slot: Slot | null;
}

/** The edit a form holds, or what was wrong with it. `edit` is `undefined` exactly when a problem is set. */
export interface TaskEditReading {
  edit: TaskEdit | undefined;
  problems: DraftProblems;
}

/**
 * Reads the edit form of a task. A field that is missing or posted more than once is a
 * problem like a field with a value that breaks its rule.
 */
export function readTaskEdit(body: unknown): TaskEditReading {
  const title = postedValue(body, 'title');
  const minutes = postedValue(body, 'minutes');
  const priority = priorities.find((item) => item.id === postedValue(body, 'priority'));
  const slotValue = postedValue(body, 'slot');
  const slot = slotValue === '' ? null : slots.find((item) => item.id === slotValue)?.id;

  const trimmed = typeof title === 'string' ? title.trim() : '';
  const estimated = typeof minutes === 'string' ? readMinutes(minutes) : undefined;
  const problems: DraftProblems = {
    title: trimmed === '',
    minutes: estimated === undefined,
    choice: priority === undefined || slot === undefined,
  };
  if (trimmed === '' || estimated === undefined || priority === undefined || slot === undefined) {
    return { edit: undefined, problems };
  }
  return { edit: { title: trimmed, estimated_minutes: estimated, priority: priority.id, time_slot: slot }, problems };
}

/**
 * Makes a task `done` at `now`. Its minutes and its times are left as they are. A task
 * that is `done` already is not written.
 */
export function markDone(db: Database, task: Task, now: Date): void {
  if (task.status === 'done') return;
  updateTask(db, task.id, { status: 'done', completed_at: now.toISOString() });
}

/**
 * Gives a `pending` task the time the scheduler finds for it at `now`, and the tasks it
 * pushes later their new times, all or none. Its own times do not stand in its way. A
 * task the scheduler cannot place keeps its times; a task that is not `pending` is not
 * written.
 */
export function rescheduleTask(db: Database, task: Task, now: Date): void {
  if (task.status !== 'pending') return;
  inTransaction(db, () => {
    storeSchedule(db, placeTasks(db, [task], now));
  });
}

/**
 * Stores an edit of a task. A `pending` task whose minutes, priority or slot it changes
 * is placed again at `now`, as `rescheduleTask` does, in the same transaction. Nothing
 * else of the task is written.
 */
export function saveTaskEdit(db: Database, task: Task, edit: TaskEdit, now: Date): void {
  inTransaction(db, () => {
    const saved = updateTask(db, task.id, edit);
    if (saved === undefined || saved.status !== 'pending') return;
    const changed =
      saved.estimated_minutes !== task.estimated_minutes ||
      saved.priority !== task.priority ||
      saved.time_slot !== task.time_slot;
    if (changed) storeSchedule(db, placeTasks(db, [saved], now));
  });
}
```

- `src/routes/tasks.ts`. Exports `createTasksRouter(deps: AppDeps): Router`. The whole
  file:

```ts
import express, { Router, type Response } from 'express';
import type { AppDeps } from '../app.ts';
import type { Database } from '../db/database.ts';
import { deleteTask, getTask, listTasks, type Task, type TaskStatus } from '../db/tasks.ts';
import { dayTimeLabel } from '../dubai.ts';
import { renderPage } from '../render.ts';
import { postedValue, type DraftProblems } from '../services/drafts.ts';
import { markDone, readTaskEdit, rescheduleTask, saveTaskEdit } from '../services/task-actions.ts';
import {
  LIST_PATH,
  isListed,
  queryPairs,
  readListQuery,
  shownTasks,
  sortOptions,
  togglePriority,
  toggleSlot,
  withQuery,
  type ListQuery,
} from '../services/task-list.ts';
import { priorities, slots, type Priority, type Slot } from '../ui.ts';
import { readId } from './review.ts';

const NO_TITLE = 'Give the task a title.';
const BAD_MINUTES = 'Set the duration to a whole number of minutes from 1 to 1440.';
const BAD_CHOICE = 'Choose a priority and a slot from the ones offered.';

/** What a card shows for a task without a start, without a slot, and without minutes. */
const NOT_SCHEDULED = 'Not scheduled';
const NO_SLOT = 'No slot';
const NO_ESTIMATE = 'No estimate';

/** The status of a task as a card shows it. A draft is never listed. */
const STATUS_LABELS: Record<TaskStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
};

/** The address of one task, which its actions hang under. */
function taskPath(id: number): string {
  return `${LIST_PATH}/${id}`;
}

/** The task a path segment names when the list shows it, or `undefined`: no such id, a draft, or not written as an id. */
function findListedTask(db: Database, raw: unknown): Task | undefined {
  const id = readId(raw);
  const task = id === undefined ? undefined : getTask(db, id);
  return task !== undefined && isListed(task) ? task : undefined;
}

/** One chip of the filter bar or of the active filters, as `partials/chip.ejs` takes it. */
interface ChipLink {
  label: string;
  href: string;
  selected: boolean;
  current: boolean;
  removable: boolean;
  tone?: Priority;
}

/** One task as a card of `pages/tasks.ejs` shows it. */
interface TaskCard {
  id: number;
  title: string;
  /** `25 min`, or `No estimate`. */
  minutes: string;
  /** `null`: no badge. */
  priority: Priority | null;
  /** The slot's label, or `No slot`. */
  slot: string;
  status: string;
  /** `Today 2:30 PM`, or `Not scheduled`. */
  start: string;
  editHref: string;
  /** Where Done posts; `null` for a task that is done. */
  doneAction: string | null;
  /** Where Reschedule posts; `null` for a task that is not pending. */
  rescheduleAction: string | null;
  deleteAction: string;
}

function cardOf(task: Task, list: ListQuery, now: Date): TaskCard {
  const path = taskPath(task.id);
  return {
    id: task.id,
    title: task.title,
    minutes: task.estimated_minutes === null ? NO_ESTIMATE : `${task.estimated_minutes} min`,
    priority: task.priority,
    slot: slots.find((item) => item.id === task.time_slot)?.label ?? NO_SLOT,
    status: STATUS_LABELS[task.status],
    start: task.scheduled_start === null ? NOT_SCHEDULED : dayTimeLabel(new Date(task.scheduled_start), now),
    editHref: `${path}/edit`,
    doneAction: task.status === 'done' ? null : withQuery(`${path}/done`, list),
    rescheduleAction: task.status === 'pending' ? withQuery(`${path}/reschedule`, list) : null,
    deleteAction: withQuery(`${path}/delete`, list),
  };
}

/** Renders the list for this query at `now`. */
function renderList(res: Response, db: Database, list: ListQuery, now: Date): void {
  const listed = listTasks(db).filter(isListed);
  const shown = shownTasks(listed, list);

  const bar = {
    priorities: priorities.map((item): ChipLink => {
      const on = list.priorities.includes(item.id);
      const href = withQuery(LIST_PATH, togglePriority(list, item.id));
      return { label: item.label, href, selected: on, current: on, removable: false, tone: item.id };
    }),
    slots: slots.map((item): ChipLink => {
      const on = list.slots.includes(item.id);
      const href = withQuery(LIST_PATH, toggleSlot(list, item.id));
      return { label: item.label, href, selected: on, current: on, removable: false };
    }),
  };
  const active: ChipLink[] = [
    ...bar.priorities.filter((chip) => chip.selected),
    ...bar.slots.filter((chip) => chip.selected),
  ].map((chip) => ({ ...chip, current: false, removable: true }));
  // The sort form keeps the filters; its own select gives the sort.
  const hidden = queryPairs({ ...list, sort: 'start' }).map(([name, value]) => ({ name, value }));

  renderPage(res, 'tasks', {
    title: 'Tasks',
    nav: 'tasks',
    tasks: {
      bar,
      active,
      sort: { action: LIST_PATH, options: sortOptions, current: list.sort, hidden },
      cards: shown.map((task) => cardOf(task, list, now)),
      empty: listed.length === 0 ? 'none' : shown.length === 0 ? 'filtered' : null,
      clearHref: LIST_PATH,
    },
  });
}

/** The edit form of a task as `pages/task-edit.ejs` shows it. */
interface EditForm {
  title: string;
  /** As text, so a refused value is shown as it was posted. */
  minutes: string;
  priority: Priority | null;
  /** The empty string is `No slot`. */
  slot: Slot | '';
  action: string;
  deleteAction: string;
  backHref: string;
}

/** The messages of a refused edit, in the order they are shown. */
function messagesOf(problems: DraftProblems): string[] {
  const messages: string[] = [];
  if (problems.title) messages.push(NO_TITLE);
  if (problems.minutes) messages.push(BAD_MINUTES);
  if (problems.choice) messages.push(BAD_CHOICE);
  return messages;
}

/**
 * Renders the edit page of a task. A value that was posted is shown in place of the
 * stored one: a title or minutes exactly as posted, a priority or a slot only when the
 * page has a control for it.
 */
function renderEdit(res: Response, task: Task, status = 200, body: unknown = undefined, errors: string[] = []): void {
  const path = taskPath(task.id);
  const postedPriority = postedValue(body, 'priority');
  const postedSlot = postedValue(body, 'slot');
  const edit: EditForm = {
    title: postedValue(body, 'title') ?? task.title,
    minutes: postedValue(body, 'minutes') ?? (task.estimated_minutes === null ? '' : String(task.estimated_minutes)),
    priority: priorities.find((item) => item.id === postedPriority)?.id ?? task.priority,
    slot: postedSlot === '' ? '' : (slots.find((item) => item.id === postedSlot)?.id ?? task.time_slot ?? ''),
    action: `${path}/edit`,
    deleteAction: `${path}/delete`,
    backHref: LIST_PATH,
  };
  res.status(status);
  renderPage(res, 'task-edit', { title: 'Edit task', nav: 'tasks', edit, errors });
}

/**
 * The task list and what it does to one task: the list, Done, Reschedule, the edit page
 * and its post, and Delete. An id that names no task, names a draft or is not written as
 * an id falls through to the app's not-found page. Every redirect goes to the list, with
 * the query of the request as the app writes it.
 */
export function createTasksRouter(deps: AppDeps): Router {
  const router = Router();
  // The edit form posts flat fields, so the simple parser is enough.
  const form = express.urlencoded({ extended: false });

  router.get(LIST_PATH, (req, res) => {
    renderList(res, deps.db, readListQuery(req.query), new Date());
  });

  router.post(`${LIST_PATH}/:taskId/done`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    markDone(deps.db, task, new Date());
    res.redirect(303, `${withQuery(LIST_PATH, readListQuery(req.query))}#task-${task.id}`);
  });

  router.post(`${LIST_PATH}/:taskId/reschedule`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    rescheduleTask(deps.db, task, new Date());
    res.redirect(303, `${withQuery(LIST_PATH, readListQuery(req.query))}#task-${task.id}`);
  });

  router.get(`${LIST_PATH}/:taskId/edit`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    renderEdit(res, task);
  });

  router.post(`${LIST_PATH}/:taskId/edit`, form, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const { edit, problems } = readTaskEdit(req.body);
    if (edit === undefined) {
      renderEdit(res, task, 400, req.body, messagesOf(problems));
      return;
    }
    saveTaskEdit(deps.db, task, edit, new Date());
    res.redirect(303, `${LIST_PATH}#task-${task.id}`);
  });

  router.post(`${LIST_PATH}/:taskId/delete`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    deleteTask(deps.db, task.id);
    res.redirect(303, withQuery(LIST_PATH, readListQuery(req.query)));
  });

  return router;
}
```

- `src/views/pages/tasks.ejs`:

```ejs
<%#
  The task list: every task but the drafts, filtered and sorted by the query string.
  tasks: { bar, active, sort, cards, empty, clearHref }
  `bar` holds a chip link per priority and per slot, each to the list with its own value
  turned on or off. `active` are the chips of the values that are on, each to the list
  without it. `sort` is the GET form of the sort: its options, the current one and the
  hidden inputs that keep the filters. `cards` are the tasks shown, each with where its
  actions post. `empty` is 'none' when there is no task at all, 'filtered' when the
  filters match none of them, else null.
  Every address here is built by the route, with the query in the app's one order.
-%>
<%- include('../partials/page-header', { pageHeader: { heading: 'Tasks' } }) -%>

<div class="filter-bar">
  <div class="filter-bar__group" role="group" aria-label="Priority">
<% for (const chip of tasks.bar.priorities) { -%>
    <%- include('../partials/chip', { chip }) -%>
<% } -%>
  </div>
  <div class="filter-bar__group" role="group" aria-label="Time slot">
<% for (const chip of tasks.bar.slots) { -%>
    <%- include('../partials/chip', { chip }) -%>
<% } -%>
  </div>
</div>

<% if (tasks.active.length > 0) { -%>
<ul class="active-filters" aria-label="Active filters">
<% for (const chip of tasks.active) { -%>
  <li><%- include('../partials/chip', { chip }) -%></li>
<% } -%>
</ul>
<% } -%>

<form class="sort-form" method="get" action="<%= tasks.sort.action %>">
<% for (const input of tasks.sort.hidden) { -%>
  <input type="hidden" name="<%= input.name %>" value="<%= input.value %>">
<% } -%>
  <label class="sort-form__label" for="sort-by">Sort by</label>
  <select class="field" id="sort-by" name="sort">
<% for (const option of tasks.sort.options) { -%>
    <option value="<%= option.id %>"<% if (option.id === tasks.sort.current) { %> selected<% } %>><%= option.label %></option>
<% } -%>
  </select>
  <%- include('../partials/button', { button: { label: 'Sort', variant: 'ghost', type: 'submit' } }) -%>
</form>

<% if (tasks.empty === 'none') { -%>
<%- include('../partials/empty-state', { emptyState: {
  heading: 'No tasks yet',
  text: 'Tasks you confirm on the review page are listed here.',
  actions: include('../partials/button', { button: { label: 'Add a task', href: '/add' } }),
} }) -%>
<% } else if (tasks.empty === 'filtered') { -%>
<%- include('../partials/empty-state', { emptyState: {
  heading: 'No tasks match these filters',
  actions: include('../partials/button', { button: { label: 'Clear filters', variant: 'ghost', href: tasks.clearHref } }),
} }) -%>
<% } else { -%>
<ol class="task-list">
<% for (const card of tasks.cards) { -%>
  <li class="card task" id="task-<%= card.id %>">
    <h2 class="task__title"><%= card.title %></h2>
    <p class="task__meta">
      <span class="task__minutes"><%= card.minutes %></span>
<% if (card.priority !== null) { -%>
      <%- include('../partials/priority-badge', { priorityBadge: { priority: card.priority } }) -%>
<% } -%>
      <span class="task__slot"><%= card.slot %></span>
      <span class="task__status"><%= card.status %></span>
      <span class="task__start"><%= card.start %></span>
    </p>
    <div class="task__actions">
<% if (card.doneAction !== null) { -%>
      <form method="post" action="<%= card.doneAction %>">
        <%- include('../partials/button', { button: { label: 'Done', type: 'submit' } }) -%>
      </form>
<% } -%>
<% if (card.rescheduleAction !== null) { -%>
      <form method="post" action="<%= card.rescheduleAction %>">
        <%- include('../partials/button', { button: { label: 'Reschedule', variant: 'ghost', type: 'submit' } }) -%>
      </form>
<% } -%>
      <%- include('../partials/button', { button: { label: 'Edit', variant: 'ghost', href: card.editHref } }) -%>
      <form method="post" action="<%= card.deleteAction %>">
        <%- include('../partials/button', { button: { label: 'Delete', variant: 'ghost', type: 'submit' } }) -%>
      </form>
    </div>
  </li>
<% } -%>
</ol>
<% } -%>
```

- `src/views/pages/task-edit.ejs`:

```ejs
<%#
  The edit page of one task: what the user sets in place of what the analyzer and the
  rules chose.
  edit: { title, minutes, priority, slot, action, deleteAction, backHref }
  errors: the messages of a refused post.
  The values are the stored ones, or those of a refused post. `slot` is '' for No slot.
  Delete is a form of its own after the edit form: forms do not nest.
-%>
<%- include('../partials/page-header', { pageHeader: { heading: 'Edit task' } }) -%>

<% if (errors.length > 0) { -%>
<div class="notice notice--error" role="alert">
<% for (const message of errors) { -%>
  <p><%= message %></p>
<% } -%>
</div>
<% } -%>
<form class="edit-form" method="post" action="<%= edit.action %>">
  <label class="edit-form__label" for="edit-title">Title</label>
  <input class="field" id="edit-title" type="text" name="title" value="<%= edit.title %>" required>
  <label class="edit-form__label" for="edit-minutes">Minutes</label>
  <input class="field" id="edit-minutes" type="number" name="minutes" value="<%= edit.minutes %>" min="1" max="1440" required>
  <fieldset class="choices">
    <legend class="edit-form__label">Priority</legend>
<% for (const item of ui.priorities) { -%>
    <label class="choice">
      <input type="radio" name="priority" value="<%= item.id %>"<% if (edit.priority === item.id) { %> checked<% } %>>
      <span><span aria-hidden="true"><%= item.glyph %></span> <%= item.label %></span>
    </label>
<% } -%>
  </fieldset>
  <fieldset class="choices">
    <legend class="edit-form__label">Time slot</legend>
    <label class="choice">
      <input type="radio" name="slot" value=""<% if (edit.slot === '') { %> checked<% } %>>
      <span>No slot</span>
    </label>
<% for (const item of ui.slots) { -%>
    <label class="choice">
      <input type="radio" name="slot" value="<%= item.id %>"<% if (edit.slot === item.id) { %> checked<% } %>>
      <span><%= item.label %></span>
    </label>
<% } -%>
  </fieldset>
  <div class="edit-form__actions">
    <%- include('../partials/button', { button: { label: 'Save', type: 'submit' } }) -%>
    <%- include('../partials/button', { button: { label: 'Back to tasks', variant: 'ghost', href: edit.backHref } }) -%>
  </div>
</form>
<form method="post" action="<%= edit.deleteAction %>">
  <%- include('../partials/button', { button: { label: 'Delete', variant: 'ghost', type: 'submit' } }) -%>
</form>
```

- Tests: `src/services/task-list.test.ts`, `src/tasks-page.test.ts`,
  `src/tasks-actions.test.ts`, `src/tasks-edit.test.ts`: see `plan.md`.

Changed:

- `src/views/partials/chip.ejs` (D6), the whole file:

```ejs
<%#
  chip: { label, selected?, tone?, href?, current?, removable? }
  `tone` is a priority id; a selected chip takes that priority's colors. With `href` the
  chip is a link: `current` marks it with aria-current="true", and `removable` adds a ×
  that is decoration, so the label stays the link's name.
-%>
<%
  const classes = ['chip'];
  if (chip.selected) classes.push('chip--on');
  if (chip.tone) classes.push(`chip--${ui.priority(chip.tone).id}`);
-%>
<% if (chip.href) { -%>
<a class="<%= classes.join(' ') %>" href="<%= chip.href %>"<% if (chip.current) { %> aria-current="true"<% } %>><%= chip.label %><% if (chip.removable) { %> <span aria-hidden="true">×</span><% } %></a>
<% } else { -%>
<span class="<%= classes.join(' ') %>"><%= chip.label %></span>
<% } -%>
```

- `src/app.ts`: `import { createTasksRouter } from './routes/tasks.ts';` after the import
  of `./routes/styleguide.ts`, and `app.use(createTasksRouter(deps));` right after
  `app.use(createReviewRouter(deps));`.
- `src/routes/review.ts`: `function readId(` becomes `export function readId(`. Nothing
  else.
- `src/services/drafts.ts`: `function readMinutes(` becomes `export function readMinutes(`.
  Nothing else.
- `public/css/base.css`: two insertions.
  Before `/* Card */`:

```css
/* A chip that is a link, such as a filter to turn on or off, is a touch target. */
.chip[href] {
  min-height: var(--touch-target);
  text-decoration: none;
}

```

  Before `/* ---------- Style guide ---------- */`:

```css
/* Tasks: a bar of filter chips that scrolls sideways, the sort, and one card per task. */
.filter-bar {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
}

.filter-bar__group {
  display: flex;
  flex: none;
  gap: var(--space-2);
}

.active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: 0;
  list-style: none;
}

.sort-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.sort-form .field {
  width: auto;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0;
  list-style: none;
}

.task {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.task__title {
  font-size: var(--font-size-md);
  overflow-wrap: anywhere;
}

.task__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.task__actions,
.edit-form__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* The edit page of a task: labelled fields, one under the other. */
.edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.edit-form__label {
  font-weight: 700;
}

```

- `src/shell.test.ts`: D14, one line.

Not touched:

- `package.json`, `yarn.lock`: no package.
- `src/db/*`: no migration, no helper, no SQL. `listTasks`, `getTask`, `updateTask`,
  `deleteTask` are used as they are.
- `src/services/scheduler.ts`: `placeTasks` and `storeSchedule` as they are.
- `src/services/drafts.ts` beyond the one `export`; `confirmDrafts` and the review
  routes.
- `src/ui.ts`: the nav already has `/tasks`; the sort labels live in `task-list.ts`.
- `src/views/pages/home.ejs`, `src/routes/home.ts`: the Today page is U2.
- `src/views/pages/styleguide.ejs`: the chip link is shown on `/tasks`, not added there.
- `src/server.ts`, `src/testing/*`, `vitest.config.ts`, `tsconfig.json`: no clock in
  `AppDeps` (009 D12).
- `public/js/*`: no script (spec).
- Every existing test file except the one line of `src/shell.test.ts`.
- `docs/` unless the builder logs an error; everything under `factory/` but this job's
  `build.md`; `data/`.

## Risks

- **Drafts are listed or acted on.** AC1 list test; AC14 404 tests. Checked: with
  `isListed` returning `true`, two prototype tests failed.
- **A null priority or slot matches a filter.** AC3 tests hold a task without a priority
  and one without a slot under each filter. The `!== null` guards in `shownTasks` are
  there for the compiler: `includes(null)` is `false` anyway, so removing a guard breaks
  no behaviour and no test (checked, and expected).
- **The canonical order is lost: a chip href in click order, or `sort=start` written.**
  AC5 href tests with a query given out of order. Checked: writing `sort=start` failed
  three tests.
- **`newest` sorts by id alone.** The AC4 test stores tasks with `created_at` out of `id`
  order. Checked: failed with `created_at` ignored.
- **Done rewrites a done task, Reschedule touches an `in_progress` task.** AC8 and AC9
  compare the whole rows, `updated_at` included. Checked: both mutations failed a test.
- **An edit that changes only the title reschedules.** AC11 "keeps the times" test.
  Checked.
- **A redirect drops or keeps a bad query.** AC8 and AC14 redirect tests post a query
  with an unknown value out of order. Checked: a redirect without the query failed.
- **Reschedule counts the task's own times.** AC9 test with the task already at the
  first free mark. `placeTasks` ignores the tasks it is handed (009 D4).
- **A failure halfway stores half a reschedule.** `inTransaction` around
  `placeTasks` + `storeSchedule`; the same shape as `confirmDrafts`, whose rollback 009
  tested. No new trigger test here.
- **The `/tasks` route shadows another.** It is mounted after the review router and
  before the 404; no other route starts with `/tasks`.
- **Ports run out when test files are run in a loop**
  (`docs/errors/repeated-test-runs-run-out-of-ports.md`). Run each check once.
- **A reporter writes into the repo**
  (`docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md`). Default reporter
  only.
