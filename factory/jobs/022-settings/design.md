# 022-settings: design

No spec problem blocks the job. Five readings, each a decision below:

- **The 400 answer (AC2).** The spec asks only for status 400 and an unchanged setting. The
  route answers `res.sendStatus(400)`, as `src/routes/push.ts` does; a page with the
  message is error-page work (023) (D4).
- **The slot label of an unknown `time_slot` (AC3).** The seeded rules always name a known
  slot. A stored rule with another value shows the raw value instead of throwing
  `ui.slot`'s error and answering 500 (D5).
- **The status text before the script runs (AC6).** The spec gives the four texts the
  script sets. The server renders `Checking alerts...`, which is none of them, so a test
  can tell that the script ran (D8).
- **`<feed_token>` in the URL (AC7).** The token is put in the URL with
  `encodeURIComponent`. A token from `ensureFeedToken` is base64url, which this leaves
  unchanged, so the value is `...?token=<feed_token>` exactly (D6).
- **"Adds no second theme mechanism" (AC4).** The page's button is one more
  `[data-theme-toggle]` that the layout's inline script handles. `public/js/settings.js`
  never touches the theme, and a test asserts that its source does not name it (D7).

Checked in a throwaway folder under `$TMPDIR`, importing the repo's own `node_modules`
by absolute path (nothing installed, nothing written in the repo), on Node 26.8.2 and
yarn 1.22.22, with jsdom 30.1.1, Express 5.3.0 and supertest 7.3.1. The folder was
removed afterwards.

- jsdom has no `navigator.clipboard` (`'clipboard' in navigator` is false). Setting
  `window.navigator.clipboard = { writeText }` from the test works, and a page script
  then calls the stub. **Checked.**
- `new window.Event('beforeinstallprompt', { cancelable: true })` with a `prompt`
  property assigned to it reaches a `window` listener in the page. After the listener's
  `preventDefault()`, `window.dispatchEvent(event)` returns `false` and
  `event.defaultPrevented` is `true`. The page can keep the event and call
  `event.prompt()` later. **Checked.**
- Setting a checkbox's `checked` and dispatching `change` runs the page's `change`
  listener with the new `checked`. `click()` on a checkbox flips it and fires `change`.
  **Checked.**
- Express 5 with `express.urlencoded({ extended: false })` gives a repeated field as an
  array (`start=09:00&start=10:00` gives `['09:00', '10:00']`), so `postedValue` returns
  `null` for it. `09%3A30` decodes to `09:30`. **Checked.**
- Through supertest, `req.protocol` is `http` and `req.get('host')` is `127.0.0.1:<port>`,
  or whatever `.set('Host', 'example.test:8123')` sends. **Checked.**
- `express.static` serves `public/js/*.js` as `text/javascript; charset=utf-8`. **Checked.**
- `/^([01]\d|2[0-3]):[0-5]\d$/` turns down `9:00` and `24:00` and accepts `23:59`. **Checked.**

Not checked: Node 22 and 24 (26.8.2 is the only Node here), and anything the spec leaves
to checks by hand (the real install dialog, permission dialog, clipboard and calendar
apps). No prototype was built, and the project's build and test commands were not run.

## Approach

A new router, `src/routes/settings.ts`, serves `GET /settings` and
`POST /settings/working-hours`. The GET reads the clock once with `requestTime(res)`, the
`working_hours` and `slot_rules` settings with `getSetting`, and the feed token with
`ensureFeedToken` (021), which stores a token when there is none. It hands one
`settingsPage` object to `renderPage(res, 'settings', …)` with `nav: 'more'`. A new pure
module, `src/services/settings.ts`, holds the paths and the pure pieces: the parse of a
posted working-hours form, the read-only rows of the slot rules, and the feed URL. The
route only reads the request and the database and writes the setting.

The view `src/views/pages/settings.ejs` has six sections, each a `section.card` with an
`h2`: Working hours (the form), Slot rules (a list or the empty state), Appearance (the
theme button), Alerts (the sound checkbox, the status and the two buttons), Calendar (the
feed URL, Copy, the two download links) and App (Install app). It ends with
`<script src="/js/settings.js" defer></script>`, as `add.ejs` and `review.ejs` link their
scripts.

