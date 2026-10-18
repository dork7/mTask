# A page that shows the request's host differs between two supertest requests

**Error**: `AssertionError: expected 'http://127.0.0.1:65443/calendar.ics?t…' to be 'http://127.0.0.1:65441/calendar.ics?t…' // Object.is equality`
**Where**: `src/settings-page.test.ts`, the AC7 test "shows the same URL on two visits".
**Cause**: `request(app).get(...)` on an Express app starts a new server on a free port
for each request, so `req.get('host')` is `127.0.0.1:<port>` with a different port every
time. A value built from the host is not the same across two requests.
**Fix**: set the host on both requests with `.set('Host', 'example.test')`; the two
values were then equal and the test passed. When a test compares anything built from
`req.get('host')` or `req.protocol` across requests, set `Host` on every one of them.
**Seen in**: 022-settings, 2026-10-18
