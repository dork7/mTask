# 022-settings: settings page

## Goal

The pieces a user would want to set or look up now all exist, but each has no page of its
own: the `working_hours` and `slot_rules` settings (003, 008), the theme toggle and its
`theme` localStorage key (002), the alarm's sound and notification prompt (018), the push
subscribe and unsubscribe endpoints (019), the `.ics` downloads and the token-guarded
`/calendar.ics` feed (021), and the installable PWA shell (017). This job adds `/settings`
(`docs/plan.md`, U11), one page that gathers them: editable working hours, the slot rules
shown read-only, the theme toggle, notification and sound controls, the feed URL with a
copy button, the `.ics` download links and an install-app button.

It is a router beside the others in `src/routes/`, rendered with `renderPage` into
`src/views/layout.ejs`, reading the clock with `requestTime(res)` (`src/routes/mini-bar.ts`)
and the settings with `getSetting` / `setSetting` (`src/db/settings.ts`). Its browser half is
one small vanilla script, like `public/js/alarm.js`. `docs/mockUps.html` has no settings
screen and the plan names no routes, fields or texts, so every name and text below is this
spec's choice. The backlog's open decisions are taken at their defaults: one user, no
accounts (decision 4), so the page and its form carry no authentication, and the seeded
slot rules of 008 (decision 3) are what the page shows.

## Acceptance criteria

- **AC1**: The page. `GET /settings` answers 200 with the layout, the document title
  `Settings - <app name>` and one `main h1` whose text is `Settings`. It works with
  `ANTHROPIC_API_KEY` unset. The nav's More item is the page's item: its link is
  `/settings` (the `more` entry of `navItems` in `src/ui.ts` changes its `href` from
  `/more` to `/settings`, keeping id `more` and label `More`, since no job builds `/more`),
  and on `/settings` that link has `aria-current="page"`. The page loads `/js/settings.js`,
  which is served with a JavaScript content type.

- **AC2**: Working hours. The page has a form posting to `/settings/working-hours` with two
  `input type="time"` fields named `start` and `end`, whose values are the stored
  `working_hours` (`09:00` and `22:00` on a new database). `POST /settings/working-hours`
  with one `start` and one `end`, each `HH:MM` on a 24-hour clock (`00:00` to `23:59`), and
  `start` earlier than `end`, stores `{ start, end }` as `working_hours` and answers 303 to
  `/settings`; the next `GET /settings` shows the new values. A missing, repeated, malformed
  (`9:00`, `24:00`, `ab:cd`) field, or a `start` equal to or later than `end`, answers 400
  and leaves `working_hours` unchanged.

- **AC3**: Slot rules, read-only. The page lists one item per entry of the `slot_rules`
  setting, in stored order, each showing the rule's `category`, the label of its
  `time_slot` from `src/ui.ts` (`Morning`, `Night`, ...) and its `start` and `end` as
  stored. With the seeded value that is two items: `coding`, `Morning`, `09:00`, `11:00`,
  and `shopping`, `Night`, `20:00`, `22:00`. The section has no form and no input, and no
  route writes `slot_rules`. With the setting `[]` the section shows the text
  `No slot rules`.

- **AC4**: Theme. Inside `main` the page has a `button` carrying `data-theme-toggle`, so
  the existing theme script of 002 toggles the theme and saves it under the `theme`
  localStorage key; this job adds no second theme mechanism.

- **AC5**: Sound. The page has a checkbox `#alarm-sound`. `/js/settings.js` checks it when
  localStorage `alarm-sound` is anything but `off` (so it starts checked), and on change
  stores `on` or `off` under `alarm-sound`. `public/js/alarm.js` reads that key when it
  shows an alarm: with `off` it shows `#alarm` and the title as before but does not call
  `play` on `.alarm__sound`; with `on` or no value it plays as 018 AC8 says. A blocked
  localStorage counts as no value. 018's existing alarm tests pass unchanged.

- **AC6**: Notifications. The page has a status element `#notification-status`, an
  `Allow alerts` button and a `Turn off alerts` button. In a jsdom test of the page with
  `Notification` stubbed, `/js/settings.js` sets the status text to `Alerts are on` for
  permission `granted`, `Alerts are blocked in this browser` for `denied`, `Alerts are off`
  for `default`, and `Alerts are not supported` when `Notification` does not exist (and
  then throws nothing). Clicking `Allow alerts` calls `Notification.requestPermission()`;
  when it resolves `granted` and the vapid meta of 019 AC4 is present, the script
  subscribes and posts `endpoint`, `p256dh` and `auth` to `/push/subscribe` as 019 AC5
  does. Clicking `Turn off alerts`, with a stubbed `pushManager.getSubscription()` that
  returns a subscription, posts that subscription's `endpoint` to `/push/unsubscribe` and
  calls its `unsubscribe()`; with no subscription it posts nothing.

- **AC7**: Feed URL. The page shows the feed URL in a read-only text input `#feed-url`,
  whose value is `<protocol>://<host>/calendar.ics?token=<feed_token>`, the protocol and
  host being those of the request. When the database has no `feed_token`, rendering the
  page makes one with `ensureFeedToken` (`src/services/calendar.ts`), so the URL is always
  usable: `GET` of the path and query of the shown value answers 200 with
  `text/calendar`. A `Copy` button beside it, clicked in a jsdom test with a stubbed
  `navigator.clipboard.writeText`, calls it once with the input's value.

- **AC8**: `.ics` downloads. The page has a link to `/upcoming/ics` and a link to
  `/day/<today>/ics`, where `<today>` is the request's Dubai date as `YYYY-MM-DD`
  (`dateOfDay(dubaiDay(...))` of `src/dubai.ts`); both carry the `download` attribute.
  With the clock at `2026-10-12T21:30:00.000Z` (1:30 AM on 13 Oct in Dubai) the day link
  is `/day/2026-10-13/ics`.

- **AC9**: Install prompt. The page has an `Install app` button `#install-app` that is
  `hidden` when rendered. In a jsdom test, dispatching a `beforeinstallprompt` event on
  `window` makes `/js/settings.js` call its `preventDefault()` and unhide the button;
  clicking the button then calls the event's `prompt()` once and hides the button again.
  With no such event the button stays hidden.

- **AC10**: Build and tests. `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` and
  the three `VAPID_*` unset; tests use an in-memory or temporary database and leave nothing
  under `data/`. Two existing test files change for AC1's nav link: `src/ui.test.ts` (the
  `more` entry's href is `/settings`) and `src/shell.test.ts` (`NAV_HREFS` ends with
  `/settings`, and the `/more`-is-not-found case is removed or kept as a 404 for `/more`).
  No other existing test changes. New tests cover AC1 to AC9.

## Out of scope

- Editing slot rules: the plan says "view for now, editable later" and the backlog lists a
  rules editor under Left out.
- Rescheduling tasks already placed when the working hours change: the new hours apply to
  the next scheduler run (009) only.
- Changing or regenerating the feed token; the page only shows it (021 made it).
- The alarm modal itself, its permission prompt and snooze, and the push job (018, 019).
- A `/more` page or menu; the More nav item now opens `/settings`.
- Error pages, toasts with undo, focus styles and ARIA work across the app (023).
- **Checked by hand** (needs a device or a live browser): the browser's install dialog
  appears from `Install app` and the app installs on a phone (backlog, 017); the real
  notification permission dialog and a push arriving after `Allow alerts` (019); the copy
  button putting the URL on the real clipboard; and subscribing to the feed URL from Google
  or Apple Calendar (021).
