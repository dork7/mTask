# 021-calendar-export: plan

Decision numbers (D1, D2, …) refer to `design.md`.

## Steps

1. **The setting key.** Files: `src/db/settings.ts`. Serves AC5.
   - Add `feed_token: string` to `Settings`, with the doc comment of design.md (Files).
   - Check: `yarn build`.

2. **The service.** Files: `src/services/calendar.ts`. Serves AC1, AC3, AC4, AC5, AC6.
   - Write the exports of design.md (Files) as D1, D2, D3, D4, D6, D7 and D8 say. Every
     line of the text ends in `\r\n` and goes through `foldLine`. Sort copies, never the
     input. No `new Date()` without an argument, no `Date.now()`, no local getters.
   - Check: `yarn vitest run src/services/calendar.test.ts`.

3. **The parser for tests.** Files: `src/testing/ics.ts`. Serves AC6, AC8.
   - `parseIcs` as design.md (Files) says.
   - Check: used by the tests of steps 2 and 4.

4. **The router.** Files: `src/routes/calendar.ts`, `src/app.ts`. Serves AC2, AC3, AC4,
   AC5, AC7.
   - `createCalendarRouter(deps)` with the four routes of D4 and `sendIcs` of D5.
   - In `createApp`, `app.use(createCalendarRouter(deps));` right after
     `app.use(createTimelineRouter(deps));`, so before the style guide and the not-found
     handler.
   - Check: `yarn vitest run src/calendar-export.test.ts`.

5. **The default token.** Files: `src/server.ts`, `src/server.test.ts`. Serves AC5, AC7.
   - In `server.ts`, import `ensureFeedToken` and call `ensureFeedToken(db);` after
     `startRecurrence(db);`, with the comment
     `// The calendar feed's secret: made once, kept across restarts (021).`
   - In `server.test.ts`, `const ensureFeedToken = vi.fn();`, the `doMock`/`doUnmock` pair
     of D9, and the test listed under AC5.
   - Check: `yarn vitest run src/server.test.ts`.

6. **Whole suite.** Serves AC8.
   - Run with `ANTHROPIC_API_KEY` unset.
   - Check: `yarn build` and `yarn test` pass, and `git status --porcelain data/` prints
     nothing.

## Tests

Shared setup.

- `src/services/calendar.test.ts` is pure: tasks are plain `Task` objects from a local
  `task(fields: Partial<Task> & { id: number }): Task` that fills every other field with
  `null`, `title: 'Task'`, `status: 'pending'`, and `created_at`/`updated_at`
  `'2026-10-01T00:00:00.000Z'`. `NOW = new Date('2026-10-12T09:36:00.000Z')`. Only
  `ensureFeedToken` uses a database: `openDatabase(':memory:')`, closed in `afterEach`.
- `src/calendar-export.test.ts` uses `createTestApp()` (`src/testing/app.ts`), closed in
  `afterEach`, `supertest` on `testApp.app`, and `createTask` to store tasks.
  `beforeEach`: `vi.useFakeTimers({ toFake: ['Date'] })` and
  `vi.setSystemTime(new Date('2026-10-12T09:36:00.000Z'))`; `afterEach`:
  `vi.useRealTimers()`. Bodies are read with `parseIcs(res.text)`.
- The grocery task of AC6: `{ title: 'Buy groceries', status: 'pending', time_slot: 'night',
  scheduled_start: '2026-10-12T16:00:00.000Z', scheduled_end: '2026-10-12T16:40:00.000Z' }`.
- Wherever order is tested, the later task is created first, so id order is not start
  order.

### AC1: `src/services/calendar.test.ts`

