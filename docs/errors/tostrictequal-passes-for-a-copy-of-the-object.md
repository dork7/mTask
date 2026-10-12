# A test that should prove "the same object is handed on" passes for a copy of it

**Error**: no failure. In `src/server.test.ts`, "builds the app on that database and the
configured uploads folder" stayed green with `src/server.ts` changed to
`createApp({ db: { ...db }, uploadsDir })`, which hands the app a different object than
the one `openDatabase` returned.
**Where**: `vitest run src/server.test.ts`, while breaking `src/server.ts` to see the test
fail.
**Cause**: the assertions were
`expect(createApp.mock.calls[0]).toStrictEqual([{ db: database, uploadsDir }])` and
`toHaveProperty('db', value)`. Both compare by structure, recursively. Neither checks
that it is the same object.
**Fix**: assert identity with `toBe` on the value itself:
`expect(createApp.mock.calls[0][0].db).toBe(openDatabase.mock.results[0].value)`. The
`toStrictEqual` stays for "exactly these two entries". Use `toBe` whenever the point is
which object, not what it looks like.
**Seen in**: 004-photo-upload, 2026-10-12
