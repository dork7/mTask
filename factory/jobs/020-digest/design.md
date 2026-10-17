# 020-digest: design

No spec problems. Nine readings the spec leaves open are fixed below and repeated as
decisions:

- **AC7's return shape is not written field by field.** Reading: `buildDigest` returns a
  `Digest` that carries the date, the raw count and planned minutes, the exact texts AC2
  wants, the first task or `null`, the overdue items with their count, and the three hrefs
  the view needs (a view cannot import a module), following `buildToday` of 014 (D1).
- **AC4 fixes no order for the *list* of overdue items beyond "`scheduled_start` order with
  ties by `id`".** Reading: the same order `src/services/overdue.ts` uses for a group, so a
  task with no `scheduled_start` comes last; and it is one flat list, not the day groups of
  `overdueGroups` (D3).
- **AC4 does not say where the `Review overdue` link is when there is none.** Reading: the
  link is rendered inside `#digest-overdue` only in the non-empty branch, so the empty
  branch has no such link (D6).
- **AC3 and AC4 each render an empty-state partial, and both can appear at once** (a page
  with a running task today and nothing overdue). Reading: no wrapper id is invented for
  the first-task empty state (`#digest-first` must be absent), so a test tells the two
  apart by their `.empty-state__heading` text (D5).
- **AC9's summary count does not say whether it goes singular.** Reading: it reuses AC2's
  `countText` — which AC9 calls "the count and minutes of AC2" — so one task reads
  `1 task today · …`; AC9's own example has four tasks and is unaffected (D8).
- **AC8 says "not once at the start" but the start can be exactly 07:30.** Reading: the
  first fire is the next Dubai 07:30 **at or after** the start, so a start of exactly 07:30
  fires at delay 0 and never earlier (D7).
- **AC8 says "its interval is unref'd" without saying how the first, off-grid fire is
  scheduled.** Reading: a `setTimeout` for the first fire, then a `setInterval(DAY_MS)` from
  it, both unref'd and both cleared by the returned function (D9).
- **AC10 says "the same `PushSender` it builds for 019".** Reading: `src/server.ts` builds
  the sender once into a `const` and hands the *same function* to both jobs (D10).
- **AC1's "the nav has no Digest item" needs the route to say so.** Reading: the digest
  route passes no `nav` local, so `renderPage`'s `nav?` is left out and no link is marked
  (D11); the layout write a `<meta name="vapid-public-key">` only when the app has a key,
  which is the server's job, not a page change.

The page reuses `todaysTasks` and `tasksLeft` of `src/services/today.ts` (014) for the
count, the planned minutes and the first task; `isOverdue` and `OVERDUE_PATH` of
`src/services/overdue.ts` (011); `taskPath` of `src/services/task-list.ts`; `TIMELINE_PATH`
of `src/services/timeline.ts`; `weekdayDateLabel`, `clockLabel` and `dayTimeLabel` of
`src/dubai.ts`; and 019's `PushSender`, `listSubscriptions` seam, `{ title, href }` payload
and `public/sw.js` push handler. Every name and text is the spec's.

Checked in a throwaway folder under `$TMPDIR` (`020-digest-arch-check`), deleted
afterwards, on Node 26.8.2 and yarn 1.22.22, by importing the repo's `src/dubai.ts` with
`node` (it runs the `.ts` directly) and running a few lines; nothing was written into the
repo and nothing was installed:

- The AC8 arithmetic: `dubaiDayStart(dubaiDay(now)) + 7h30m` is 2026-10-12T03:30:00.000Z for
  `now` = 2026-10-12T02:00:00.000Z (90 min), 2026-10-13T03:30:00.000Z for
  2026-10-12T04:00:00.000Z (1410 min), and the same instant for a start of exactly
  2026-10-12T03:30:00.000Z (0 min). The two spec examples hold. D7's `nextDigestAt` is right.
- `weekdayDateLabel(2026-10-12T09:36:00.000Z)` is `Monday, 12 Oct`; `dayTimeLabel` of
  2026-10-11T05:00:00.000Z at that clock is `11 Oct 9:00 AM`; `clockLabel` of
  2026-10-12T10:00:00.000Z is `2:00 PM`. The AC1, AC3 and AC4 examples hold.

