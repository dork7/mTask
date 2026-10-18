# 023-hardening: design

One spec problem and three readings. None of them blocks the job:

- **AC2's example request is not refused (spec problem).** With body-parser 2.3.0, which
  Express 5.3.0 uses, `express.urlencoded({ extended: false })` accepts `title=%E0%A4%A`
  and hands back `{ title: '%E0%A4%A' }`. The handler then runs: 404 when there is no
  task 1, and when there is one the title is stored. Checked, see below. The parser does
  refuse `Content-Type: application/x-www-form-urlencoded; charset=koi8-r` with an error
  that has `status` and `statusCode` 415 (`charset.unsupported`). The AC2 test uses that
  request instead (D3). The rest of AC2 is built as written.
- **"The `/_styleguide` toast example follows the same rule" (AC8).** Read as: the style
  guide page also has exactly one `#live-region` and no other `aria-live`. The example
  stays inside its stage in the Toast section, and the toast partial no longer brings a
  live region of its own (D9).
- **Logging (AC1, AC2).** AC1 asks for `console.error` on a 500. A 4xx is the client's
  fault and is not logged (D2).
- **Undo is kept in memory** (D6), which the out-of-scope list allows. The redirect
  carries the id of the task (`?deleted=<id>`, `?done=<id>`) and the page shows the toast
  only while the store still holds that undo (D7).

Checked in a throwaway folder under `$TMPDIR` on Node 26.8.2 and yarn 1.22.22. The
scripts imported the repo's own `node_modules` (Express 5.3.0, body-parser 2.3.0,
supertest 7.3.1) by absolute path. Nothing was installed and nothing in the repo was
written. The folder was removed afterwards.

- `express.urlencoded({ extended: false })` with body `title=%E0%A4%A` gives 200 and
  `{"title":"%E0%A4%A"}`. With `; charset=koi8-r` it passes an error with `status` 415,
  `statusCode` 415 and `type` `charset.unsupported` to the error handler. A bogus
  `Content-Encoding` gives 415, a body over 100 kB gives 413, and 1001 parameters give
  413. **Checked.**
- Express 5.3.0 `app.render` builds its options as
  `{ ...this.locals, ...opts._locals, ...opts }` (`lib/application.js:536`). Spreading
  `res.locals` calls the `miniBar` and `alarm` getters. A getter defined with
  `configurable: true` can be redefined as a plain `value` before the spread, and the
  spread then reads the value. A non-configurable one throws `TypeError` when it is
  redefined. **Checked.**
- `node:sqlite`: `DELETE FROM tasks WHERE id = ? RETURNING *` returns every column,
  including one added by `ALTER TABLE` (`reminded_at`). An `ON DELETE SET NULL` child
  has its `parent_task_id` cleared. An `INSERT` with the old explicit `id` into an
  `AUTOINCREMENT` table puts the row back with all its values, and the next plain insert
  still gets a new id (max + 1). An insert whose `source_id` names no row fails with
  `FOREIGN KEY constraint failed`. **Checked.**
- supertest: a handler that answers 429 without reading a multipart upload gets the
  answer through for 1 kB and 200 kB files, but the client sees `ECONNRESET` for 2 MB.
  When the handler first calls `req.resume()` and answers on `'end'`, the answer arrives
  for 0 B, 1 kB, 2 MB and 11 MB uploads. `req.ip` through supertest is `127.0.0.1`.
  **Checked.**

## Approach

The job adds four pieces to the app and does not change its structure.

**Error page.** A new error handler, `createErrorHandler()` in `src/routes/errors.ts`, is
mounted after the not-found handler in `createApp`. It picks the status (an integer
`status` or `statusCode` from 400 to 499 is used as given, anything else is 500), logs a
500, and renders the new page fragment `pages/error.ejs` with `renderPage`. That page
says nothing about the error. Before rendering, it replaces the lazy `miniBar` and
`alarm` getters of `res.locals` with `null` and `false`, so a closed database cannot
break the error page. This keeps the rule of
`docs/errors/app-middleware-reads-db-before-every-router.md`: the middleware still reads
nothing until a page renders.

