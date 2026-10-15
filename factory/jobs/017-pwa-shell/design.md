# 017-pwa-shell: design

No spec problems. One reading of AC3 is fixed under D3 because the wording "the URLs of
every page the app shell caches" could be taken to require a specific set, and the spec
only lists three as examples.

Everything marked "checked" below was run in a throwaway copy outside the repo, on this
machine (Node 26.8.2, yarn 1.22.22, Express 5.3.0).

## Approach

The job adds four static files under `public/` and edits one view. The app already serves
`public/` at the root via `express.static(publicDir)` (`src/app.ts:50`), so the manifest,
icon, service worker and offline page need no new routes.

**Manifest.** `public/manifest.webmanifest` is a JSON file. Express 5 serves it with
content type `application/manifest+json` (checked). It declares the app name, display
mode, colors and one icon entry.

**Icons.** `public/icons/icon.svg` is an SVG file. Express serves it with content type
`image/svg+xml` (checked). The manifest references it with `type: "image/svg+xml"` and
`sizes: "any"`, which Chrome accepts for PWA installability.

**Service worker.** `public/sw.js` is a plain JavaScript file. Express serves it with
content type `application/javascript` (checked). It has an install listener that caches
the app shell and a fetch listener that tries the network first, falls back to the cache,
and finally to the offline page.

**Offline page.** `public/offline.html` is a static HTML file. It is a simple page with
a message and a reload button. The service worker caches it on install and serves it for
requests that fail offline.

**Layout.** `src/views/layout.ejs` gains three things in the `<head>`: a manifest link,
a theme-color meta tag, and an inline script that registers the service worker. The
script guards the registration with `if ('serviceWorker' in navigator)` so it does not
throw in browsers without the API.

**Tests.** `src/pwa.test.ts` checks the manifest, icons, service worker, layout and
offline page. It uses the existing `withTestApp` helper and `supertest` to request
resources from the app. It uses `parseHtml` from `src/testing/dom.ts` to check the layout
HTML.

## Decisions

**D1. Icons are SVG files, not PNGs.** `public/icons/icon.svg` is a text file the builder
can write directly. The manifest references it with `type: "image/svg+xml"` and
`sizes: "any"`. Rejected: PNG icons, which are binary and would need to be generated with
a script, adding a dependency or a build step.

**D2. The offline page is a static HTML file at `/offline.html`.** It is served by
`express.static` and cached by the service worker. The service worker's fetch handler
serves it for navigation requests that fail offline. Rejected: a route for the offline
page, which would require changes to `src/routes/` and is out of scope.

**D3. The app shell is the five URLs: `/`, `/manifest.webmanifest`, `/css/base.css`,
`/icons/icon.svg`, and `/offline.html`.** The service worker caches these on install.
AC3 requires the source to contain the URLs of every page the app shell caches, including
`/`, `/manifest.webmanifest`, and `/css/base.css`. The "including" means the three listed
are a minimum; the other two are part of the shell. Rejected: caching only the three
listed, which would leave the icon and offline page uncached.

**D4. The layout changes are inline in `src/views/layout.ejs`, not a partial.** The
manifest link, theme-color meta and SW registration script are added directly to the
`<head>`. The SW registration is guarded with `if ('serviceWorker' in navigator)`. This
avoids creating a new partial, which would be a component change. The three additions
are small and specific to this job. Rejected: a new partial, which is a component and
out of scope per the spec.

**D5. Manifest colors are hex values from the existing palette.** `background_color` is
`"#eef0f4"` (the light background) and `theme_color` is `"#4f46e5"` (the accent). These
are the same values used in `public/css/base.css` under `:root`.

**D6. The test file is `src/pwa.test.ts`.** It follows the naming convention of existing
test files (`src/app.test.ts`, `src/shell.test.ts`, etc.).

## Files

Created:

- `public/manifest.webmanifest`: a JSON object with `name`, `short_name`, `start_url`,
  `display`, `background_color`, `theme_color` and `icons` (D5, D1).
- `public/icons/icon.svg`: an SVG file with `viewBox="0 0 512 512"` and a simple design
  (D1).
- `public/sw.js`: a service worker with `self.addEventListener("install")` and
  `self.addEventListener("fetch")` (D3).
- `public/offline.html`: a static HTML page with a message and a reload button (D2).
- `src/pwa.test.ts`: tests for AC1 through AC5 (D6).

Changed:

- `src/views/layout.ejs`: the `<head>` gains, after the theme-script include:
  - `<meta name="theme-color" content="#4f46e5">`
  - `<link rel="manifest" href="/manifest.webmanifest">`
  - An inline `<script>` that guards and calls
    `navigator.serviceWorker.register("/sw.js")` (D4).

Not touched: `src/app.ts` (static files are already served), `src/routes/` (no new
routes), `src/views/pages/` (no page changes), `src/views/partials/` (no new partials),
and `public/css/base.css` (no style changes).

## Risks

- **Express does not serve `.webmanifest` with the right content type.** The AC1 test
  checks the content type of `GET /manifest.webmanifest`. Checked: Express 5.3.0 serves
  it with `application/manifest+json`.
- **The service worker source does not contain the required URLs.** The AC3 test checks
  that the source contains `/`, `/manifest.webmanifest` and `/css/base.css`. The test
  would fail if any of these strings is missing from `public/sw.js`.
- **The layout does not register the service worker.** The AC4 test checks that the
  HTML contains `navigator.serviceWorker.register("/sw.js")`. The test would fail if the
  script is missing from the layout.
- **The offline page is not cached.** The AC3 test checks that `/offline.html` appears
  in the service worker source (as part of D3). The test would fail if the offline page
  URL is missing.
- **Icons return the wrong content type.** The AC2 test reads the manifest, gets each
  icon `src`, and checks that `GET <src>` returns a content type matching the icon
  `type`. The test would fail if the icon file extension does not match the declared
  type.
- **The SW registration script throws in jsdom.** The AC4 test uses `parseHtml` (scripts
  off), so the script never runs in the test. Even if it did, the guard
  `if ('serviceWorker' in navigator)` prevents a throw in browsers without the API.