Not checked: the page in a browser; and whether a vitest fake-timer handle has `unref`
(019's `startPushJob` already runs under `vi.useFakeTimers()` with the same guarded call,
and this job's guard is that code copied).

## Approach

The job is one read-only page and one repeating job. `src/services/digest.ts` holds both:
`buildDigest(tasks, now)` is the pure function the page renders, and
`startDigestJob(db, send)` is the 7:30 AM push, the twin of 019's `startPushJob`. It reuses
`todaysTasks` and `tasksLeft` of `today.ts` rather than restating "today" and "the first
task", so the digest and Today can never disagree about either. The overdue list is a flat
`filter(isOverdue).sort(byStart)` — the comparator mirrored from `overdue.ts`, because
`overdueGroups` groups by Dubai day and AC4 wants `scheduled_start` order, not group order.

`src/routes/digest.ts` is the thin route: `listTasks(deps.db)` once and `requestTime(res)`,
exactly as 014's `home.ts` does, handed to `buildDigest` and rendered as `pages/digest.ejs`
with no `nav`, so nothing is marked current. It writes nothing (AC6). `src/app.ts` mounts it
after the mini-bar middleware and the timeline router.

`pages/digest.ejs` reuses the 002 partials (page header, empty state, button) and the
`.card` class, and adds one small `.digest__*` block to `base.css` with tokens only, no
inline style. The push end is 019's: `listSubscriptions(db)` in `id` order, one
`JSON.stringify({ title, href: '/digest' })` per row, through 019's `PushSender`, so 019
AC8's service-worker handler shows it and opens `/digest`. `src/server.ts` builds the one
real sender and starts both jobs in the keys branch; without the keys it starts 018's
reminder job and no digest job.

## Decisions

**D1. `src/services/digest.ts` exports `DIGEST_PATH` and `buildDigest`, and owns the
`Digest` model.** The model carries the raw numbers (`count`, `plannedMinutes`,
`overdueCount`) *and* the exact AC2 texts (`countText`, `plannedText`), the first task or
`null`, the overdue items, and the three hrefs, like `buildToday` of 014 returning
`emptyHref` and the finished `minutesText`. Signatures and the full file are under Files.
Rejected: formatting the texts in the view, which would move AC2's wording (and AC9's
reuse of it) out of the tested builder.

**D2. Today's count, planned minutes and first task come from `today.ts`'s
`todaysTasks` and `tasksLeft`.** `todaysTasks(tasks, now).length` is the count;
`minutesOf(todaysTasks(...))` is the planned minutes (`estimated_minutes ?? 0`);
`tasksLeft(tasks, now)[0] ?? null` is the first task. `tasksLeft` already means "pending,
end not earlier than `now`, in `scheduled_start` then `id` order", which *is* AC3's rule
("014 AC2's Next up rule"). Rejected: a second "today" or "first" test written in
`digest.ts`, which could drift from 014's.

**D3. The overdue list is `tasks.filter(isOverdue).sort(byStart)`, one flat list.** A local
`byStart` mirrors `overdue.ts`'s private one — both `scheduled_start` values compared as
text, a `null` start last, then `id`. The due label is
`dayTimeLabel(scheduled_start ?? scheduled_end, now)`, the same choice 011's cards make.
Rejected: `overdueGroups(tasks, now).flatMap((group) => group.tasks)`, whose order is
Today, Yesterday, Earlier, not `scheduled_start` order.

**D4. The hrefs come from the existing constants.** `overdueHref` is `OVERDUE_PATH`,
`timelineHref` is `TIMELINE_PATH`, each task's `href` is `taskPath(id)`, and `addHref` is a
private `ADD_PATH = '/add'` (`today.ts` keeps its own private one). Rejected: hard-coding
`/add` in the view, or exporting `today.ts`'s private constant.

**D5. The view uses the 002 partials, and the two empty states are told apart by their
heading.** `#digest-first` is absent when `first` is `null`; the partial then shows the
empty state with heading `Nothing left today` and one button link `Add a task` to
`digest.addHref` (`/add`). When `overdue` is empty, `#digest-overdue` holds the empty state
with heading `Nothing overdue` and no action. Both may appear at once, so a test finds each
by its `.empty-state__heading` text. Rejected: an id on either empty state, which AC3 and
AC4 do not name.