**Rate limit.** `src/services/rate-limit.ts` holds a sliding-window limiter, keyed by
client IP, that never reads the clock except through an injectable `now`. `createApp`
makes one limiter for the app and hands it to the add and review routers. A middleware
from `src/routes/add.ts`, `limitAnalysis(limiter, tab)`, runs first on the four AI
posts, before multer for the photo. It answers a refused request with the Add page,
status 429 and `Retry-After`.

**Photo cleanup.** `src/services/photo-cleanup.ts` has `runPhotoCleanup(db, uploadsDir,
now)`. It deletes old photo sources that have no tasks (one SQL statement in
`src/db/sources.ts`), removes their files with `photoFile` and `removePhoto`, and then
removes old files in the uploads folder that no row names. `startPhotoCleanup`
schedules it the way `startRecurrence` schedules its run, and `src/server.ts` calls it.

**Undo.** `src/services/undo.ts` keeps, in memory and per app, what a Delete took
(`takeTask`, the whole row) and what a Done changed (the old status, `completed_at`,
`actual_minutes`, and the id of the instance it made). The list's Done and Delete and the
overdue Done go through it. Their redirects keep their paths and gain `deleted=<id>` or
`done=<id>`. The page they lead to passes a `toast` local to the layout. The layout now
always has `<div id="live-region" aria-live="polite">` and renders the toast inside it.
The toast partial loses its own `aria-live`. The undo posts restore the row
(`restoreTask`) or the fields, and remove the next instance while it is still pending.

The CSS, accessibility and README parts change only `public/css/base.css`, `README.md`,
and any view that the new AC9 audit test finds failing. Reading every view, I found none
failing today.

## Decisions

**D1. The error handler is `createErrorHandler()` in `src/routes/errors.ts`, mounted last
in `createApp`, after the not-found handler.** It is a 4-argument
`ErrorRequestHandler`. When `res.headersSent`, it calls `next(error)`, because Express can
only close the connection then. Otherwise it calls `skipLayoutReads(res)` (D4), sets the
status (D2), and renders `renderPage(res, 'error', { title: 'Something went wrong' },
done)`. When rendering the page itself fails, `done` logs that error with `console.error`
and sends the plain text `Something went wrong` with the same status. Express's
finalhandler is never reached: it would print a stack trace outside the test
environment. The page `src/views/pages/error.ejs` is:

```
<h1>Something went wrong</h1>
<p class="muted">The page could not be shown. Try again in a moment.</p>
<p><a href="/">Back to Today</a></p>
```

The page shows no part of the error. Rejected: the page-header partial (not-found does
not use it either), and showing `error.message` on a 4xx (the message of a body-parser
error names internals such as the charset).

**D2. `errorStatus(error: unknown): number` is the status of an error: `error.status`,
else `error.statusCode`, when it is an integer from 400 to 499, and 500 for anything
else.** It is exported from `src/routes/errors.ts`. A value that is not an object, a
string `'400'`, `400.5`, `399` or `503` gives 500. `status` is checked before
`statusCode`. Only a 500 is logged:
`console.error(\`${req.method} ${req.path} failed:\`, error)`. It logs `req.path` and not
`req.originalUrl`, so the calendar feed's `?token=` is never written to a log. A 4xx is
not logged.

**D3. The AC2 test triggers the client error with
`Content-Type: application/x-www-form-urlencoded; charset=koi8-r` and body `title=a` on
`POST /tasks/1/edit`, and expects 415.** The spec's own example is accepted by the parser
(checked, see the top of this file). Unit tests of `errorStatus` cover `status`
alone and `statusCode` alone.

**D4. `skipLayoutReads(res: Response): void`, exported from `src/routes/mini-bar.ts`,
redefines `res.locals.miniBar` as `null` and `res.locals.alarm` as `false`.** It uses
`Object.defineProperty(res.locals, name, { value, enumerable: true, configurable: true,
writable: true })`. For this to work, the middleware's two `defineProperty` calls gain
`configurable: true`. The error page always leaves both out, not only when the database
is unreadable: one rule, and the page has no use for them. A request that failed before
the middleware ran has neither property, and the layout reads `undefined`. Rejected:
catching inside the getters. That would hide a database failure on every page.

