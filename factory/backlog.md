# Factory backlog: Task Image AI

Source: `docs/plan.md` (backend tasks 1-17, UI tasks U1-U12) and `docs/mockUps.html`
(Today, Review and Timeline screens). Each item is one factory job.

## Queue

The unchecked items are the backlog the dashboard shows, in the order they run.
`/factory next` starts the first one and ticks it.

- [x] 001-scaffold: Express + EJS server, test runner and project commands
- [x] 002-design-system: design tokens, app shell and the style-guide page
- [x] 003-data-model: tasks, sources and settings tables with CRUD helpers
- [x] 004-photo-upload: Add screen with the Photo tab and image upload
- [x] 005-analyzer: AI analyzer that returns several tasks from a photo or text
- [x] 006-review-drafts: draft tasks and the review-before-save screen
- [x] 007-voice-and-text: Voice and Type tabs on the Add screen
- [x] 008-slot-rules: priority and time-slot rules
- [x] 009-scheduler: auto-scheduler with gap filling, bumping and overflow
- [x] 010-task-list: task list with filters, sort, edit and delete
- [x] 011-overdue: overdue view with reschedule and mark done
- [x] 012-timeline: day timeline with slot bands, now line and conflicts
- [x] 013-timer-and-detail: task detail sheet, Start and Done, running timer
- [x] 014-today-dashboard: Today page with Next up, progress and quick add
- [x] 015-learning-loop: feed estimate corrections back into the analyzer
- [x] 016-recurring: daily, weekly and monthly recurring tasks
- [x] 017-pwa-shell: manifest, icons and offline app shell
- [x] 018-reminders-and-alarm: urgent reminders with the in-page alarm
- [x] 019-web-push: push notifications with the tab closed
- [ ] 020-digest: morning digest page and push
- [ ] 021-calendar-export: .ics downloads and the calendar feed
- [ ] 022-settings: settings page
- [ ] 023-hardening: error pages, rate limits, cleanup and accessibility

## Decisions

Settled:

1. **The existing app** is removed: `src/`, `index.html` and the Vite config are gone
   from the working tree. Job 001 starts from an empty `src/`.
2. **Language** is TypeScript (`tsconfig.json` is kept, without the browser settings).
   Job 001 adds the run and type-check commands.

Open, with the default the backlog assumes:

3. **Slot rules.** Coding at 9-11 AM, groceries and shopping at 8 PM, working hours
   9 AM - 10 PM. The plan marks these as unconfirmed. Needed before job 008.
4. **Users.** The plan has no login. Default: one user, no accounts. The calendar feed
   (job 021) is then guarded by a secret token in its URL.

## Jobs

Core product: 001-012.

