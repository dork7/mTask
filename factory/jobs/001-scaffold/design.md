# 001-scaffold: design

No spec problems. One reading of AC4 is fixed under Decisions (D9) because the wording
can be taken two ways.

Everything marked "checked" below was run in a throwaway copy outside the repo, on this
machine (Node 25.4.0, yarn 1.22.22), with the exact versions listed in D2.

## Approach

`src/` is empty, so this job sets the patterns later jobs copy. The server is plain
Express 5 with EJS as the view engine. `src/app.ts` exports a `createApp()` factory that
builds and returns the Express app and never listens. `src/server.ts` is the only entry
point: it loads `.env`, reads the port and calls `listen`. Tests import `createApp()` and
drive it with supertest; nothing in the suite starts the real listener.

EJS has no layout feature of its own. The layout is one file, `src/views/layout.ejs`,
and it is always the view that Express renders. It includes the page fragment named by a
`page` local: `<%- include('pages/' + page) %>`. A three-line helper,
`renderPage(res, page, locals)`, hides that convention from routes. Pages live in
`src/views/pages/` and hold only what goes inside `<main>`. The 404 handler is the last
middleware and renders `pages/not-found.ejs` through the same helper, so it is in the
same layout by construction.

Static files are served from `public/` at the repo root. The base stylesheet is
`public/css/base.css`, linked from the layout as `/css/base.css`. Its `:root` block uses
the light values and the variable names from `docs/mockUps.html`, so job 002 extends the
set instead of renaming it.

Node runs the TypeScript directly. Node 22.18 and newer strip types on load with no flag
and no warning, so `yarn dev` is `node --watch src/server.ts` and there is no compile
step. `yarn build` is `tsc --noEmit`, as the spec asks. `tsconfig.json` is tightened so
that `tsc` rejects anything Node could not run as written.

All environment reads go through `src/config.ts`. That gives AC4 two pure functions to
test (`getPort`, `loadEnv`) and gives AC5 one rule a test can enforce: every variable
name read under `src/` is a key in `.env.example`.

## Decisions

**D1. Add `vite` as a dev dependency. Without it `yarn test` cannot start.**
Today `yarn test` fails with `Cannot find package 'vite' imported from
.../vitest/dist/...`. Vitest 5.0.1 has `vite` as a required peer dependency, and the
commit that removed the old app also removed `vite` from `package.json`. Pin
`vite@8.3.0`, the version the project had before. Rejected: downgrading Vitest, or
moving to another runner; the spec names Vitest.

**D2. Dependencies, pinned exactly.** `package.json` pins exact versions with no ranges;
keep that with `yarn add --exact`.

| Package | Version | Kind | Why |
|---|---|---|---|
| `express` | 5.3.0 | dependency | the server (spec) |
| `ejs` | 7.0.1 | dependency | the view engine (spec) |
| `vite` | 8.3.0 | dev | D1 |
| `supertest` | 7.3.1 | dev | route tests (spec, AC6) |
| `@types/express` | 5.0.6 | dev | types for `express` |
| `@types/supertest` | 7.2.1 | dev | types for `supertest` |
| `@types/node` | 26.6.5 | dev | types for `node:*`, `process`, `import.meta.dirname` |

Not added, on purpose: `@types/ejs` (our code never imports `ejs`; Express loads it by
name, and the published types are for EJS 3), `dotenv` (D5), `tsx` (D3),
`express-ejs-layouts` (D6). The leftover `onnxruntime-web`, `@huggingface/tokenizers`
and `jsdom` stay as they are, and so does the package name.

**D3. Node runs the `.ts` files itself. No `tsx`, no compile step.**
`yarn build` only type-checks (the spec says so and `tsconfig.json` has `noEmit`), so
whatever starts the server has to execute TypeScript. Node's built-in type stripping
does that with no dependency. Checked: `node src/server.ts` and
`node --watch src/server.ts` start and serve with no warning on Node 25.4.0.
Rejected: `tsx watch`. It works, but it is an extra dependency (with esbuild binaries)
for something the runtime already does, and it would have to become a production
dependency to run the app outside dev.

This decision has three consequences the builder must keep:

- Relative imports carry the `.ts` extension: `import { createApp } from './app.ts'`.
- Only erasable syntax: no `enum`, no `namespace` with values, no constructor parameter
  properties. Type-only imports are written `import type` or `import { type X }`.
- `package.json` gets `"engines": { "node": ">=22.18.0" }`, and the Language line in
  `CLAUDE.md` says the same, so later jobs know the rule.

