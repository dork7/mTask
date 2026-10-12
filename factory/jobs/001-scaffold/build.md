# 001-scaffold: build

Branch `factory/001-scaffold`, commit `310416f`. Built on Node 25.4.0, yarn 1.22.22.

## What changed

Created:

| File | Why |
|---|---|
| `src/paths.ts` | `rootDir`, `viewsDir`, `publicDir`, built from `import.meta.dirname` (D13). |
| `src/config.ts` | `DEFAULT_PORT`, `loadEnv` (`process.loadEnvFile`, ignores a missing file only, D5) and `getPort` (D10). The only file under `src/` that reads the environment. |
| `src/render.ts` | `PageLocals` and `renderPage(res, page, locals)`, which renders `layout` with the page name (D6). Carries the "never from a request" rule as a comment. |
| `src/app.ts` | `createApp()`: EJS view engine, `app.locals.appName`, `express.static(publicDir)`, the home router, then the 404 handler. No `listen`, no env reads. |
| `src/server.ts` | The entry point: `loadEnv()`, `getPort()`, `createApp().listen(port, callback)`. |
| `src/routes/home.ts` | `homeRouter`, `GET /` renders the `home` page. |
| `src/views/layout.ejs` | The whole document: title, viewport, stylesheet link, `site-header` with the app name, `<main class="page">` around the page include. |
| `src/views/pages/home.ejs`, `src/views/pages/not-found.ejs` | The two page fragments. |
| `public/css/base.css` | `:root` with the light values and names from `docs/mockUps.html` (D8), a reset, and rules for `body`, `a`, `.site-header`, `.page`, `h1`, `.muted`. No color literal outside `:root`. |
| `src/services/.gitkeep`, `src/db/.gitkeep` | Keep the two empty folders in git. |
| `vitest.config.ts` | Node environment, `include: ['src/**/*.test.ts']` (D12). |
| `.env.example` | A comment and `PORT=3000`. |
| `src/app.test.ts`, `src/config.test.ts`, `src/server.test.ts`, `src/project.test.ts` | The tests in the table below. |
| `docs/errors/express5-listen-callback-hides-failure.md` | Error log entry for the one failure that needed a fix (see Not done). |

Changed:

| File | Why |
|---|---|
| `package.json`, `yarn.lock` | The pinned dependencies in D2 (including `vite`, without which Vitest cannot start), the `dev` and `build` scripts, `engines.node >= 22.18.0`. |
| `tsconfig.json` | The compiler options and `include` in D4. |
| `.gitignore` | A `.env` line. |
| `CLAUDE.md` | Project facts only: Test, Build and Dev command bullets, and the D3 rule on the Language bullet. |

## Acceptance criteria

