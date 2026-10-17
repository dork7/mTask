# A test that reads the task `makeNextInstance` returns sees no scheduled times

**Error**: `expected { id: 2, …(19) } to match object { scheduled_start: '2026-10-13T05:00:00.000Z',
scheduled_end: '2026-10-13T05:30:00.000Z' }`, with `scheduled_start: null` and `scheduled_end: null`
in the received object.
**Where**: `src/services/recurrence.test.ts`, "the next instance (AC3)", the placement cases.
**Cause**: `makeNextInstance` returns the `Task` that `createTask` built from its
`INSERT … RETURNING` row, and the scheduler runs after that: `storeSchedule` writes the
times to the database, but the returned object is never re-read. The times are in the row,
not in the value the function hands back.
**Fix**: read the stored row back — `getTask(db, created.id)` — before asserting on its
times (or `listTasks(db)`). The returned value is only good for the fields copied at
insert and for its `id`. Next time: assert scheduled times on a task read from the
database, not on a value a service returned before it finished writing.
**Seen in**: 016-recurring, 2026-10-16
