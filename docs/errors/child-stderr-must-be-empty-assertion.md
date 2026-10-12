# Test fails on a child process's stderr although the child exited with code 0

**Error**: `expected 'Debugger listening on ws://127.0.0.1:…' to be ''`
**Where**: `NODE_OPTIONS=--inspect=0 vitest run src/project.test.ts` (what a debug
terminal sets), in "plain Node, the runtime of the dev command, can load the app".
**Cause**: the test asserted `expect(result.stderr).toBe('')`. The child inherits the
developer's environment, so anything Node writes to stderr because of the shell (the
inspector banner, a deprecation or experimental warning) failed the test while the app
loaded correctly.
**Fix**: assert only the exit code and use stderr as the failure message:
`expect(result.status, describeFailure(result)).toBe(0)`. Do not assert that a child
process's stderr is empty.
**Seen in**: 001-scaffold, 2026-10-12
