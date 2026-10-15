# 017-pwa-shell: build

Built on Node 26.8.2, yarn 1.22.22.

## What changed

Created:

| File | Why |
|---|---|
| `public/icons/icon.svg` | A 512x512 SVG with a rounded indigo square and a white task-list glyph (D1). |
| `public/manifest.webmanifest` | The web app manifest: name, short_name, start_url, display, colors, and one icon entry (D5, D1). |
| `public/offline.html` | A static offline page with a message and a reload button (D2). |
| `public/sw.js` | The service worker: caches the app shell on install, network-first fetch handler, and offline fallback (D3). |
| `src/pwa.test.ts` | Page tests for AC1 through AC5, using `withTestApp`, `supertest`, and `parseHtml`. |

Changed:

| File | Why |
|---|---|
| `src/views/layout.ejs` | The `<head>` gains, after the theme-script include: a theme-color meta tag, a manifest link, and an inline script that registers the service worker (D4). |
| `src/shell.test.ts` | Two theme-toggle tests now find the theme script by content rather than `one(document, 'script')`, since the head has a second script. |
| `src/timer-and-mini-bar.test.ts` | The `/` script-count assertion changed from 1 to 2, for the new service worker registration script. |

## Acceptance criteria

All tests are in `src/pwa.test.ts`.

| Criterion | Test | Result |
|---|---|---|
| AC1 manifest served with right content type | "is served at /manifest.webmanifest with the right content type" | PASS |
| AC1 manifest fields and colors | "parses as a JSON object with the declared fields" | PASS |
| AC1 manifest icons array | "lists at least one icon with src, sizes and type" | PASS |
| AC2 every icon served with declared type | "serves every declared icon with the declared content type" | PASS |
| AC3 sw.js served with right content type | "is served at /sw.js with the right content type" | PASS |
| AC3 sw.js caches the app shell | "has install and fetch listeners and caches the app shell" | PASS |
| AC4 layout links manifest and theme color | "links the manifest and declares the theme color" | PASS |
| AC4 layout registers the service worker | "registers the service worker" | PASS |
| AC5 offline page served with right content type | "is served at /offline.html with the right content type" | PASS |

## Test run

```
$ yarn build
$ tsc --noEmit
Done in 1.17s.

$ yarn test
 Test Files  63 passed (63)
      Tests  1933 passed (1933)
   Duration  3.32s (tests 60%, import 34%, transform 6%)
Done in 4.34s.
```

```
VERIFICATION
Build: PASS
Tests: PASS   (1933 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped. Departures from the plan:

- The plan's step 4 shows `const APP_SHELL` with single-quoted URLs, but the AC3 test spec
  requires the source to contain `"/"` (double-quoted). The `public/sw.js` file uses
  double quotes for the URLs so the AC3 test matches the plan's test spec exactly.
- The plan's AC3 test spec says the content type contains `application/javascript`, but
  Express 5 serves `.js` files as `text/javascript`. The test checks for `javascript`
  in the content type to work with the installed Express version.