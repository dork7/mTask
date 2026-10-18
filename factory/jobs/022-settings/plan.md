# 022-settings: plan

Decision numbers (D1, D2, …) refer to `design.md`.

## Steps

1. **The nav item.** Files: `src/ui.ts`, `src/ui.test.ts`, `src/shell.test.ts`. Serves AC1, AC10.
   - Change the `more` href to `/settings` (D10), and update the two tests exactly as
     D10 says.
   - Check: `yarn vitest run src/ui.test.ts src/shell.test.ts`.

2. **The pure module.** Files: `src/services/settings.ts`, `src/services/settings.test.ts`. Serves AC2, AC3, AC7.
   - Write the exports listed in design.md (Files), as D1, D2, D3, D5 and D6 say.
   - Check: `yarn vitest run src/services/settings.test.ts`.

3. **The router and the view.** Files: `src/routes/settings.ts`, `src/app.ts`,
   `src/views/pages/settings.ejs`, `public/css/base.css`. Serves AC1, AC2, AC3, AC4,
   AC7, AC8, AC9.
   - `createSettingsRouter` with the GET (D2, D6) and the POST (D4). Mount it right
     after `createCalendarRouter` in `createApp`.
   - The view as design.md (Files) says, with the ids of D5, D6, D7 and D8. Add the CSS
     of D12.
   - Check: `yarn vitest run src/settings-page.test.ts src/settings-working-hours.test.ts src/stylesheet.test.ts src/components.test.ts`.

4. **Test typings.** Files: `src/testing/jsdom.d.ts`, `src/testing/dom.ts`. Serves AC5, AC6, AC7, AC9.
   - Add the optional members of D11 and re-export `DomCheckbox`.
   - Check: `yarn build` (and `src/push-client.test.ts` still type-checks).

5. **The page script.** Files: `public/js/settings.js`, `src/settings-client.test.ts`. Serves AC5, AC6, AC7, AC9.
   - Write it exactly as D8 says.
   - Check: `yarn vitest run src/settings-client.test.ts`.

6. **The alarm reads the sound choice.** Files: `public/js/alarm.js`, `src/alarm-sound.test.ts`. Serves AC5.
   - D9.
   - Check: `yarn vitest run src/alarm-sound.test.ts src/alarm.test.ts`. `alarm.test.ts`
     is not edited.