`public/js/settings.js` is one ES5 IIFE, written like `public/js/push.js` and
`public/js/alarm.js`. It wires the sound checkbox, the alert status and buttons, Copy and
the install prompt. Each part looks up its element by id and does nothing when the
element is missing. `public/js/alarm.js` gains one storage read: it skips `play` when
`alarm-sound` is `off`. `src/ui.ts` points the More item at `/settings`. The router is
mounted in `createApp` after the calendar router, before the style guide and the
not-found handler.

## Decisions

**D1. The paths live in `src/services/settings.ts`.** `SETTINGS_PATH = '/settings'` and
`WORKING_HOURS_PATH = '/settings/working-hours'`. The route, the view (through the
`settingsPage` object) and the tests use them. `src/ui.ts` keeps the literal
`'/settings'` in `navItems`, because `ui.ts` imports nothing and a test of `ui.ts`
compares literals. `SOUND_KEY` is not a server constant: the key `alarm-sound` lives in
the two browser scripts only.

**D2. The page object.** The route passes
`renderPage(res, 'settings', { title: 'Settings', nav: 'more', settingsPage })` with:

```ts
interface SettingsPage {
  workingHours: { start: string; end: string };  // the stored value, or { start: '', end: '' } when unset
  workingHoursAction: string;                     // WORKING_HOURS_PATH
  slotRules: SlotRuleRow[];                        // slotRuleRows(getSetting(db, 'slot_rules') ?? [])
  feedUrl: string;                                 // feedUrl(req.protocol, req.get('host') ?? 'localhost', ensureFeedToken(db))
  upcomingIcsHref: string;                         // UPCOMING_ICS_PATH
  todayIcsHref: string;                            // dayIcsPath(dateOfDay(dubaiDay(now.getTime())))
}
```

The type is exported from `src/services/settings.ts`. Rejected: building the object
inside the view, which would put `getSetting` and the clock into EJS.

**D3. `readWorkingHours(body: unknown): { start: string; end: string } | undefined`.**
It reads `start` and `end` with `postedValue` (`src/services/drafts.ts`), so a missing
field (`undefined`) or a repeated one (`null`) is turned down. Each must match
`CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/`, which also turns down `9:00`, `24:00`,
`ab:cd`, `09:00:00` and a value with spaces around it (nothing is trimmed). `start < end`
as strings, which is time order for zero-padded `HH:MM`. It returns a new
`{ start, end }` or `undefined`.

**D4. `POST /settings/working-hours`** uses `express.urlencoded({ extended: false })` on
the route only, as `src/routes/push.ts` does. When `readWorkingHours` gives `undefined`
it answers `res.sendStatus(400)` and writes nothing. Otherwise it calls
`setSetting(deps.db, 'working_hours', hours)` and `res.redirect(303, SETTINGS_PATH)`.
Placed tasks are not moved (out of scope). There is no authentication (backlog decision 4).

**D5. `slotRuleRows(rules: readonly SlotRule[]): SlotRuleRow[]`**, with
`SlotRuleRow = { category: string; slotLabel: string; start: string; end: string }`,
keeps the stored order. `slotLabel` is `slots.find((s) => s.id === rule.time_slot)?.label
?? rule.time_slot`, with `slots` from `src/ui.ts`. Each row is written as
`<li class="slot-rule">` with four spans: `.slot-rule__category`, `.slot-rule__slot`,
`.slot-rule__start` and `.slot-rule__end`, inside `<ul class="slot-rules" id="slot-rules">`.
With no rows, the section shows the `empty-state` partial with heading `No slot rules`,
and there is no `ul`. The section has no `form` and no `input`. Nothing writes
`slot_rules`.

**D6. `feedUrl(protocol: string, host: string, token: string): string`** returns
`` `${protocol}://${host}${FEED_PATH}?token=${encodeURIComponent(token)}` ``. The route
calls `ensureFeedToken(deps.db)` on every GET. It is a no-op once a token is stored, so
the URL is stable. `trust proxy` is not set, so `req.protocol` is the socket's protocol.
That holds for the one-user local app; behind a TLS proxy, the user would see `http`
(noted, not handled). The value is escaped by `<%= %>` in the `value` attribute. The
input: `<input class="field" id="feed-url" type="text" readonly value="…"
aria-label="Calendar feed URL">`. Beside it is the button partial with label `Copy` and
`attrs: { id: 'feed-copy' }`.

