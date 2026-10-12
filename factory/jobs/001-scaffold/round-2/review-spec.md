VERDICT: PASS

# Review: spec, round 2

## Findings

None.

## Earlier findings

Both round 1 spec findings are fixed in commit `7022a5f`. I repeated the mutations that
survived in round 1, in a throwaway copy, and each one now fails a test.

1. **`getPort()` could run before `loadEnv()` with no test failing.** Fixed.
   `src/server.test.ts:63` "reads the port after it has loaded .env" gives the `loadEnv`
   spy an implementation that sets `PORT` to 4321 and asserts `listen` is called with
   4321. With lines 4 and 5 of `src/server.ts` swapped, that test fails (1 failed). In
   round 1 the same mutation failed nothing.

2. **Nothing tied the loaded file to `.env` at the repo root.** Fixed, by the two
   assertions asked for.
   - `src/config.test.ts:72` "loads .env at the repo root when it is given no file"
     spies on `process.loadEnvFile` and asserts the argument is
     `path.join(rootDir, '.env')`. With the default changed to `.env.local`, it fails
     (1 failed).
   - `src/server.test.ts:76` "loads the default file, .env at the repo root" asserts
     `loadEnv` is called with no arguments. With `server.ts` changed to
     `loadEnv("config/settings.env")`, it fails (1 failed).

The two round 1 code findings touch tests this lens relies on, so I checked their effect
on the criteria too. With `app.listen(0)` added to `createApp`, the suite now ends by
itself in 10 s with 2 failed ("does not listen…" and the plain-Node load test, message
`the child process did not finish: spawnSync /usr/local/bin/node ETIMEDOUT`), and no
child process is left behind. In round 1 that run never returned.

## Checked

Read `spec.md`, `design.md`, `plan.md`, `build.md` (including its Round 1 section),
`CLAUDE.md`, both round 1 reviews, the full `git diff main...factory/001-scaffold`
(everything except the body of `yarn.lock`), and the round 1 fix on its own
(`git diff c7e397e..HEAD`). Branch head: `993a5f6`.

Ran in the repo, on Node 25.4.0:

- `yarn test`, exit 0:

  ```
   RUN  v5.0.1 /Users/hamza/Documents/mTask


   Test Files  4 passed (4)
        Tests  37 passed (37)
     Start at  14:17:15
     Duration  256ms (tests 42%, import 29%, transform 27%, worker 3%)

  Done in 1.60s.
  ```

- `yarn build`: `$ tsc --noEmit`, `Done in 0.85s.`, exit 0.
- `git check-ignore -v .env`: `.gitignore:5:.env`.
- `yarn check --integrity`: `success Folder in sync.`
- `git status --short` before and after: clean, apart from this file.

Mutation checks. I exported the branch head into a throwaway copy
(`review-spec-2` in the scratch directory), broke one thing at a time and ran the suite.
The script confirmed each mutation changed the file before running. The repo itself was
not changed, and the copy was deleted afterwards. The baseline in the copy was 37 passed
before the first mutation and after the last.

| Criterion | What I broke | Tests that failed |
|---|---|---|
| AC1 | home router removed | 2 |
| AC1 | app name changed | 3 |
| AC1 | page include removed from the layout | 3 |
| AC1 | home route sends HTML without the layout | 7 |
| AC2 | stylesheet link removed | 5 |
| AC2 | `express.static` removed | 4 |
| AC2 | hex color in `.muted` | 1 |
| AC2 | `--border` not declared | 1 |
| AC2 | variables moved from `:root` to `html` | 3 |
| AC3 | `res.status(404)` removed | 2 |
| AC3 | 404 handler sends HTML without the layout | 2 |
| AC3 | 404 handler answers `GET` only | 1 |
| AC4 | `createApp` calls `listen` | 2, run ended by itself in 10 s |
| AC4 | `getPort` ignores `PORT` | 12 |
| AC4 | default port 3001 | 3 |
| AC4 | `process.loadEnvFile` call removed | 3 |
| AC4 | `loadEnv()` removed from `server.ts` | 3 |
| AC4 | `server.ts` listens on a fixed 3000 | 2 |
| AC4 | `getPort()` moved before `loadEnv()` in `server.ts` | 1 (was 0 in round 1) |
| AC4 | default env file changed to `.env.local` | 1 (was 0 in round 1) |
| AC4 | `server.ts` loads a different file | 1 (was 0 in round 1) |
| AC4 | `loadEnv` overwrites a `PORT` that is already set | 1 |
| AC4 | listen error rethrow removed from `server.ts` | 1 |
| AC4 | `/^\d+$/` check in `getPort` replaced by a bare `Number(raw)` | 2 (was 0 in round 1) |
| AC5 | `PORT` removed from `.env.example` | 1 |
| AC5 | `.env` line removed from `.gitignore` | 1 |
| AC6 | `build` script changed | 1 |
| AC6 | `test` script changed | 1 |
| AC6 | `supertest` removed from `devDependencies` | 1 |
| AC6 | Dev command bullet removed from `CLAUDE.md` | 1 |
| AC6 | an import in `app.ts` without `.ts` | 1 |

In every row the failing tests include the one `build.md` names for that criterion.

The suite does not depend on the machine it runs on. In the copy: `PORT=9999` in the
shell, 37 passed; a real `.env` holding `PORT=4999` at the copy's root, 37 passed;
`NODE_OPTIONS=--inspect=0 vitest run src/project.test.ts`, 5 passed.

The real listener, in the copy, each process started by me and stopped by its pid:

- `.env` holding a free port (59735) and `PORT` unset in the shell: the server printed
  `Task Image AI is running at http://localhost:59735`. `GET /` was `200 text/html` with
  the title `Today - Task Image AI`, `/css/base.css` was `200 text/css`, and `/nope` was
  `404 text/html` with the title `Page not found - Task Image AI` and the `site-header`.
- The same `.env` with `PORT=59767` in the shell: the server ran on 59767. The shell
  beats the file, as D5 says.
- No `.env` and `PORT` unset: the server tried 3000 and stopped with
  `listen EADDRINUSE: address already in use :::3000`, printing no "running at" line.
  Port 3000 on this machine is held by another project's server, which I did not touch.
  So the default was seen being chosen, not seen serving. The three tests that cover it
  fail when the default is changed to 3001.

Against the spec and the design:

- Every test `build.md` names for AC1 to AC6, including the five rows added in its
  Round 1 section, exists under that name and passes.
- Round 1 changed only `src/config.test.ts`, `src/project.test.ts`, `src/server.test.ts`
  and two new files under `docs/errors/`. No file of the app itself changed, so nothing
  was built beyond what round 1 already checked. The error log entries are what
  `CLAUDE.md` asks for.
- Nothing outside the spec is on the branch. There is no feature route, no database code
  and no navigation; `src/db/` and `src/services/` hold only `.gitkeep`; the leftover
  dependencies are untouched.
- D1 to D13 are still followed. `package.json` has the seven packages in D2, pinned with
  no ranges, and `tsconfig.json` matches D4.
- Not done, items 1 to 3: unchanged since round 1 and still acceptable for the reasons
  given there. The builder's "left alone" notes (the server listens on every interface
  while the start-up line says `localhost`; `--radius-sm` is declared and unused) are not
  against any acceptance criterion.
