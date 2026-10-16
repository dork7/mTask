# 018-reminders-and-alarm: design

No spec problems. Three readings the spec leaves open, and one tension with the code that
AC11 already names, are fixed below and repeated as decisions:

- **The new column must not change `Task` (AC11).** `yarn build` is `tsc --noEmit` over
  `src`, so it type-checks the tests too, and `src/db/tasks.test.ts` compares the object
  `createTask`/`getTask` return to a literal of the 21 fields of `Task`
  (`tasks.test.ts:89`, `:128`). Adding `reminded_at` to `Task`, `TaskFields` and
  `holdsTimestamp` breaks those two tests, which AC11 forbids. So `Task` stays exactly as
  it is: `reminded_at` is not a field of it, `toTask` drops the column (D3), and the
  column's SQL lives in a new `src/db/reminders.ts` (D2).
- **AC2 lists four conditions.** A task is listed when `reminded_at` is not null,
  `reminder_at` is not null and at or before `now`, and the priority and status are
  urgent/pending-or-in-progress. The list does not add a fifth check that
  `reminded_at >= reminder_at` (D4), even though AC1 uses that comparison to decide
  whether to mark.
- **AC3's 400 has no page in the spec.** A `minutes` that is missing, repeated or not
  `5`, `10` or `15` answers `res.sendStatus(400)` and writes nothing (D6).
- **AC7's "not `done`" includes a `draft`.** `anyReminder` (D4) is `reminder_at !== null
  && status !== 'done'`, the spec's words. A draft cannot be given a reminder by the app
  (the sheet's `findListedTask` refuses one), so this is a reading that only a test that
  writes a draft straight into the database can see.

Checked in a throwaway folder under `$TMPDIR`, with `node:sqlite` directly, on Node
26.8.2 and yarn 1.22.22 (nothing installed, nothing written in the repo):

- `ALTER TABLE tasks ADD COLUMN reminded_at TEXT CONSTRAINT tasks_reminded_at CHECK
  (reminded_at GLOB '????-??-??T??:??:??.???Z')` is accepted, appends the column **last**
  (`id, …, created_at, updated_at, reminded_at`), allows a NULL, and refuses
  `datetime('now')` with `CHECK constraint failed: tasks_reminded_at`.
- The fire rule of D2 marked exactly the urgent, due, `pending`/`in_progress` rows of a
  seven-row table (2 changes), a second run changed **0** rows, and the AC2 query
  returned the marked ones in `reminder_at` then `id` order.
- A 1964-byte WAV — 8 kHz, 8-bit unsigned mono, 0.12 s of an 880 Hz square tone and
  0.12 s of silence — encodes to 2620 base64 characters and is accepted by macOS
  `afinfo` (`WAVE`, 1 ch, 8000 Hz, lpcm 8-bit unsigned). It is the alarm's looping sound
  (D8).
- `setInterval(...).unref()` lets a plain Node process exit; the same interval without
  `unref` keeps it alive. `startReminderJob` unrefs the interval it makes (D9).

Not checked: the look of the alarm in a real browser and the permission dialog (the spec's
hand-check), and Node 22 and 24.

## Approach

The job adds the watcher the sheet of 013 was missing and the alarm it feeds. A new
`src/db/reminders.ts` owns the only SQL that names `reminded_at`: a point update that
marks due urgent tasks, and a select that reads the marked ones back. `Task` and its four
helpers are unchanged except that `toTask` drops the new column, so every object that
crosses the `src/db/tasks.ts` boundary still has exactly the 21 fields of `Task`.

`src/services/reminders.ts` holds the behaviour: `fireDueReminders(db, now)` (the fire
rule), `listAlarms(db, now)` (the alarm list as JSON), `anyReminder(tasks)` (whether the
layout writes the alarm at all), `readSnooze`, `snoozeTask`, `dismissTask`, and
`startReminderJob(db, everyMs)`. `src/server.ts` starts the job once, after it opens the
database; `createApp` never does, so a test's app runs no interval.

The alarm list is a route of its own, `GET /reminders` in a new `src/routes/reminders.ts`,
mounted in `src/app.ts` beside the others. It reads the database and the request time and
answers JSON. Snooze and Dismiss go the other way: they are posts on a task, so they live
in `src/routes/tasks.ts`, which already owns `findListedTask` (an unknown, draft or
malformed id must 404 before any write, AC5).

Every page shows the alarm, so it cannot come from one route. The mini-bar middleware
already runs before every router and already defers its database read; it gains a second
deferred, enumerable `res.locals.alarm` (D7), and the layout writes `/js/alarm.js` and
`partials/alarm` when that local is true. `public/js/alarm.js` polls `GET /reminders` on
load and every 30 seconds, fills and shows the one overlay, plays a looping beep, asks
for notification permission when it needs to, and posts Snooze or Dismiss with `fetch`
before hiding the overlay again.

## Decisions

**D1. The migration is a third entry, an `ALTER TABLE ... ADD COLUMN` with a named
CHECK.** Appended to `migrations`:

```
ALTER TABLE tasks ADD COLUMN reminded_at TEXT CONSTRAINT tasks_reminded_at CHECK (reminded_at GLOB '????-??-??T??:??:??.???Z');
```

It is nullable, holds the same GLOB as `reminder_at`, and lands after `updated_at`
because `ADD COLUMN` appends (checked). Rejected: rebuilding `tasks` to seat the column
next to `reminder_at`, which would have to copy the table, its `parent_task_id`
self-reference and its foreign keys for no behaviour. Migration 1 and 2 are untouched.

**D2. `src/db/reminders.ts` owns `reminded_at`, and nothing else names it.**
`markDueReminders(db, now)` is

```sql
UPDATE tasks SET reminded_at = ?
 WHERE priority = 'urgent'
   AND status IN ('pending', 'in_progress')
   AND reminder_at IS NOT NULL
   AND reminder_at <= ?
   AND (reminded_at IS NULL OR reminded_at < reminder_at)
