# 017-pwa-shell: manifest, icons and offline app shell

## Goal

Task Image AI is used mostly on a phone, and the plan asks for it to install there and to
keep working offline (`docs/plan.md`, task 16). Dark mode is already done in 002; this
job adds the remaining parts of task 16: the web manifest, the icons, a service worker
that caches the app shell, and an offline page. The result is a page the browser can
offer to install, and a page that keeps working when the network drops.

The static assets sit under `public/`, which the app already serves. The layout is in
`src/views/layout.ejs`, the entry the service worker caches. The manifest and icons live
under `public/`, alongside the existing `css/` and `js/` folders.

## Acceptance criteria

- **AC1**: Manifest. `GET /manifest.webmanifest` returns 200 with content type
  `application/manifest+json`. The body is a JSON object with:
  - `name`: `"Task Image AI"`
  - `short_name`: `"Task Image AI"`
  - `start_url`: `"/"`
  - `display`: `"standalone"`
  - `background_color`: a hex color string
  - `theme_color`: a hex color string
  - `icons`: an array with at least one entry, each with `src`, `sizes`, and `type`

- **AC2**: Icons. For every entry in the manifest's `icons` array, `GET <src>` returns
  200 with a content type that matches the entry's `type`.

- **AC3**: Service worker. `GET /sw.js` returns 200 with content type
  `application/javascript`. The source contains:
  - `self.addEventListener("install"` and `self.addEventListener("fetch"`
  - The URLs of every page the app shell caches, including `/`, `/manifest.webmanifest`,
    and `/css/base.css`

- **AC4**: Layout registration. Every page rendered in the layout includes:
  - `<link rel="manifest" href="/manifest.webmanifest">` in the `<head>`
  - `<meta name="theme-color" content="...">` with a hex color
  - A script that calls `navigator.serviceWorker.register("/sw.js")`

- **AC5**: Offline page. There is an offline page at a fixed URL. The service worker's
  fetch handler serves this page when the network is unavailable and the requested URL
  is not in the cache. The offline page is itself cached by the service worker on
  install.

- **AC6**: Tests and build. `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY`
  unset. There are tests for:
  - the manifest's status code, content type, and JSON fields (AC1);
  - each icon's status code (AC2);
  - the service worker's status code, content type, and the presence of the install
    and fetch listeners in its source (AC3);
  - the layout's manifest link, theme-color meta, and SW registration script (AC4);
  - the offline page's status code (AC5).

## Out of scope

- The install prompt itself. The plan's "Done when" is "the app installs on a phone";
  that needs a device and is checked by hand (backlog).
- Push notifications, which come with the reminders (018) and web push (019).
- Updating the offline cache when the app changes. The service worker caches once on
  install and never updates. Background sync and cache versioning come with hardening
  (023).
- Any change to the app shell's pages, routes, or components. This job only adds the
  manifest, icons, service worker, and offline page.
- A service worker for push or background sync. Those come with 019.