**D6. `#digest-overdue` always exists; the `Review overdue` link is inside it only when
the list is not empty.** In the non-empty branch it holds the `<ul>` of items and then the
link; in the empty branch it holds only the empty state. Both links on the page are the
button partial (`.btn`), which is already a touch target: the review link is
`{ label: 'Review overdue', href: digest.overdueHref, variant: 'ghost' }`, and the timeline
link is the same with `attrs: { id: 'timeline-link' }` (AC5's one link with that id).
Rejected: the review link outside the section, which AC4's "holds" wording and the empty
case both contradict.

**D7. The first fire is the next Dubai 07:30 at or after `now`.**
`nextDigestAt(now) = dubaiDayStart(dubaiDay(now.getTime())) + (7 * 60 + 30) * MINUTE_MS`;
when that is before `now`, add `DAY_MS`. At exactly 07:30 the delay is 0 (checked), so the
job never fires before the plan's time and never "once at the start". Rejected: firing once
at the start or one interval from the start (019's `startPushJob`), which AC8 rules out.

**D8. The notification summary reuses the page's texts.**
`summaryOf(digest) = `${countText} · ${plannedText}` + (overdueCount > 0 ? ` · <n> overdue
task(s)` : '')`, with 014 AC5's plural (`1 overdue task`, `2 overdue tasks`). Because
`countText` is AC2's, one task reads `1 task today` and four read `4 tasks today`. The
payload is `JSON.stringify({ title: summary, href: '/digest' })`, 019's shape. Rejected: a
second "tasks" wording inside the job, which would let the page and the push disagree.

**D9. `startDigestJob(db, send)` schedules with a first `setTimeout` and a repeating
`setInterval(DAY_MS)`.** The callback pushes once and starts the interval; both handles are
unref'd with the guarded call 019 uses, and the returned function clears both. It pushes
through a private `pushDigest(db, now, send)`: `listSubscriptions(db)` (already `id` order,
019 D3), one `send` per row, the payload of D8. With no subscription row it sends nothing
and does not throw. `createApp` starts no job. Rejected: a recursive `setTimeout`, which is
not "its interval"; and `node-cron`, which 018 rejected for the twin reminder job and which
the fake-timer tests could not drive.

**D10. `src/server.ts` builds one sender and starts both jobs in the keys branch.**
`const send = createPushSender(vapid); startPushJob(db, send); startDigestJob(db, send);`
after `createApp` and before `listen`. Without the keys, `startReminderJob(db)` runs as
before and `startDigestJob` is not reached. Rejected: calling `createPushSender` twice,
which would hand AC10's "same `PushSender`" two different functions.

**D11. `src/routes/digest.ts` mounts `GET /digest` with no `nav`, and reads the request
time with `requestTime(res)`.** The handler is
`renderPage(res, 'digest', { title: 'Digest', digest: buildDigest(listTasks(deps.db), requestTime(res)) })`.
`nav` is left out, so `renderPage`'s optional `nav?` is absent and `nav.ejs` marks nothing.
`src/app.ts` mounts `createDigestRouter(deps)` after `createTimelineRouter(deps)`, both
after the mini-bar middleware, which `requestTime` needs. Rejected: reading the clock with
`new Date()` in the route (014 and 012 use `requestTime`), and marking a nav item.

**D12. One small `.digest__*` block goes into `public/css/base.css` before the style
guide section.** Tokens only, no custom property, no colour literal, no px spacing, no new
radius — the same rules the existing blocks follow (`src/stylesheet.test.ts`). The stats
sit in one `.card`; the first task is a `.card.digest__first`; the overdue items reuse the
`.later__item` row shape as `.digest__item`. No inline style anywhere (`/digest` is not one
of the two paths `src/components.test.ts` scans, but the rule is kept anyway). Rejected:
reusing `.next-up`/`.later__*` classes outright, whose names say "Today" while their styles
are generic; and leaving the page unstyled.

## Files

Created:

- `src/services/digest.ts`:

```ts
import type { Database } from '../db/database.ts';
import { listSubscriptions } from '../db/push.ts';
import { listTasks, type Task } from '../db/tasks.ts';
import {
  DAY_MS,
  MINUTE_MS,
  clockLabel,
  dayTimeLabel,
  dubaiDay,
  dubaiDayStart,
  weekdayDateLabel,
} from '../dubai.ts';
import { OVERDUE_PATH, isOverdue } from './overdue.ts';
import type { PushSender } from './push.ts';
import { taskPath } from './task-list.ts';
import { TIMELINE_PATH, type ScheduledTask } from './timeline.ts';
import { tasksLeft, todaysTasks } from './today.ts';

/*
 * The morning digest: today's count and planned minutes, the first task left and the
 * overdue items, for the page and the daily push. `buildDigest` takes the tasks and the
 * clock; the job takes the database and the sender. Nothing here reads either by itself.
 */

/** The path of the digest page, which the push opens. */
export const DIGEST_PATH = '/digest';

/** Where the empty state's Add link goes. */
const ADD_PATH = '/add';

/** The Dubai minutes after midnight the daily job runs at: the plan's 7:30 AM. */
const DIGEST_MINUTE_OF_DAY = 7 * 60 + 30;

/** The first task left today, as the page shows it. */
export interface DigestFirst {
  id: number;
  title: string;
  /** Its sheet. */
  href: string;
  /** `2:00 PM`. */
  time: string;
}

/** One overdue task, as the page lists it. */
export interface DigestOverdueItem {
  id: number;
  title: string;
  href: string;
  /** When it was due: `Today 9:00 AM`, `11 Oct 9:00 AM`. */
  due: string;
}

/** Everything `pages/digest.ejs` shows, and what the job's notification says. */
export interface Digest {
  /** `Monday, 12 Oct`. */
  date: string;
  /** The number of today's tasks. */
  count: number;
  /** `4 tasks today`, `1 task today`. */
  countText: string;
  /** The sum of `estimated_minutes` over today's tasks, a null as 0. */
  plannedMinutes: number;
  /** `210 min planned`. */
  plannedText: string;
  /** `null`: the empty state is shown. */
  first: DigestFirst | null;
  /** In `scheduled_start` order, a task without one last, then by id. May be empty. */
  overdue: DigestOverdueItem[];
  /** The number of `overdue` items. */
  overdueCount: number;
  /** Where the empty state's link goes. */
  addHref: string;
  /** The link back to the overdue view. */
  overdueHref: string;
  /** The link to the timeline. */
  timelineHref: string;
}

function minutesOf(tasks: readonly Task[]): number {
  return tasks.reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0);
}

function firstOf(task: ScheduledTask): DigestFirst {
  return {
    id: task.id,
    title: task.title,
    href: taskPath(task.id),
    time: clockLabel(new Date(task.scheduled_start)),
  };
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

function overdueItemOf(task: Task, now: Date): DigestOverdueItem {
  // An overdue task has an end; a task with an end and no start is labelled by its end.
  const due = task.scheduled_start ?? task.scheduled_end;
  return {
    id: task.id,
    title: task.title,
    href: taskPath(task.id),
    due: due === null ? '' : dayTimeLabel(new Date(due), now),
  };
}

/** The digest at `now`, from every task. The ones it does not show are dropped here. */
export function buildDigest(tasks: readonly Task[], now: Date): Digest {
  const todays = todaysTasks(tasks, now);
  const left = tasksLeft(tasks, now);
  const overdue = tasks
    .filter((task) => isOverdue(task, now))
    .sort(byStart)
    .map((task) => overdueItemOf(task, now));
  const count = todays.length;
  const plannedMinutes = minutesOf(todays);
  return {
    date: weekdayDateLabel(now),
    count,
    countText: `${count} task${count === 1 ? '' : 's'} today`,
    plannedMinutes,
    plannedText: `${plannedMinutes} min planned`,
    first: left.length === 0 ? null : firstOf(left[0]),
    overdue,
    overdueCount: overdue.length,
    addHref: ADD_PATH,
    overdueHref: OVERDUE_PATH,
    timelineHref: TIMELINE_PATH,
  };
}

/** The instant of the next Dubai 7:30 AM at or after `now`. */
function nextDigestAt(now: Date): number {
  const at = dubaiDayStart(dubaiDay(now.getTime())) + DIGEST_MINUTE_OF_DAY * MINUTE_MS;
  return at < now.getTime() ? at + DAY_MS : at;
}

/** The notification title of a digest: the count of AC2, the overdue count of 014 AC5. */
function summaryOf(digest: Digest): string {
  const overdue =
    digest.overdueCount === 0 ? '' : ` · ${digest.overdueCount} overdue task${digest.overdueCount === 1 ? '' : 's'}`;
  return `${digest.countText} · ${digest.plannedText}${overdue}`;
}

/** Builds the digest at `now` and sends it to every subscription, in `id` order. */
function pushDigest(db: Database, now: Date, send: PushSender): void {
  const payload = JSON.stringify({ title: summaryOf(buildDigest(listTasks(db), now)), href: DIGEST_PATH });
  for (const subscription of listSubscriptions(db)) send(subscription, payload);
}

/**
 * Starts the daily digest job: at the next Dubai 7:30 AM at or after now, and every 24
 * hours after that, it builds the digest and pushes it to every `push_subscriptions` row.
 * Returns the function that stops it. The first timeout and the interval are both unref'd,
 * so the job does not keep the process alive by itself, which `src/server.ts` needs.
 */
export function startDigestJob(db: Database, send: PushSender): () => void {
  const now = new Date();
  let interval: ReturnType<typeof setInterval> | undefined;
  const first = setTimeout(() => {
    pushDigest(db, new Date(), send);
    interval = setInterval(() => pushDigest(db, new Date(), send), DAY_MS);
    if (typeof (interval as { unref?: unknown }).unref === 'function') {
      (interval as { unref: () => void }).unref();
    }
  }, nextDigestAt(now) - now.getTime());
  if (typeof (first as { unref?: unknown }).unref === 'function') {
    (first as { unref: () => void }).unref();
  }
  return () => {
    clearTimeout(first);
    if (interval !== undefined) clearInterval(interval);
  };
}
```

- `src/routes/digest.ts`:

```ts
import { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { listTasks } from '../db/tasks.ts';
import { renderPage } from '../render.ts';
import { DIGEST_PATH, buildDigest } from '../services/digest.ts';
import { requestTime } from './mini-bar.ts';

/**
 * The Digest page: today's count, planned minutes, the first task left and the overdue
 * items, with links to the overdue view and the timeline. It reads every task once and
 * the time of the request as the mini-bar middleware read it, and writes nothing.
 */
export function createDigestRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(DIGEST_PATH, (_req, res) => {
    renderPage(res, 'digest', {
      title: 'Digest',
      digest: buildDigest(listTasks(deps.db), requestTime(res)),
    });
  });

  return router;
}
```

- `src/views/pages/digest.ejs`:

```ejs
<%#
  The Digest: the morning summary of the day.
  digest: { date, countText, plannedText, first, overdue, overdueCount, addHref,
  overdueHref, timelineHref }, built by `buildDigest` of src/services/digest.ts. `first` is
  null when nothing is left today; `overdue` may be empty. The two empty states can appear
  together, so each is told apart by its heading.
-%>
<%- include('../partials/page-header', { pageHeader: { heading: 'Digest', sub: digest.date } }) -%>

<div class="card digest__stats">
  <p class="digest__count" id="digest-count"><%= digest.countText %></p>
  <p class="digest__planned" id="digest-planned"><%= digest.plannedText %></p>
</div>

<% if (digest.first !== null) { -%>
<div class="card digest__first" id="digest-first">
  <a class="digest__title" href="<%= digest.first.href %>"><%= digest.first.title %></a>
  <span class="digest__time"><%= digest.first.time %></span>
</div>
<% } else { -%>
<%- include('../partials/empty-state', { emptyState: {
  heading: 'Nothing left today',
  actions: include('../partials/button', { button: { label: 'Add a task', href: digest.addHref } }),
} }) -%>
<% } -%>

<div class="card digest__overdue" id="digest-overdue">
<% if (digest.overdue.length > 0) { -%>
  <ul class="digest__list">
<% for (const item of digest.overdue) { -%>
    <li class="digest__item" id="digest-overdue-<%= item.id %>">
      <a class="digest__title" href="<%= item.href %>"><%= item.title %></a>
      <span class="digest__time"><%= item.due %></span>
    </li>
<% } -%>
  </ul>
  <%- include('../partials/button', { button: { label: 'Review overdue', href: digest.overdueHref, variant: 'ghost' } }) -%>
<% } else { -%>
  <%- include('../partials/empty-state', { emptyState: { heading: 'Nothing overdue' } }) -%>
<% } -%>
</div>

<%- include('../partials/button', { button: { label: 'View timeline', href: digest.timelineHref, variant: 'ghost', attrs: { id: 'timeline-link' } } }) -%>
```

- Tests (see `plan.md`): `src/digest-page.test.ts`, `src/services/digest.test.ts`,
  `src/digest-job.test.ts`.

Changed:

- `src/app.ts`: add `import { createDigestRouter } from './routes/digest.ts';` in import
  order (after `./routes/add.ts`, before `./routes/home.ts`); and
  `app.use(createDigestRouter(deps));` after `app.use(createTimelineRouter(deps));`, before
  `app.use(styleguideRouter);`. Nothing else.

- `src/server.ts`: add `import { startDigestJob } from './services/digest.ts';` in import
  order (after `./services/analyzer.ts`, before `./services/push.ts`); replace the
  `else { startPushJob(db, createPushSender(vapid)); }` branch with D10's:

```ts
} else {
  const send = createPushSender(vapid);
  startPushJob(db, send);
  startDigestJob(db, send);
}
```

  The `createPushSender` declaration, the `if (vapid === undefined)` condition, and the
  `listen` block are otherwise unchanged.

- `src/server.test.ts` (AC10): add `const startDigestJob = vi.fn();` beside the two job
  spies; add `vi.doMock('./services/digest.ts', () => ({ startDigestJob }));` in
  `beforeEach` and `vi.doUnmock('./services/digest.ts');` in `afterEach`; in the no-keys
  test add `expect(startDigestJob).not.toHaveBeenCalled();`; in the keys test add
  `expect(startDigestJob).toHaveBeenCalledTimes(1);`,
  `expect(startDigestJob.mock.calls[0][0]).toBe(database);`,
  `expect(startDigestJob.mock.calls[0][1]).toBe(startPushJob.mock.calls[0][1]);`,
  `expect(startDigestJob.mock.calls[0][1]).toBeTypeOf('function');`, and the two order
  assertions `createApp < startDigestJob < listen`. The describe name becomes
  `'server: the reminder, push and digest jobs (019 AC7, 020 AC10)'`. The module comment
  gains the digest mock. Nothing else changes; the two existing assertions stand.

- `public/css/base.css` (D12): insert right after the `.alarm__permission, .alarm__blocked`
  rule and before `/* ---------- Style guide ---------- */`:

```css
/* Digest: the morning summary of the day. */
.digest__stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.digest__count {
  font-size: var(--font-size-xl);
  font-weight: 700;
}

.digest__planned {
  color: var(--muted);
}

.digest__first {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.digest__list {
  padding: 0;
  list-style: none;
}

.digest__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}

.digest__item:last-child {
  border-bottom: 0;
}

.digest__title {
  color: var(--text);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.digest__time {
  color: var(--muted);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}
```

Not touched:

- `src/services/today.ts`, `src/services/overdue.ts`, `src/services/timeline.ts`,
  `src/services/task-list.ts`, `src/services/push.ts`, `src/services/reminders.ts`: their
  exports are imported as they are (`todaysTasks`, `tasksLeft`, `isOverdue`,
  `OVERDUE_PATH`, `taskPath`, `TIMELINE_PATH`, `PushSender`), not changed. In particular no
  `PushSender` field and no new export is added to them.
- `src/db/*`: no migration, no table, no SQL. `push_subscriptions` and its helpers (019) are
  read through `listSubscriptions`; the schema and `src/db/migrations.test.ts` stay as they
  are.
- `src/views/layout.ejs`, `src/render.ts`, `src/ui.ts`, `src/views/partials/*`: the digest
  uses the existing page-header, empty-state and button partials; no nav item is added.
- `public/sw.js`, `public/js/push.js`, `src/routes/push.ts`: 019's handler already opens
  `payload.href`, and the digest payload carries `/digest`; the service worker's
  `APP_SHELL` is left as it is (the page is reached over the network, as `/overdue` was
  before 014). `src/pwa.test.ts` and `src/push-sw.test.ts` stand.
- Every existing `*.test.ts` but `src/server.test.ts`: they are unchanged (AC11).
- `package.json`, `yarn.lock`, `.env.example`: no package or environment value is added.
- `docs/mockUps.html` and `docs/plan.md`: no digest screen; task 14 and U10 name no route or
  field. `docs/` unless the builder logs an error; everything under `factory/` but this
  job's `build.md`; `data/`.

## Risks

- **The two empty states appear together, and a test that expects one fails.** An
  in-progress task today with nothing overdue gives `Nothing left today` *and* `Nothing
  overdue`. The AC3 and AC4 empty tests find their empty state by heading (D5); they never
  use `one(document, '.empty-state')`.
- **The overdue list comes out in the wrong order.** `overdueGroups` would sort by Dubai
  day (Today first), and a list without a comparator would be `id` order. The AC4 and AC7
  tests use two overdue tasks whose `scheduled_start` order is neither their `id` order nor
  their day order, and one overdue task with a `null` start that must come last.
- **The first task is a running, done or overdue one.** `tasksLeft` (D2) is 014's rule. The
  AC3 tests add an overdue 9:00 AM task (so the 2:00 PM one is first), an `in_progress`, a
  `done`, a `draft` and a tomorrow task, and a same-start tie in reverse `id` order.
- **The count or the minutes count the wrong tasks.** `todaysTasks` (D2) drops a `draft`, a
  task with no `scheduled_start` and a task on another day. The AC2 test seeds all three
  plus the four counted tasks and expects `4 tasks today` and `210 min planned`; a null
  estimate is counted as 0.
- **The job fires at the wrong time, or at the start.** The AC8 tests start before and
  after 07:30 and advance to the two checked instants (D7); one starts after 07:30 and
  asserts nothing at 90 minutes, then the push at 23½ hours.
- **The interval keeps the suite alive.** Both handles are unref'd with 019's guard (D9);
  the runner exiting is the check. No test fakes a real interval onto the process.
- **`startDigestJob` pushes at the wrong now.** The callback reads `new Date()` at the fire,
  under `vi.useFakeTimers()` the faked clock, so the AC8 and AC9 tests move the system time
  before they start the job.
- **The summary wording drifts from the page.** D8 builds it from `countText` and
  `plannedText`, so the AC9 test reads the same strings the AC2 test does; a job that
  re-words "tasks" fails the AC9 assertion.
- **A task title is rendered as markup.** Every text is `<%= %>`; the AC1 test puts
  `<b>x</b>` in the first task and an overdue item and expects no `b` in `main`.
- **The diff reaches a file it should not.** `src/server.test.ts` is the only existing test
  that changes and no migration is added (AC11); the changed files are exactly
  `src/app.ts`, `src/server.ts`, `src/server.test.ts` and `public/css/base.css`, plus the
  four new files.
- **A stylesheet rule breaks `src/stylesheet.test.ts`.** The `.digest__*` block uses only
  `var()` colors and spacing, no custom property, no px length, no new radius (D12); the
  test checks every rule.
- **The page reads or writes more than it should.** The route calls `listTasks` once and
  `requestTime(res)`, and the AC6 test compares every task and settings row (with
  `updated_at`) before and after two requests.
- **Ports run out when a test file is run in a loop**
  (`docs/errors/repeated-test-runs-run-out-of-ports.md`). Run each check once.
- **A reporter writes into the repo**
  (`docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md`). Default reporter
  only; the page tests use `createTestApp` and the job tests `openDatabase(':memory:')`, so
  nothing is left under `data/`.