**D5. `renderPage` gains an optional fourth parameter
`done?: (error: Error | null, html?: string) => void`.** With it, `res.render('layout',
{ ...locals, page }, done)` is called and `done` must send the answer. Without it, the
call works as now. `PageLocals` gains `toast?: PageToast | null`, and
`export interface PageToast { message: string; undoAction: string }` is added to
`src/render.ts`.

**D6. The rate limiter is a per-key log of at most `limit` request times, in
`src/services/rate-limit.ts`.**

```ts
export const AI_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;
export interface RateLimiter {
  /** Counts one request of `key`. `undefined`: accepted. A number: refused, the whole seconds to wait. */
  hit(key: string): number | undefined;
}
export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number }): RateLimiter;
```

On `hit(key)` at `t = now()`:

1. Drop the key's times that are `<= t - windowMs`.
2. Call the request accepted when fewer than `limit` times remain.
3. Push `t` in either case, because refused requests count (AC3). When there are more
   than `limit` times, drop the oldest.
4. When refused, return
   `Math.min(Math.ceil(windowMs / 1000), Math.max(1, Math.ceil((log[0] + windowMs - t) / 1000)))`,
   with `log[0]` read after the push.

Keeping only the newest `limit` times is enough to decide every later request. It also
bounds the memory per key. On every hit, keys whose newest time is `<= t - windowMs` are
deleted from the map. A request is accepted again at exactly
`oldest + windowMs`, which is "once 60 seconds have passed".

The default clock is `() => Date.now()`, read at each call, so
`vi.useFakeTimers({ toFake: ['Date'] })` controls it. A captured reference to `Date.now`
would keep the real clock.

The key is `req.ip ?? req.socket.remoteAddress ?? 'unknown'`. Express is not told to
trust a proxy, which suits one user and one process (decision 4).

Rejected: the `express-rate-limit` package (a new dependency the spec does not need) and
a fixed window (it allows 20 requests across a window edge).

**D7. `limitAnalysis(limiter: RateLimiter, tab: SourceKind): RequestHandler`, exported
from `src/routes/add.ts`, is the first handler of `POST /add/photo` and
`POST /review/:sourceId/analyze` (tab `'photo'`). On `/add/voice` and `/add/text` it
comes right after the `form` parser (tabs `'voice'`, `'text'`).** When refused, it sets
`Retry-After` to the seconds, and answers
`renderAdd(res, 429, tab, { error: TOO_MANY_REQUESTS, text })`, where
`TOO_MANY_REQUESTS = 'Too many requests. Wait a minute and try again.'` (exported).
`text` is `readText(req.body) ?? ''` for voice and text, so the typed text is not lost,
and `''` for photo.

When the request body has not been read (`!req.readableEnded`), it calls `req.resume()`
and answers on `req.once('end', ...)`. Answering in the middle of an upload resets the
connection for large files (checked). Draining stores nothing.

For the photo post the limiter runs before multer, so no file is written, no source is
made and `analyze` is not called. Every other route is left alone. `GET /add` has no
limiter.

**D8. One undo store per app, in memory: `createUndoStore()` in `src/services/undo.ts`.
`createApp` makes it and hands it to `createTasksRouter(deps, undo)` and
`createOverdueRouter(deps, undo)`.** Each of the store's two maps keeps at most
`UNDO_LIMIT = 50` entries. Setting a key deletes it and sets it again, so the newest
entry is last, and the first key is dropped while the size is over the limit. A restart
forgets every undo, which the out-of-scope list allows. Rejected: a table, which would
need a migration and break the hardcoded table list
(`docs/errors/new-table-breaks-the-hardcoded-table-list.md`), and undo data in the form,
which a client could change.

**D9. The layout always renders `<div id="live-region" aria-live="polite">`, right after
`</main>`, and renders `locals.toast` inside it.** With no toast, the element has no
child and no text. The toast partial drops `aria-live` from its root but keeps
`<div class="toast-region">` as its root, so the fixed positioning and the style guide
stage work as before. Its `<span class="toast__actions">` becomes a `div`, because it now
holds a form.

