# Server prints its "running at" line and exits 0 when the port is already in use

**Error**: no error message at all. `node src/server.ts` printed
`Task Image AI is running at http://localhost:3000` and exited with code 0, while
requests to that port were answered by a different program (JSON 404s that this app
never sends). Under `yarn dev` the watcher then printed
`Completed running 'src/server.ts'. Waiting for file changes before restarting...`.
**Where**: `yarn dev` (and `node src/server.ts`) with another process already listening
on the port.
**Cause**: Express 5 changed `app.listen(port, callback)`. It registers the callback for
the server's `error` event as well as for `listening`, so a failed `listen`
(`EADDRINUSE`) calls the callback with the error as its first argument. A callback that
ignores its argument logs the start-up line, the error counts as handled, and the
process ends cleanly.
**Fix**: in `src/server.ts` the callback takes `(error?: Error)` and starts with
`if (error) throw error;`, so the process stops with the real `EADDRINUSE` message and a
non-zero exit code. `src/server.test.ts` calls the callback with and without an error.
When checking a server by hand, look at who holds the port first:
`lsof -nP -iTCP:<port> -sTCP:LISTEN`.
**Seen in**: 001-scaffold, 2026-10-12
