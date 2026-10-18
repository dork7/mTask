# 022-settings: build

Branch `factory/022-settings`, code commit `545406b` (and `5f5dd67`, an error log entry),
built on Node v26.8.2 and yarn 1.22.22.

## What changed

Created:

| File | Why |
|---|---|
| `src/services/settings.ts` | `SETTINGS_PATH`, `WORKING_HOURS_PATH`, `CLOCK_TIME`, `readWorkingHours`, `SlotRuleRow`, `slotRuleRows`, `feedUrl`, `SettingsPage` (D1, D2, D3, D5, D6) |
| `src/routes/settings.ts` | `createSettingsRouter`: `GET /settings` builds the page object and calls `ensureFeedToken`; `POST /settings/working-hours` stores the hours or answers 400 (D2, D4, D6) |
| `src/views/pages/settings.ejs` | The six sections: Working hours, Slot rules, Appearance, Alerts, Calendar, App, then the script tag (D5 to D8, Files) |
| `public/js/settings.js` | Sound checkbox, alert status, Allow and Turn off, Copy, install prompt (D8) |
| `src/services/settings.test.ts` | Unit tests of the pure module (AC2, AC3, AC7) |
| `src/settings-page.test.ts` | AC1, AC3, AC4, AC7, AC8 |
| `src/settings-working-hours.test.ts` | AC2 |
| `src/settings-client.test.ts` | AC5, AC6, AC7 (Copy), AC9 |
| `src/alarm-sound.test.ts` | AC5 (alarm side) |
| `docs/errors/supertest-host-port-changes-per-request.md` | The error log entry for the one error that needed a fix |

Changed:

| File | Why |
|---|---|
| `src/ui.ts` | The `more` nav item's href is `/settings` (D10) |
| `src/ui.test.ts`, `src/shell.test.ts` | The expected href, and the `/more` case renamed to `'%s answers with the not-found page'`, still a 404 (D10) |
| `src/app.ts` | Mounts the router right after the calendar router (Approach, Files) |
| `public/js/alarm.js` | `soundOn()`; `play` only when `alarm-sound` is not `off`; one sentence in the header comment (D9) |
| `public/css/base.css` | The settings block after the `.later__*` rules, tokens only (D12) |
| `src/testing/jsdom.d.ts`, `src/testing/dom.ts` | `hidden`, `DomCheckbox`, `select()`, `unsubscribe?`, `getSubscription?`, `navigator.clipboard?`, and the `DomCheckbox` re-export (D11) |

## Acceptance criteria

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1 page | `src/settings-page.test.ts` "the page (AC1)" (4 tests); `src/shell.test.ts`, `src/ui.test.ts` | `src/ui.ts` href back to `/more`: "marks the More item, which links to /settings, as the current page" failed | PASS |
| AC2 working hours | `src/settings-working-hours.test.ts` (14 tests); `src/services/settings.test.ts` | Dropped `if (start >= end) return undefined;`: "answers 400 to equal times" and "to a start later than the end" failed. Also made the 400 path write a value: 11 of the 400 cases failed | PASS |
| AC3 slot rules | `src/settings-page.test.ts` "the slot rules, read-only (AC3)" (5 tests); `src/services/settings.test.ts` | `slotLabel` from the slot's id in place of its label: "lists the seeded rules with the slot labels" and "keeps the stored order" failed. Removed the empty state: "shows No slot rules when the setting is empty" failed | PASS |
| AC4 theme | `src/settings-page.test.ts` "the theme (AC4)" (3 tests) | Removed `data-theme-toggle` from the page's button: "has one theme toggle in main, a button" and "toggles and saves the theme through the layout script" failed | PASS |
| AC5 sound | `src/settings-client.test.ts` "the sound checkbox (AC5)" (5 tests); `src/alarm-sound.test.ts` (4 tests); `src/alarm.test.ts` unchanged | Removed `box.checked = readSound() !== 'off'`: "is unchecked with off stored" failed. `alarm.js` back to `if (sound)`: "shows the alarm without playing when the sound is off" failed | PASS |
| AC6 notifications | `src/settings-client.test.ts` "the alerts (AC6)" (9 tests) | Removed the `subscribe()` call: "asks, subscribes and posts once on Allow when it is granted" failed. Changed the denied text: "shows the status of permission denied" failed. Removed `subscription.unsubscribe()`: "posts the endpoint and unsubscribes on Turn off alerts" failed | PASS |
| AC7 feed URL | `src/settings-page.test.ts` "the feed URL (AC7)" (4 tests); `src/settings-client.test.ts` "Copy (AC7)"; `src/services/settings.test.ts` | Hard-coded `'localhost'` as the host: "shows the feed URL on the request host, with a token it made" failed. `writeText('')`: "writes the feed URL to the clipboard once" failed | PASS |
| AC8 `.ics` downloads | `src/settings-page.test.ts` "the .ics downloads (AC8)" | UTC date (`now.toISOString().slice(0, 10)`): "links the upcoming download and the Dubai day download" failed | PASS |
| AC9 install prompt | `src/settings-client.test.ts` "Install app (AC9)" (3 tests) | Removed `install.hidden = false`: "shows on the event, prompts once on a click and hides again" failed | PASS |
| AC10 build and tests | The whole suite with `ANTHROPIC_API_KEY` and the three `VAPID_*` unset | n/a | PASS: `yarn build` exit 0, 2260 tests passed; `git status --porcelain data/` printed nothing; `git diff --stat main -- 'src/*.test.ts' 'src/**/*.test.ts'` showed only `src/shell.test.ts` and `src/ui.test.ts` |

A script applied each break, ran the named test file and put the file back.
`git status --short` afterwards showed only the intended changes.

Checked by hand: nothing. The spec's hand checks (the real install dialog, the
permission dialog, a real push, the real clipboard, subscribing from a calendar app) need
a device or a live browser, and none was available here.

## Test run

`env -u ANTHROPIC_API_KEY -u VAPID_PUBLIC_KEY -u VAPID_PRIVATE_KEY -u VAPID_SUBJECT yarn build`:

```
yarn run v1.22.22
$ tsc --noEmit
Done in 1.17s.
```

`env -u ANTHROPIC_API_KEY -u VAPID_PUBLIC_KEY -u VAPID_PRIVATE_KEY -u VAPID_SUBJECT yarn test`:

```
 Test Files  88 passed (88)
      Tests  2260 passed (2260)
   Start at  18:49:25
   Duration  4.10s (tests 54%, import 39%, transform 6%)
Done in 4.55s.
```

```
VERIFICATION
Build: PASS
Tests: PASS   (2260 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped. Small differences from the design:

- Each section's `h2` has an id, and its `section` points to it with `aria-labelledby`,
  as `home.ejs` does. The AC3 empty-state test uses that attribute to find the section.
- The two-visit test in AC7 sets `Host: example.test` on both requests. Supertest
  listens on a new port for each request, so the host differs otherwise
  (`docs/errors/supertest-host-port-changes-per-request.md`).
- The plan's step 3 check ran after `public/js/settings.js` was written (step 5),
  because the AC1 and AC4 page tests fetch that script.