**D4. `tsconfig.json` makes `tsc` enforce D3.** Compiler options, checked against the
whole prototype:

```json
"target": "ES2022",
"lib": ["ES2022"],
"module": "NodeNext",
"moduleResolution": "NodeNext",
"types": ["node"],
"skipLibCheck": true,
"isolatedModules": true,
"verbatimModuleSyntax": true,
"erasableSyntaxOnly": true,
"allowImportingTsExtensions": true,
"noEmit": true,
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true
```

and `"include": ["src", "vitest.config.ts"]`. With these, a missing `.ts` extension is
error TS2835 and an `enum` is TS1294 (both checked), so code that passes in Vitest but
would crash under Node fails `yarn build` instead. Rejected: keeping
`"moduleResolution": "node"`. It accepts extensionless imports, which Vitest also
accepts and Node does not.

**D5. `.env` is loaded with `process.loadEnvFile`, not `dotenv`.** It is built into
Node, parses the same format, and like `dotenv` it does not overwrite a variable that is
already set, so `PORT=4000 yarn dev` beats the file. It throws when the file is missing;
`loadEnv` catches `ENOENT` only and rethrows anything else. Rejected: `dotenv` (a
dependency for one call), and `node --env-file-if-exists=.env` in the script (then the
loading lives in `package.json`, where no test reaches it).

**D6. The layout includes the page; the page does not pull in the layout.**
`res.render('layout', { ...locals, page })`, and the layout does
`<%- include('pages/' + page) %>`. One render pass, no callback, errors go to Express
the normal way, no dependency. Checked with EJS 7.0.1 and Express 5.3.0. Rejected:
`express-ejs-layouts` (last released in 2021, patches `res.render` on every request,
and needs a types package written for Express 4); header and footer partials included
by every page (two files to keep in step, and a page can forget one).

`page` is always a string literal written in a route. It must never come from a request,
because it becomes part of a file path.

**D7. Static files live in `public/` at the repo root, not under `src/`.** `src/` is
type-checked as Node code with no DOM library. Browser scripts that later jobs add would
not belong in that program. The stylesheet URL is `/css/base.css`.

**D8. The stylesheet has light values only, and no color literal outside `:root`.**
Variable names and values are taken from `docs/mockUps.html`: `--bg`, `--surface`,
`--text`, `--muted`, `--border`, `--accent`, `--accent-text`, plus `--radius` and
`--radius-sm`. Dark values, the theme toggle and the remaining tokens are job 002. If a
shadow is wanted, its color is a variable too.

**D9. How AC4's "without opening a port" is read.** The app module never calls `listen`
and no test starts the server on `PORT`. supertest, which AC6 requires, binds its own
ephemeral loopback port for the length of each request; that is how it works and it is
not what AC4 forbids. The test for this spies on `http.Server.prototype.listen` and
asserts that importing `app.ts` and calling `createApp()` does not call it.

**D10. `getPort` rules.** Unset or blank `PORT` gives 3000. An integer from 1 to 65535
is used. Anything else throws an `Error` that names the bad value. Rejected: falling
back to 3000 on a bad value, which would hide a typo in `.env`.

**D11. `createApp()` is a factory, not an exported app instance.** Each test gets a
fresh app, and later jobs can pass it a database or a stubbed AI client as arguments.

**D12. Tests sit next to the code as `src/**/*.test.ts`.** That is where the old app
kept them, and `tsc` then type-checks them with the rest of `src/`. `vitest.config.ts`
sets `include: ['src/**/*.test.ts']` so that a factory worktree checked out inside the
repo is not picked up as a second copy of the suite.

**D13. Paths are built from `import.meta.dirname` in one module, `src/paths.ts`.**
Never from `process.cwd()`. Checked: `import.meta.dirname` works under Vitest 5 and
under plain Node.

## Files

Created:

- `src/paths.ts`: exports `rootDir` (the repo root, one level above `src/`), `viewsDir`
  (`src/views`) and `publicDir` (`public`).
- `src/config.ts`: `DEFAULT_PORT = 3000`; `loadEnv(file = <rootDir>/.env): void` (D5);
  `getPort(env: NodeJS.ProcessEnv = process.env): number` (D10). The only file under
  `src/` that reads an environment variable.
- `src/render.ts`: `PageLocals` (`title: string` plus any other keys) and
  `renderPage(res: Response, page: string, locals: PageLocals): void` (D6).
