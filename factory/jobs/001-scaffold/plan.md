# 001-scaffold: plan

Decision numbers (D1, D2, …) refer to `design.md`.

## Steps

1. **Tooling.** Files: `package.json`, `yarn.lock`, `tsconfig.json`, `vitest.config.ts`.
   Serves AC6.
   - `yarn add --exact express@5.3.0 ejs@7.0.1`
   - `yarn add --dev --exact vite@8.3.0 supertest@7.3.1 @types/express@5.0.6 @types/supertest@7.2.1 @types/node@26.6.5`
   - Add the `dev` and `build` scripts and the `engines` field (D3). Replace the
     compiler options and `include` in `tsconfig.json` with those in D4. Write
     `vitest.config.ts` (D12).
   - Check: `yarn test` no longer stops with `Cannot find package 'vite'`; it now
     reports that there are no test files.

2. **Paths and config.** Files: `src/paths.ts`, `src/config.ts`, `src/config.test.ts`.
   Serves AC4.
   - `rootDir`, `viewsDir`, `publicDir` (D13); `loadEnv` (D5); `getPort` (D10).
   - Check: `yarn test src/config.test.ts` passes and `yarn build` is clean.

3. **App, layout and home page.** Files: `src/render.ts`, `src/app.ts`,
   `src/routes/home.ts`, `src/views/layout.ejs`, `src/views/pages/home.ejs`,
   `src/app.test.ts`. Serves AC1 and AC4.
   - `renderPage` (D6), `createApp` without the 404 handler yet, `homeRouter`, the
     layout and the home fragment.
   - Check: the AC1 tests and the "does not listen" test pass.

4. **Base stylesheet.** Files: `public/css/base.css`, `src/app.test.ts`. Serves AC2.
   - Write the stylesheet (D7, D8). `express.static(publicDir)` is already mounted in
     step 3; the layout already links `/css/base.css`.
   - Check: the AC2 tests pass.

5. **404 page.** Files: `src/views/pages/not-found.ejs`, `src/app.ts`,
   `src/app.test.ts`. Serves AC3.
   - Add the 404 handler as the last middleware in `createApp`.
   - Check: the AC3 tests pass.

6. **Listener.** Files: `src/server.ts`, `src/server.test.ts`. Serves AC4.
   - `loadEnv()`, `getPort()`, `createApp().listen(port, …)`, in that order.
   - Check: `src/server.test.ts` passes. By hand: `yarn dev` prints the URL and
     `http://localhost:3000/` shows the styled page; `PORT=4000 yarn dev` listens on
     4000.

7. **Environment files and folders.** Files: `.env.example`, `.gitignore`,
   `src/services/.gitkeep`, `src/db/.gitkeep`, `src/project.test.ts`. Serves AC5.
   - Check: the AC5 tests pass; `git check-ignore .env` prints `.env`.

8. **Project facts and command checks.** Files: `CLAUDE.md`, `src/project.test.ts`.
   Serves AC6.
   - Edit Project facts as described under Files in `design.md`.
   - Add the AC6 tests and the plain-Node load test.

9. **Verify.** No files. Serves AC6.
   - Run `yarn build` and `yarn test`, then the verification loop, and record the real
     output in `build.md`.

## Tests

Shared setup. `src/app.test.ts` calls `request(createApp())` from supertest for every
request. Tests that change `process.env`, mock a module or spy on a prototype undo it in
`afterEach` (`vi.unstubAllEnvs()`, `vi.resetModules()`, `vi.restoreAllMocks()`).
`src/project.test.ts` reads repo files by joining names onto `rootDir` from
`src/paths.ts`.

### AC1: `src/app.test.ts`

- `GET /` has status 200 and a `content-type` starting with `text/html`.
- The body has exactly one `<html` and a `<title>` that contains `Task Image AI`.
- The header element with class `site-header` contains `Task Image AI`.
- `<h1>Today</h1>` appears between `<main` and `</main>`: the home view was rendered
  inside the layout.

### AC2: `src/app.test.ts`

- The `GET /` body has a `<link rel="stylesheet" href="…">`. The test takes the `href`
  from it and requests that URL.
- That response has status 200 and a `content-type` starting with `text/css`.
- The CSS has a `:root { … }` block that declares at least `--bg`, `--text` and
  `--accent`.
- With every `:root { … }` block removed, the rest of the CSS contains no hex color and
  no `rgb(`, `rgba(`, `hsl(` or `hsla(`.
- Every `var(--name)` used in the CSS is declared in the `:root` block.

### AC3: `src/app.test.ts`

- `GET /no-such-page` has status 404 and a `content-type` starting with `text/html`.
- The body has the same layout markers as AC1 (one `<html`, the app name in `<title>`,
  the `site-header` with the app name, the same stylesheet `href` as the home page).
- `<h1>Page not found</h1>` appears between `<main` and `</main>`.
- `POST /no-such-page` is also 404 with the same page: the handler is not tied to `GET`.

### AC4: three files

`src/app.test.ts`:
- With a spy on `http.Server.prototype.listen` in place and the module cache reset,
  `await import('./app.ts')` followed by `createApp()` leaves the spy uncalled (D9).

`src/config.test.ts`:
- `getPort({})` is 3000; `getPort({ PORT: '' })` is 3000.
- `getPort({ PORT: '4123' })` is 4123.
- `getPort` throws for `'abc'`, `'0'`, `'70000'` and `'80.5'`, and the message contains
  the value.
- With `PORT` removed from `process.env` and a temp file holding `PORT=4123`,
  `loadEnv(file)` then `getPort()` gives 4123: the port is read from the `.env` file.
- With `process.env.PORT` already `'5000'`, `loadEnv(file)` leaves it `'5000'`.
- `loadEnv` on a path that does not exist does not throw.

`src/server.test.ts` (uses `vi.doMock('./app.ts', …)` so `createApp` returns an object
whose `listen` is a spy, and `vi.doMock('./config.ts', …)` to keep the real `getPort`
but replace `loadEnv` with a spy; then `await import('./server.ts')`):
- With `PORT` stubbed to `'4567'`, `listen` is called once with 4567 as its first
  argument.
- With `PORT` unset, `listen` is called with 3000.
- `loadEnv` is called before `listen`.

No test in the suite calls the real `listen` on a fixed port.

### AC5: `src/project.test.ts`

- Collect every name matched by `env.NAME` or `env['NAME']` (upper-case names) in the
  `.ts` files under `src/`, leaving out `*.test.ts`. The set is not empty, it includes
  `PORT`, and every name in it is a key of `.env.example` as parsed by `parseEnv` from
  `node:util`.
- One line of `.gitignore`, trimmed, is exactly `.env`.

### AC6: `src/project.test.ts`, plus the commands themselves

- `package.json` scripts: `test` is `vitest run`, `build` is `tsc --noEmit`, `dev` is
  `node --watch src/server.ts`; `supertest` and `vitest` are in `devDependencies`.
- In `CLAUDE.md`, the text from `## Project facts` up to the next `## ` heading contains
  `` `yarn test` ``, `` `yarn build` `` and `` `yarn dev` ``.
- Plain-Node load test: running `process.execPath` with `--input-type=module -e` and a
  script that imports `./src/app.ts` and calls `createApp()`, with `cwd` set to
  `rootDir`, exits with code 0. This is the check that the `dev` command's runtime can
  load the app.
- "`yarn test` passes" and "`yarn build` type-checks with no errors" are proved by
  running the two commands. Step 9 records their real output in `build.md`; the
  reviewers run them again.
