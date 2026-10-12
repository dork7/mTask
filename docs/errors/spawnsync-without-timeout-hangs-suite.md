# `yarn test` never exits: a test waits on `spawnSync` for a child that stays alive

**Error**: no message. `yarn test` printed the results of the other files (for example
`× does not listen when the module is imported and the app is created`) and then never
returned. `vitest run src/project.test.ts` on its own hung the same way.
**Where**: `src/project.test.ts`, "plain Node, the runtime of the dev command, can load
the app", whenever `createApp()` keeps the event loop open (seen with `app.listen(0)`
added to it; a database handle or a timer would do the same).
**Cause**: the test called `spawnSync` with no `timeout`. `spawnSync` blocks the worker
until the child exits, and Vitest's per-test timeout cannot interrupt a synchronous
call, so a child that never exits blocks the suite forever.
**Fix**: pass `timeout` to `spawnSync` (10 s here), give the test a timeout longer than
that (third argument of `it`), and put `result.error` / `result.signal` in the assertion
message. The test then fails after 10 s with
`the child process did not finish: spawnSync … ETIMEDOUT`. Every `spawnSync` or
`execSync` in a test needs a `timeout`.
**Seen in**: 001-scaffold, 2026-10-12