- `src/app.ts`: `createApp(): Express`. Sets `view engine` to `ejs` and `views` to
  `viewsDir`; sets `app.locals.appName = 'Task Image AI'`; mounts
  `express.static(publicDir)`, then the home router, then the 404 handler, which sets
  status 404 and calls `renderPage(res, 'not-found', { title: 'Page not found' })`.
  No `listen`, no env reads.
- `src/server.ts`: `loadEnv()`, then `getPort()`, then
  `createApp().listen(port, callback)`. The callback logs one line with the URL. That
  line is the server's start-up message, not debug output.
- `src/routes/home.ts`: exports `homeRouter`; `GET /` calls
  `renderPage(res, 'home', { title: 'Today' })`.
- `src/views/layout.ejs`: the full document. `<title><%= title %> - <%= appName %></title>`,
  the viewport meta tag, `<link rel="stylesheet" href="/css/base.css">`, a header
  showing `appName` as a link to `/` (class `site-header`), and
  `<main class="page">` around the page include. Values are output with `<%= %>`.
- `src/views/pages/home.ejs`: a fragment. `<h1>Today</h1>` and one muted line saying
  there are no tasks yet.
- `src/views/pages/not-found.ejs`: a fragment. `<h1>Page not found</h1>` and a link
  back to `/`.
- `public/css/base.css`: the `:root` block (D8), a box-sizing reset, body background,
  text color and the system font stack from the mockups, and rules for `.site-header`,
  `.page`, `h1`, `a` and `.muted`.
- `src/services/.gitkeep`, `src/db/.gitkeep`: empty, so git keeps the two folders.
- `vitest.config.ts`: `defineConfig` from `vitest/config` with `environment: 'node'`
  and `include: ['src/**/*.test.ts']`.
- `.env.example`: a comment and `PORT=3000`.
- `src/app.test.ts`, `src/config.test.ts`, `src/server.test.ts`,
  `src/project.test.ts`: see `plan.md`.

Changed:

- `package.json`: the dependencies in D2; scripts `"dev": "node --watch src/server.ts"`
  and `"build": "tsc --noEmit"` added, `test` and `test:watch` unchanged;
  `"engines": { "node": ">=22.18.0" }`.
- `yarn.lock`: updated by the installs.
- `tsconfig.json`: the options and `include` in D4.
- `.gitignore`: add a `.env` line.
- `CLAUDE.md`, Project facts only: add `**Test command**`, `**Build command**` and
  `**Dev command**` bullets with `yarn test`, `yarn build` and `yarn dev` in backticks,
  in the style of the existing bullets, and extend the Language bullet with the D3 rule
  (Node 22.18 or newer runs the `.ts` files directly; relative imports end in `.ts`;
  erasable syntax only). Leave the Lint bullet and the Factory section as they are.

Not touched: `.yarnrc`, `README.md`, `docs/`, the tracked `.DS_Store` files, and
everything under `factory/` except this job's `build.md`.

## Risks

- **Code passes in Vitest but Node cannot load it** (missing `.ts` extension, an enum, a
  type imported as a value). Caught by `yarn build` through D4, and by the test in
  `src/project.test.ts` that loads `src/app.ts` in a plain `node` child process.
- **A developer's own `.env` changes test results.** `src/server.test.ts` replaces
  `loadEnv` with a spy, and `src/config.test.ts` only loads a file it wrote to a temp
  folder and restores `process.env.PORT` afterwards. The "3000 when unset" tests would
  fail if a real `.env` leaked in.
- **The stylesheet link and the file drift apart.** The AC2 test reads the `href` out of
  the rendered layout and requests that URL, instead of a hard-coded path.
- **A later job reads a new environment variable and forgets `.env.example`.** The AC5
  test scans every non-test `.ts` file under `src/` for `env.NAME` and `env['NAME']` and
  fails on any name missing from `.env.example`.
- **Views or static files not found when the process starts from another folder.**
  D13 removes the dependence on the working folder; the route tests would return 500 or
  404 if `viewsDir` or `publicDir` pointed at the wrong place.
- **`page` taken from user input would allow reading other files in `views/`.** No test
  here; D6 states the rule and `render.ts` carries it as a comment for later jobs.
- **Node 25 is outside Vitest 5.0.1's declared engine range** (`^22.12 || ^24 || >=26`).
  `.yarnrc` has `ignore-engines true`, and the suite ran on 25.4.0 in the prototype. If
  Vitest fails to start for a reason other than the missing `vite`, that is the first
  thing to look at; log it in `docs/errors/`.
- **EJS 7 is a recent major version.** The views use only `<%= %>` and
  `<%- include() %>`, both checked with Express 5.3.0. The route tests fail if rendering
  breaks.
