# 021-calendar-export: build

Branch `factory/021-calendar-export`, code commit `d1994bf`. Built on Node v26.8.2 and yarn 1.22.22.

## What changed

Created:

| File | Why |
| --- | --- |
| `src/services/calendar.ts` | `icsFromTasks`, `icsTime`, `tasksOnDay`, `upcomingTasks`, `feedTokenMatches`, `ensureFeedToken`, the paths; internal `icsText`, `foldLine`, `sha256` (D1, D2, D3, D4, D6, D7, D8) |
| `src/routes/calendar.ts` | `createCalendarRouter` with the four GET routes and `sendIcs` (D4, D5) |
| `src/testing/ics.ts` | `parseIcs` for tests: unfolds, splits on CRLF, throws on a bare LF (Files) |
| `src/services/calendar.test.ts` | Service tests for AC1, AC3, AC4, AC5 (plan) |
| `src/calendar-export.test.ts` | Route tests for AC2 to AC7 (plan) |

Changed:

| File | Why |
| --- | --- |
| `src/db/settings.ts` | `feed_token: string` added to `Settings` (AC5, Files) |
| `src/app.ts` | Mounts the calendar router after the timeline router, before the style guide and the not-found handler (AC7) |
| `src/server.ts` | Calls `ensureFeedToken(db)` after `startRecurrence(db)` (D6) |
| `src/server.test.ts` | Mock of `./services/calendar.ts` and one test of the call order (D9) |

## Acceptance criteria

| Criterion | Test | Fails when | Result |
| --- | --- | --- | --- |
| AC1 | `src/services/calendar.test.ts` › icsFromTasks (AC1) | `icsTime(now)` replaced with `icsTime(new Date())`: "stamps the events with the now it is given" and "writes one event…" failed. Also: sort removed, "orders the events by start" failed; end-time check removed, "writes no event for a task without both scheduled times" failed; `\r\n` to `\n`, 9 tests failed; folding counting UTF-16 units instead of bytes, "folds an Arabic title" failed | PASS |
| AC2 | `src/calendar-export.test.ts` › GET /task/:id/ics (AC2) | Quotes dropped from the filename: "downloads the task as a calendar file" failed. Also: every task sent, "holds exactly that task" failed; scheduled-time check removed, "is not found for a task with no scheduled times" failed | PASS |
| AC3 | `src/calendar-export.test.ts` › GET /day/:date/ics (AC3), `tasksOnDay (AC3)` | UTC day instead of `dubaiDay`: "cuts the day at Dubai midnight, not UTC midnight" and the `tasksOnDay` test failed. Also: `day === undefined` check removed, the three "is not found for …" failed | PASS |
| AC4 | `upcomingTasks (AC4)`, `GET /upcoming/ics and the feed (AC4)` | Status filter changed to `!== 'draft'`: "keeps pending and in-progress tasks…" and "downloads the pending and in-progress tasks still to come" failed. Also `>=` to `>`: "keeps a task starting at now…" failed | PASS |
| AC5 | `the feed token (AC5)`, `feedTokenMatches (AC5)`, `ensureFeedToken (AC5)`, `src/server.test.ts` › 021 AC5 | Guard replaced with `if (false)`: 7 "refuses …" tests failed. Also: empty stored token allowed, "is false for an empty token against an empty stored one" failed; case-insensitive compare, "refuses the token in other case" failed; keeping the stored token removed, "keeps the token it stored" failed; `ensureFeedToken(db)` removed from `server.ts`, the server test failed | PASS |
| AC6 | `times on the Dubai clock (AC6)` | `DTSTART` built from local getters (`getHours` etc.): both TZ cases and "holds exactly that task" failed | PASS |
| AC7 | `the clock of a request (AC7)`, route tests | `/upcoming/ics` with a fixed date instead of `requestTime(res)`: "stamps and filters with the time of the request" failed. Router mounted after the not-found handler: every 200 route test failed (8 shown) | PASS |
| AC8 | the whole suite | Full `yarn test` with `ANTHROPIC_API_KEY` unset: 2157 passed; `git status --porcelain data/` printed nothing | PASS |

Checked by hand: `icsFromTasks` on one task titled `Buy groceries, milk`, run with
`node -e`, gave
`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//mTask//Task Image AI//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\nUID:task-3@mtask\r\nDTSTAMP:20261012T093600Z\r\nDTSTART:20261012T160000Z\r\nDTEND:20261012T164000Z\r\nSUMMARY:Buy groceries\, milk\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`.
Importing into Google or Apple Calendar was not done; the spec leaves it out of scope.

## Test run

`yarn build`:

```
$ tsc --noEmit
Done in 1.28s.
```

`env -u ANTHROPIC_API_KEY yarn test`:

```
 Test Files  80 passed (80)
      Tests  2157 passed (2157)
Done in 4.72s.
```

```
VERIFICATION
Build: PASS
Tests: PASS   (2157 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped.