**D7. Theme: one more toggle, no new code.** The Appearance section holds the button
partial `{ label: 'Toggle theme', variant: 'ghost', attrs: { 'data-theme-toggle': '', id: 'settings-theme' } }`.
The inline script of `partials/theme-script.ejs` listens on `document`, so it handles
this button too. `settings.js` contains neither the string `theme` nor `data-theme`.

**D8. `public/js/settings.js`, its exact behaviour.** One `(function () { … })();`, ES5
(`var`, no arrow functions), every storage access in `try`/`catch`, every promise chain
ending in `.catch(function () {})`.

- *Sound.* `var box = document.getElementById('alarm-sound')`. On load,
  `box.checked = readSound() !== 'off'`, where `readSound()` returns
  `localStorage.getItem('alarm-sound')`, or `null` when that throws. On `change`, it
  calls `localStorage.setItem('alarm-sound', box.checked ? 'on' : 'off')` in a
  `try`/`catch`. The server renders the box with `checked`, so with no script it shows on.
- *Status.* `#notification-status` text, from `statusText(permission)`: `granted` gives
  `Alerts are on`, `denied` gives `Alerts are blocked in this browser`, anything else
  gives `Alerts are off`. When `typeof Notification === 'undefined'` the text is
  `Alerts are not supported`. It is set on load, and again from the resolved value after
  `requestPermission`.
