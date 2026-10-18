# 021-calendar-export: design

No spec problem blocks the job. Four readings are needed, and each is a decision below:

- **AC1's signature.** AC1 names `icsFromTasks(tasks)` and also says `now` is one of its
  arguments. The function is `icsFromTasks(tasks, now)` (D1).
- **"A default in `server.ts`" without a migration (AC5, AC7).** The default token is
  not a fixed value (a fixed default would be no secret). `server.ts` calls
  `ensureFeedToken(db)` of the new service once at start: it stores a random token when
  there is none and keeps one that is there. A database that never went through
  `server.ts` (every test database) has no token, and the feed then answers 401 to every
  request (D6, D7).
- **One task "read with `listTasks`" (AC7).** AC7 says the routes read tasks with
  `listTasks`. The single-task route also does, and finds the id in the list, rather
  than calling `getTask` (D4).
- **Drafts in the task and day downloads.** AC2 and AC3 filter on scheduled times only
  ("regardless of status"), so a task of any status, draft included, is exported there
  when it has both times. Only `upcomingTasks` filters on status (AC4).

Checked in a throwaway folder under `$TMPDIR`, importing the repo's own `node_modules` by
absolute path (nothing installed, nothing written in the repo), on Node 26.8.2,
yarn 1.22.22, Express 5.3.0, supertest 7.3.1. The folder was removed afterwards.

- `res.set('Content-Type', 'text/calendar; charset=utf-8')` then `res.send(string)`
  arrives as `text/calendar; charset=utf-8` with the body byte for byte (the CRLFs kept),
  and supertest puts a `text/calendar` body in `res.text`. **Checked.**
- `res.attachment('task-1.ics')` writes `attachment; filename=task-1.ics`, **without the
  quotes** AC2 asks for. `res.set('Content-Disposition', 'attachment; filename="task-1.ics"')`
  arrives exactly as written. So the header is set by hand (D5). **Checked.**
- Express 5's query parser gives `?token=a&token=b` as the array `['a', 'b']`, `?token=`
  as `''`, and `?token[x]=1` as the key `'token[x]'`. So `req.query.token` is read as
  `unknown` and only a non-empty string can match (D7). **Checked.**
- `createHash('sha256').update(s).digest()` on both sides and `timingSafeEqual` of the two
  32-byte digests compare without a length check; `randomBytes(32).toString('base64url')`
  is 43 URL-safe characters. **Checked.**
- `new Date('2026-10-12T09:36:00.000Z').toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')`
  is `20261012T093600Z`. **Checked.**
- Assigning `process.env.TZ` at run time changes `getHours()` of the same `Date` in the
  same process (20, then 12 under `America/New_York`, then 20 under `Asia/Dubai`), so a
  test can switch the process zone around a request (AC6 test). **Checked.**
- `Buffer.byteLength('é')` is 2, and `[...'a😀b']` has 3 entries, so folding by code
  point and counting UTF-8 bytes never splits a character (D3). **Checked.**

Not checked: Node 22 and 24 (26.8.2 is the only Node here), and importing into Google or
Apple Calendar (out of scope, by hand). No prototype was built and the project's build and
test commands were not run.

## Approach

`src/services/calendar.ts` is new and pure except for `ensureFeedToken`: it turns a list
of tasks into iCalendar text (`icsFromTasks`), picks the tasks of a Dubai day
(`tasksOnDay`) and the upcoming ones (`upcomingTasks`), checks a feed token
(`feedTokenMatches`) and stores the default token (`ensureFeedToken`). It never reads the
clock; `now` is always an argument. Times are written straight from the stored UTC
timestamps as `YYYYMMDDTHHMMSSZ`, so no time zone is ever consulted and the events are on
the Dubai clock whatever the process `TZ` (AC6). It also owns the four paths, so 022 can
link to them without repeating strings.

