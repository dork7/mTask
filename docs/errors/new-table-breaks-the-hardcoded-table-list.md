# A migration that adds a table fails src/db/database.test.ts, which hardcodes the table list

**Error**: three failing tests in `src/db/database.test.ts`, all the same assertion:
`AssertionError: expected [ 'push_subscriptions', …(3) ] to deeply equal [ 'settings', 'sources', 'tasks' ]`,
in `openDatabase (AC1)`.
**Where**: `yarn test` (the whole suite), after migration 4 of `src/db/migrations.ts` created
`push_subscriptions`; `src/db/database.test.ts:13` (`const tables = […]`) and its three callers.
**Cause**: `src/db/database.test.ts` names the schema's tables by hand
(`['settings', 'sources', 'tasks']`) instead of reading them from the migrations, and asserts
`userVersion(db) === migrations.length`. The design for 019 listed the test files it expected to
change (`src/db/migrations.test.ts` and `src/server.test.ts`) and touched neither `database.ts`
nor `schema.test.ts`, so it did not notice that a migration that creates a **table** (018's
migration 3 added a `tasks` column, which this test does not count) also changes this list.
**Fix**: added `'push_subscriptions'` to the list in `src/db/database.test.ts` and saw the three
tests pass. `tableNames` sorts by name, so the new table goes first. Next time a migration adds
a table, expect to change this one fixture too — unlike a column, a new table is counted here.
**Seen in**: 019-web-push, 2026-10-16
