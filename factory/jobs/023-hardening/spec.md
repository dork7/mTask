# 023-hardening: error pages, rate limits, cleanup and accessibility

## Goal

Every feature of the plan now exists, but the app has rough edges: an error thrown in a
handler gets Express's bare default answer, nothing stops a client from calling the
Anthropic API as fast as it can post, photos whose source lost its tasks (a Discard on the
review page, a deleted task) stay in the uploads folder forever, Delete and Done cannot be
taken back, and the README is one line. This job does the plan's task 17 and U12 as the
backlog row narrows them: error pages, a rate limit on the AI endpoints, cleanup of photos
with no tasks, toasts with undo for Delete and Done, focus styles, accessible names, one
live region, reduced motion, and a README.

It fits into what is there. The error handler goes after the not-found handler at the end of
`createApp` (`src/app.ts`) and renders with `renderPage` (`src/render.ts`). The AI endpoints
are the posts of `src/routes/add.ts` and `/review/:sourceId/analyze` in
`src/routes/review.ts`. The cleanup reads `sources` (`src/db/sources.ts`) and uses
`photoFile` and `removePhoto` (`src/services/photo-storage.ts`), and is started from
`src/server.ts` the way `startRecurrence` is. Undo works on the Done and Delete posts of
`src/routes/tasks.ts` and the Done post of `src/routes/overdue.ts`, and shows the existing
`partials/toast.ejs`. The CSS goes in `public/css/base.css`, which already has
`--touch-target: 44px`, a `:focus-visible` outline and a reduced-motion block for the
skeleton. The plan and `docs/mockUps.html` give no limits, ages, texts or paths for any of
this, so every number, text and path below is this spec's choice. Decision 4 is taken at its
default (one user, no accounts): the rate limit is counted per client IP and undo needs no
login.

## Acceptance criteria

- **AC1**: Server error page. When a handler throws or passes an error to `next` (in a
  test, an app whose database is closed before `GET /tasks`), the answer is 500, HTML, with
  the document title `Something went wrong - <app name>`, one `main h1` whose text is
  `Something went wrong`, and a link to `/`. The body holds neither the error's message
  nor a stack trace. The page renders even when the database cannot be read (the mini-bar
  and alarm of the layout are then left out, not thrown). The error is logged with
  `console.error`.

- **AC2**: Client error page. An error carrying a `status` or `statusCode` from 400 to 499
  (in a test, `POST /tasks/1/edit` with the body `title=%E0%A4%A` and
  `Content-Type: application/x-www-form-urlencoded`, which the body parser refuses) is
  answered with that status and the same page with the `h1` text `Something went wrong`,
  not a 500. The existing not-found page and its 404s are unchanged.

- **AC3**: Rate limit. The four AI endpoints, `POST /add/photo`, `POST /add/voice`,
  `POST /add/text` and `POST /review/:sourceId/analyze`, share one limit per client IP: 10
  requests in any 60 seconds. The 11th within the window answers 429 with a `Retry-After`
  header holding a whole number of seconds from 1 to 60, and renders the Add page with
  the tab of the endpoint (Photo for `/add/photo` and the analyze post) and the error
  `Too many requests. Wait a minute and try again.` A refused request does not call
  `analyze`, creates no source and leaves no file in the uploads folder. Once 60 seconds
  have passed since the oldest counted request, a request is accepted again (tested with
  fake timers or an injected clock). Every other route, `GET /add` included, has no limit.
  Refused requests also count toward the limit (the simplest reading).

- **AC4**: Photo cleanup. A cleanup run, given the database, the uploads folder and the
  current time, removes each `photo` source that has no task in any status and whose
  `created_at` is more than 24 hours before that time, and its file
  (`photoFile(uploadsDir, image_path)`). It also removes each file in the uploads folder
  that no source's `image_path` names and whose modification time is more than 24 hours
  old. It keeps: a photo source with at least one task (draft, pending, in progress or
  done) and its file; a photo source with no task created 24 hours or less ago and its
  file; every voice and text source. A missing file or a missing uploads folder is no
  error. Once the run is done, `GET /review/<id>` of a removed source answers 404.

- **AC5**: Cleanup schedule. A start function, which `src/server.ts` calls once after it
  opens the database, runs the cleanup at once and then every hour, and returns a function
  that stops it (the shape of `startRecurrence`). `createApp` does not start it. Tested
  with fake timers: one run at start, a second after one hour, none after it is stopped.