Each test was also checked the other way: I broke the behaviour it covers, saw the test
fail, and restored the file. The "Fails when" column is what I broke.

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1: `GET /` is 200 HTML | `src/app.test.ts` > GET / (AC1) > returns 200 with an HTML page | home router removed from `app.ts` | PASS |
| AC1: shared layout carries "Task Image AI" | `src/app.test.ts` > GET / (AC1) > renders the shared layout, which carries the app name | app name changed in `app.ts` | PASS |
| AC1: EJS view rendered inside the layout | `src/app.test.ts` > GET / (AC1) > renders the home view inside the layout | page include removed from `layout.ejs` | PASS |
| AC2: layout links a stylesheet served as `text/css` | `src/app.test.ts` > base stylesheet (AC2) > is linked from the layout and served as text/css | link removed; `express.static` removed | PASS |
| AC2: colors are CSS variables on `:root` | `src/app.test.ts` > base stylesheet (AC2) > defines its colors as CSS variables on :root; > has no color literal outside :root; > declares on :root every variable it uses | a hex color put in `.muted`; `--border` removed from `:root` | PASS |
| AC3: unknown path is 404 HTML | `src/app.test.ts` > unknown path (AC3) > returns 404 with an HTML page | `res.status(404)` removed | PASS |
| AC3: rendered in the same layout | `src/app.test.ts` > unknown path (AC3) > renders the not-found view in the same layout as the home page; > answers any method, not only GET | handler replaced by `res.send(...)` | PASS |
| AC4: app created separately from the listener | `src/app.test.ts` > app without a listener (AC4) > does not listen when the module is imported and the app is created | `app.listen(0)` added to `createApp` | PASS |
| AC4: listens on `PORT` | `src/server.test.ts` > server (AC4) > listens on PORT; `src/config.test.ts` > getPort (AC4) > uses PORT when it is a valid port number, and the four "throws for PORT=..." cases | `getPort` made to ignore `PORT` | PASS |
| AC4: `PORT` is read from `.env` | `src/config.test.ts` > loadEnv (AC4) > reads PORT from the .env file; > does not overwrite a PORT that is already set; > does not throw when the file does not exist; > rethrows an error that is not a missing file; `src/server.test.ts` > server (AC4) > loads .env before it listens | `process.loadEnvFile` call removed; `loadEnv()` removed from `server.ts` | PASS |
| AC4: 3000 when `PORT` is not set | `src/config.test.ts` > getPort (AC4) > is 3000 when PORT is not set; > is 3000 when PORT is blank; `src/server.test.ts` > server (AC4) > listens on 3000 when PORT is not set | `DEFAULT_PORT` changed to 3001 | PASS |
| AC4 (added, see Not done): a failed listen is not reported as running | `src/server.test.ts` > server (AC4) > announces the URL once it is listening; > fails instead of announcing a URL when it cannot listen | `if (error) throw error;` removed | PASS |
| AC5: `.env.example` lists every variable the app reads | `src/project.test.ts` > environment files (AC5) > .env.example lists every environment variable the app reads | `PORT` removed from `.env.example` | PASS |
| AC5: `.env` is git-ignored | `src/project.test.ts` > environment files (AC5) > .env is git-ignored | `.env` line removed from `.gitignore` | PASS |
| AC6: `yarn test` runs Vitest and supertest | `src/project.test.ts` > project commands (AC6) > package.json has the test, build and dev scripts, with Vitest and supertest; and the run below | `build` script changed | PASS |
| AC6: `yarn build` type-checks with no errors | the `yarn build` run below; `src/project.test.ts` > project commands (AC6) > plain Node, the runtime of the dev command, can load the app | an import in `app.ts` written without `.ts` | PASS |
| AC6: Project facts lists the three commands | `src/project.test.ts` > project commands (AC6) > Project facts in CLAUDE.md lists the test, build and dev commands | Dev command bullet removed | PASS |

Checked by hand as well (plan step 6), with the real listener:

- `PORT=4000 yarn dev` printed `Task Image AI is running at http://localhost:4000`.
  `GET /` was `200 text/html` with the title `Today - Task Image AI`, `/css/base.css` was
  `200 text/css`, and `/nope` was `404 text/html`.
- With a temporary `.env` holding `PORT=4321` (deleted afterwards), `node src/server.ts`
  printed `...http://localhost:4321` and served the home page there.
- `git check-ignore .env` prints `.env`.

## Test run

`yarn build`:

```
yarn run v1.22.22
$ tsc --noEmit
Done in 0.97s.
```

`yarn test --reporter=verbose` (the same suite as `yarn test`, with test names shown):