A new partial `partials/undo-button.ejs` (`undoButton: { action }`) renders
`<form method="post" action="...">` with the `button` partial
`{ label: 'Undo', variant: 'ghost', type: 'submit' }`. The layout builds
`actions: include('partials/undo-button', { undoButton: { action: toast.undoAction } })`.

The style guide keeps its own example in the stage, with no live region, and its page
has the layout's empty `#live-region`.

A toast rendered with the page is present when the page loads. Whether a screen reader
announces it is checked by hand (out of scope). Rejected: inserting the toast with a
script, which would leave a page without scripts with no toast.

**D10. Rows for Delete and its undo: `takeTask` and `restoreTask` in `src/db/tasks.ts`.**

```ts
export interface TakenTask {
  /** The task as `Task`. */
  readonly task: Task;
  /** Every column of the row as `DELETE … RETURNING *` gave it, columns `Task` drops included. */
  readonly row: Readonly<Record<string, SQLOutputValue>>;
  /** The tasks whose `parent_task_id` the delete cleared, in `id` order. */
  readonly childIds: readonly number[];
}
export function takeTask(db: Database, id: number): TakenTask | undefined;
export function restoreTask(db: Database, taken: TakenTask): Task | undefined;
```

`takeTask` runs in `inTransaction`. It reads `SELECT id FROM tasks WHERE parent_task_id = ?
ORDER BY id`, then runs `DELETE … RETURNING *`. It keeps `row` as `{ ...returned }`,
copied before `toTask`, because `toTask` deletes `reminded_at` from the object it is
given. It returns `undefined` when no row was deleted.

`restoreTask` runs in `inTransaction` and returns `undefined`, writing nothing, when:

- a task with that id exists, or
- `source_id` is not null and no source has it (the cleanup removed it).

Otherwise:

1. A `parent_task_id` that names no task any more is inserted as `null`, which is what
   the delete of that parent would have done.
2. The row is inserted with the column names `Object.keys(row)`. These come from
   SQLite's answer, never from a request. Each must match `/^[a-z_]+$/`, or it throws.
3. `UPDATE tasks SET parent_task_id = ? WHERE parent_task_id IS NULL AND id IN (…)`
   links the children back.
4. It returns `toTask` of the inserted row.

`reminded_at` comes back as it was, so an alarm that already rang does not ring again.
`src/db/tasks.ts` never writes that name, which keeps the rule of `src/db/reminders.ts`.
`deleteTask` stays as it is.

**D11. `markDone` returns what it wrote:
`markDone(db, task, now): { next: Task | undefined } | undefined`.** It returns
`undefined` when the task was done already and nothing was written. Otherwise `next` is
`makeNextInstance`'s result. Only the id of `next` is used, so the stale times of the
returned object do not matter (`docs/errors/next-instance-returned-before-placement.md`).
Existing callers ignore the value.

**D12. The undo service, `src/services/undo.ts`.**

```ts
export const UNDO_LIMIT = 50;
export const DELETED_TOAST = 'Task deleted';
export const DONE_TOAST = 'Task marked done';
export interface DoneRecord {
  status: TaskStatus; completed_at: string | null; actual_minutes: number | null;
  /** The instance the Done made, or `null`. */
  nextId: number | null;
}
export interface UndoStore { readonly deleted: Map<number, TakenTask>; readonly done: Map<number, DoneRecord> }
export function createUndoStore(): UndoStore;
export function deleteWithUndo(db: Database, store: UndoStore, task: Task): boolean;
export function canUndoDelete(store: UndoStore, taskId: number): boolean;
export function undoDelete(db: Database, store: UndoStore, taskId: number): Task | undefined;
export function doneWithUndo(db: Database, store: UndoStore, task: Task, now: Date): boolean;
export function canUndoDone(db: Database, store: UndoStore, taskId: number): boolean;
export function undoDone(db: Database, store: UndoStore, taskId: number): Task | undefined;
```

- **`deleteWithUndo`** calls `takeTask` and remembers the result under the task's id. It
  returns whether a row was taken.