```

and returns `Number(...run(now, now).changes)`. It sets `reminded_at` alone: `updated_at`
is left as it is, because the mark is the job's business, not an edit of the task (D8's
test pins it). `listAlarmTasks(db, now)` is

```sql
SELECT id, title FROM tasks
 WHERE priority = 'urgent'
   AND status IN ('pending', 'in_progress')
   AND reminder_at IS NOT NULL
   AND reminder_at <= ?
   AND reminded_at IS NOT NULL
 ORDER BY reminder_at, id
```

Stored timestamps sort as text in time order (`src/db/timestamps.ts`), so `<=` and the
order are plain string comparisons. `now` is passed as an ISO string from the service.

**D3. `toTask` drops `reminded_at`; `Task` is unchanged.** In `src/db/tasks.ts`:

```ts
function toTask(row: Record<string, SQLOutputValue>): Task {
  Reflect.deleteProperty(row, 'reminded_at');
  return { ...row } as unknown as Task;
}
```

`createTask`, `getTask`, `listTasks` and `updateTask` keep returning exactly a `Task`, so
`tasks.test.ts:89` and `:128` and every other whole-row comparison hold. A caller cannot
set `reminded_at` through `updateTask` (it is no `TaskField`), which is correct: only the
job marks it. Rejected: adding the field to `Task` and editing the tests (AC11 forbids
it), and a separate `SELECT` that lists columns and omits `reminded_at` in all four
helpers (four places to keep in step instead of one).

**D4. `src/services/reminders.ts` is the behaviour.** Exports
`SNOOZE_MINUTES = [5, 10, 15] as const`, `type SnoozeMinutes`, `interface Alarm`,
`fireDueReminders`, `listAlarms`, `anyReminder`, `readSnooze`, `snoozeTask`,
`dismissTask`, `startReminderJob` (signatures in Files).

- `fireDueReminders(db, now)` is `markDueReminders(db, now.toISOString())`.
- `listAlarms(db, now)` maps `listAlarmTasks(db, now.toISOString())` to
  `{ id, title, href, snooze, dismiss }` with `taskPath(id)` and `${taskPath(id)}/snooze`
  and `/dismiss` (the paths of `src/services/task-list.ts`, so no route module is
  imported). It requires `reminded_at IS NOT NULL` and nothing more (the reading above).
- `anyReminder(tasks)` is `tasks.some((task) => task.reminder_at !== null && task.status
  !== 'done')`.
- `readSnooze(body)` is `postedValue(body, 'minutes')` matched against
  `SNOOZE_MINUTES` as text; missing, repeated (`null`) or any other value is `undefined`.
- `snoozeTask(db, task, minutes, now)` writes
  `{ reminder_at: new Date(now.getTime() + minutes * MINUTE_MS).toISOString() }` through
  `updateTask`, which sets `updated_at` and leaves `reminded_at` alone.
- `dismissTask(db, task)` writes `{ reminder_at: null }`.

`postedValue` is reused from `src/services/drafts.ts`; `MINUTE_MS` from `src/dubai.ts`.
Rejected: a check that the task is urgent or marked, which AC3 and AC4 do not ask for —
they act on any task the list shows.

**D5. `GET /reminders` is a route of its own, `src/routes/reminders.ts`, mounted in
`app.ts` after `createTasksRouter`.** It answers `res.json({ alarms: listAlarms(deps.db,
requestTime(res)) })`, so the content type is `application/json` and the time is the one
the middleware read. It reads only the database, so it works with `ANTHROPIC_API_KEY`
unset. Rejected: adding it to `src/routes/tasks.ts`, which would put a JSON handler among
the HTML ones and would need the task list's reader anyway.

**D6. Snooze and Dismiss are posts in `src/routes/tasks.ts`, after Delete.** Both start
with `findListedTask`; an id it refuses calls `next()`, which is the app's 404 handler,
before any write (AC5). Then:

```ts
  router.post(`${LIST_PATH}/:taskId/snooze`, form, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    const minutes = readSnooze(req.body);
    if (minutes === undefined) {
      res.sendStatus(400);
      return;
    }
    snoozeTask(deps.db, task, minutes, requestTime(res));
    res.redirect(303, '/');
  });

  router.post(`${LIST_PATH}/:taskId/dismiss`, (req, res, next) => {
    const task = findListedTask(deps.db, req.params.taskId);
    if (task === undefined) {
      next();
      return;
    }
    dismissTask(deps.db, task);
    res.redirect(303, '/');
  });