```
 ✓ src/config.test.ts > getPort (AC4) > is 3000 when PORT is not set 1ms
 ✓ src/config.test.ts > getPort (AC4) > is 3000 when PORT is blank 0ms
 ✓ src/config.test.ts > getPort (AC4) > uses PORT when it is a valid port number 0ms
 ✓ src/config.test.ts > getPort (AC4) > throws for PORT=abc and names the value 0ms
 ✓ src/config.test.ts > getPort (AC4) > throws for PORT=0 and names the value 0ms
 ✓ src/config.test.ts > getPort (AC4) > throws for PORT=70000 and names the value 0ms
 ✓ src/config.test.ts > getPort (AC4) > throws for PORT=80.5 and names the value 0ms
 ✓ src/config.test.ts > loadEnv (AC4) > reads PORT from the .env file 2ms
 ✓ src/config.test.ts > loadEnv (AC4) > does not overwrite a PORT that is already set 3ms
 ✓ src/config.test.ts > loadEnv (AC4) > does not throw when the file does not exist 2ms
 ✓ src/config.test.ts > loadEnv (AC4) > rethrows an error that is not a missing file 1ms
 ✓ src/server.test.ts > server (AC4) > listens on PORT 9ms
 ✓ src/server.test.ts > server (AC4) > listens on 3000 when PORT is not set 2ms
 ✓ src/server.test.ts > server (AC4) > loads .env before it listens 2ms
 ✓ src/server.test.ts > server (AC4) > announces the URL once it is listening 2ms
 ✓ src/server.test.ts > server (AC4) > fails instead of announcing a URL when it cannot listen 2ms
 ✓ src/project.test.ts > environment files (AC5) > .env.example lists every environment variable the app reads 3ms
 ✓ src/project.test.ts > environment files (AC5) > .env is git-ignored 0ms
 ✓ src/project.test.ts > project commands (AC6) > package.json has the test, build and dev scripts, with Vitest and supertest 0ms
 ✓ src/project.test.ts > project commands (AC6) > Project facts in CLAUDE.md lists the test, build and dev commands 0ms
 ✓ src/project.test.ts > project commands (AC6) > plain Node, the runtime of the dev command, can load the app 93ms
 ✓ src/app.test.ts > GET / (AC1) > returns 200 with an HTML page 15ms
 ✓ src/app.test.ts > GET / (AC1) > renders the shared layout, which carries the app name 4ms
 ✓ src/app.test.ts > GET / (AC1) > renders the home view inside the layout 2ms
 ✓ src/app.test.ts > base stylesheet (AC2) > is linked from the layout and served as text/css 4ms
 ✓ src/app.test.ts > base stylesheet (AC2) > defines its colors as CSS variables on :root 3ms
 ✓ src/app.test.ts > base stylesheet (AC2) > has no color literal outside :root 3ms
 ✓ src/app.test.ts > base stylesheet (AC2) > declares on :root every variable it uses 4ms
 ✓ src/app.test.ts > unknown path (AC3) > returns 404 with an HTML page 2ms
 ✓ src/app.test.ts > unknown path (AC3) > renders the not-found view in the same layout as the home page 3ms
 ✓ src/app.test.ts > unknown path (AC3) > answers any method, not only GET 1ms
 ✓ src/app.test.ts > app without a listener (AC4) > does not listen when the module is imported and the app is created 1ms

 Test Files  4 passed (4)
      Tests  32 passed (32)
   Start at  14:04:17
   Duration  288ms (tests 40%, import 29%, transform 27%, worker 4%)

Done in 0.92s.
```

Verification loop:

- Build: `yarn build`, exit 0, no errors.
- Tests: `yarn test`, 4 files, 32 passed, 0 failed, none skipped.
- Lint: Project facts says "none".
- Diff: every changed file is in the design's Files list, plus the one error-log entry.
  No `.only`, `.skip`, TODO, commented-out code, secret or machine path. The single
  `console.log` is the server's start-up line, which the design asks for.

```
VERIFICATION
Build: PASS
Tests: PASS   (32 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

Nothing in the spec was skipped. Three things differ from the design or the plan:

1. **`src/server.ts` checks the listen callback's error argument (not in the design).**
   The design has the callback log one line. Express 5 also calls that callback, with the
   error, when `listen` fails. With the port taken, `node src/server.ts` printed
   `Task Image AI is running at http://localhost:3000` and exited with code 0. The
   callback now starts with `if (error) throw error;`, so the process stops with
   `listen EADDRINUSE: address already in use :::3000` and exit code 1 (seen in a real
   run). Two tests in `src/server.test.ts` cover it. Logged in
   `docs/errors/express5-listen-callback-hides-failure.md`.

2. **The default port was not seen serving on 3000 by hand.** Port 3000 on this machine
   is held by another project's server (`zho-backend`), which I left running. What I saw
   instead: with `PORT` unset the server tried 3000 and failed with `EADDRINUSE :::3000`,
   and the tests assert `listen` is called with 3000. Plan step 6's hand check was done
   on 4000 and 4321.

   My first hand check was run without looking at who held port 3000, so its `curl`
   calls were answered by that other server. That is how item 1 was found. It also left
   my own `node --watch` process running for a short time; I stopped it by pid after
   confirming its parent, start time and working folder were mine. The other project's
   process was not touched.

3. **`public/css/base.css` declares `--radius-sm` but no rule uses it yet.** D8 lists it
   among the variables to carry over from the mockups; the home page has nothing with a
   small radius. Job 002 uses it.

`build.md` is committed on the branch in its own commit after the code commit.
