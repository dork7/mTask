# An app-level middleware that reads the database broke a route's own failure handling

**Error**: `AssertionError: expected false to be true` at
`expect(existsSync(testApp.uploadsDir)).toBe(true)`, in "answers 500 and keeps no file
when the source cannot be written".
**Where**: `yarn test`, `src/add-photo.test.ts:208`, once `createMiniBarMiddleware` was
mounted before every router in `src/app.ts`.
**Cause**: the middleware called `listTasks` for every request, before the routers ran.
The test closes the database and expects `POST /add/photo` itself to store the photo,
fail on the source and remove the file. With the database closed, the middleware threw
first, Express answered 500 from there, and the photo handler never ran, so the uploads
folder was never made.
**Fix**: the middleware still reads the clock up front, but `res.locals.miniBar` is an
enumerable getter that reads the database the first time it is read, which is when
Express spreads `res.locals` into a page's render options. A request that renders no
page, or whose handler fails first, never reads it. Rule: a middleware mounted before
every router must not do I/O that a route might need to fail on itself; defer it to the
point where its result is used.
**Seen in**: 013-timer-and-detail, 2026-10-14
