# Task Image AI: Build Plan

A Node.js + Express app with EJS pages. The user adds tasks by photo or voice note. An AI model extracts one or more tasks, each with an estimated duration, priority and time slot. The user reviews them before saving, and the app schedules them on a timeline around working hours, with alarms for urgent tasks.

Hand these tasks to a coding agent (or yourself) one at a time. Paste the **Shared context** at the top of every task.

---

## Shared context (paste at the top of every task)

> Building "Task Image AI": a Node.js + Express app with EJS server-rendered pages. Users add tasks by photo or voice note. An AI model extracts one or more tasks, each with an estimated duration, priority and time slot. The user reviews them before saving, and the app schedules them on a timeline around working hours. Stack: Express, EJS, SQLite (better-sqlite3), multer, node-cron, Anthropic API for vision and text analysis. Times are in Asia/Dubai.
>
> UI: mobile-first (the camera and voice features are used on a phone), server-rendered EJS partials, plain CSS with design tokens as CSS variables, and small vanilla JS modules (optionally htmx for filters without full reloads). Light and dark themes via `prefers-color-scheme` plus a manual toggle. Bottom tab bar on mobile, side navigation on desktop.

### Design tokens

- Priority colors: urgent = red, high = orange, medium = blue, low = gray. Always pair color with an icon or label so it never relies on color alone.
- Slot colors: a soft tint per slot (morning, afternoon, evening, 8 PM).
- One type scale, a 4px spacing scale, two corner radii. Dark mode redefines the same tokens.

### Assumptions to confirm

- Coding tasks go to a **morning deep-work slot (9-11 AM)**. The original prompt was cut off at this point, so change it if you meant something else.
- Grocery / shopping tasks go to the **8 PM slot**.
- Working hours default to 9 AM - 10 PM and live in the `settings` table.

---

# Part 1: Backend tasks

## Phase 1: Foundation

**1. Scaffold**
Express + EJS with layout and partials, static folder, `.env`, and the folders `routes/`, `services/`, `views/`, `db/`. Include a base stylesheet that uses CSS variables so dark mode is easy later.
*Done when:* the server runs and renders a styled home page.

**2. Data model**
Table `tasks`: `id`, `title`, `description`, `image_path`, `category`, `estimated_minutes`, `actual_minutes`, `priority`, `time_slot`, `scheduled_start`, `scheduled_end`, `status` (draft / pending / in_progress / done), `started_at`, `completed_at`, `reminder_at`, `recurrence_rule`, `parent_task_id`, `source_id`, `created_at`. Add a `settings` table (working hours, slot rules) and CRUD helpers.
*Done when:* a test script can insert, read, update and delete tasks.

**3. Image upload**
Upload page with camera capture (`<input type="file" accept="image/*" capture="environment">`), multer, type and size validation, and a preview.
*Done when:* a photo from phone or desktop is saved and its path is returned.

## Phase 2: AI input

**4. AI analyzer (multi-task)**
`services/analyzer.js` takes an image or text and returns a JSON array: `[{ title, description, category, estimated_minutes, urgency, confidence }]`. One photo of a whiteboard, handwritten list or fridge can yield several tasks. Validate with a schema, with retry and fallback.
*Done when:* a single-item photo returns one task and a handwritten list returns several.

**5. Review before save**
Analysis creates `draft` tasks tied to one `source_id`. A review page shows each draft with editable title, duration, priority and slot, plus per-task remove and "confirm all". Nothing reaches the timeline until confirmed.
*Done when:* drafts can be edited, discarded or confirmed, and only confirmed tasks appear elsewhere.

**6. Voice note input**
A record button using the browser Web Speech API to transcribe, with an editable transcript and a typed-text fallback for unsupported browsers. The text goes through the same analyzer and review flow as photos.
*Done when:* saying "buy milk and finish the login bug" produces two draft tasks.

## Phase 3: Scheduling

**7. Priority and slot rules**
`services/rules.js`, deterministic and editable:
- grocery / shopping goes to 8 PM
- coding goes to the morning deep-work slot (9-11 AM assumed)
- urgent goes to the next available slot today

