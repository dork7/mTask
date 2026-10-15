# 017-pwa-shell: plan

Decision numbers (D1, D2, D3, D4, D5) refer to `design.md`.

## Steps

1. **Icons.** Files: `public/icons/icon.svg`. Serves AC2.
   - Write an SVG file with `viewBox="0 0 512 512"` and a simple design: a filled
     rounded square in the accent color `#4f46e5` with a white task-list glyph (three
     horizontal lines with check marks).
   - Check: `file public/icons/icon.svg` reports it as an SVG.

2. **Manifest.** Files: `public/manifest.webmanifest`. Serves AC1.
   - Write the JSON object: `name`, `short_name`, `start_url`, `display`,
     `background_color`, `theme_color` (D5), and `icons` with one entry for
     `/icons/icon.svg` (D1).
   - Check: `node -e "console.log(JSON.stringify(require('node:fs').readFileSync('public/manifest.webmanifest','utf8')))"` prints valid JSON.

3. **Offline page.** Files: `public/offline.html`. Serves AC5.
   - Write a minimal HTML page with a `<title>Offline</title>`, a heading, a message
     that the app is offline, and a `<button onclick="location.reload()">Try again</button>`.
   - Check: `node -e "console.log(require('node:fs').readFileSync('public/offline.html','utf8').includes('Offline'))"` prints `true`.

4. **Service worker.** Files: `public/sw.js`. Serves AC3, AC5.
   - Write the service worker with:
     - `const CACHE_NAME = 'task-image-ai-v1'`
     - `const APP_SHELL = ['/', '/manifest.webmanifest', '/css/base.css', '/icons/icon.svg', '/offline.html']` (D3)
     - `self.addEventListener("install", ...)` that calls `caches.open(CACHE_NAME)` and
       `cache.addAll(APP_SHELL)`
     - `self.addEventListener("activate", ...)` that cleans up old caches and calls
       `self.clients.claim()`
     - `self.addEventListener("fetch", ...)` that tries the network first, falls back to
       the cache, and finally to `/offline.html` for navigation requests.
   - Check: `grep -q 'self.addEventListener("install"' public/sw.js && grep -q 'self.addEventListener("fetch"' public/sw.js && echo 'OK'` prints `OK`.

5. **Layout registration.** Files: `src/views/layout.ejs`. Serves AC4.
   - In the `<head>`, after `<%- include('partials/theme-script') -%>`, add:
     - `<meta name="theme-color" content="#4f46e5">`
     - `<link rel="manifest" href="/manifest.webmanifest">`
     - A `<script>` block that contains:
       ```
       if ('serviceWorker' in navigator) {
         navigator.serviceWorker.register("/sw.js");
       }
       ```
   - Check: `grep -q 'rel="manifest"' src/views/layout.ejs && grep -q 'theme-color' src/views/layout.ejs && grep -q 'serviceWorker.register' src/views/layout.ejs && echo 'OK'` prints `OK`.

6. **Tests.** Files: `src/pwa.test.ts`. Serves AC6.
   - Write the test file described in the Tests section below.
   - Check: `yarn test src/pwa.test.ts` passes.

7. **Verify.** No files. Serves AC6.
   - Run `yarn build` and `yarn test`, then the verification loop, and record the real
     output in `build.md`.

## Tests

Shared setup. `src/pwa.test.ts` uses `withTestApp` from `src/testing/app.ts` to get a
fresh app for each test. It uses `supertest` to make requests. It uses `parseHtml` from
`src/testing/dom.ts` to parse HTML responses.

### AC1: `src/pwa.test.ts`

- `GET /manifest.webmanifest` has status 200.
- The response `content-type` contains `application/manifest+json`.
- The body parses as a JSON object.
- `manifest.name` is `"Task Image AI"`.
- `manifest.short_name` is `"Task Image AI"`.
- `manifest.start_url` is `"/"`.
- `manifest.display` is `"standalone"`.
- `manifest.background_color` matches `/^#[0-9a-fA-F]{6}$/`.
- `manifest.theme_color` matches `/^#[0-9a-fA-F]{6}$/`.
- `manifest.icons` is a non-empty array.
- Every entry in `manifest.icons` has `src`, `sizes` and `type` properties.

### AC2: `src/pwa.test.ts`

- For every entry in the manifest's `icons` array, `GET <src>` returns status 200.
- The response `content-type` contains the entry's `type`.
- The test reads the manifest first, then requests each icon URL, so a change to the
  manifest's icon `src` or `type` makes the test fail.

### AC3: `src/pwa.test.ts`

- `GET /sw.js` has status 200.
- The response `content-type` contains `application/javascript`.
- The source contains `self.addEventListener("install"`.
- The source contains `self.addEventListener("fetch"`.
- The source contains `"/"` (the home page).
- The source contains `"/manifest.webmanifest"`.
- The source contains `"/css/base.css"`.
- The source contains `"/offline.html"` (D3).
- The source contains `"/icons/icon.svg"` (D3).

### AC4: `src/pwa.test.ts`

- `GET /` has status 200.
- The HTML contains `<link rel="manifest" href="/manifest.webmanifest">`.
- The HTML contains `<meta name="theme-color" content="#4f46e5">`.
- The HTML contains `navigator.serviceWorker.register("/sw.js")`.
- The test uses `parseHtml` to parse the HTML, so the assertions run against the DOM.

### AC5: `src/pwa.test.ts`

- `GET /offline.html` has status 200.
- The response `content-type` contains `text/html`.
- The body contains `Offline` (the heading text).
