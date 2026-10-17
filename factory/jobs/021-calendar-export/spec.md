# 021-calendar-export: .ics downloads and the calendar feed

Confirmed tasks have times now: job 009's scheduler stores `scheduled_start` and
`scheduled_end` (UTC timestamps, `src/db/timestamps.ts`) on every task it places, and
`src/db/tasks.ts` still holds the title, priority, slot and status of each. This job
turns those into iCalendar (` .ics`) events and serves them, so a task, a day or the
whole week can be handed to an outside calendar. It adds `src/services/calendar.ts`,
which builds the text, and four routes: one `.ics` for a single task, one for a Dubai
day, one for all upcoming tasks, and the subscribable `/calendar.ics` feed. It reads
what 009 wrote and what the app already has: the scheduled times, title and status from
`listTasks` (`src/db/tasks.ts`), the Dubai clock from `src/dubai.ts`, and it needs no
migration, because the two columns already exist.

The plan's task 15 lists a `.ics` for a single task, a day and all upcoming tasks "plus
a subscribable `/calendar.ics` feed", and leaves Google Calendar OAuth out. The backlog
adds one thing the plan does not say: the feed is guarded by a secret token in its URL
(backlog decision 4, the "one user, no accounts" default). This spec takes that as the
default, as it says, and guards only `/calendar.ics`; the three downloads take no token.
The only check the backlog leaves to a device is the file importing into Google and
Apple Calendar.

## Acceptance criteria

- **AC1**: `src/services/calendar.ts` exports `icsFromTasks(tasks)`, which returns
  iCalendar text and never reads the clock: `now` is one of its arguments and `DTSTAMP`
  is `now` in UTC (`2026-10-12T09:36:00.000Z` becomes `20261012T093600Z`). The text
  starts with `BEGIN:VCALENDAR`, contains `VERSION:2.0`, `PRODID`, `CALSCALE:GREGORIAN`
  and `METHOD:PUBLISH`, and ends with `END:VCALENDAR`. A task with both scheduled times
  contributes one `BEGIN:VEVENT`/`END:VEVENT` pair holding `UID`, `DTSTAMP`, `DTSTART`,
  `DTEND` and `SUMMARY`; a task with no scheduled times contributes none. Events are
  ordered by `scheduled_start` ascending. Whether the text is built from the database or
  from a task list already read is the architect's choice.
- **AC2**: One task. `GET /task/:id/ics` answers 404 when the id is unknown or the task
  has no scheduled times, and otherwise 200 with `Content-Type: text/calendar` and
  `Content-Disposition: attachment; filename="task-<id>.ics"`. The body has exactly one
  VEVENT whose `SUMMARY` is the task's title, whose `DTSTART` is its `scheduled_start`
  and whose `DTEND` is its `scheduled_end`, each a UTC `YYYYMMDDTHHMMSSZ` string.
- **AC3**: One day. `GET /day/:date/ics`, `:date` a `YYYY-MM-DD` on the Dubai clock,
  answers 404 when `dayOfDate` (`src/dubai.ts`) returns none, and otherwise 200 with one
  VEVENT per task whose `scheduled_start` is on that Dubai day and that has both
  scheduled times, regardless of status; an empty day is a valid empty calendar (a
  VCALENDAR with no VEVENT).
- **AC4**: Upcoming and feed content. `upcomingTasks(tasks, now)` returns the tasks with
  status `pending` or `in_progress` and a `scheduled_start` at or after `now`, ordered by
  start. `GET /upcoming/ics` serves `icsFromTasks(upcomingTasks(listTasks(...), now))`
  with no token; `GET /calendar.ics` serves the same list, guarded by a token (AC5).
- **AC5**: The feed is guarded by a secret token, the backlog's default for "one user,
  no accounts" (decision 4). `GET /calendar.ics` reads `?token=`, compares it to the
  `feed_token` setting (the architect adds the key to the `Settings` type in
  `src/db/settings.ts` and a default in `server.ts`), and answers 401 when it is missing
  or wrong and 200 when it matches. The three downloads in AC2 and AC3 take no token.
- **AC6**: Times in Asia/Dubai. A test parses the served text and checks the times: a
  `night` grocery task stored at `2026-10-12T16:00:00.000Z` to `2026-10-12T16:40:00.000Z`
  (8:00-8:40 PM on the Dubai clock) yields `DTSTART:20261012T160000Z` and
  `DTEND:20261012T164000Z`. The times come straight from the stored UTC timestamps, so
  they are the Dubai clock whatever the process `TZ`.
- **AC7**: Wiring. The routes are mounted in `createApp` (before the not-found handler),
  read tasks with `listTasks`, and read the clock once per request from
  `requestTime(res)` (`src/routes/mini-bar.ts`) or the faked `Date` the existing tests
  use, passing it to the service. No migration is added.
- **AC8**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. Tests parse
  the `.ics` and check the times (AC6), the status codes (AC2, AC3, AC5) and the token
  (AC5); they run against an in-memory database and leave nothing in `data/`.

## Out of scope

- Importing the file into Google or Apple Calendar. The backlog lists it under "Checked
  by hand, not by tests"; the format follows RFC 5545 so it imports, but that is not
  tested here.
- Google Calendar OAuth sync. The plan leaves it as a follow-up to `.ics`; 022 shows the
  feed URL and the `.ics` download buttons in the settings UI.
- Editing or creating tasks from the feed. The feed is a read-only export; reschedule
  and mark done are 010 and 011.
- A token page or a way to change the token. 022 shows the feed URL with a copy button;
  the token itself is a setting the architect defaults, and its editing is 022.
- Excluding `done` tasks from a day. A day shows every task on it (AC3); only the
  upcoming feed and the feed drop `done` and `draft` (AC4).
- Time zones. Asia/Dubai is fixed, as the plan's shared context says and `src/dubai.ts`
  assumes; there is no time zone setting.
- Checked by hand: the file importing into Google and Apple Calendar (backlog).