- `icsTime(new Date('2026-10-12T09:36:00.000Z'))` is `20261012T093600Z`.
- With no task, the text starts with `BEGIN:VCALENDAR\r\n`, ends with `END:VCALENDAR\r\n`,
  has the lines `VERSION:2.0`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH` and one starting
  `PRODID:`, and `parseIcs` finds no event.
- `parseIcs` of a text with two scheduled tasks does not throw (no bare LF) and every line
  of `text.split('\r\n')` is CRLF-terminated (the split leaves exactly one trailing `''`).
- One task with both times gives exactly one event with `UID:task-<id>@mtask`,
  `DTSTAMP:20261012T093600Z`, `DTSTART`, `DTEND` and `SUMMARY` equal to the title.
- `DTSTAMP` follows `now`: built with `new Date('2027-01-02T03:04:05.000Z')`, it is
  `20270102T030405Z` (fails if the clock is read inside).
- A task with no times, one with only `scheduled_start`, and one with only
  `scheduled_end` give no event; mixed with one full task, exactly one event.
- Three tasks given in id order 1, 2, 3 with starts 18:00, 09:00, 12:00 give events in
  the order 2, 3, 1; the input array is unchanged afterwards (`toEqual` its ids `[1, 2, 3]`).
- A title `Milk, eggs; bread \ jam` plus a newline and `more` gives
  `SUMMARY:Milk\, eggs\; bread \\ jam\nmore` after unfolding.
- A 200-character ASCII title: every line is at most 75 bytes
  (`Buffer.byteLength`), continuation lines start with one space, and the unfolded
  `SUMMARY` equals the title.
- A title of 60 Arabic letters (`'م'.repeat(60)`, 120 bytes): every line is at most 75
  bytes and the unfolded `SUMMARY` equals the title (fails if a fold splits a character).

### AC2: `src/calendar-export.test.ts`

- `GET /task/<id>/ics` of the grocery task: 200, `content-type` matches
  `/^text\/calendar/`, `content-disposition` is exactly
  `attachment; filename="task-<id>.ics"`.
- Its body has exactly one event, `SUMMARY:Buy groceries`, `DTSTART:20261012T160000Z`,
  `DTEND:20261012T164000Z`, with a second scheduled task stored beside it that is not in
  the body.
- 404 for an id that does not exist (`/task/999/ics`).
- 404 for a stored task with no scheduled times.
- 404 for an id that is not an id (`/task/abc/ics`).

### AC3: `src/calendar-export.test.ts` and `src/services/calendar.test.ts`

- Route: `GET /day/2026-10-12/ics` with a pending task, a done task and an in-progress
  task on that Dubai day, one on 13 Oct and one with no times: 200, `text/calendar`,
  `content-disposition` `attachment; filename="day-2026-10-12.ics"`, and exactly the
  three events of the day (by `UID`), ordered by start.
- Route: a task at `2026-10-12T19:59:00.000Z` is in `/day/2026-10-12/ics`; a task at
  `2026-10-12T20:00:00.000Z` is not in it and is in `/day/2026-10-13/ics`.
- Route: `GET /day/2026-10-20/ics` with no task that day: 200, a VCALENDAR with no event.
- Route: 404 for `/day/2026-02-30/ics`, `/day/2026-13-01/ics` and `/day/12-10-2026/ics`.
- Service: `tasksOnDay` keeps a `draft` and a `done` task of that day and drops a task of
  that day with no `scheduled_end`.

### AC4: `src/services/calendar.test.ts` and `src/calendar-export.test.ts`

- `upcomingTasks` keeps a `pending` and an `in_progress` task after `now` and drops a
  `done` and a `draft` one at the same time.
- It keeps a task starting exactly at `now` and drops one starting 1 ms before.
- It drops a pending task with no `scheduled_start`.
- It orders by start: tasks given as ids 1, 2 with starts 18:00, 12:00 come back 2, 1;
  the input is unchanged.
- Route: `GET /upcoming/ics` with no token: 200, `text/calendar`,
  `content-disposition` `attachment; filename="upcoming.ics"`, and exactly the events of
  the future pending and in-progress tasks (a past pending task and a future done task
  absent), ordered by start.
- Route: with `setSetting(db, 'feed_token', 'secret-1')`, `GET /calendar.ics?token=secret-1`
  answers a body whose `UID` list equals that of `/upcoming/ics`, and has no
  `content-disposition` header.

### AC5: `src/calendar-export.test.ts`, `src/services/calendar.test.ts`, `src/server.test.ts`

- Route, token `secret-1` set: `?token=secret-1` is 200 `text/calendar`; no `token` is
  401; `?token=` is 401; `?token=secret-2` is 401; `?token=secret-1&token=secret-1` is
  401; `?token=SECRET-1` is 401.
- Route, no `feed_token` setting: `/calendar.ics` and `/calendar.ics?token=` are 401.
- Route: the 401 body contains no `BEGIN:VCALENDAR`.
- Route: `/task/<id>/ics`, `/day/2026-10-12/ics` and `/upcoming/ics` answer 200 with no
  token while `feed_token` is set.
- Service: `feedTokenMatches('abc', 'abc')` is true; `('abc', 'abd')`, `('abc', 'ab')`,
  `('abc', undefined)`, `('abc', ['abc'])`, `('', '')` and `(undefined, 'abc')` are false.
- Service: `ensureFeedToken` on a new database stores a token of 43 characters matching
  `/^[A-Za-z0-9_-]+$/` and returns it (`getSetting(db, 'feed_token')` equals the return).
- Service: called twice, it returns the same token; with `feed_token` set to `'kept'`
  beforehand, it returns `'kept'` and leaves it; with `''` stored, it replaces it.
- Service: two new databases get different tokens.
- `src/server.test.ts`: "stores the feed token once, on the database it opened, before it
  listens": `ensureFeedToken` called once, `mock.calls[0][0]` is `toBe(database)`, and its
  `invocationCallOrder[0]` is after `openDatabase`'s and before `listen`'s.

### AC6: `src/calendar-export.test.ts`

- With the grocery task stored, `process.env.TZ` set to `'America/New_York'` (the old
  value saved and restored in `finally`, deleting the key when it was unset),
  `GET /task/<id>/ics` and `GET /day/2026-10-12/ics` each give an event with
  `DTSTART:20261012T160000Z` and `DTEND:20261012T164000Z`.
- The same under `'Asia/Dubai'` gives the same two lines.

### AC7: `src/calendar-export.test.ts`

- `DTSTAMP` of `/upcoming/ics` is `20261012T093600Z`, the faked clock; after
  `vi.setSystemTime(new Date('2026-10-12T10:00:00.000Z'))` a second request gives
  `20261012T100000Z` and drops a pending task that started at 09:45.
- The routes are mounted before the not-found handler: `/upcoming/ics` is 200 and
  `text/calendar`, not the HTML 404 page (covered by AC4's route test; fails if mounted
  after the handler).
- No migration: the unchanged `src/db/migrations.test.ts` keeps passing (no new test).

### AC8

- Step 6: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset, and
  `git status --porcelain data/` is empty. Every route test runs on `createTestApp()`'s
  in-memory database.
