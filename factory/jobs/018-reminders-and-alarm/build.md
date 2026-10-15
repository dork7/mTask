# 018-reminders-and-alarm: build

Branch `factory/018-reminders-and-alarm`, code commit `ba305aa` ("018-reminders-and-alarm:
mark due urgent reminders and show the in-page alarm"). Built on Node 26.8.2, yarn 1.22.22.

## What changed

Created:

| File | Why |
|---|---|
| `src/db/reminders.ts` | The only SQL that names `reminded_at`: `markDueReminders` (D2) and `listAlarmTasks` (D2). `Task` keeps its 21 fields. |
| `src/services/reminders.ts` | The behaviour: `fireDueReminders`, `listAlarms`, `anyReminder`, `readSnooze`, `snoozeTask`, `dismissTask`, `startReminderJob` (D4, D9). |
| `src/routes/reminders.ts` | `GET /reminders`, the alarm list as JSON, mounted after `createTasksRouter` (D5). |
| `src/views/partials/alarm.ejs` | One hidden `#alarm` overlay with the title, looping sound, four buttons, the permission prompt and the blocked fallback (D8, D11). |
| `public/js/alarm.js` | Polls `/reminders` on load and every 30 s, shows the first alarm, plays the sound, posts Snooze and Dismiss, and announces where the Notifications API exists (D10). |
| `src/services/reminders.test.ts` | AC1. |
| `src/reminders.test.ts` | AC2, AC3, AC4, AC5, AC7. |
| `src/reminder-job.test.ts` | AC6. |
| `src/alarm.test.ts` | AC8, AC9, AC10. |

Changed:

| File | Why |
|---|---|
| `src/db/migrations.ts` | Appends migration 3, the nullable `reminded_at` column with the `reminder_at` GLOB (D1). |
| `src/db/migrations.test.ts` | The count and the two `userVersion` assertions become 3; one test title (AC11). |
| `src/db/schema.test.ts` | The tasks column list and the timestamp-column list gain `reminded_at` (AC11). |
| `src/db/tasks.ts` | `toTask` drops `reminded_at`, so every returned object still has 21 fields (D3). |
| `src/routes/mini-bar.ts` | Adds the deferred, enumerable `res.locals.alarm` getter beside `miniBar` (D7). |
| `src/routes/tasks.ts` | Adds the Snooze and Dismiss posts after Delete, each behind `findListedTask` (D6). |
| `src/app.ts` | Mounts `createRemindersRouter` after `createTasksRouter` (D5). |
| `src/server.ts` | Starts the job once after `createApp`, before `listen` (D9). |
| `src/views/layout.ejs` | Writes `/js/alarm.js` and `partials/alarm` when `locals.alarm` (D7). |
| `public/css/base.css` | The alarm styles before the style-guide marker, tokens only (D12). |
| `src/testing/jsdom.d.ts` | `DomResponse`, `DomRequestInit`, `DomNotification`, `DomNotificationClass` and the three `DomWindow` members (D13). |

## Acceptance criteria

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1 fire rule | `src/services/reminders.test.ts`: "marks every urgent, due, pending or in progress task and leaves the others alone" | I dropped `AND status IN ('pending', 'in_progress')` from `markDueReminders`; that test failed (1 failed, 3 passed). | PASS |
| AC2 alarm list | `src/reminders.test.ts`: "answers tasks with the same reminder in id order, and an earlier reminder first" | I changed `ORDER BY reminder_at, id` to `ORDER BY id`; that test failed (1 failed, 22 passed). | PASS |
| AC3 Snooze | `src/reminders.test.ts`: "moves the reminder 5 minutes past the request time" | I dropped `minutes * MINUTE_MS` from `snoozeTask`, so the new time was the request time; the three `it.each` cases and "does not fire again until the new reminder comes due" failed (4 failed, 19 passed). | PASS |
| AC4 Dismiss | `src/reminders.test.ts`: "takes the reminder away, so no later job marks it" | I made `dismissTask` a no-op; that test failed (1 failed, 22 passed). | PASS |
| AC5 unknown task | `src/reminders.test.ts`: "answers 404 for /tasks/2/... and writes no row" | I replaced `findListedTask` with `getTask(Number(...))` in the Snooze route, so a draft and a malformed id were written; `2`, `01` and `1e0` failed (3 failed, 20 passed). | PASS |
| AC6 the job | `src/reminder-job.test.ts`: "fires one interval from the start, not at once" | I called `fireDueReminders` at the start of `startReminderJob`; three tests failed (3 failed, 1 passed). | PASS |
| AC7 alarm markup | `src/reminders.test.ts`: "renders neither on a page with no reminder that is not done" | I dropped `&& task.status !== 'done'` from `anyReminder`; that test failed (1 failed, 22 passed). | PASS |
| AC8 showing an alarm | `src/alarm.test.ts`: "shows the one alarm, with the title as text and the sound playing" | I wrote the title with `innerHTML` in `alarm.js`, so `<b>x</b>` made a `b` element; that test failed (1 failed, 8 passed). | PASS |
| AC9 Snooze and Dismiss from the modal | `src/alarm.test.ts`: "posts the chosen snooze and hides the alarm" | I posted `'minutes='` with no value; that test failed (1 failed, 8 passed). | PASS |
| AC10 permission and fallback | `src/alarm.test.ts`: "keeps the alarm and does not throw when Notification does not exist" | I removed the `typeof Notification === 'undefined'` guard from `announce`, so the page threw on `Notification.permission`; that test failed (1 failed, 8 passed). | PASS |
| AC11 build and tests | `src/db/migrations.test.ts`: "is one of three migrations"; `src/db/schema.test.ts`: "has the columns of the plan, then confidence and the two timestamps" | I removed migration 3; the two count assertions, the two column-list assertions and the `reminded_at` timestamp case failed (5 failed, 73 passed). | PASS |

Checked by hand: nothing beyond the suite. The spec's own hand-check (the real permission
dialog, the looping sound and a system notification on a live page) needs a device or a
browser and was not run here.

## Test run

```
$ ANTHROPIC_API_KEY= yarn build
$ tsc --noEmit
Done in 1.76s.

$ ANTHROPIC_API_KEY= yarn test
 Test Files  67 passed (67)
      Tests  1974 passed (1974)
   Duration  3.35s (tests 59%, import 34%, transform 6%)
Done in 3.87s.
```

`git diff --stat main HEAD -- '*.test.ts'` lists only the two changed files
(`src/db/migrations.test.ts`, `src/db/schema.test.ts`) and the four new ones
(`src/services/reminders.test.ts`, `src/reminders.test.ts`, `src/reminder-job.test.ts`,
`src/alarm.test.ts`), and `git status --porcelain data/` is empty.

```
VERIFICATION
Build: PASS
Tests: PASS   (1974 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped. One departure from the design:

- The design's `src/services/reminders.ts` imports `listTasks` from `../db/tasks.ts`, but
  the file never calls it (`anyReminder` takes the list as its argument), so `yarn build`
  fails with `TS6133: 'listTasks' is declared but its value is never read`. The import is
  `import { updateTask, type Task } from '../db/tasks.ts';` here; the rest of the block is
  copied as written.

The spec's device hand-check (above) is the one thing this job cannot do.
