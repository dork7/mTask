# Review: spec, round 1

Verdict: CHANGES

## Findings

Both findings are about one clause of AC4: "The server listens on `PORT` read from
`.env`". The code is correct today. The tests `build.md` names for that clause do not
fail when the clause is broken, so nothing protects it.

1. `src/server.test.ts:54` — "loads .env before it listens" only compares `loadEnv`
   with `listen`. It does not check that `.env` is loaded before the port is read. I
   swapped lines 4 and 5 of `src/server.ts` in a throwaway copy, so `getPort()` runs
   before `loadEnv()`, and all 32 tests still passed. With that order the server never
   uses `PORT` from `.env`: with a `.env` holding `PORT=4321`, the real functions gave
   3000 when `getPort()` ran before `loadEnv()` and 4321 after it. Make the test fail on
   the wrong order. For example, give the `loadEnv` spy an implementation that sets
   `PORT` (`vi.stubEnv('PORT', '4321')`) and assert that `listen` is called with 4321.

2. `src/config.ts:17` and `src/server.ts:4` — no test ties the file that is loaded to
   `.env` at the repo root. `src/config.test.ts:44` ("reads PORT from the .env file")
   always passes an explicit temp path, so the default `path.join(rootDir, '.env')` is
   never exercised, and `src/server.test.ts:59` only counts calls to `loadEnv`. In a
   throwaway copy I changed the default to `.env.local`, and separately changed
   `server.ts` to call `loadEnv("config/settings.env")`. All 32 tests passed both times.
   Add two assertions: `loadEnv()` with no argument calls `process.loadEnvFile` with
   `path.join(rootDir, '.env')` (spy on `process.loadEnvFile`, so no real `.env` is
   read), and `server.ts` calls `loadEnv` with no arguments.

## Checked

Read `spec.md`, `design.md`, `plan.md`, `build.md`, `CLAUDE.md`, and the full diff
`git diff main...factory/001-scaffold` (everything except the body of `yarn.lock`).

Ran in the repo, on Node 25.4.0:

- `yarn test`:

  ```
   Test Files  4 passed (4)
        Tests  32 passed (32)
     Start at  14:05:54
     Duration  252ms (tests 43%, import 29%, transform 26%, worker 2%)

  Done in 1.23s.
  ```

- `PORT=9999 yarn test`: 32 passed. A `PORT` in the shell does not change the result.
- `yarn build`: `$ tsc --noEmit`, `Done in 0.84s.`, exit 0.
- `git check-ignore -v .env`: `.gitignore:5:.env`.
- `yarn check --integrity`: `success Folder in sync.`
- `git status --short` before and after: clean, apart from this file.

Mutation checks. I exported the branch into a throwaway copy outside the repo, broke
one thing at a time and ran the suite. The repo itself was not changed.

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
| AC4 | `createApp` calls `listen` | 2 (see note) |
| AC4 | `getPort` ignores `PORT` | 9 |
| AC4 | default port 3001 | 3 |
| AC4 | `process.loadEnvFile` call removed | 2 |
| AC4 | `loadEnv()` removed from `server.ts` | 1 |
| AC4 | `server.ts` listens on a fixed 3000 | 1 |
| AC4 | `getPort()` moved before `loadEnv()` in `server.ts` | **0** (finding 1) |
| AC4 | default env file changed to `.env.local` | **0** (finding 2) |
| AC4 | `server.ts` loads a different file | **0** (finding 2) |
| AC5 | `PORT` removed from `.env.example` | 1 |
| AC5 | `.env` line removed from `.gitignore` | 1 |
| AC6 | `build` script changed | 1 |
| AC6 | `supertest` removed from `devDependencies` | 1 |
| AC6 | Dev command bullet removed from `CLAUDE.md` | 1 |
| AC6 | an import in `app.ts` without `.ts` | 1 |

Note on the `createApp` calls `listen` row: the "does not listen" test failed as it
should. The plain-Node load test in `src/project.test.ts` then did not return, because
the child process it starts kept listening. The run only finished after I stopped that
child by hand. I am not raising it here; it is about the test's robustness, which is
the code lens.

Against the spec and the design:

- Every test listed in `plan.md` for AC1 to AC6 exists under the name `build.md` gives
  it, and passes.
- Nothing outside the spec was built. There is no feature route, no database code and
  no navigation. `src/db/` and `src/services/` hold only `.gitkeep`. The leftover
  dependencies are untouched. `factory/backlog.md` was ticked in the spec commit, not
  by the builder.
- D1 to D13 are followed. `package.json` has exactly the seven packages in D2, pinned
  with no ranges. `tsconfig.json` matches D4 option for option. The `:root` names and
  values in `public/css/base.css` match the light block in `docs/mockUps.html`, and the
  font stack matches the mockups' `body` rule.
- Not done, item 1 (the listen callback rethrows the error): not in the design, but it
  fixes a real failure of AC4, has two tests, and is logged in `docs/errors/` as
  `CLAUDE.md` asks. Acceptable.
- Not done, item 2 (port 3000 not seen serving by hand): acceptable. The default is
  covered by three tests, and the mutation to 3001 fails all three.
- Not done, item 3 (`--radius-sm` declared and not used): acceptable. D8 lists it.