```

Snooze takes the `form` parser (its `minutes` field); Dismiss has no body. The bad-minutes
400 is `res.sendStatus(400)` (body `Bad Request`), because the spec names no page and the
alarm's `fetch` ignores the answer. Rejected: rendering the not-found page with 400, which
would say "Page not found" for a malformed field.

**D7. The alarm reaches every page through a second deferred `res.locals` getter.**
`createMiniBarMiddleware` in `src/routes/mini-bar.ts` gains, after the `miniBar` getter:

```ts
    let alarm: boolean | undefined;
    Object.defineProperty(res.locals, 'alarm', {
      enumerable: true,
      get: () => {
        if (alarm === undefined) alarm = anyReminder(listTasks(deps.db));
        return alarm;
      },
    });
```

Like `miniBar` it reads the database the first time Express spreads `res.locals` into a
render, so a request that renders nothing, or whose handler fails first, never reads it
(`docs/errors/app-middleware-reads-db-before-every-router.md`). The layout writes the
script in `head` and the overlay after `</main>`:

```ejs
<% if (locals.alarm) { -%>
  <script src="/js/alarm.js" defer></script>
<% } -%>
```

```ejs
<% if (locals.alarm) { -%>
  <%- include('partials/alarm') -%>
<% } -%>
```

`locals.` keeps `renderView('layout', …)` working without the middleware. Rejected: a
route that renders the alarm, which no single route owns, and reading the database
directly in the middleware (the error above).

**D8. The markup is `partials/alarm.ejs`: one hidden overlay.** Classes `overlay
overlay--alarm`, `id="alarm"`, `role="alertdialog"`, `hidden`. Inside: an empty
`p.alarm__title`; `<audio class="alarm__sound" loop src="<data URI>">`; a
`div.alarm__actions` of four `partials/button` calls — `Snooze 5 min`, `Snooze 10 min`,
`Snooze 15 min` each with `data-minutes` of `5`, `10`, `15`, and a ghost `Dismiss` with
`data-alarm-dismiss`; a `p.alarm__permission` with the sentence
`Allow alerts so urgent tasks can wake you` and a button with `data-alarm-permission`; and
a `p.alarm__blocked` with the fallback text. Both last paragraphs start `hidden`. The
partial builds its buttons through `partials/button`, which is not in
`components.test.ts`'s PARTIALS table, so the include is unproblematic; the markup uses
no `style` attribute (the `/` and `/no-such-page` checks of `components.test.ts`).

**D9. The job: `startReminderJob(db, everyMs = 60_000)` returns the stop function.** It
is `setInterval(() => fireDueReminders(db, new Date()), everyMs)`, so the first fire is
one interval from the start (AC6's test sees the mark after `everyMs`, not at once), and
it unrefs the interval so it never keeps the process alive, guarded so a runtime without
`unref` still starts the job:

```ts
export function startReminderJob(db: Database, everyMs = 60_000): () => void {
  const timer = setInterval(() => fireDueReminders(db, new Date()), everyMs);
  if (typeof (timer as { unref?: unknown }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
  return () => clearInterval(timer);
}
```

`src/server.ts` calls `startReminderJob(db)` after `createApp`, before `listen`;
`createApp` does not, so a test's app never starts it. Rejected: `node-cron` (the plan's
job), which is a new dependency for an interval Node already has.

**D10. `public/js/alarm.js` polls, shows, and posts.** An ES5 IIFE. It finds `#alarm` and
returns when there is none. `poll()` is `fetch('/reminders').then((r) => r.json())`, and
when `data.alarms.length > 0` it shows `data.alarms[0]`; it runs once on load and through
`setInterval(poll, 30_000)`, and makes no other request. `show(alarm)` keeps the alarm as
the current one, sets `.alarm__title.textContent = alarm.title` (so a title with markup is
text), clears `#alarm.hidden`, calls `.alarm__sound.play()` with a `.catch` guard, and
calls `announce(alarm.title)`. `hide()` sets `#alarm.hidden = true` and calls
`.alarm__sound.pause()`. Direct `click` listeners are put on each `[data-minutes]`, on
`[data-alarm-dismiss]` and on `[data-alarm-permission]`: a snooze and the dismiss
`fetch(url, { method: 'POST', headers: { 'Content-Type':
'application/x-www-form-urlencoded' }, body })` the alarm's own `snooze`/`dismiss` URL
(`minutes=<n>` or `''`) and then `hide()`; the permission button calls
`Notification.requestPermission()`. `announce` checks `typeof Notification === 'undefined'`
**before** it reads `Notification.permission`; missing or `denied` reveals
`.alarm__blocked`, `granted` makes `new Notification(text)`, and `default` reveals
`.alarm__permission`.

**D11. The sound is a text-only data URI, not a file.** `alarm.ejs` builds
`src="data:audio/wav;base64,…"` from a `SOUND` constant: a short generated beep. 017 D1
rejects binary assets under `public/`, and this keeps the alarm in one text file. The
tests never decode it (jsdom's `play` is stubbed); the hand-check hears it. Rejected: an
`.mp3`/`.wav` file under `public/`, which a merge would carry as binary, and a file the
builder cannot write as text.

**D12. The styles go before the style-guide marker, tokens only.** `.overlay--alarm`,
`.alarm`, `.alarm__title`, `.alarm__sound`, `.alarm__actions`, `.alarm__permission`,
`.alarm__blocked` (in Files). Font sizes from the type scale, spacing from the
`--space-*` tokens, `border-radius: var(--radius)`, colors only from tokens, so
`src/stylesheet.test.ts` holds. No new rule in the `@media (min-width: 900px)` block.

**D13. The jsdom types gain `fetch`, `Notification` and `HTMLMediaElement`.** `src/alarm.test.ts`
stubs the page's `fetch`, `Notification` and `HTMLMediaElement.prototype.play`/`pause`, so
`src/testing/jsdom.d.ts` declares them on `DomWindow` (in Files), the way 013 added `Date`
and `setInterval`.

## Files

Created:

- `src/db/reminders.ts`:

```ts
import type { Database } from './database.ts';

/*
 * The reminder job's own reads and writes. `reminded_at` is not a field of `Task` (see
 * `./tasks.ts`), so the only SQL that names the column lives here.
 */

/** One marked task, as the alarm list needs it. */
export interface AlarmTask {
  id: number;
  title: string;
}

/**
 * Marks every urgent task whose reminder is due at `now` and which was not marked for
 * it: `pending` or `in_progress`, a `reminder_at` that is not null and at or before
 * `now`, and a `reminded_at` that is null or earlier than `reminder_at`. Sets
 * `reminded_at` to `now` and leaves every other column, `updated_at` included, as it is.
 * Returns the number of rows changed.
 */
export function markDueReminders(db: Database, now: string): number {
  return Number(
    db
      .prepare(
        `UPDATE tasks SET reminded_at = ?
          WHERE priority = 'urgent'
            AND status IN ('pending', 'in_progress')
            AND reminder_at IS NOT NULL
            AND reminder_at <= ?
            AND (reminded_at IS NULL OR reminded_at < reminder_at)`,
      )
      .run(now, now).changes,
  );
}

/**
 * The marked tasks whose reminder is due at `now`, in `reminder_at` order then `id`
 * order.
 */
export function listAlarmTasks(db: Database, now: string): AlarmTask[] {
  return db
    .prepare(
      `SELECT id, title FROM tasks
        WHERE priority = 'urgent'
          AND status IN ('pending', 'in_progress')
          AND reminder_at IS NOT NULL
          AND reminder_at <= ?
          AND reminded_at IS NOT NULL
        ORDER BY reminder_at, id`,
    )
    .all(now)
    .map((row) => ({ id: Number(row.id), title: String(row.title) }));
}
```

- `src/services/reminders.ts`:

```ts
import type { Database } from '../db/database.ts';
import { listAlarmTasks, markDueReminders, type AlarmTask } from '../db/reminders.ts';
import { listTasks, updateTask, type Task } from '../db/tasks.ts';
import { MINUTE_MS } from '../dubai.ts';
import { postedValue } from './drafts.ts';
import { taskPath } from './task-list.ts';

/*
 * The urgent reminders: which tasks the job marks as due, the alarm list a page polls,
 * and what Snooze and Dismiss write. Nothing here reads the clock; the caller passes it.
 */

/** The minutes a Snooze button offers, in the order the modal shows them. */
export const SNOOZE_MINUTES = [5, 10, 15] as const;

export type SnoozeMinutes = (typeof SNOOZE_MINUTES)[number];

/** One alarm, as `GET /reminders` answers it. */
export interface Alarm {
  id: number;
  title: string;
  href: string;
  snooze: string;
  dismiss: string;
}

/** Marks every urgent task whose reminder is due at `now` and was not marked for it. Returns how many rows changed. */
export function fireDueReminders(db: Database, now: Date): number {
  return markDueReminders(db, now.toISOString());
}

/** The alarm of one marked task. */
function alarmOf(task: AlarmTask): Alarm {
  const path = taskPath(task.id);
  return { id: task.id, title: task.title, href: path, snooze: `${path}/snooze`, dismiss: `${path}/dismiss` };
}

/** The alarms of every marked task whose reminder is due at `now`, in reminder order then id order. */
export function listAlarms(db: Database, now: Date): Alarm[] {
  return listAlarmTasks(db, now.toISOString()).map(alarmOf);
}

/** Whether any task of the list carries a reminder and is not done, so the layout writes the alarm. */
export function anyReminder(tasks: readonly Task[]): boolean {
  return tasks.some((task) => task.reminder_at !== null && task.status !== 'done');
}

/** The minutes a snooze post asks for, or `undefined` when the field is missing, repeated or not one of the three. */
export function readSnooze(body: unknown): SnoozeMinutes | undefined {
  const value = postedValue(body, 'minutes');
  if (value === null || value === undefined) return undefined;
  return SNOOZE_MINUTES.find((minutes) => String(minutes) === value);
}

/** Moves a task's reminder to `minutes` after `now`, so the alarm leaves the list. `reminded_at` is left as it is. */
export function snoozeTask(db: Database, task: Task, minutes: SnoozeMinutes, now: Date): void {
  updateTask(db, task.id, { reminder_at: new Date(now.getTime() + minutes * MINUTE_MS).toISOString() });
}

/** Takes a task's reminder away, so no later job marks it. */
export function dismissTask(db: Database, task: Task): void {
  updateTask(db, task.id, { reminder_at: null });
}

/**
 * Starts the repeating reminder job: `fireDueReminders` every `everyMs`, the first time
 * one interval from now. Returns the function that stops it. The interval is unref'd, so
 * it does not keep the process alive by itself, which `src/server.ts` needs.
 */
export function startReminderJob(db: Database, everyMs = 60_000): () => void {
  const timer = setInterval(() => fireDueReminders(db, new Date()), everyMs);
  if (typeof (timer as { unref?: unknown }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
  return () => clearInterval(timer);
}
```

- `src/routes/reminders.ts`:

```ts
import { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { listAlarms } from '../services/reminders.ts';
import { requestTime } from './mini-bar.ts';

/**
 * The alarm list the page's script polls: every marked urgent task whose reminder has
 * come due at the request time, as JSON. It reads only the database.
 */
export function createRemindersRouter(deps: AppDeps): Router {
  const router = Router();

  router.get('/reminders', (_req, res) => {
    res.json({ alarms: listAlarms(deps.db, requestTime(res)) });
  });

  return router;
}
```

- `src/views/partials/alarm.ejs`:

```ejs
<%#
  The alarm for an urgent reminder. Hidden until `/js/alarm.js` finds an alarm in
  `GET /reminders`. The layout writes it once, on a page where a task carries a reminder
  and is not done. `SOUND` is a short generated beep: 8 kHz, 8-bit unsigned mono PCM.
-%>
<%
  const SOUND = 'data:audio/wav;base64,UklGRqQHAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YYAHAADIyMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4OMjIyMg4ODg4OMjIyMg4ODg4OMjIyMg4ODg4OMjIyMg4ODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIyDg4ODjIyMjIyDg4ODjIyMjIyDg4ODjIyMjIyDg4ODjIyMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4OMjIyMg4ODg4OMjIyMg4ODg4OMjIyMg4ODg4OMjIyMg4ODg4OMjIyMg4ODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIyDg4ODjIyMjIyDg4ODjIyMjIyDg4ODjIyMjIyDg4ODjIyMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4yMjIyMg4ODg4OMjIyMg4ODg4OMjIyMg4ODg4OMjIyMg4ODg4OMjIyMg4ODg4OMjIyMg4ODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4OMjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIODg4ODjIyMjIyDg4ODjIyMjIyDg4ODjIyMjIyDg4ODjIyMjIyDg4ODjIyMjIyDg4ODjIyMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyDg4ODg4yMjIyMiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=';
-%>
<div class="overlay overlay--alarm" id="alarm" role="alertdialog" hidden>
  <div class="alarm">
    <p class="alarm__title"></p>
    <audio class="alarm__sound" loop src="<%= SOUND %>"></audio>
    <div class="alarm__actions">
      <%- include('button', { button: { label: 'Snooze 5 min', attrs: { 'data-minutes': '5' } } }) -%>
      <%- include('button', { button: { label: 'Snooze 10 min', attrs: { 'data-minutes': '10' } } }) -%>
      <%- include('button', { button: { label: 'Snooze 15 min', attrs: { 'data-minutes': '15' } } }) -%>
      <%- include('button', { button: { label: 'Dismiss', variant: 'ghost', attrs: { 'data-alarm-dismiss': '' } } }) -%>
    </div>
    <p class="alarm__permission" hidden>Allow alerts so urgent tasks can wake you
      <%- include('button', { button: { label: 'Allow alerts', attrs: { 'data-alarm-permission': '' } } }) -%>
    </p>
    <p class="alarm__blocked" hidden>Alerts are blocked. Keep this page open so the alarm can sound.</p>
  </div>
</div>
```

- `public/js/alarm.js`:

```js
/*
 * The in-page alarm. It polls `/reminders` when it loads and every 30 seconds after, and
 * shows the full-screen alarm of the first marked task: the title, a looping sound,
 * Snooze 5, 10 and 15 minutes, and Dismiss. Where the page has the Notifications API it
 * also raises a system notification, and asks for permission when the user allows it.
 * Loaded with `defer` by the layout on a page with a reminder. Its only clock is the
 * interval.
 */
(function () {
  var POLL_MS = 30000;

  var overlay = document.getElementById('alarm');
  if (!overlay) return;

  var title = overlay.querySelector('.alarm__title');
  var sound = overlay.querySelector('.alarm__sound');
  var permission = overlay.querySelector('.alarm__permission');
  var blocked = overlay.querySelector('.alarm__blocked');
  var current = null;

  function announce(text) {
    if (typeof Notification === 'undefined') {
      if (blocked) blocked.hidden = false;
      return;
    }
    if (Notification.permission === 'granted') {
      new Notification(text);
      return;
    }
    if (Notification.permission === 'denied') {
      if (blocked) blocked.hidden = false;
      return;
    }
    if (permission) permission.hidden = false;
  }

  function show(alarm) {
    current = alarm;
    title.textContent = alarm.title;
    overlay.hidden = false;
    if (sound) {
      var playing = sound.play();
      if (playing && typeof playing.catch === 'function') playing.catch(function () {});
    }
    announce(alarm.title);
  }

  function hide() {
    overlay.hidden = true;
    if (sound) sound.pause();
  }

  function post(url, body) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
    });
  }

  var snoozes = overlay.querySelectorAll('[data-minutes]');
  var index;
  for (index = 0; index < snoozes.length; index += 1) {
    (function (button) {
      button.addEventListener('click', function () {
        if (current === null) return;
        post(current.snooze, 'minutes=' + button.getAttribute('data-minutes'));
        hide();
      });
    })(snoozes[index]);
  }

  var dismiss = overlay.querySelector('[data-alarm-dismiss]');
  if (dismiss) {
    dismiss.addEventListener('click', function () {
      if (current === null) return;
      post(current.dismiss, '');
      hide();
    });
  }

  var ask = overlay.querySelector('[data-alarm-permission]');
  if (ask) {
    ask.addEventListener('click', function () {
      if (typeof Notification === 'undefined') return;
      Notification.requestPermission();
    });
  }

  function poll() {
    fetch('/reminders')
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (data.alarms && data.alarms.length > 0) show(data.alarms[0]);
      });
  }

  poll();
  setInterval(poll, POLL_MS);
})();
```

- Tests (see `plan.md`): `src/services/reminders.test.ts`, `src/reminders.test.ts`,
  `src/reminder-job.test.ts`, `src/alarm.test.ts`.

Changed:

- `src/db/migrations.ts`: append the third entry (D1) after migration 2:

```ts
  // 3: when a reminder was fired, so the job does not fire it twice (018).
  `
ALTER TABLE tasks ADD COLUMN reminded_at TEXT CONSTRAINT tasks_reminded_at CHECK (reminded_at GLOB '????-??-??T??:??:??.???Z');
`,
```

- `src/db/migrations.test.ts` (AC11): the count is now three. In the count test
  `it('is the second of two migrations')` becomes `it('is one of three migrations')` and
  `expect(migrations).toHaveLength(2)` becomes `toHaveLength(3)`; in "gives a version 1
  database the rules…" `expect(userVersion(db)).toBe(2)` becomes `toBe(3)`; in "does not
  overwrite rules…" `expect(userVersion(second)).toBe(2)` becomes `toBe(3)`. Nothing else,
  and the migration-1 hash and the `versionOne` assertions (version 1) stay.

- `src/db/schema.test.ts` (AC11): in "has the columns of the plan, then confidence and
  the two timestamps" add `'reminded_at',` after `'updated_at',` (the column is appended
  last); in the timestamp-column `it.each` add `'reminded_at',` after `'reminder_at',`.
  Nothing else.

- `src/db/tasks.ts`: `toTask` becomes D3's version; its doc comment gains the sentence
  about dropping the marker. No other change: `Task`, `TaskFields`, `holdsTimestamp`,
  `taskFields`, `givenFields` and the four helpers are untouched.

- `src/routes/mini-bar.ts`: import `anyReminder` from `../services/reminders.ts` (beside
  the existing imports); add the `alarm` getter of D7 inside the middleware after the
  `miniBar` one; the middleware's doc comment names the two locals. `requestTime` and
  `MiniBar` are unchanged.

- `src/routes/tasks.ts`: import `dismissTask`, `readSnooze`, `snoozeTask` from
  `../services/reminders.ts`; add the two handlers of D6 after the Delete handler; the
  router's doc comment names Snooze and Dismiss. Nothing else.

- `src/app.ts`: `import { createRemindersRouter } from './routes/reminders.ts';` in
  import order (after `./routes/overdue.ts`), and `app.use(createRemindersRouter(deps));`
  after `app.use(createTasksRouter(deps));`, before `createOverdueRouter`.

- `src/server.ts`: `import { startReminderJob } from './services/reminders.ts';` and
  `startReminderJob(db);` after `createApp(...)` and before `app.listen(...)`, with a
  one-line comment that the job watches `reminder_at` while the server runs.

- `src/views/layout.ejs`: in `head`, after the `locals.miniBar` script block, the
  `locals.alarm` script block of D7; after the `locals.miniBar` include, the
  `locals.alarm` include of D7.

- `public/css/base.css` (D12), before `/* ---------- Style guide ---------- */`:

```css
/* The alarm of an urgent reminder: a full-screen overlay over every page. */
.overlay--alarm {
  align-items: center;
  padding: var(--space-4);
  background: var(--urgent-bg);
}

.alarm {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
  max-width: 28rem;
  padding: var(--space-5);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--urgent);
  border-radius: var(--radius);
  box-shadow: 0 var(--space-2) var(--space-8) var(--shadow);
  text-align: center;
}

.alarm__title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
}

.alarm__sound {
  width: 100%;
}

.alarm__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
}

.alarm__permission,
.alarm__blocked {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
```

- `src/testing/jsdom.d.ts` (D13): exported interfaces `DomResponse` (`json():
  Promise<unknown>`), `DomRequestInit` (`method?`, `headers?`, `body?`),
  `DomNotification` (`readonly permission: string`) and `DomNotificationClass`
  (`new (title: string): DomNotification`, `permission: string`,
  `requestPermission(): Promise<string> | undefined`); and in `DomWindow`:

```ts
    /** The page's `fetch`. jsdom has none; a test puts a stub here. */
    fetch: (url: string, init?: DomRequestInit) => Promise<DomResponse>;
    /** The Notifications API. jsdom has none; a test puts a stub here. */
    Notification?: DomNotificationClass;
    /** The media element class, for stubbing `play` and `pause`. */
    HTMLMediaElement: { prototype: { play: () => unknown; pause: () => void } };
```

Not touched:

- `src/db/tasks.ts` beyond `toTask`: `Task`, `TaskFields`, `holdsTimestamp`, the column
  list and the four helpers stay as they are (AC11). `reminder_at` already exists.
- `src/db/migrations.ts` migrations 1 and 2, and `src/db/database.ts`.
- `src/services/task-actions.ts`, `src/services/task-list.ts`, `src/services/drafts.ts`,
  `src/services/scheduler.ts`: used, not changed. `postedValue` and `taskPath` are
  imported as they are.
- `src/views/partials/button.ejs`, `modal.ejs`, `mini-bar.ejs`, `bottom-sheet.ejs` and
  every other 002 partial; `src/views/pages/styleguide.ejs` (no new component section).
- `src/render.ts`, `src/ui.ts`, `src/routes/home.ts`, `src/routes/overdue.ts`,
  `src/routes/timeline.ts`, `src/routes/add.ts`, `src/routes/review.ts`,
  `src/routes/styleguide.ts`.
- `package.json`, `yarn.lock`: no package (D9).
- Every existing `*.test.ts` file but the two of AC11; `src/shell.test.ts`,
  `src/timer-and-mini-bar.test.ts`, `src/components.test.ts`, `src/stylesheet.test.ts`
  and `src/server.test.ts` among them.
- `docs/` unless the builder logs an error; everything under `factory/` but this job's
  `build.md`; `data/`.

## Risks

- **An existing whole-row test breaks on the new column.** `toTask` drops `reminded_at`
  (D3); `tasks.test.ts:89` and `:128` compare a `Task` to a literal of 21 fields and
  `Object.getPrototypeOf(task) === Object.prototype`. The builder runs `yarn test` whole;
  a failure there means the strip is wrong.
- **The migration count assertions.** There are three in `migrations.test.ts` (the
  `toHaveLength`, and two `userVersion(...).toBe(2)`), not one; all three become 3 (AC11).
  `src/db/database.test.ts` uses its own migration lists and stays as it is.
- **The mark writes `updated_at`.** D2's `UPDATE` sets `reminded_at` alone; the AC1 test
  asserts the row's `updated_at` is unchanged, and a `updateTask`-style write would fail
  it.
- **The alarm appears where an existing test counts scripts.** `locals.alarm` is true only
  on a page with a task that has a `reminder_at` and is not `done` (D7). The only existing
  tests that give a task a `reminder_at` are `task-sheet.test.ts` and
  `task-sheet-edit.test.ts`, which assert on forms and text, not on scripts; the pages
  whose script counts are pinned (`/`, `/no-such-page`, `/add`) have no such task.
- **A page that reads `res.locals.alarm` before rendering fails a route that must fail
  itself.** The getter is deferred (D7), like `miniBar`; `src/add-photo.test.ts`'s
  closed-database test is the one that catches a middleware that reads up front.
- **A plain interval keeps the suite alive.** `startReminderJob` unrefs it, guarded so a
  runtime without `unref` still starts (D9). `src/server.test.ts` imports the real
  `server.ts` and starts a job on a stand-in; the suite exiting is the check.
- **The job fires at once or not at all.** `setInterval`'s first fire is after `everyMs`
  (D9); the AC6 test asserts nothing is marked right after the start and everything is
  after `everyMs`, and that the returned stop function ends it.
- **A `minutes` is accepted that should not be, or `reminded_at` is cleared.** AC3's
  `it.each` covers `5`, `10`, `15`, `0`, `30`, `five`, `''`, missing and repeated, and
  asserts `reminded_at` is unchanged; `readSnooze` uses `postedValue`'s `null` for a
  repeated field.
- **The list adds or drops a condition.** AC2's cases pin the four conditions and the
  order; the reading above (no `reminded_at >= reminder_at`) is pinned by a test with a
  marked task whose `reminder_at` was moved before the mark.
- **A script error passes unseen** (`docs/errors/jsdom-page-script-error-does-not-fail-test.md`).
  Every jsdom test asserts `scriptErrors(window)` is empty, the missing-`Notification` case
  included (it would catch a `Notification.permission` read before the existence check).
- **The 30-second poll test asserts before the `fetch` promise resolves.** After
  `clock.advance(30_000)` the test drains the microtasks (an awaited `setTimeout(…, 0)`)
  before it looks at the overlay.
- **Ports run out when a test file is run in a loop**
  (`docs/errors/repeated-test-runs-run-out-of-ports.md`). Run each check once.
- **A reporter writes into the repo**
  (`docs/errors/vitest-json-reporter-writes-a-file-into-the-repo.md`). Default reporter
  only.