| Job id | Plan tasks | Needs | Testable outcome |
|---|---|---|---|
| `001-scaffold` | 1 | - | Express + EJS server with layout, static folder, `.env` loading and the `routes/ services/ views/ db/` folders. `GET /` returns 200 with the layout. Test runner and `supertest` set up; test, build and dev commands written into Project facts. |
| `002-design-system` | U1 | 001 | Tokens for priority, slot, type, spacing and radii as CSS variables, redefined for dark. Theme toggle saved in localStorage. Nav (tab bar / sidebar, center Add) and every partial in U1 rendered on `/_styleguide`. |
| `003-data-model` | 2 | 001 | `tasks` and `settings` tables with migrations and CRUD helpers. Adds what the plan's columns miss: a `sources` table (photo path or transcript, for the review screen), `confidence` and `updated_at` on tasks. Tests insert, read, update and delete against a temp database. |
| `004-photo-upload` | 3, U3 (Photo tab) | 002, 003 | `/add` with the Photo tab: camera capture input, preview and retake. `POST` saves the image with multer and creates a source. Wrong type and oversize files are rejected with a message. |
| `005-analyzer` | 4 | 003 | `services/analyzer` takes an image or text and returns a schema-valid task array. Invalid model output triggers one retry, then a fallback result. Tested with a stubbed Anthropic client: one task, several tasks, bad JSON, API error. |
| `006-review-drafts` | 5, U4 | 004, 005 | Upload runs the analyzer and creates `draft` tasks under one source. `/review/:sourceId` shows an editable card per draft, a low-confidence marker, per-card remove, Confirm all and Discard. Drafts appear nowhere else until confirmed. Analyzing and error-with-retry states. |
| `007-voice-and-text` | 6, U3 (Voice, Type tabs) | 006 | Voice tab with Web Speech API transcription and an editable transcript; Type tab as the fallback, shown automatically when the API is missing. Submitted text creates a source and goes through the same analyze and review flow. |
| `008-slot-rules` | 7 | 003 | `services/rules`: category and urgency in, priority and time slot out, with the rules read from `settings`. A unit test per rule. |
| `009-scheduler` | 8, U4 (landing preview) | 008 | `services/scheduler` places tasks in free gaps inside working hours with no overlaps, bumps lower priorities for an urgent task, and rolls overflow to the next day. Takes the current time as an argument. Confirming drafts schedules them; review cards show "Today 8:00 PM". |
| `010-task-list` | 10 (list), U5 | 009 | `/tasks` with priority and slot filters and sort, all in the query string and combinable. Edit and delete, overriding the AI's choices. Done and Reschedule actions on each card. |
| `011-overdue` | 10 (overdue), U6 | 010 | `/overdue` lists pending tasks whose end has passed, grouped Yesterday / Earlier, with Reschedule (auto-fit or pick a time) and Mark done, and an empty state. |
| `012-timeline` | 11, U7 | 009 | `/timeline?date=` with an hour axis, slot bands, blocks sized by duration and colored by priority, hatched conflicts, a now line and a day switcher. |
| `013-timer-and-detail` | 12 (Start / Done), U8 | 010 | Task detail sheet with edit fields and reminder time. Start and Done record `started_at`, `completed_at` and `actual_minutes`. Running timer, a mini-bar on every page while a task is in progress, and the estimate vs. actual summary. |
| `014-today-dashboard` | U2 | 011, 013 | `/` shows Next up with Start, planned vs. done minutes, the overdue banner, the rest of today's tasks and quick-add buttons. |
| `015-learning-loop` | 12 (corrections) | 005, 013 | A service picks the last N completed tasks per category with a large estimate gap, and the analyzer prompt includes them as examples. Tested on the built prompt, not on model output. |
| `016-recurring` | 9, U4 and U8 (recurrence picker) | 009, 013 | Daily, weekly-on-days and monthly rules. Completing an instance, or a cron run after its date, creates the next one exactly once and schedules it. |
| `017-pwa-shell` | 16 | 002 | Web manifest, icons and a service worker that caches the app shell and serves an offline page. |
| `018-reminders-and-alarm` | 13 (in-page), U9 | 013 | A cron job marks urgent tasks due at `reminder_at`. An open page shows the alarm modal with looping sound, Snooze (5, 10, 15) and Dismiss, the permission prompt, and an in-page fallback when notifications are blocked. |
| `019-web-push` | 13 (closed tabs) | 017, 018 | VAPID keys, a `push_subscriptions` table, subscribe and unsubscribe endpoints, and a push sent for each due reminder. Tested with a stubbed push sender. |
| `020-digest` | 14, U10 | 011, 019 | A 7:30 AM cron job builds today's count, planned minutes, overdue items and first task. `/digest` shows it and a push is sent. |
| `021-calendar-export` | 15 | 009 | `.ics` for one task, one day and all upcoming tasks, and a `/calendar.ics` feed. Tests parse the output and check times in Asia/Dubai. |
| `022-settings` | U11 | 008, 019, 021 | `/settings`: working hours, slot rules (read-only), theme, notification and sound controls, feed URL with copy, `.ics` downloads and the install prompt. |
| `023-hardening` | 17, U12 | all | Error pages, rate limiting on the AI endpoints, cleanup of images with no tasks, toasts with undo, focus styles, ARIA labels and a live region, reduced motion, and a README. |

## Checked by hand, not by tests

The plan's own "Done when" lines for these need a device or a live model, so each job
lists them under Not done for you to try:

- 004: a photo taken on a phone.
- 005: a real handwritten list returns several tasks from the live model.
- 007: saying "buy milk and finish the login bug" gives two drafts.
- 015: estimates for a category shift after a few completions.
- 017, 019: the app installs on a phone; a push arrives with the tab closed.
- 021: the file imports into Google and Apple Calendar.

## Left out

From the plan's own notes: Google Calendar OAuth sync, a rules editor, escalating repeat
alerts, Telegram and WhatsApp notifications, and the UI feature ideas (swipe gestures,
confetti, haptics).