*Done when:* unit tests cover each rule.

**8. Auto-scheduler**
`services/scheduler.js` fits tasks into free gaps within the working hours from `settings`, with no overlaps. When an urgent task arrives, it takes the nearest gap and pushes lower-priority tasks later. Tasks that don't fit today roll to the next day.
*Done when:* tests cover gap-filling, bumping and overflow.

**9. Recurring tasks**
Support a `recurrence_rule` (daily, weekly on given days, monthly). A cron job generates the next instance when the current one is completed or its date passes, then runs it through the scheduler.
*Done when:* "weekly groceries" generates next week's instance automatically at the 8 PM slot.

## Phase 4: Views and tracking

**10. Task list, filters and overdue view**
`/tasks` with filters for priority and time slot (query-string driven), sorting, and edit / delete with override of AI choices. Add `/overdue` for pending tasks whose end time has passed, with one-click "reschedule" and "mark done".
*Done when:* filters combine correctly, the URL is shareable, and overdue tasks appear automatically.

**11. Timeline**
`/timeline` shows a day by time slot with a day switcher. Blocks are color-coded by priority, sized by duration, and conflicts are visible.
*Done when:* tasks appear at the right slots.

**12. Done button, timer and learning loop**
Start and Done buttons that record `started_at`, `completed_at` and `actual_minutes`, and a running timer in the UI. A service finds past tasks with a large estimate vs. actual gap per category and injects the last N corrections into the analyzer prompt as few-shot examples (for example, "coding bug fixes: estimated 30, actual 75").
*Done when:* the analyzer's estimates for a category shift after you log a few completions.

## Phase 5: Alerts and delivery

**13. Urgent reminders and alarms**
A `node-cron` job finds urgent tasks nearing `reminder_at`. The browser fires a Notifications API alert and an audio alarm, and a service worker with Web Push covers closed tabs. Include snooze and dismiss.
*Done when:* an urgent task triggers sound and a notification on time.

**14. Daily digest**
A morning cron job (for example 7:30 AM) builds a summary of today's tasks, overdue items and total planned minutes. Show it on a `/digest` page and send it as a push notification.
*Done when:* the digest appears on schedule with correct counts.

**15. Calendar export**
`.ics` download for a single task, a day, or all upcoming tasks, plus a subscribable `/calendar.ics` feed. Google Calendar OAuth sync is optional and best left as a follow-up.
*Done when:* the file imports cleanly into Google and Apple Calendar with correct times.

**16. PWA and dark mode**
Web manifest, icons, service worker caching for the app shell, and installability. Dark mode follows `prefers-color-scheme` with a manual toggle saved in localStorage.
*Done when:* the app installs on a phone and the theme persists.

**17. Hardening**
Error pages, rate limiting on AI endpoints, uploaded image cleanup, loading states during analysis, and a README.

---

# Part 2: UI tasks

Each UI task pairs with a backend task, so you can build them together.

**U1. Design system and app shell** *(pairs with task 1, extended in 16)*
Build the tokens, a base layout, and reusable partials: nav (bottom tab bar on mobile, sidebar on desktop), page header, buttons, priority and slot badges, chips, cards, modal and bottom sheet, toast, empty state, skeleton loader. Nav items are Today, Timeline, Tasks and More, with a prominent center **Add** button.
*Done when:* a style-guide page (`/_styleguide`) shows every component in light and dark.

**U2. Today dashboard** *(pairs with tasks 10-12)*
- A "Next up" card with a Start button.
- A progress ring or bar for planned vs. done minutes today.
- An overdue banner linking to `/overdue`.
- A compact list of the remaining tasks today.
- Quick-add buttons for camera, voice and text.

*Done when:* the home page answers "what should I do now?" at a glance.

**U3. Add task screen** *(pairs with tasks 3 and 6)*
Three input modes as tabs: **Photo** (camera or gallery with a preview and retake), **Voice** (a large mic button, live transcript, editable text), **Type**. While the AI runs, show a full-width "Analyzing..." state with a skeleton, and a clear error state with retry.
*Done when:* all three modes reach the review screen.