- **AC6**: Undo Delete. `POST /tasks/:taskId/delete` still answers 303 to the same path as
  now (`/tasks` with the list's query). The page that redirect leads to shows a toast with
  the text `Task deleted` and an `Undo` button in a form that posts. Posting that form
  brings the task back with the same `id` and the same stored fields it had before the
  delete (title, times, status, priority, slot, source, recurrence and the rest), and
  answers 303 to the list, where the task is shown again. Posting the undo for a task that
  cannot be restored (an unknown id, or one restored already) answers 404 and changes
  nothing.

- **AC7**: Undo Done. `POST /tasks/:taskId/done` from the list and `POST /overdue/:taskId/done`
  still answer 303 to the same paths as now. The page they lead to shows a toast with the
  text `Task marked done` and an `Undo` button in a form that posts. Posting it gives the
  task back the `status`, `completed_at` and `actual_minutes` it had before the Done, and
  removes the next instance that Done created for a recurring task (016) while that
  instance is still `pending`; it answers 303 to the page the Done came from. Undo of a task
  that is no longer `done` answers 404 and changes nothing. Done from the task sheet and the
  mini-bar (`?from=sheet`) keeps its summary and gets no toast.

- **AC8**: One live region. Every page rendered in `src/views/layout.ejs` holds exactly one
  element `#live-region` with `aria-live="polite"`, present (and empty) when there is no
  toast. The toasts of AC6 and AC7 are rendered inside it, and no other element of the
  page carries `aria-live`. The `/_styleguide` toast example follows the same rule.

- **AC9**: Accessible names. On each of `/`, `/add`, `/tasks`, `/overdue`, `/timeline`,
  `/digest`, `/settings`, `/_styleguide`, a task sheet `/tasks/:id`, a task edit page and a
  review page `/review/:sourceId` with one draft (all with a task in the database where
  the page needs one), checked in a jsdom test: every `a` and `button` has a non-empty
  accessible name (its trimmed text, an `aria-label`, or an `aria-labelledby` naming
  elements with text), and every `input` other than `type="hidden"`, every `select` and
  every `textarea` has a label (`label[for]`, a wrapping `label`, `aria-label` or
  `aria-labelledby`). Where a page fails today, the page is fixed, not the test.

- **AC10**: Focus and touch targets. `public/css/base.css` keeps a `:focus-visible` rule
  with a visible `outline` (not `none` or `0`), and no rule in it sets `outline: none` or
  `outline: 0` on any selector. The `.btn` and `.toast .btn` rules keep a `min-height` of
  `var(--touch-target)`.

- **AC11**: Reduced motion. `public/css/base.css` has a
  `@media (prefers-reduced-motion: reduce)` block with a rule for `*`, `*::before` and
  `*::after` that sets `animation-duration`, `transition-duration` (each to `0.01ms` or
  less, or `animation: none` and `transition: none`) and `scroll-behavior: auto`. The
  existing skeleton rule may stay or be folded into it.

- **AC12**: README. `README.md` has a title naming the app, and sections that state: the
  Node version (`22.18`) and `yarn install`; the commands `yarn dev`, `yarn test` and
  `yarn build`; every environment variable `src/config.ts` reads (`PORT`, `DATABASE_PATH`,
  `UPLOADS_DIR`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) with what each is for and its default; and the
  rate limit and the photo cleanup of AC3 and AC4. A test checks that each of those
  command and variable names appears in the file.

- **AC13**: Build and tests. `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` and
  the three `VAPID_*` unset; tests use an in-memory or temporary database and a temporary
  uploads folder and leave nothing under `data/`. Existing tests change only where this job
  changes what they check (the toast partial's own `aria-live`, a redirect `Location` that
  now carries what the toast needs while its path stays the same, a page fixed for AC9);
  each such change is listed in the build report. New tests cover AC1 to AC12.

## Out of scope

- Undo for anything but Delete and Done (reschedule, edit, discard of drafts, confirm),
  and undo that lasts across a server restart if the chosen mechanism keeps it in memory.
- Toasts for Done from the task sheet or the mini-bar: the sheet already shows the
  estimate vs. actual summary (013).
- New empty, loading and offline states: the screens keep those their own jobs built
  (006 analyzing and error, 011 and 014 empty states, 017 offline page). U12's "for every
  screen" audit beyond what AC9 checks is not done here.
- Cleanup of voice and text sources with no tasks; only photos and their files are removed.
- Accounts, per-user limits or a shared limit store: one user, one process (decision 4,
  taken at its default).
- A rules editor, Google Calendar sync and the other items under the backlog's Left out.
- **Checked by hand** (needs a browser, a screen reader or a device): the color contrast of
  both themes, the focus ring being visible on every control while tabbing, a screen reader
  announcing the toast, and the reduced-motion setting of the operating system stopping
  the app's animations.