- **`undoDelete`** returns `undefined` with no entry. Otherwise it calls `restoreTask` and
  deletes the entry once `restoreTask` has returned, whether it returned a task or
  `undefined` (an undo that cannot succeed is never offered again). When `restoreTask`
  throws, the entry stays.
- **`doneWithUndo`** copies `status`, `completed_at` and `actual_minutes` from `task`,
  calls `markDone`, and remembers `{ …, nextId: write.next?.id ?? null }` when something
  was written. It returns whether something was written. A `markDone` that throws
  remembers nothing.
- **`canUndoDone`** is true when there is an entry and the task exists with status
  `done`.
- **`undoDone`** returns `undefined`, writing nothing, when `canUndoDone` is false. It
  drops a stale entry in that case. Otherwise, in one `inTransaction`:
  - The changes are `{ status, completed_at, actual_minutes }` from the record.
  - When `nextId` names a task that is `pending`, that task is deleted (`deleteTask`)
    and `recurrence_rule: next.recurrence_rule` is added to the changes. This moves the
    rule back to the task. When the instance had already passed the rule on, it moves
    back the `null` it holds, so no second chain starts.
  - When the instance is not pending or is gone, it stays as it is and the rule stays
    `null`.
  - `updateTask` writes the changes, the entry is deleted, and the updated task is
    returned.

**D13. The redirects keep their paths and gain one parameter, added by
`withToastParam(address: string, name: 'deleted' | 'done', id: number): string` in
`src/services/task-list.ts`.** It appends `?name=id`, or `&name=id` when `address`
already holds a `?`.

| Request | Location |
| --- | --- |
| `POST /tasks/:id/done` (not `from=sheet`), written | `${withToastParam(withQuery(LIST_PATH, list), 'done', id)}#task-${id}`, e.g. `/tasks?priority=medium&sort=priority&done=1#task-1` |
| the same, nothing written | `/tasks#task-1`, as now |
| `POST /tasks/:id/delete` | `withToastParam(withQuery(LIST_PATH, list), 'deleted', id)`, e.g. `/tasks?deleted=1` |
| `POST /overdue/:id/done`, written | `/overdue?done=<id>` |
| `POST /overdue/:id/done`, not overdue | `/overdue`, as now |

`from=sheet` calls `markDone` directly, records nothing, and goes to `taskPath(id)` as
now.

`GET /tasks` builds its toast from the query:

1. `readId(req.query.deleted)` with `canUndoDelete` gives
   `{ message: DELETED_TOAST, undoAction: withQuery(\`${taskPath(id)}/undo-delete\`, list) }`.
2. Otherwise, `readId(req.query.done)` with `canUndoDone` gives
   `{ message: DONE_TOAST, undoAction: withQuery(\`${taskPath(id)}/undo-done\`, list) }`.
3. Otherwise there is no toast (`null`).

`GET /overdue` reads `done` the same way and gives
`{ message: DONE_TOAST, undoAction: \`${OVERDUE_PATH}/${id}/undo-done\` }`.

The new posts:

| Route | Success | Failure |
| --- | --- | --- |
| `POST /tasks/:taskId/undo-delete` | 303 `${withQuery(LIST_PATH, list)}#task-${id}` | 404 through `next()` |
| `POST /tasks/:taskId/undo-done` | 303 `${withQuery(LIST_PATH, list)}#task-${id}` | 404 through `next()` |
| `POST /overdue/:taskId/undo-done` | 303 `/overdue` | 404 through `next()` |

All three read the id with `readId`, not with `findListedTask`, because a deleted task is
not there to be found. `renderList` and `renderOverdue` take a last parameter
`toast: PageToast | null = null` and pass it as the `toast` local.

**D14. The cleanup, `src/services/photo-cleanup.ts`.**

```ts
export const PHOTO_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CLEANUP_EVERY_MS = 60 * 60 * 1000;
export interface CleanupResult { sources: number[]; orphans: string[] }
export type PhotoCleanup = (db: Database, uploadsDir: string, now: Date) => Promise<CleanupResult>;
export const runPhotoCleanup: PhotoCleanup;
export function startPhotoCleanup(db: Database, uploadsDir: string, cleanup: PhotoCleanup = runPhotoCleanup): () => void;
```