**U4. Review screen** *(pairs with tasks 4 and 5)*
- The source photo or transcript pinned at the top, collapsible.
- One editable card per draft task: title field, duration stepper (±5 min), priority chips, slot picker, recurrence picker.
- A "low confidence" marker on uncertain guesses.
- Per-card remove, and a sticky bottom bar with **Confirm all (N)** and Discard.
- A preview of where each task will land, such as "Today 8:00 PM".

*Done when:* a multi-task photo shows several cards, and edits persist through confirmation.

**U5. Tasks list and filters** *(pairs with task 10)*
- A filter bar of horizontally scrollable chips for priority and time slot, plus a sort dropdown, with active filters shown as removable chips.
- Task cards showing title, duration, priority badge, slot and status.
- Quick actions: Done and Reschedule (swipe on mobile, buttons on desktop).

*Done when:* filter state lives in the URL and the list updates without losing scroll position.

**U6. Overdue view** *(pairs with task 10)*
A grouped list ("Yesterday", "Earlier") with one-tap Reschedule (auto-fit or pick a time) and Mark done. A friendly empty state when nothing is overdue.

**U7. Timeline** *(pairs with task 11)*
- A vertical hour axis with slot bands labeled behind the blocks.
- Blocks sized by duration and colored by priority, with a **now** line.
- Overlapping tasks get a hatched conflict style.
- A day switcher (previous, next, date picker, "Today") and swipe between days.
- Tapping a block opens the task detail sheet.

*Done when:* an 8 PM grocery task and a 9 AM coding task render in the right bands.

**U8. Task detail sheet and timer** *(pairs with task 12)*
- Edit fields, reminder time, and recurrence.
- **Start** and **Done** buttons.
- A running timer, plus a sticky mini-bar on every page while a task is in progress.
- After completion, an "estimated 30 min, actual 75 min" summary.

**U9. Urgent alarm UI** *(pairs with task 13)*
- A notification permission prompt explained in context ("Allow alerts so urgent tasks can wake you").
- A full-screen alarm modal with the task title, a looping sound, **Snooze** (5, 10, 15 min) and **Dismiss**, and a visible in-page fallback if notifications are blocked.
- A sound on/off control in settings.

**U10. Digest page** *(pairs with task 14)*
Today's summary: task count, planned minutes, overdue items, and the first task of the day, with a link to the timeline.

**U11. Settings** *(pairs with tasks 7, 9, 15, 16)*
Working hours, slot rules (view for now, editable later), theme toggle, notification and sound controls, a calendar feed URL with a copy button and `.ics` download buttons, and an install-app prompt.

**U12. Polish and accessibility** *(pairs with task 17)*
- Empty, loading, error and offline states for every screen.
- Toasts with undo for delete and done.
- Keyboard focus styles, ARIA labels, an `aria-live` region for status updates, and 44px minimum touch targets.
- Respect `prefers-reduced-motion` and check color contrast in both themes.

---

# Build order

1. Tasks 1-3 with U1 and U3 (photo tab)
2. Tasks 4-5 with U4
3. Task 6 with U3 (voice tab)
4. Tasks 7-10 with U5, U6
5. Task 11 with U7 and U2
6. Task 12 with U8
7. Tasks 13-16 with U9, U10, U11
8. Task 17 with U12

Tasks 1-11 give you the core product. Tasks 12-13 come next because they depend on stable timestamps and statuses.

# Notes

- **Google Calendar sync** is left out of task 15 because OAuth adds a lot of surface area. `.ics` gets you most of the value.
- **Voice input** uses the Web Speech API, which works well in Chrome and Safari but varies elsewhere, so the typed fallback matters.
- **Not included (add later if wanted):** custom category-to-slot rules UI, escalating repeat alerts, Telegram / WhatsApp notifications.

# UI feature ideas

- Swipe gestures on cards (right for done, left for reschedule).
- A "now" line that auto-scrolls the timeline to the current time.
- A subtle confetti or progress animation when the day's tasks are finished.
- Haptic feedback on mobile for the Done button.