7. **Whole suite.** Serves AC10.
   - Run with `ANTHROPIC_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
     `VAPID_SUBJECT` unset.
   - Check: `yarn build` and `yarn test` pass. `git status --porcelain data/` prints
     nothing, and `git diff --stat main -- 'src/*.test.ts' 'src/**/*.test.ts'` shows
     only `src/ui.test.ts` and `src/shell.test.ts` among the existing test files.

## Tests

Shared setup.

- The server-side files (`src/settings-page.test.ts`, `src/settings-working-hours.test.ts`)
  use `createTestApp()` from `src/testing/app.ts` in `beforeEach` and `close()` in
  `afterEach`. They use `supertest` on `testApp.app`, and parse with `parseHtml` /
  `one` / `all` / `textOf` from `src/testing/dom.ts`. `SETTINGS_PATH` and
  `WORKING_HOURS_PATH` come from `src/services/settings.ts`.
- The client files (`src/settings-client.test.ts`, `src/alarm-sound.test.ts`) follow
  `src/alarm.test.ts`. They keep an `opened: DomWindow[]`, and in `afterEach` they close
  each window and `expect(scriptErrors(window)).toEqual([])`. They drain with
  `flush = () => new Promise((r) => setTimeout(r, 0))`, run scripts with
  `runLinkedScripts(testApp.app, window)`, and use local stubs for `fetch` (records
  `{ url, init }`), `Notification` (settable `permission`, a `requestPermission` that
  counts calls and resolves a given value) and `navigator.serviceWorker`
  (`ready: Promise.resolve({ pushManager: { subscribe, getSubscription } })` with `vi.fn`s).
- `KEY` is the base64url VAPID public key string of `src/push-client.test.ts`, copied.
- No test sets `process.env`. Nothing is written under `data/`.

### AC1: `src/settings-page.test.ts`
- GET `/settings` answers 200 `text/html`. The `title` text is `Settings - Task Image AI`. There is exactly one `main h1`, with text `Settings`.
- With `ANTHROPIC_API_KEY` deleted from `process.env` around the request (and restored in `finally`), the GET still answers 200.
- The nav link with `href="/settings"` has `aria-current="page"`, and it is the only element with `aria-current`. Its visible text is `More`.
- The page has one `script[src="/js/settings.js"]`. GET `/js/settings.js` answers 200 with a content type matching `/javascript/`.
- (`src/shell.test.ts`, changed) the nav hrefs end with `/settings`, and `/more` answers 404 with the not-found `h1`. (`src/ui.test.ts`, changed) the `more` row is `['more', '/settings', 'More']`.

### AC2: `src/settings-working-hours.test.ts`
- On a new database, `form[action="/settings/working-hours"][method="post"]` holds `input[type="time"][name="start"]` with value `09:00` and `input[type="time"][name="end"]` with value `22:00`.
- POST `start=10:30&end=18:00` answers 303 with `Location: /settings`. `getSetting(db, 'working_hours')` is `{ start: '10:30', end: '18:00' }`, and the next GET shows `10:30` and `18:00` in the two inputs.
- POST `start=00:00&end=23:59` answers 303 and is stored (the edges are accepted).
- `it.each` of 400 cases. Each first does `setSetting(db, 'working_hours', { start: '08:00', end: '20:00' })`, then asserts status 400 and that the setting still `toEqual`s `{ start: '08:00', end: '20:00' }`. The bodies: `end=22:00` (no start), `start=09:00` (no end), `start=10:00&start=11:00&end=22:00` (repeated), `start=09:00&end=22:00&end=23:00` (repeated end), `start=9:00&end=22:00`, `start=09:00&end=24:00`, `start=ab:cd&end=22:00`, `start=09:00:00&end=22:00`, `start=12:00&end=12:00` (equal), `start=18:00&end=09:00` (later), and the empty body.
- (`src/services/settings.test.ts`) `readWorkingHours({ start: '09:00', end: '22:00' })` gives a new object equal to the input. `{ start: ['09:00'], end: '22:00' }` gives `undefined`. `{ start: ' 09:00', end: '22:00' }` gives `undefined`. `CLOCK_TIME` accepts `00:00` and `23:59` and turns down `9:00`, `24:00`, `12:60` and `ab:cd`.

### AC3: `src/settings-page.test.ts`
- With the seeded rules, `#slot-rules li` has two items. Each item's four spans, in order (`.slot-rule__category`, `.slot-rule__slot`, `.slot-rule__start`, `.slot-rule__end`), read `coding`, `Morning`, `09:00`, `11:00`, then `shopping`, `Night`, `20:00`, `22:00`.
- With three rules stored in an order unlike the seed (`errands`/`afternoon`, `coding`/`evening`, `gym`/`morning`, with distinct times), the items follow the stored order and show `Afternoon`, `Evening`, `Morning`.
- The section holding `#slot-rules` (its closest `section`) contains no `form` and no `input`.
- With `setSetting(db, 'slot_rules', [])`, there is no `#slot-rules`, and the section's text contains `No slot rules`.
- After a POST to `/settings/working-hours` (valid) and a GET, `getSetting(db, 'slot_rules')` still equals the seed. Also, a POST to `/settings/slot-rules` answers 404 (no route writes the rules).
- (`src/services/settings.test.ts`) `slotRuleRows` of a rule with `time_slot: 'night'` gives `slotLabel: 'Night'`. A rule with an unknown `time_slot` gives that raw value and does not throw.

### AC4: `src/settings-page.test.ts`
- `main [data-theme-toggle]` is one element, a `BUTTON`.
- Open `/settings` with `openPage(html)` (the inline theme script runs), with `systemDark` left out so the theme in effect is light. Clicking the `main` toggle sets `data-theme="dark"` on the root and stores `theme` = `dark` in `window.localStorage`. A second click gives `light`. `scriptErrors` is empty.
- The text of GET `/js/settings.js` does not match `/theme/` (no second mechanism).

### AC5: `src/settings-client.test.ts` and `src/alarm-sound.test.ts`
- (client) With nothing stored, after the scripts run `#alarm-sound` is `checked === true`.
- (client) With `alarm-sound` = `off` stored before `runLinkedScripts`, it is `checked === false`. This fails when the script ignores the key, because the HTML has `checked`.
- (client) With `on` stored, it is checked.
- (client) Setting `checked = false` and dispatching `change` stores `off`. Then `checked = true` and `change` stores `on`.
- (client) Opened with `storageThrows: true`: the box is checked, a `change` throws nothing, and `scriptErrors` is empty.
- (alarm) A pending urgent task with a reminder makes the home page carry the alarm. With `stubClock`, a `fetch` stub answering `{ alarms: [ALARM] }` and a media stub, as in `alarm.test.ts`:
  - with `alarm-sound` = `off`: `#alarm` is shown, `.alarm__title` is the alarm's title, and `played` is `[]`.
  - with `on`: `played` is `[the .alarm__sound]`.
  - with nothing stored: `played` has one entry.
  - opened with `storageThrows: true`: `played` has one entry, and there are no script errors.