`runPhotoCleanup` takes `cutoff = now.getTime() - PHOTO_MAX_AGE_MS` and then:

1. `removeStalePhotoSources(db, new Date(cutoff).toISOString())` deletes the old photo
   sources with no task and returns them.
2. Each returned source's file, `photoFile(uploadsDir, image_path)`, is removed with
   `removePhoto`, wrapped as `new Promise<void>((resolve) => removePhoto(file, resolve))`.
   `removePhoto` uses `force` and ignores errors, so a missing file is no error.
3. `named` is the set of `path.posix.basename` of every path `listImagePaths(db)` returns.
4. `readdir(uploadsDir, { withFileTypes: true })` lists the folder. `ENOENT` gives `[]`;
   any other error is thrown.
5. For each entry with `isFile()` (symlinks and folders are skipped) whose name is not in
   `named`: `lstat` it (`ENOENT` skips it). When `mtimeMs < cutoff`, the file is removed
   with `removePhoto` and its name is pushed to `orphans`.

`sources` holds the removed ids in `id` order, and `orphans` the names in `readdir` order.
"More than 24 hours" is strict, `<`, for both the age of a source and the age of a file.

`startPhotoCleanup` runs `cleanup(db, uploadsDir, new Date())` at once and on
`setInterval(run, CLEANUP_EVERY_MS)`. A rejection is logged with
`console.error('The photo cleanup failed:', error)`. It returns `() => clearInterval(timer)`.

`createApp` does not import it. `src/server.ts` calls `startPhotoCleanup(db, uploadsDir)`
right after `startRecurrence(db)`, and the upload folder is read once into
`const uploadsDir = getUploadsDir()` for both calls.

`listImagePaths` also returns `tasks.image_path`. The spec names only sources, but
removing a file that any row names would lose data. Nothing in the app sets
`tasks.image_path` today, so no test of the spec sees the difference.

**D15. The new SQL of the cleanup lives in `src/db/sources.ts`.**

```ts
/** Deletes every photo source created before `before` (a stored timestamp) that no task names, and returns them in id order. */
export function removeStalePhotoSources(db: Database, before: string): Source[];
/** Every non-null image_path of sources and tasks. */
export function listImagePaths(db: Database): string[];
```

The first is one statement:

```sql
DELETE FROM sources
 WHERE kind = 'photo' AND created_at < ?
   AND NOT EXISTS (SELECT 1 FROM tasks WHERE tasks.source_id = sources.id)
RETURNING *
```

It is sorted by id in JS. It is one statement, so a task made between a read and a
delete cannot be orphaned, and the `ON DELETE RESTRICT` key is never hit. The second is
`SELECT image_path FROM sources WHERE image_path IS NOT NULL UNION SELECT image_path FROM
tasks WHERE image_path IS NOT NULL`.

**D16. CSS.**

- `.toast .btn` gains `min-height: var(--touch-target);`. Today it has none, and AC10
  needs it. `.btn` keeps its own.
- The `@media (prefers-reduced-motion: reduce)` block at the end of `base.css` gains,
  before the `.skeleton__line` rule (which stays, for the existing stylesheet test):

  ```css
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  ```

- Nothing else changes. No rule sets `outline: none` or `0` today.

**D17. The accessible-name audit (AC9) is a jsdom test with two helpers.**

- `nameOf(element, document)` is the trimmed `textContent` of a clone with every
  `[aria-hidden="true"]` descendant removed, else the trimmed `aria-label`, else the
  joined `nameOf` text of the elements that the `aria-labelledby` ids name (every id must
  exist).
- `hasLabel(control, document)` is true when there is a `label[for="<id>"]` with text, or
  `control.closest('label')`, or a non-blank `aria-label`, or an `aria-labelledby` that
  resolves to text.

Hidden elements are checked too. Glyphs marked `aria-hidden` do not count as a name. My
reading of every view found no failing control. When the test finds one, the builder
fixes the view by adding a visible label or an `aria-label`, and lists the fix in the
build report.

**D18. README.** `README.md` is rewritten with these sections:

- **`# Task Image AI`**, followed by one paragraph on what the app does: tasks from a
  photo, voice or text, scheduled into the working day.
- **`## Requirements`**: Node `22.18` or newer, which runs the `.ts` files directly, and
  yarn. Then `yarn install`.
- **`## Commands`**: `yarn dev` (the server with reload, at http://localhost:3000),
  `yarn test` (Vitest), `yarn build` (type check with `tsc --noEmit`) and `yarn analyze`.
- **`## Configuration`**: copy `.env.example` to `.env`. A table of every variable,
  with what it is for and its default:

  | Variable | Default | Effect when unset or blank |
  | --- | --- | --- |
  | `PORT` | `3000` | |
  | `DATABASE_PATH` | `data/app.db` | A relative path starts at the project folder. `:memory:` is allowed. |
  | `UPLOADS_DIR` | `data/uploads` | |
  | `ANTHROPIC_API_KEY` | none | The analyzer refuses every photo and text; the rest of the app runs. |
  | `ANTHROPIC_MODEL` | `claude-opus-5-5` | |
  | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | none | All three are needed for Web Push. Without them the in-page alarm is used. Make them with `npx web-push generate-vapid-keys`. |

- **`## Limits and cleanup`**: the four AI endpoints share 10 requests per client IP in
  any 60 seconds. The 11th gets 429 with `Retry-After`. Every hour, and once at start,
  photo sources with no task that are older than 24 hours are removed with their files,
  and so are files in the uploads folder that no source names and that are older than
  24 hours. Undo of Delete and Done lasts until the server restarts.

## Files

Created:

- `src/routes/errors.ts`: `errorStatus(error: unknown): number`,
  `createErrorHandler(): ErrorRequestHandler` (D1, D2).
- `src/views/pages/error.ejs`: the page of D1.
- `src/views/partials/undo-button.ejs`: `undoButton: { action }` (D9).
- `src/services/rate-limit.ts`: `AI_RATE_LIMIT`, `RateLimiter`, `createRateLimiter` (D6).
- `src/services/undo.ts`: everything listed in D12.
- `src/services/photo-cleanup.ts`: `PHOTO_MAX_AGE_MS`, `CLEANUP_EVERY_MS`,
  `CleanupResult`, `PhotoCleanup`, `runPhotoCleanup`, `startPhotoCleanup` (D14).
- Tests: `src/error-page.test.ts`, `src/rate-limit.test.ts`,
  `src/services/photo-cleanup.test.ts`, `src/db/tasks-restore.test.ts`, `src/undo.test.ts`,
  `src/live-region.test.ts`, `src/accessible-names.test.ts`, `src/focus-motion.test.ts`,
  `src/readme.test.ts`.

Changed:

- `src/app.ts`:
  - imports `createRateLimiter`/`AI_RATE_LIMIT`, `createUndoStore` and
    `createErrorHandler`;
  - builds `const aiLimiter = createRateLimiter(AI_RATE_LIMIT)` and
    `const undo = createUndoStore()`;
  - calls `createAddRouter(deps, aiLimiter)`, `createReviewRouter(deps, aiLimiter)`,
    `createTasksRouter(deps, undo)` and `createOverdueRouter(deps, undo)`;
  - mounts `app.use(createErrorHandler())` after the not-found handler.
- `src/render.ts`: `PageToast`, `toast?` in `PageLocals`, and the optional `done` of
  `renderPage` (D5).
- `src/routes/mini-bar.ts`: `configurable: true` on both properties, and exports
  `skipLayoutReads` (D4).
- `src/routes/add.ts`:
  - `createAddRouter(deps: AppDeps, limiter: RateLimiter)`;
  - exports `TOO_MANY_REQUESTS` and `limitAnalysis`;
  - mounts `limitAnalysis(limiter, 'photo')` first on `/add/photo`, and after `form` on
    voice and text (D7).
- `src/routes/review.ts`: `createReviewRouter(deps: AppDeps, limiter: RateLimiter)`, and
  `limitAnalysis(limiter, 'photo')` before the analyze handler.
- `src/routes/tasks.ts`:
  - `createTasksRouter(deps: AppDeps, undo: UndoStore)`;
  - Done (when not `from=sheet`) uses `doneWithUndo`, and Delete uses `deleteWithUndo`;
  - the new Locations of D13;
  - `renderList(res, db, list, now, toast)` and the toast of the `GET`;
  - the `undo-delete` and `undo-done` posts.
  - The import of `deleteTask` goes away when it is unused.
- `src/routes/overdue.ts`: `createOverdueRouter(deps: AppDeps, undo: UndoStore)`, Done
  through `doneWithUndo`, the `?done=` Location, the toast of the `GET`, and
  `POST /overdue/:taskId/undo-done`.
- `src/services/task-actions.ts`: the return value of `markDone` (D11).
- `src/services/task-list.ts`: `withToastParam` (D13).
- `src/db/tasks.ts`: `TakenTask`, `takeTask`, `restoreTask` (D10), importing
  `inTransaction` from `./transaction.ts`.
- `src/db/sources.ts`: `removeStalePhotoSources`, `listImagePaths` (D15).
- `src/server.ts`: `const uploadsDir = getUploadsDir();`, used by `createApp` and by
  `startPhotoCleanup(db, uploadsDir)`, which runs after `startRecurrence(db)`.
- `src/views/layout.ejs`: `#live-region` with the toast (D9).
- `src/views/partials/toast.ejs`: no `aria-live`, `toast__actions` as a `div`, and the
  comment updated to say that the layout's `#live-region` announces the toast.
- `public/css/base.css`: D16.
- `README.md`: D18.
- Existing tests, only as listed in plan step 10.

Not touched:

- `src/db/migrations.ts`: no new table or column.
- `src/views/pages/styleguide.ejs`: its example keeps working because the partial
  changed.
- `.env.example`, `src/config.ts`, `package.json`: no dependency, no variable.
- `public/js/*`.
- `deleteTask`'s behaviour.
- `src/services/recurrence.ts`.
- `src/testing/app.ts`: each test app already gets fresh limiter and undo state through
  `createApp`.

## Risks

- **An existing test makes more than 10 AI posts on one app and now gets 429.** I found
  none: every add test file builds its app in `beforeEach`. If the full `yarn test` shows
  a 429, the builder reports it rather than widening the limit.
- **The getters cannot be redefined.** The AC1 test closes the database before
  `GET /tasks` and asserts 500 with the page, no `#mini-bar` and no `#alarm`. It fails
  when D4's `configurable: true` is missing.
- **A test silently uses the real clock in the limiter.** The AC3 window test advances a
  faked `Date` by 60 s and expects acceptance, which fails with a captured `Date.now`
  (D6).
- **A refused upload resets the connection.** The AC3 test uploads a real PNG buffer
  through the limiter. The drain of D7 is also what a browser needs for a 10 MB photo.
  The tests keep their files small.
- **Restore fails on a vanished source or parent.** `tasks-restore.test.ts` covers both
  (D10): 404 with no row for the source, `null` for the parent.
- **Undo Done leaves a second recurrence chain.** `undo.test.ts` asserts the next
  instance is gone and the rule is back on the task, and that an instance already started
  stays while the rule stays `null`.
- **The cleanup removes a fresh upload or a named file.** `photo-cleanup.test.ts` keeps a
  fresh orphan file (mtime now), an old file a source names, a photo source with a task
  of each status, a photo source created exactly 24 hours ago, and voice and text
  sources: every keep case of AC4.
- **The cleanup leaves files in the repo.** Every cleanup test uses a `mkdtemp` folder
  under `os.tmpdir()`, removed in `afterEach`
  (`docs/errors/failing-test-leaves-file-outside-its-temp-folder.md`).
- **The `server.ts` test runs the real cleanup on its stand-in database.** It must mock
  `./services/photo-cleanup.ts` like the other jobs (step 10).
- **Logging noise from tests that expect a 500.** These now print through
  `console.error`. The new error tests spy on it and silence it. The old ones only check
  the status and keep passing.
- **A toast that is present at load may not be announced.** That is checked by hand per
  the spec, and D9 records why.