`src/routes/calendar.ts` is new: `createCalendarRouter(deps)` with the four GET routes.
Each reads `listTasks(deps.db)` once and `requestTime(res)` once, filters with the
service, and sends `icsFromTasks(…, now)`. The router is mounted in `createApp` after the
timeline router and before the style guide and the not-found handler. A 404 is `next()`,
so it falls to the app's not-found page, as `src/routes/tasks.ts` does for an unknown id.
A 401 is `res.sendStatus(401)`. These routes render no page, so the mini-bar middleware's
lazy getters never read the database for them (docs/errors/app-middleware-reads-db-before-every-router.md).

`src/db/settings.ts` gains `feed_token: string` in `Settings`. `src/server.ts` calls
`ensureFeedToken(db)` right after the recurring job is started. No migration is added;
`src/db/migrations.ts`, `src/db/settings.test.ts` and `src/db/database.test.ts` are
unchanged (no new row is seeded, no table added).

## Decisions

**D1. `icsFromTasks(tasks: readonly Task[], now: Date): string`.** It keeps the tasks with
both `scheduled_start` and `scheduled_end` non-null, sorts a copy by `scheduled_start`
ascending (string comparison, which is time order for the stored format of
`src/db/timestamps.ts`), ties by `id` ascending, and writes, each line ending in `\r\n`:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//mTask//Task Image AI//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT              (per task)
UID:task-<id>@mtask
DTSTAMP:<icsTime(now)>
DTSTART:<icsTime(scheduled_start)>
DTEND:<icsTime(scheduled_end)>
SUMMARY:<icsText(title)>
END:VEVENT
END:VCALENDAR
```

The text therefore ends with `END:VCALENDAR\r\n` (RFC 5545 ends every content line with
CRLF); AC1's "ends with `END:VCALENDAR`" is read on the text without its last CRLF. The
input array is not sorted in place. The text is built from a list already read, not from
the database (AC1 leaves this to the architect), so the service has no I/O and each route
reads the database once. Rejected: extra properties (`DESCRIPTION`, `STATUS`,
`X-WR-CALNAME`), which the spec does not ask for and no test would hold.

**D2. Times are text arithmetic on the stored UTC string.** `icsTime(at: Date): string`
returns `at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')`. A stored
timestamp goes through `icsTime(new Date(task.scheduled_start))`. No `getHours`, no
`Intl`, no `TZID`: the events are UTC instants, which every calendar shows on its own
clock, and for a Dubai user that is the Dubai clock (AC6). Rejected: `TZID=Asia/Dubai`
with local times, which would need a `VTIMEZONE` block and adds nothing.