- `src/alarm.test.ts` runs unchanged (step 6 check).

### AC6: `src/settings-client.test.ts`
- `it.each` of `granted` → `Alerts are on`, `denied` → `Alerts are blocked in this browser`, `default` → `Alerts are off`: with the `Notification` stub set before the scripts run, `#notification-status` has that text.
- With no `Notification` on the window, the status is `Alerts are not supported`. Clicking `#notification-allow` and `#notification-off` throws nothing (`scriptErrors` empty).
- The page has buttons with the text `Allow alerts` (`#notification-allow`) and `Turn off alerts` (`#notification-off`).
- Allow, with a key. The app is `createTestApp({ vapidPublicKey: KEY })`, `Notification.permission` is `default` and `requestPermission` resolves `granted`, with the service worker stub. Clicking Allow calls `requestPermission` once and `subscribe` once with `{ userVisibleOnly: true, applicationServerKey: KEY }`. `fetch` is called exactly once, to `/push/subscribe`, with method `POST` and the body `endpoint=…&p256dh=…&auth=…` built as in `push-client.test.ts`. The status becomes `Alerts are on`.
- Allow, with `requestPermission` resolving `denied`: `subscribe` is not called, there is no `fetch`, and the status is `Alerts are blocked in this browser`.
- Allow, with `granted` and no key (the default test app): `requestPermission` is called and `subscribe` is not, and there is no `fetch`.
- Turn off, with `getSubscription` resolving a subscription `{ endpoint: 'https://push.example/x', unsubscribe: vi.fn(() => Promise.resolve(true)) }`: `fetch` is called once, to `/push/unsubscribe`, `POST`, body `endpoint=${encodeURIComponent('https://push.example/x')}`, and `unsubscribe` is called once.
- Turn off, with `getSubscription` resolving `null`: there is no `fetch`.

### AC7: `src/settings-page.test.ts` and `src/settings-client.test.ts`
- (page) On a new test app (no `feed_token`), GET `/settings` with `.set('Host', 'example.test:8123')`. `#feed-url` is an `input` with `readonly`, and its value is `http://example.test:8123/calendar.ics?token=${getSetting(db, 'feed_token')}`, the token non-empty.
- (page) GET of `new URL(value).pathname + search` on the same app answers 200 with a content type matching `/^text\/calendar/`.
- (page) With `setSetting(db, 'feed_token', 'kept-token')` first, the value ends with `?token=kept-token` and the setting is unchanged. Two GETs on a new app show the same value.
- (client) With `window.navigator.clipboard = { writeText: vi.fn(() => Promise.resolve()) }`, clicking `#feed-copy` (text `Copy`) calls `writeText` once with `#feed-url`'s value.
- (`src/services/settings.test.ts`) `feedUrl('https', 'a.example', 'abc_-1')` is `https://a.example/calendar.ics?token=abc_-1`.

### AC8: `src/settings-page.test.ts`
- `beforeEach` of this describe: `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(new Date('2026-10-12T21:30:00.000Z'))`. `afterEach`: `vi.useRealTimers()`. There is exactly one `a[href="/day/2026-10-13/ics"]` and exactly one `a[href="/upcoming/ics"]`, and both have the `download` attribute.

### AC9: `src/settings-client.test.ts`
- The page has one `button#install-app` with text `Install app` and the `hidden` attribute (parsed with scripts off).
- After the scripts run, with no event, it is still `hidden`, and clicking it throws nothing.
- Dispatch `new window.Event('beforeinstallprompt', { cancelable: true })`, with `prompt: vi.fn(() => Promise.resolve())` assigned. `window.dispatchEvent` returns `false` (preventDefault was called), and the button no longer has `hidden`. Clicking it calls `prompt` once and makes the button `hidden` again. A second click does not call `prompt` again.

### AC10
- Step 7's check. The suite needs no `ANTHROPIC_API_KEY` or `VAPID_*` (the test apps take the key as an option), and every database is `:memory:`.
