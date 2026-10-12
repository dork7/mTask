# Review: code, round 1

Verdict: CHANGES

## Findings

1. `src/project.test.ts:79` — the plain-Node load test calls `spawnSync` with no
   `timeout`, so the suite hangs forever instead of failing when the child process does
   not exit. `spawnSync` blocks the worker, and Vitest's per-test timeout cannot
   interrupt a synchronous call. I reproduced it in a scratch copy with the mutation
   `build.md` names for AC4 (`app.listen(0);` added to `createApp`): `yarn test` printed
   `× does not listen when the module is imported and the app is created` and then never
   exited (killed by my watchdog after 40 s); `vitest run src/project.test.ts` on its own
   hung the same way, while `vitest run src/app.test.ts` finished with 1 failed. So the
   one regression AC4 exists to catch turns `yarn test` into a hang, and the same will
   happen the first time a later job has `createApp()` hold the event loop open (a
   database handle, a timer). Pass a `timeout` to `spawnSync` (10 s is plenty; the load
   takes about 0.1 s) so the test fails, and let the failure show why: `result.error` /
   `result.signal` are set when the timeout fires.

2. `src/project.test.ts:84` — `expect(result.stderr).toBe('')` fails the test when the
   app loads correctly but anything at all is written to the child's stderr. The child
   inherits the environment, so this depends on the developer's shell, not on the code.
   Reproduced: `NODE_OPTIONS=--inspect=0 vitest run src/project.test.ts` (what a debug
   terminal does) fails with
   `expected 'Debugger listening on ws://127.0.0.1:…' to be ''`, with exit status 0 from
   the child. The plan asks only that the child "exits with code 0". Drop the emptiness
   assertion and keep stderr as the failure message instead:
   `expect(result.status, result.stderr).toBe(0)`.

## Checked

Read `spec.md`, `design.md`, `plan.md`, `build.md`, `CLAUDE.md`, and the whole of
`git diff main...factory/001-scaffold` except `yarn.lock` (for the lockfile I checked
that every dependency in `package.json` has an entry at its pinned version, and
`yarn check --integrity` reports `Folder in sync`). Read `app.listen` in
`node_modules/express/lib/application.js` (5.3.0): it does register the callback for the
server's `error` event, as `docs/errors/express5-listen-callback-hides-failure.md` says.

Ran on Node 25.4.0, yarn 1.22.22, at commit `c3fb54e`:

- `yarn test`, exit 0:

  ```
   Test Files  4 passed (4)
        Tests  32 passed (32)
     Start at  14:06:28
     Duration  258ms (tests 37%, transform 34%, import 27%, worker 2%)

  Done in 1.14s.
  ```

- `yarn build` (`tsc --noEmit`), exit 0, no errors.

- The real listener, `PORT=<free port> node src/server.ts`: `/` 200 `text/html`,
  `/css/base.css` 200 `text/css`, `/nope` 404 `text/html` in the layout. Malformed and
  traversal paths (`/%`, `/%E0%A4%A`, `/css/../../package.json`,
  `/css/..%2f..%2fpackage.json`, `/.env.example`) all give the 404 page, nothing outside
  `public/` is served. `HEAD /` is 200. Stopped by pid afterwards.
- Failure modes of `server.ts`: with the port held by a listener I started,
  `node src/server.ts` exits 1 with `listen EADDRINUSE` and prints no "running at" line;
  `PORT=abc` exits 1 with `PORT must be an integer from 1 to 65535, got "abc"`.
- `getPort` by hand: `' 3000 '` and `'00080'` are accepted (3000, 80); `'65536'`, `'+80'`,
  `'1e3'`, `'0x50'`, `'-1'`, `'80 80'`, Arabic-Indic digits and a 23-digit number all
  throw; a blank or whitespace-only value gives 3000.
- Mutations, in a scratch copy outside the repo, each one seen to fail the test that
  covers it: error rethrow removed from `server.ts`; `loadEnv` swallowing every error;
  port upper bound removed; port lower bound removed; `res.status(404)` removed; a hex
  color outside `:root`; an import without `.ts`; `loadEnv()` removed from `server.ts`;
  an env variable read that is missing from `.env.example`. No test in the suite is
  empty of assertions. One mutation survived: replacing the `/^\d+$/` check in `getPort`
  with a bare `Number(raw)` leaves all 32 tests passing, because no case covers `'1e3'`
  or `'0x50'`. The code is right; this is a gap, not a finding.

Seen and left alone, not findings: the server listens on every interface (`*:PORT`)
while the start-up line says `localhost`, which is Express's default for `listen(port)`;
`--radius-sm` is declared and unused, as `build.md` says.

Working tree: clean before this file was written; nothing else in the repo was changed.
