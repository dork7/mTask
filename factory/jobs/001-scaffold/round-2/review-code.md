VERDICT: PASS

# Review: code, round 2

## Findings

None.

## Earlier findings

Both round 1 code findings are fixed in commit `7022a5f`. I checked each one by running
it, not by reading `build.md`.

1. **Round 1, finding 1** (`src/project.test.ts`, `spawnSync` with no `timeout` hangs
   the suite): fixed. `spawnSync` now gets `timeout: LOAD_TIMEOUT_MS` (10 s), the test's
   own timeout is 15 s, and the assertion message comes from `describeFailure(result)`.
   In a scratch copy I added `app.listen(0);` to `createApp`, the mutation that hung the
   suite in round 1. `yarn test` ended by itself after 11 s with exit code 1 and two
   failed tests:

   ```
   × does not listen when the module is imported and the app is created 3ms
   × plain Node, the runtime of the dev command, can load the app 10014ms
   AssertionError: the child process did not finish: spawnSync /usr/local/bin/node ETIMEDOUT: expected null to be +0
   ```

   The message is the assertion's, not a Vitest timeout, so the 15 s test timeout does
   what the comment says. No child process was left behind (`pgrep` found none).

2. **Round 1, finding 2** (`src/project.test.ts`, `expect(result.stderr).toBe('')`
   depends on the developer's shell): fixed. The assertion is gone; the test asserts the
   exit code only and uses stderr as the failure message.
   `NODE_OPTIONS=--inspect=0 vitest run src/project.test.ts` now gives 5 passed. The
   test still catches what it is there for: with `'./render.ts'` written as `'./render'`
   in `app.ts` it fails, and the message is the child's `ERR_MODULE_NOT_FOUND` output.

The gap I noted in round 1 without raising it (a bare `Number(raw)` in `getPort` left
every test passing) is closed as well: with that mutation, `throws for PORT=1e3` and
`throws for PORT=0x50` both fail.

## Checked

Read `spec.md`, `design.md`, `plan.md`, `build.md` (including its Round 1 section),
`CLAUDE.md`, both round 1 reviews, the whole of `git diff main...factory/001-scaffold`
except the body of `yarn.lock`, and `git diff c3fb54e..HEAD` for what this round
changed. That second diff touches only `src/config.test.ts`, `src/project.test.ts`,
`src/server.test.ts` and two new files under `docs/errors/`. No non-test file changed
since round 1 (`git diff --stat c3fb54e..HEAD` with tests, job files and the error log
left out prints nothing).

Ran in the repo on Node 25.4.0, yarn 1.22.22, at commit `993a5f6`, each run under a
watchdog timeout:

- `yarn test`, exit 0:

  ```
   RUN  v5.0.1 /Users/hamza/Documents/mTask


   Test Files  4 passed (4)
        Tests  37 passed (37)
     Start at  14:17:32
     Duration  256ms (tests 43%, import 28%, transform 27%, worker 3%)

  Done in 0.75s.
  ```

- `yarn build` (`tsc --noEmit`), exit 0, no errors. The test files are in the
  type-checked program, so the new test code type-checks too.

Ran in a scratch copy of the branch (`review-code-2` in the scratch directory, made with
`git archive`; the repo was not touched). Baseline there: 37 passed.

The tests added this round, each broken on purpose and seen to fail:

| What I broke | Test that failed |
|---|---|
| `app.listen(0);` added to `createApp` | 2: "does not listen ..." and "plain Node ... can load the app" (after 10 s, no hang) |
| `getPort()` moved before `loadEnv()` in `server.ts` | "reads the port after it has loaded .env": `expected 3000 to be 4321` |
| default env file changed to `.env.local` | "loads .env at the repo root when it is given no file" |
| `server.ts` calls `loadEnv("config/settings.env")` | "loads the default file, .env at the repo root": `expected [ 'config/settings.env' ] to deeply equal []` |
| `/^\d+$/` check replaced by `Number(raw)` | "throws for PORT=1e3 ..." and "throws for PORT=0x50 ..." |
| an import in `app.ts` without `.ts` | "plain Node ... can load the app", with the child's stderr as the message |

Whether the new tests leak state or depend on the machine:

- `vitest run --sequence.shuffle` with seeds 1, 7, 42, 2026 and 99991: 37 passed each
  time. The implementation given to the `loadEnv` spy in "reads the port after it has
  loaded .env" does not reach the tests after it (`vi.resetAllMocks()` in `afterEach`).
- Each test file on its own: 11, 14, 7 and 5 passed.
- `vitest run --no-isolate --no-file-parallelism`: 37 passed.
- Started from `/` with `--root`: 37 passed.
- A real `.env` holding `PORT=4999` at the root of the scratch copy: 37 passed. No test
  reads it.
- `PORT=9999 yarn test`: 37 passed.

The real listener, to confirm round 1's result still holds on unchanged code:
`PORT=<free port> node src/server.ts` in the scratch copy printed
`Task Image AI is running at http://localhost:60978`; `/` was 200 `text/html`,
`/css/base.css` 200 `text/css`, `/nope` and `POST /nope` 404 `text/html`,
`/.env.example` and `/css/..%2f..%2fpackage.json` 404. I stopped that process by its
pid. The server on port 3000 belongs to another project and was not touched.

Seen and left alone, as in round 1: the server listens on every interface while the
start-up line says `localhost`, and `--radius-sm` is declared and unused.

Working tree: clean before this file was written; nothing else in the repo was changed.