**D3. `SUMMARY` is escaped and every line is folded at 75 octets.** `icsText(value)`
replaces `\` with `\\`, `;` with `\;`, `,` with `\,`, and each `\r\n`, `\n` or `\r` with
`\n` (backslash, letter n), in that order (backslash first). `foldLine(line)` splits a
content line longer than 75 UTF-8 octets: walking code points (`for … of`), it starts a
new segment when adding the next code point would make the segment exceed 75 octets for
the first segment or 74 for later ones, and joins segments with `\r\n ` (CRLF and one
space). A line of 75 octets or fewer is returned as it is. Every line goes through
`foldLine`. Both are internal (not exported). This is what makes a long or Arabic title
import (RFC 5545 §3.1 and §3.3.11).

**D4. The four routes, in `src/routes/calendar.ts`.**
- `GET /task/:taskId/ics`: `readId(req.params.taskId)` (`src/routes/review.ts`); the task
  is `listTasks(deps.db).find((task) => task.id === id)`. `next()` when the id is not an
  id, is unknown, or the task lacks either scheduled time. Otherwise
  `sendIcs(res, icsFromTasks([task], now), "task-<id>.ics")`.
- `GET /day/:date/ics`: `dayOfDate(req.params.date)`; `next()` when `undefined`.
  Otherwise `sendIcs(res, icsFromTasks(tasksOnDay(listTasks(deps.db), day), now), "day-<date>.ics")`.
- `GET /upcoming/ics`: `sendIcs(res, icsFromTasks(upcomingTasks(listTasks(deps.db), now), now), 'upcoming.ics')`.
- `GET /calendar.ics`: when `feedTokenMatches(getSetting(deps.db, 'feed_token'), req.query.token)`
  is false, `res.sendStatus(401)` and nothing else (the tasks are not read). Otherwise
  the same body as `/upcoming/ics`, sent by `sendIcs(res, text, null)`.

`now` is `requestTime(res)` (`src/routes/mini-bar.ts`), read once at the top of each
handler that sends a body. `tasksOnDay(tasks, day)` keeps the tasks with both times whose
`dubaiDay(Date.parse(scheduled_start)) === day`, any status. `upcomingTasks(tasks, now)`
keeps `status` `pending` or `in_progress` with `scheduled_start !== null` and
`Date.parse(scheduled_start) >= now.getTime()`, sorted by `scheduled_start` then `id`, on
a copy. It does not require `scheduled_end`; `icsFromTasks` drops a task without one.

**D5. `sendIcs(res, text, filename: string | null)` sets the headers by hand.**
`Content-Type: text/calendar; charset=utf-8` always; `Content-Disposition:
attachment; filename="<filename>"` when a filename is given, set with `res.set`, because
`res.attachment` drops the quotes (checked). The feed gets no `Content-Disposition`: a
calendar subscribes to it, it is not a download. Then `res.send(text)` with status 200.
`sendIcs` is a module-level function of `src/routes/calendar.ts`, not exported.

**D6. The default token is random and stored by `server.ts` at start.**
`ensureFeedToken(db: Database): string` returns the stored `feed_token` when it is a
non-empty string; otherwise it stores `randomBytes(32).toString('base64url')` with
`setSetting` and returns it. `src/server.ts` calls it once, after `startRecurrence(db)`
and before `createApp`. A restart keeps the token, so a subscribed calendar keeps
working. Rejected: a migration seeding a token (AC7 forbids one, and a seeded constant
would be the same in every install); creating the token in `createApp` (the spec puts the
default in `server.ts`, and `createApp` writes nothing today); a fixed default string
(no secret).

**D7. The token check fails closed and compares digests.**
`feedTokenMatches(stored: string | undefined, given: unknown): boolean` is false when
`stored` is `undefined` or `''`, or when `given` is not a non-empty string (missing,
`''`, an array from a repeated key). Otherwise it is
`timingSafeEqual(sha256(stored), sha256(given))`, `sha256` being
`createHash('sha256').update(value).digest()`. Hashing makes both sides 32 bytes, so
`timingSafeEqual` never throws on a length difference and the length is not leaked.

**D8. The paths live in the service.** `src/services/calendar.ts` exports
`FEED_PATH = '/calendar.ics'`, `UPCOMING_ICS_PATH = '/upcoming/ics'`,
`taskIcsPath(id: number): string` (`/task/<id>/ics`) and
`dayIcsPath(date: string): string` (`/day/<date>/ics`). The router mounts
`'/task/:taskId/ics'`, `'/day/:date/ics'`, `UPCOMING_ICS_PATH` and `FEED_PATH`. 022 links
with these; nothing in this job renders them.

**D9. `src/server.test.ts` gains one mock and one test, no assertion changes.** Its
`openDatabase` returns a stand-in `{ name: … }`, so a real `ensureFeedToken` would throw
at import. `vi.doMock('./services/calendar.ts', () => ({ ensureFeedToken }))` in
`beforeEach`, `vi.doUnmock('./services/calendar.ts')` in `afterEach`, as for
`./services/recurrence.ts` (016 D9).

## Files

Created:
- `src/services/calendar.ts`:
  - `export const FEED_PATH = '/calendar.ics'`
  - `export const UPCOMING_ICS_PATH = '/upcoming/ics'`
  - `export function taskIcsPath(id: number): string`
  - `export function dayIcsPath(date: string): string`
  - `export function icsTime(at: Date): string` (D2)
  - `export function icsFromTasks(tasks: readonly Task[], now: Date): string` (D1, D3)
  - `export function tasksOnDay(tasks: readonly Task[], day: number): Task[]` (D4)
  - `export function upcomingTasks(tasks: readonly Task[], now: Date): Task[]` (D4)
  - `export function feedTokenMatches(stored: string | undefined, given: unknown): boolean` (D7)
  - `export function ensureFeedToken(db: Database): string` (D6)
  - internal `icsText`, `foldLine`, `sha256`.
  Imports: `node:crypto` (`createHash`, `randomBytes`, `timingSafeEqual`),
  `import type { Database }`, `import type { Task }`, `getSetting`/`setSetting`,
  `dubaiDay` from `../dubai.ts`.
- `src/routes/calendar.ts`: `export function createCalendarRouter(deps: AppDeps): Router` (D4, D5).
- `src/testing/ics.ts`: `export interface IcsEvent { [name: string]: string }` and
  `export function parseIcs(text: string): { lines: string[]; events: IcsEvent[] }`.
  It unfolds (removes every `\r\n` followed by one space or tab), splits on `\r\n`
  (dropping the one empty string after the final CRLF), and for each
  `BEGIN:VEVENT`…`END:VEVENT` maps each `NAME:value` line (split at the first `:`) to an
  entry. It throws when the text contains a bare `\n` not preceded by `\r`, so a test
  fails on LF-only output.
- `src/services/calendar.test.ts` and `src/calendar-export.test.ts` (see the plan).

Changed:
- `src/db/settings.ts`: add to `Settings`
  `/** The secret the calendar feed's URL carries as \`?token=\` (021). */ feed_token: string;`
- `src/app.ts`: `import { createCalendarRouter } from './routes/calendar.ts';` and
  `app.use(createCalendarRouter(deps));` right after `app.use(createTimelineRouter(deps));`.
- `src/server.ts`: `import { ensureFeedToken } from './services/calendar.ts';` and, after
  `startRecurrence(db);`, a comment line and `ensureFeedToken(db);`.
- `src/server.test.ts`: the mock of D9 and one test (plan, AC5).

Not touched:
- `src/db/migrations.ts` and every migration test: no migration (AC7).
- `src/db/tasks.ts`: `listTasks` already gives everything; no new query.
- `src/routes/mini-bar.ts`: `requestTime` is used as it is.
- `src/routes/tasks.ts`, `src/services/task-list.ts`: the export routes are `/task/…`, not
  under `LIST_PATH`, and the sheet gets no download button (022).
- `src/testing/app.ts`: the test app stays tokenless; tests set the token with `setSetting`.
- Views, `public/`, `src/ui.ts`: nothing is rendered.
- `package.json`: no dependency; iCalendar is written by hand.

## Risks

- **LF instead of CRLF, or a missing final CRLF.** `parseIcs` throws on a bare LF, and a
  service test asserts `text.endsWith('END:VCALENDAR\r\n')`.
- **The process zone leaking into times (AC6).** The AC6 route test runs the request with
  `process.env.TZ = 'America/New_York'` and restores the old value in `finally`; any use
  of local getters would shift the hour by 8.
- **UTC day instead of Dubai day (AC3).** A task at `2026-10-12T19:59:00.000Z`
  (23:59 Dubai, 12 Oct) must be in `2026-10-12`, and one at `2026-10-12T20:00:00.000Z`
  (00:00 Dubai, 13 Oct) must be in `2026-10-13` and not in `2026-10-12`. A UTC day puts
  both on 12 Oct.
- **Order by id instead of start.** Fixtures create the later task first, so id order and
  start order differ.
- **`res.attachment` quietly used.** The header test asserts the exact string with quotes.
- **Feed open when no token is configured.** A test with no `feed_token` setting asserts
  401 even for `?token=` and for a guessed token; a unit test covers `stored === ''`.
- **Repeated `token` key throwing.** A test sends `?token=<right>&token=<right>` and
  expects 401, not 500.
- **`server.test.ts` breaking at import.** D9's mock; without it every server test fails.
- **Fake timers leaking.** Route tests call `vi.useRealTimers()` in `afterEach`.
- **Folding splitting a character.** A test with a long Arabic title asserts each line is
  at most 75 octets and the unfolded `SUMMARY` equals the title.