- *Allow alerts* (`#notification-allow`). When there is no `Notification`, nothing
  happens. Otherwise `Promise.resolve(Notification.requestPermission())`, then set the
  status from the result. When the result is `granted`, it calls `subscribe()`:
  read `meta[name="vapid-public-key"]` `content`, and stop when there is none. Stop when
  there is no `navigator.serviceWorker`. Otherwise
  `navigator.serviceWorker.ready.then(r => r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }))`,
  then POST to `/push/subscribe` with `Content-Type: application/x-www-form-urlencoded`
  and the body `endpoint=<enc(subscription.endpoint)>&p256dh=<enc(keys.p256dh)>&auth=<enc(keys.auth)>`,
  with `keys = subscription.toJSON().keys`. That is byte for byte the body of `push.js`.
  The code is copied, not shared: `push.js` is unchanged (019's tests stay as they are).
- *Turn off alerts* (`#notification-off`). It stops when there is no
  `navigator.serviceWorker`. Otherwise
  `ready.then(r => r.pushManager.getSubscription())`. On `null` it posts nothing.
  Otherwise it POSTs `endpoint=<enc(sub.endpoint)>` to `/push/unsubscribe` (same
  header), then calls `sub.unsubscribe()`. The status text is not changed: the page
  cannot revoke a permission.
- *Copy* (`#feed-copy`). On click, when `navigator.clipboard` and its `writeText` exist,
  it calls `navigator.clipboard.writeText(input.value)` once (a returned promise gets
  `.catch`). Otherwise it calls `input.select()`.
- *Install* (`#install-app`, rendered `hidden`). On `window`, `beforeinstallprompt`
  makes it call `event.preventDefault()`, keep the event and set `button.hidden = false`.
  On click: when no event is kept, nothing happens. Otherwise it calls `kept.prompt()`
  once, sets `kept = null` and `button.hidden = true`.

The buttons are the button partial (class `btn`), with ids `notification-allow`
(`Allow alerts`), `notification-off` (`Turn off alerts`, ghost), `feed-copy` (`Copy`,
ghost) and `install-app` (`Install app`, with `hidden: ''` in `attrs`, which renders
`hidden=""`).

**D9. `public/js/alarm.js` reads the key at show time.** A function
`soundOn()`: `try { return localStorage.getItem('alarm-sound') !== 'off'; } catch (e) { return true; }`.
In `show`, `if (sound && soundOn()) { … play … }`. Everything else stays as it is: the
title, `overlay.hidden = false`, `announce`. `hide()` still calls `pause`, which is
harmless when nothing plays. 018's tests set no key, so they still see `play`.

**D10. The nav change and the two existing tests.** In `src/ui.ts`, the `more` entry
becomes `{ id: 'more', href: '/settings', label: 'More', glyph: '⋯' }`. In
`src/ui.test.ts`, the expected row becomes `['more', '/settings', 'More']`. In
`src/shell.test.ts`, `NAV_HREFS` ends with `'/settings'`, and the `it.each(['/more'])`
case is kept, renamed `'%s answers with the not-found page'`, still asserting 404 and
the not-found `h1`. `/more` stays a 404 (no route for it). No other existing test changes.

**D11. Test typings.** In `src/testing/jsdom.d.ts`, only optional members are added, so
the stubs of `push-client.test.ts` still type-check:
- `DomCheckbox extends DomElement { checked: boolean }`, and `DomInput` keeps `value`.
  Also `select(): void` on `DomInput`.
- `DomElement` gains `hidden: boolean`, so a test can read it as well as the attribute.
- `DomPushSubscription` gains `unsubscribe?(): Promise<boolean>`.
- `DomPushManager` gains `getSubscription?(): Promise<DomPushSubscription | null>`.
- `DomWindow['navigator']` becomes
  `{ serviceWorker?: DomServiceWorkerContainer; clipboard?: { writeText(text: string): Promise<void> } }`.

`src/testing/dom.ts` re-exports `DomCheckbox` beside the other types.

**D12. Styling.** `public/css/base.css` gains a short block after the `.later__*`
rules, with a one-line comment. It uses tokens only (no px in margin, padding or gap, no
color literal, no new media query):
`.settings-form` (flex, wrap, align-items end, `gap: var(--space-3)`),
`.settings-form__label` (`font-weight: 700`), `.settings-form .field` (`width: auto`),
`.slot-rules` (`padding: 0; list-style: none`), `.slot-rule` (flex, wrap,
`gap: var(--space-3)`, `padding: var(--space-2) 0`, `border-bottom: 1px solid var(--border)`),
`.slot-rule:last-child` (`border-bottom: 0`),
`.settings-row` (flex, wrap, align-items center, `gap: var(--space-2)`). There are no
inline styles (docs/errors/inline-style-on-home-page-fails-the-style-guide-test.md).

## Files

Created:
- `src/services/settings.ts`:
  - `export const SETTINGS_PATH = '/settings'`
  - `export const WORKING_HOURS_PATH = '/settings/working-hours'`
  - `export const CLOCK_TIME: RegExp` (D3)
  - `export function readWorkingHours(body: unknown): { start: string; end: string } | undefined` (D3)
  - `export interface SlotRuleRow { category: string; slotLabel: string; start: string; end: string }`
  - `export function slotRuleRows(rules: readonly SlotRule[]): SlotRuleRow[]` (D5)
  - `export function feedUrl(protocol: string, host: string, token: string): string` (D6)
  - `export interface SettingsPage` (D2)

  Imports: `import type { SlotRule } from '../db/settings.ts'`, `slots` from `../ui.ts`,
  `postedValue` from `./drafts.ts`, `FEED_PATH` from `./calendar.ts`.
- `src/routes/settings.ts`: `export function createSettingsRouter(deps: AppDeps): Router`,
  with `GET SETTINGS_PATH` (D2, D6) and `POST WORKING_HOURS_PATH` (D4). Imports
  `requestTime`, `getSetting`/`setSetting`, `ensureFeedToken`, `UPCOMING_ICS_PATH`,
  `dayIcsPath`, `dateOfDay`, `dubaiDay` and `renderPage`.
- `src/views/pages/settings.ejs`: the six sections of the Approach, from `settingsPage`.
  It starts with a `<%# %>` comment that names `settingsPage`'s fields. The page-header
  partial gives `{ heading: 'Settings' }`, the one `h1`, and each section heading is an
  `h2`. Working hours:
  `<form class="settings-form" id="working-hours" method="post" action="<%= settingsPage.workingHoursAction %>">`,
  with labels `Start` / `End` for `<input class="field" id="working-start" type="time" name="start" value="…" required>`
  and `id="working-end"` `name="end"`, and a `Save` submit button. Alerts:
  `<label class="settings-row"><input type="checkbox" id="alarm-sound" checked> <span>Alarm sound</span></label>`,
  then `<p id="notification-status" role="status">Checking alerts...</p>`, then the two
  buttons. Calendar: the feed input and Copy in a `div.settings-row`, then
  `Download upcoming (.ics)` → `upcomingIcsHref` and `Download today (.ics)` →
  `todayIcsHref`, both the button partial with `href`, `variant: 'ghost'` and
  `attrs: { download: '' }`. App: the `Install app` button. The last line is the script tag.
- `public/js/settings.js` (D8).
- Tests (see the plan): `src/settings-page.test.ts`, `src/settings-working-hours.test.ts`,
  `src/settings-client.test.ts`, `src/alarm-sound.test.ts`,
  `src/services/settings.test.ts`.

Changed:
- `src/app.ts`: `import { createSettingsRouter } from './routes/settings.ts';`, and
  `app.use(createSettingsRouter(deps));` right after `app.use(createCalendarRouter(deps));`.
- `src/ui.ts`: the `more` href (D10).
- `public/js/alarm.js`: D9. Also add one sentence to its header comment: "It plays the
  sound unless localStorage `alarm-sound` is `off` (022)."
- `public/css/base.css`: D12.
- `src/testing/jsdom.d.ts`, `src/testing/dom.ts`: D11.
- `src/ui.test.ts`, `src/shell.test.ts`: D10, nothing else.

Not touched:
- `public/js/push.js` and `src/routes/push.ts`: the settings script posts to the
  existing endpoints, which still answer 303 to `/` (fetch follows it, and nothing reads
  the answer).
- `src/views/layout.ejs` and `partials/theme-script.ejs`: the theme works as it is, and
  the page links its own script.
- `src/db/settings.ts` and `src/db/migrations.ts`: no new key, no migration. The sound
  choice is browser storage.
- `src/services/calendar.ts`, `src/routes/calendar.ts`: used as they are.
- `src/services/scheduler.ts`: new hours apply at its next run (out of scope).
- `public/sw.js`: `/settings` is not added to the app shell (no AC asks for it).
- `src/alarm.test.ts`, `src/push-client.test.ts` and every other existing test except
  the two of D10.
- `package.json`: no dependency.

## Risks

- **push.js also runs on `/settings` when a VAPID key is set.** With permission `granted`
  at load, it would post a subscribe of its own and give two posts. The Allow test loads
  the page with permission `default` (push.js stays silent), and the stub's
  `requestPermission` resolves `granted`. It asserts exactly one post. A second post from
  settings.js would fail it.
- **A script error that does not fail the test**
  (docs/errors/jsdom-page-script-error-does-not-fail-test.md). Every client test file
  checks `scriptErrors(window)` is `[]` in `afterEach`, as `alarm.test.ts` does. This
  covers the missing `Notification`, blocked storage and the click on Install with no
  event.
- **Blocked storage throws on load.** A test opens `/settings` with
  `storageThrows: true`: the box is checked, a change throws nothing. The alarm test runs
  with `storageThrows: true` and expects `play`.
- **The sound test passing without the script.** The server renders `checked`, so the
  `off` case (expects unchecked) fails when settings.js does not read the key. The
  `change` test reads `localStorage` directly.
- **A wrong host in the feed URL.** The test sends `Host: example.test:8123` and asserts
  the whole value. A hard-coded `localhost` fails it.
- **The token made but not stored.** The test GETs the shown path and query on the same
  app and expects 200 `text/calendar`, and it asserts `getSetting(db, 'feed_token')` is
  the token in the URL.
- **A UTC date in place of the Dubai date (AC8).** The clock is fixed at
  `2026-10-12T21:30:00.000Z`, which is 13 Oct in Dubai and 12 Oct in UTC.
- **A rejected post that still writes.** Each 400 case first stores
  `{ start: '08:00', end: '20:00' }`, then asserts it is unchanged with `toEqual`.
- **A repeated field read as its first value.** It is a 400 case of its own
  (`start=10:00&start=11:00&end=22:00`).
- **Fake timers leaking.** The AC8 test calls `vi.useRealTimers()` in `afterEach`.
- **Unhandled promise rejections in jsdom are not `error` events.** Every chain in
  settings.js ends in `.catch`. The tests drain with `setTimeout(0)` before asserting.
