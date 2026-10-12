# 004-photo-upload: design

The spec can be built as written. Seven points in it can be read two ways, or are left to
the architect. Each is settled under Decisions:

- AC1 names one existing test that changes. `createApp` now needs a database and an
  uploads folder, so every file that calls it changes too, mechanically and with no
  assertion weakened (D2, D17).
- AC2, "as the plan writes it": the input has the four attributes the plan writes, plus
  an `id` for its label, `required`, a class and a hook for the script (D12).
- AC3, "sets the preview's `src` to the chosen file": to an object URL made for that
  file (D15).
- AC7 and AC8 together: a file that is both of a wrong type and too large is answered
  with 415 (D8).
- AC9, "no file in `photo`": this includes a file sent under another field name, a text
  field named `photo`, a body that is not multipart, and the empty part a browser sends
  when the form is submitted with nothing chosen (D10).
- AC11, "created when it is missing": when a photo is stored, not when the server
  starts (D5). The folder can be moved with `UPLOADS_DIR` (D4).
- AC4, "no larger than 10 MB": a file of zero bytes is stored like any other. The spec
  puts the bytes out of scope (D8).

Everything marked "checked" below was run in a throwaway copy outside the repo with the
repo's own `node_modules`, `tsconfig.json` and Vitest config, plus the two packages of
D1 installed there: Node 26.8.2, yarn 1.22.22, multer 2.4.0 (with busboy 1.6.0),
`@types/multer` 2.3.0, Express 5.3.0, EJS 7.0.1, jsdom 30.1.1, supertest 7.3.1, Vitest
5.0.1, TypeScript 5.9.3. The whole design was built there once as a prototype:
`yarn build` was clean, the existing tests passed with the edits of D17 (554 of the 555;
the `/add` row of one test is gone), the new tests passed, and eleven deliberate breaks
of the upload code and five of the page script each failed at least one of them. The
prototype was also started with `node src/server.ts` and `node --watch src/server.ts`
and used with curl, and the page was looked at in headless Chrome 154 in both themes.
Node 26.8.2 is the only Node on this machine; nothing here ran on Node 22 or 24 (see
Risks).

## Approach

The job has four parts: the app gets its database and its uploads folder, the server
stores a photo, the stored photo is served back, and the Add page lets a user choose
one.

**Wiring.** `createApp` takes one argument, `{ db, uploadsDir }`, and never reads the
environment, as before. `src/server.ts` opens the database once with
`openDatabase(getDatabasePath())`, reads the uploads folder from the new
`getUploadsDir()`, hands both to `createApp` and then listens. That is the contract 003
D3 left for this job. Tests build their app through one helper that gives every app an
in-memory database and its own temporary folder and removes both afterwards.

**Storing.** `src/services/photo-storage.ts` owns the rules of a stored photo: the field
name, the size limit, the four types with their extensions, the name of the file and
where it goes. It wraps multer, which the spec names. multer checks the declared type
before a byte is written, streams an accepted file straight into the uploads folder
under a name the server makes, and removes the partial file itself when the size limit
is passed. `src/routes/add.ts` turns what multer reports into one of four answers (201,
415, 413 or 400), each a render of the Add page, and writes the source row with
`createSource` on success.

**Serving.** The uploads folder is mounted at `/uploads` with `express.static`, so
`image_path` is a URL path a page can put in an `<img>` as it is. The content type
comes from the extension, which the server chose from the declared type.

**The page.** `GET /add` renders `pages/add.ejs` in the layout: the page-header partial,
a tab list with one tab, and the tab's panel with the form. The form is plain HTML and
posts without script. The preview and Retake are added by the first browser script file
of the project, `public/js/add-photo.js`, a small deferred classic script.

## Decisions

**D1. Two packages, pinned: `multer` 2.4.0 (dependency) and `@types/multer` 2.3.0 (dev
dependency).** The spec names multer. 2.4.0 is the `latest` tag on the registry; 3.0 is
an alpha. Checked: `yarn add --exact` of both resolves against the installed
`@types/express` 5.0.6 without adding a second copy, `tsc --noEmit` passes with
`import multer from 'multer'` under the repo's `tsconfig.json`, plain Node loads it, and
a process that has loaded it and holds an open database still exits. Nothing else is
added: names come from `node:crypto`, folders from `node:fs`, serving from Express.

**D2. `createApp(deps: AppDeps)` takes the database and the uploads folder as one
required argument.** `AppDeps` is `{ db: Database; uploadsDir: string }`, exported from
`src/app.ts`. A caller that forgets either does not compile. `createApp` throws
`Error('The uploads folder must be an absolute path, got "<value>"')` when `uploadsDir`
is not absolute, for the reason `openDatabase` refuses a relative path (003 D4): it
would land in whatever folder the process was started from. Later jobs add their own
entries to `AppDeps` (the analyzer in 006).

Routers that need a dependency are factories: `createAddRouter(deps)`. `homeRouter` and
`styleguideRouter` stay constants. `src/routes/add.ts` imports the type `AppDeps` from
`src/app.ts` with `import type`; the import is erased, so the two files do not load each
other in a circle (checked in plain Node).

Rejected: an optional argument with a default database or folder (a missing wiring in
`server.ts` would then show at the first upload, not at build time, and a default would
have to read the configuration inside `createApp`); a shared connection module (003 D3
already rejected it).

**D3. `src/server.ts` opens the database once, after `.env` is loaded and before it
listens.** Order: `loadEnv()`, `getPort()`, `openDatabase(getDatabasePath())`,
`createApp({ db, uploadsDir: getUploadsDir() })`, `listen`. When the database cannot be
opened the error is not caught: the process stops before it listens. The handle is not
closed on shutdown and no signal is handled; the process ending closes it. Checked:
`node --watch src/server.ts` does not restart when a photo is stored or the database
file changes, because it watches the imported modules only.

**D4. The uploads folder is `UPLOADS_DIR`, with `data/uploads` under the repo root as
the default.** `getUploadsDir(env = process.env)` in `src/config.ts` follows
`getDatabasePath` exactly: unset or blank gives `<rootDir>/data/uploads`, a relative
value starts at `rootDir`, an absolute value is returned as it is. `.env.example` gets
`UPLOADS_DIR=data/uploads` under a comment line. The database path can already be
moved; a deployment that moves one to a mounted disk needs to move the other, and the
variable costs four lines.

Under the test runner the configured folder is outside the repo, as the database is in
memory (003 D5): `vitest.config.ts` sets `UPLOADS_DIR` to
`path.join(tmpdir(), 'mtask-vitest-uploads')`. Checked: it wins over an `UPLOADS_DIR`
set in the shell that starts `yarn test`. No test stores anything there, and no code of
this job creates it; the line is there so that a later job that works on the configured
folder at start-up (023 deletes images) cannot reach a developer's real photos from
`src/server.test.ts`. A test asserts the value and fails when the line is removed.

The URL path `/uploads` is fixed and does not follow the variable.

**D5. The folder is created when a photo is stored, with its parents.** The storage's
`destination` function calls `mkdir(uploadsDir, { recursive: true })` before every
write. So the folder is created the first time it is needed, and again if someone
removes it while the server runs (checked: remove the folder, upload, 201). A missing
folder is not an error for reading either: `express.static` on a folder that does not
exist answers nothing and the request falls through to the not-found page (checked).

An app that stores nothing creates nothing. That is what lets the page tests and the
plain-Node test build an app without leaving a folder behind.

Rejected: creating it in `createApp` or in `server.ts`. It would fail faster on a folder
that cannot be created, but `openDatabase` already creates `data/` at start-up for the
default layout, and a folder made once at start-up is gone for good when it is deleted.
Rejected: `multer({ dest })` or `diskStorage({ destination: '<string>' })`, which
create the folder once, when the middleware is built.

**D6. Stored photos are served by `express.static` at `/uploads`, and `image_path` is
that URL path.** In `createApp`, after the static mount of `public/`:

```ts
app.use(UPLOADS_URL_PATH, express.static(deps.uploadsDir, {
  index: false,
  redirect: false,
  setHeaders(res) { res.setHeader('X-Content-Type-Options', 'nosniff'); },
}));
```

- The content type is the one Express derives from the extension. Checked: `.jpg`,
  `.png`, `.webp` and `.gif` are served as `image/jpeg`, `image/png`, `image/webp` and
  `image/gif`, with the stored bytes.
- A name that was never stored, `/uploads` and `/uploads/` fall through to the app's
  not-found page with 404 (checked).
- `nosniff` is set because the bytes are not inspected (AC7): a file of HTML declared
  as `image/png` is stored as `.png` and served as `image/png`, and the header tells the
  browser to keep to that type.
- The database file sits beside the folder in the default layout. Checked:
  `/uploads/%2e%2e/secret.txt`, `/uploads/..%2fsecret.txt` and
  `/uploads/%2e%2e%2fsecret.txt` answer 404 and never the file beside the folder.

`UPLOADS_URL_PATH = '/uploads'` and `photoUrl(filename)` live in
`src/services/photo-storage.ts`; the mount and the stored `image_path` are built from
the same constant.

Rejected: a route that reads the file itself (`res.sendFile`), which repeats what the
static middleware does and has to get the path checks right by hand.

**D7. A photo is streamed straight into the uploads folder under
`<crypto.randomUUID()><extension>`.** `multer.diskStorage` with two functions:
`destination` (D5) and `filename`, which answers `randomUUID()` followed by
`photoExtension(file.mimetype)`. Nothing of `file.originalname` is read anywhere. The
extension is `.jpg`, `.png`, `.webp` or `.gif`, looked up from the declared type.
Checked: a client name of `../../evil.png`, `notes.html`, `notes` (no extension) or
`a/b\c.jpeg` changes nothing about the stored name, and two uploads with the same client
name and the same bytes give two files.

`photoExtension` returns `string | undefined`, and the compiler cannot know that the
filter of D8 has already run. When the lookup gives nothing, `filename` calls back with
`new PhotoTypeError(file.mimetype)` and writes no file, so a file is never stored
without one of the four extensions. Do not write `?? ''` or `!` there. The branch
cannot be reached through the route while the filter is in place, so no test enters
it; the AC7 tests tell the two apart all the same (see D8).

Rejected: memory storage and a write afterwards (a 10 MB buffer per upload in the
server's memory); a name made from a hash of the bytes (two uploads of the same picture
would be one file, against AC6, and job 023 could then delete a file another source
still points at); a name made from the time (two uploads in one millisecond).

**D8. The type is checked in multer's `fileFilter`, against the declared type, before
anything is written.** The four types and their extensions are a `Map`, looked up with
`photoExtension(mimetype)`. A type that is not in it ends the upload with a
`PhotoTypeError`. Checked:

- busboy lower-cases the type and drops its parameters, so `IMAGE/PNG` and
  `image/png; charset=binary` are `image/png` (accepted, stored as `.png`).
- `image/svg+xml`, `image/heic`, `image/bmp`, `application/pdf`, `text/plain`,
  `text/html` and `application/octet-stream` are rejected.
- A plain object would accept a declared type of `constructor` or `toString` through
  its prototype with the `in` operator; the `Map` rejects both. This is why it is a
  `Map`.
- No file and no folder is created for a rejected type: the filter runs before the
  storage. The AC7 tests assert that the uploads folder does not exist after a type
  rejection. With the filter taken out, the guard in `filename` (D7) still answers 415,
  but the folder is there by then, and those tests fail (checked).
- A file of a wrong type that is also over the limit is answered with 415. multer
  reports the size of an accepted file only.
- A zero-byte file of an allowed type is stored and gets a source. The bytes are out of
  scope; a file the analyzer cannot read is the analyzer's case to handle (005, 006).

**D9. The limit is `limits: { fileSize: MAX_PHOTO_BYTES }` with
`MAX_PHOTO_BYTES = 10 * 1024 * 1024`.** Checked on multer 2.4.0: a file of exactly that
size is stored whole and answered with 201; one byte more is answered with 413. (multer
2.4.0 hands busboy the limit plus one, because busboy reports a limit as reached at
exactly that size. The two boundary tests hold the behaviour, whatever a later upgrade
does.) Also checked: after the 413 the uploads folder holds no file, because multer
removes the partial file before it calls back; and the answer arrives for a body of
25 MB and 30 MB too, because multer reads the rest of the request before it calls back.
No other limit is set; the rest of the hardening is job 023.

**D10. What `POST /add/photo` answers.** The route calls the upload middleware itself,
`upload(req, res, callback)`, so that every outcome is rendered by the route. In the
callback, in this order:

| # | Condition | Status | Rendered with |
|---|---|---|---|
| 1 | the error is a `PhotoTypeError` | 415 | `error`: `That file is not a photo. Choose a JPEG, PNG, WebP or GIF image.` |
| 2 | the error is a `multer.MulterError` with code `LIMIT_FILE_SIZE` | 413 | `error`: `That photo is larger than 10 MB. Choose a smaller one.` |
| 3 | the error is a `multer.MulterError` with code `LIMIT_UNEXPECTED_FILE` | 400 | `error`: `Choose a photo first.` |
| 4 | any other error | `next(error)` | Express's own error answer (500) |
| 5 | no error and `req.file` is undefined | 400 | `error`: `Choose a photo first.` |
| 6 | a file was stored | 201 | `savedPhoto`: the source's `image_path` |

Row 6: `createSource(db, { kind: 'photo', image_path: photoUrl(file.filename) })`. If
it throws, the stored file is removed with `removePhoto(file.path, …)` and the error
goes to `next`, so a failed write leaves no file without a source (checked with a
closed database: 500, empty folder).

Row 3 is multer's code for a file under a field name the route did not ask for. Such a
post has no file in `photo`, which is AC9. It is also the code for a second file in
`photo`; that post gets the same answer, and multer removes the first file (checked).
The form cannot send either.

Row 5, checked: a post with no body, a urlencoded body, a multipart body whose `photo`
is a text field, and the part a browser sends for an empty file input
(`filename=""`, `application/octet-stream`, no bytes) all end here. multer skips a part
with an empty file name before the type check, so the empty form gets
`Choose a photo first.` and not the type message.

Row 4 covers a multipart body that is cut off or malformed, a folder that cannot be
created and a disk that is full. A malformed body is answered with 500 where 400 would
be right. Left as it is: no browser sends one, and error pages are job 023.

The three messages are constants in `src/routes/add.ts`: `NOT_A_PHOTO`, `TOO_LARGE`,
`NO_PHOTO`.

**D11. One view, `pages/add.ejs`, and one local, `addPage`.** Every answer of D10 and
`GET /add` goes through one function in `src/routes/add.ts`:

```ts
function renderAdd(res: Response, status: number, addPage: Partial<AddPage> = {}): void
```

It sets the status and calls `renderPage(res, 'add', { title: 'Add task', nav: 'add',
addPage: { error: addPage.error ?? null, savedPhoto: addPage.savedPhoto ?? null } })`.
`AddPage` is `{ error: string | null; savedPhoto: string | null }`. The view reads
`addPage` and nothing else of its own, the way a partial reads one object (002 D10), and
both fields are always present, so the view never tests whether a local exists.

The answer to a stored photo is the page itself with 201, not a redirect. The spec asks
for it; job 006 replaces it with the redirect to the review screen. Until then a reload
of that answer posts the photo again, which the browser asks about first.

**D12. The markup of the page.** This is the whole of `pages/add.ejs` below its header
comment. Tests select on the roles, the attributes and the `data-` hooks.

```ejs
<%- include('../partials/page-header', { pageHeader: { heading: 'Add task' } }) -%>

<div class="tabs" role="tablist" aria-label="Ways to add a task">
  <%- include('../partials/button', { button: {
    label: 'Photo',
    variant: 'ghost',
    attrs: { role: 'tab', id: 'tab-photo', 'aria-selected': 'true', 'aria-controls': 'panel-photo' },
  } }) -%>
</div>

<div class="tab-panel" role="tabpanel" id="panel-photo" aria-labelledby="tab-photo">
<% if (addPage.error) { -%>
  <p class="notice notice--error" role="alert"><%= addPage.error %></p>
<% } -%>
<% if (addPage.savedPhoto) { -%>
  <p class="notice" role="status">Photo saved.</p>
  <img class="photo" src="<%= addPage.savedPhoto %>" alt="The photo you saved">
<% } -%>
  <form class="photo-form" method="post" action="/add/photo" enctype="multipart/form-data">
    <label class="photo-form__label" for="photo-input">Take or choose a photo</label>
    <input class="photo-form__input" id="photo-input" type="file" name="photo" accept="image/*" capture="environment" required data-photo-input>
    <img class="photo" alt="Preview of the photo you chose" data-photo-preview hidden>
    <div class="photo-form__actions">
      <%- include('../partials/button', { button: { label: 'Retake', variant: 'ghost', attrs: { 'data-photo-retake': '', hidden: '' } } }) -%>
      <%- include('../partials/button', { button: { label: 'Upload photo', type: 'submit' } }) -%>
    </div>
  </form>
</div>
<script src="/js/add-photo.js" defer></script>
```

- **The heading** is the page-header partial, which renders a bare `<h1>Add task</h1>`.
- **The tab** is the button partial with `role="tab"`. It is a `<button type="button">`
  with the `btn` class, so AC2's rule about buttons holds for it. With one tab there is
  nothing to switch, and it has no script. Job 007 adds the other tabs and the
  switching.
- **The form** works with scripts off. `required` makes the browser ask for a file
  before it posts; row 5 of D10 stays for every client that does not.
- **The preview** is an `<img>` with no `src` while it is hidden. Rejected: `src=""`,
  which makes some browsers request the page again.
- **Retake and the preview carry `hidden` in the served markup**, not only after the
  script ran. Without the script the preview never shows and a Retake button would do
  nothing.
- **The notices** are written in the page, not a new partial. A partial would be a
  twelfth component with a style-guide section to add, for two lines used on one page.
  `role="alert"` for a rejection (AC10), `role="status"` for `Photo saved.`.
- **The script tag** sits at the end of the page's fragment. The layout has no place for
  a page's script and does not need one for a single page.

**D13. The notice colors come from tokens that exist.** A rejection is
`var(--text)` on `var(--urgent-bg)` with a `var(--urgent)` border. The text keeps the
contrast of body text; the message, not the color, says what went wrong. The saved
notice is `var(--surface-2)` with the normal border. No color token is added: the 002
test "has a color token for each mockup color, the scrim and the shadow" lists the
tokens exactly.

**D14. The CSS.** Added to `public/css/base.css` at the end of the Components section,
directly above the `Style guide` section comment. It follows the file's rules (tokens
only, no px in padding, margin or gap, no id selector); the 002 guards passed with it
(checked).

```css
/* Tabs: the ways to add a task. The selected tab takes the accent color. */
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tabs .btn[aria-selected="true"] {
  color: var(--accent);
  border-color: var(--accent);
}

.tab-panel > * + * {
  margin-top: var(--space-3);
}

/* Notice: what happened to the last thing the user sent. The text says it; the color repeats it. */
.notice {
  padding: var(--space-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.notice--error {
  background: var(--urgent-bg);
  border-color: var(--urgent);
}

/* A photo: the one just saved, and the preview of the one chosen. */
.photo {
  display: block;
  max-width: 100%;
  max-height: 24rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

/* Photo form */
.photo-form {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

.photo-form__label {
  font-weight: 700;
}

.photo-form__input {
  max-width: 100%;
  font: inherit;
}

/* The browser's own "choose file" button, given the size and look of a ghost button. */
.photo-form__input::file-selector-button {
  min-height: var(--touch-target);
  margin-right: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: none;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.photo-form__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
```

The `min-height` is on the file-selector button, not on the input: on the input it only
leaves a gap under a small button (seen in the prototype).

**D15. The preview script is `public/js/add-photo.js`, a classic script loaded with
`defer`.** It is the first browser script file; 001 D7 keeps browser code in `public/`,
outside the type program of `src/`. It is plain JavaScript in the style of the theme
script: one function that calls itself, `var`, no arrow functions, no module, no build.
The theme script stays inline for its own reason (002 D8); a page's script has none.

What it does, exactly:

1. Finds `[data-photo-input]`, `[data-photo-preview]` and `[data-photo-retake]`. It is
   linked from the one page that has all three and does not test for them.
2. `hidePreview()`: revokes the object URL it holds, if any, removes the preview's
   `src` attribute, and sets `hidden` on the preview and on Retake.
3. `showChosenPhoto()`: reads `input.files[0]`, calls `hidePreview()`, and stops when
   there is no file. Otherwise it makes an object URL with `URL.createObjectURL(file)`,
   sets it as the preview's `src`, and removes `hidden` from both.
4. `change` on the input calls `showChosenPhoto()`.
5. `click` on Retake sets `input.value = ''`, calls `hidePreview()` and moves the focus
   to the input, so the focus is not left on a button that has just been hidden.
6. Once, on load, it calls `showChosenPhoto()`: a browser may bring a chosen file back
   when the page is reloaded.

`input.value = ''` is how a page empties a file input, and the test helper of D16
relies on exactly that statement. Do not empty it another way (`form.reset()`).

An object URL, not `FileReader.readAsDataURL`: no copy of a 10 MB photo as base64 text
in the page, and it is there at once.

**D16. Tests run the page's script in jsdom, with three small helpers.** Checked on
jsdom 30.1.1:

- **Linked scripts are not loaded** by `openPage`. `runLinkedScripts(app, window)` in
  `src/testing/page.ts` requests every `<script src>` of the page from the app with
  supertest, fails when one is not answered with 200, and runs the text with
  `window.eval`, in document order. That is when a deferred script runs: after the page
  is parsed. An exception on load reaches the test as the rejection; an exception in a
  listener reaches the window's `error` event, which `scriptErrors` already collects
  (see `docs/errors/jsdom-page-script-error-does-not-fail-test.md`; the new test file
  asserts `scriptErrors` for every window in `afterEach`).
- **jsdom has no `URL.createObjectURL`.** `stubObjectUrls(window)` in
  `src/testing/dom.ts` puts `createObjectURL` and `revokeObjectURL` on `window.URL` and
  records the files and the URLs. The script itself has no fallback for a browser
  without object URLs; every browser with a camera input has them.
- **jsdom has no file picker, no `DataTransfer`, and no way to build a `FileList`.**
  `setChosenFile(input, file)` replaces `files` and `value` on that one element until a
  script sets `value` to the empty string, which removes the replacement and leaves
  jsdom's real, empty input. `chooseFile(window, input, file)` does that and fires
  `input` and `change`. Passing `null` puts the input back to empty, for a user who
  clears the choice.

`src/testing/jsdom.d.ts` gains only the members these helpers and tests call.

**D17. Every test app comes from `src/testing/app.ts`, and the files that called
`createApp()` change to use it.** `createTestApp()` makes a new folder under the
system's temporary folder with `mkdtempSync`, opens `openDatabase(':memory:')`, and
returns `{ app, db, dir, uploadsDir, close }`. `uploadsDir` is `<dir>/uploads` and does
not exist yet. `close()` closes the database and removes `dir` with everything in it.
`withTestApp(run)` creates one, awaits `run`, and closes it in `finally`. Nothing a test
does through these can reach `data/`, and nothing is left under the temporary folder
(checked after a full run).

Existing files that change, and how. No assertion in them is removed or loosened except
the one the spec names.

| File | Change |
|---|---|
| `src/testing/page.ts` | `getPage`, `getStylesheet` and `renderView` each run inside `withTestApp`. What they return is the same. |
| `src/app.test.ts` | The `createApp` import is replaced by `createTestApp`. A `beforeEach` creates `testApp`; the existing `afterEach` closes it first. Each `createApp()` becomes `testApp.app`; `fresh.createApp()` becomes `fresh.createApp({ db: testApp.db, uploadsDir: testApp.uploadsDir })`. One test is added (see `plan.md`). |
| `src/ui.test.ts` | "is what the views get as `ui`" reads `app.locals.ui` inside `withTestApp`. |
| `src/project.test.ts` | The plain-Node script also imports `./src/db/database.ts` and calls `createApp({ db: openDatabase(':memory:'), uploadsDir: process.argv[1] })`. The folder is passed as an argument after the script: a path under `tmpdir()` that does not exist and is never created (D5). The timeout and the exit-code assertion stay. |
| `src/shell.test.ts` | `'/add'` is taken out of the list of paths that answer with the not-found page. |
| `src/server.test.ts` | `createApp` becomes a spy that returns `{ listen }`, and `./db/database.ts` is replaced by a spy `openDatabase` that returns a stand-in object, so no database is opened. The seven existing tests are unchanged. Four tests are added (see `plan.md`). |

Checked on Vitest 5.0.1: `vi.resetAllMocks()` in that file's `afterEach` puts a spy made
with `vi.fn(implementation)` back to that implementation, also after a test replaced it
with `mockImplementation`. So the two spies keep working from test to test.

Rejected: leaving `createApp()` callable without arguments so these files need no edit
(D2). Rejected: one shared database for all page tests (a test that writes would leak
into the next).

## Files

Created:

- `src/services/photo-storage.ts`:
  - `PHOTO_FIELD = 'photo'`, `MAX_PHOTO_BYTES = 10 * 1024 * 1024`,
    `UPLOADS_URL_PATH = '/uploads'`.
  - `class PhotoTypeError extends Error`, constructed with the declared type; `name` is
    `'PhotoTypeError'`. No constructor parameter property.
  - `photoExtension(mimetype: string): string | undefined` (D8).
  - `photoUrl(filename: string): string`, `/uploads/<filename>` (D6).
  - `createPhotoUpload(uploadsDir: string): RequestHandler`: multer with the storage of
    D5 and D7, the limit of D9 and the filter of D8, as `.single(PHOTO_FIELD)`.
  - `removePhoto(file: string, done: () => void): void`: `rm(file, { force: true })`,
    then `done()` whether or not it failed.
- `src/routes/add.ts`: `createAddRouter(deps: AppDeps): Router` with `GET /add` and
  `POST /add/photo` (D10, D11). The constants `NOT_A_PHOTO`, `TOO_LARGE`, `NO_PHOTO`
  and the function `renderAdd` are not exported.
- `src/views/pages/add.ejs`: D12, under a header comment that names `addPage` and its
  two fields.
- `public/js/add-photo.js`: D15.
- `src/testing/app.ts`: `TestApp` (`app: Express`, `db: Database`, `dir: string`,
  `uploadsDir: string`, `close(): void`), `createTestApp(): TestApp`,
  `withTestApp<T>(run: (testApp: TestApp) => T | Promise<T>): Promise<T>` (D17).
- `src/add-page.test.ts`, `src/add-photo.test.ts`, `src/config.uploads.test.ts`,
  `src/services/photo-storage.test.ts`, `src/testing/app.test.ts`: see `plan.md`.

Changed:

- `package.json`, `yarn.lock`: the two packages of D1, through `yarn add --exact`.
- `src/config.ts`: add `getUploadsDir(env: NodeJS.ProcessEnv = process.env): string`
  (D4). Nothing else in the file changes.
- `.env.example`: add the line
  `# The folder uploaded photos are stored in. A relative path starts at the project folder.`
  and `UPLOADS_DIR=data/uploads`.
- `vitest.config.ts`: `env` becomes
  `{ DATABASE_PATH: ':memory:', UPLOADS_DIR: path.join(tmpdir(), 'mtask-vitest-uploads') }`,
  with imports of `tmpdir` from `node:os` and `path` from `node:path`, and the comment
  above it extended to say the same of `data/uploads` (D4).
- `src/app.ts`: export `AppDeps`; `createApp(deps: AppDeps)`; the absolute-path check
  (D2); the `/uploads` mount directly after the mount of `publicDir` (D6);
  `app.use(createAddRouter(deps))` between `homeRouter` and `styleguideRouter`. The
  doc comment says what the two dependencies are and that the caller opens and closes
  the database.
- `src/server.ts`: D3. The `listen` callback and its comment stay as they are.
- `public/css/base.css`: the block of D14. The list of sections in the file's header
  comment does not change; the new rules are components.
- `src/testing/dom.ts`: export the types `DomFile` and `DomFileInput`; add
  `ObjectUrls` (`created: DomFile[]`, `revoked: string[]`,
  `urlOf(index: number): string`), `stubObjectUrls(window): ObjectUrls`,
  `setChosenFile(input: DomFileInput, file: DomFile | null): void` and
  `chooseFile(window, input: DomFileInput, file: DomFile | null): void` (D16).
  `urlOf(n)` is `blob:http://localhost/<n>`; the nth call of `createObjectURL` returns
  `urlOf(n)`, counting from 0.
- `src/testing/page.ts`: D17, and add
  `runLinkedScripts(app: Express, window: DomWindow): Promise<string[]>`, which returns
  the `src` values it ran (D16).
- `src/testing/jsdom.d.ts`: `DomElement.dispatchEvent(event: DomEvent): boolean`;
  `DomFileInput extends DomElement` with `value: string` and a readonly `files` (a
  `length` and indexed `DomFile`s); `DomFile` (`name`, `type`); `DomEvent` (`type`);
  `DomDocument.activeElement`; on `DomWindow`: `File` and `Event` constructors, `URL`
  with optional `createObjectURL` and `revokeObjectURL`, and `eval(source: string)`.
- `src/app.test.ts`, `src/ui.test.ts`, `src/project.test.ts`, `src/shell.test.ts`,
  `src/server.test.ts`: the table in D17.

Not touched: `src/views/layout.ejs` and every partial (the page builds on them as they
are; the button partial already takes `attrs`), `home.ejs`, `not-found.ejs`,
`styleguide.ejs`, `src/render.ts` (`PageLocals` already allows `addPage`), `src/ui.ts`,
`src/paths.ts`, `src/routes/home.ts`, `src/routes/styleguide.ts`, everything under
`src/db/` (`createSource` is used as it is; no migration), `src/stylesheet.test.ts`,
`src/components.test.ts`, `src/config.test.ts`, `src/config.database.test.ts`,
`src/testing/css.ts`, `.gitignore` (`/data/` already covers `data/uploads`),
`tsconfig.json`, `CLAUDE.md` (the language and the commands are the same),
`src/services/.gitkeep`, `docs/` unless the builder logs an error, and everything under
`factory/` except this job's `build.md`. No `data/` folder is committed.

## Risks

- **A wrong type reaches the disk, or an allowed one is refused.** The AC7 tests post
  eight rejected types, among them `constructor`, and expect 415, no uploads folder and
  no source; the AC4 tests store each of the four types.
- **The limit is off by one, or a multer upgrade changes what `fileSize` means.** The
  AC8 tests post exactly 10 MB and one byte more.
- **A partial file stays after a rejection.** Every rejection test reads the uploads
  folder after the answer. For the 413 that is the partial file multer wrote.
- **The client's file name leaks into the stored name or path.** The AC6 tests post
  `../../evil.png` and four other names, check the stored name against the UUID
  pattern, and check that nothing appeared outside the uploads folder.
- **A file is stored but its source is not.** The test with a closed database expects
  500 and an empty folder.
- **`image_path` and the mount drift apart**, and saved photos stop showing. The AC5
  tests request the `image_path` read from the database, not a path built in the test.
- **A stored file is served as something a browser runs.** The extension is one of four
  and comes from the server; the AC5 tests assert the content type and `nosniff`.
- **The mount serves a file from outside the folder, the database first of all.** The
  AC5 traversal test puts a file beside the uploads folder and asks for it three ways.
- **A test writes into `data/`.** D17 and D4: a test app's folder is temporary by
  construction, the configured folder under Vitest is outside the repo, and `createApp`
  refuses a relative folder. All three are tested. The builder also looks at
  `git status --short` and for a `data/` folder after the full run.
- **A test leaves folders in the system's temporary folder.** `src/testing/app.test.ts`
  checks that `close()` removes the folder with a file in it and that `withTestApp`
  closes when its callback throws.
- **The preview is hidden only once the script ran**, so a browser without script shows
  a dead Retake button. One AC3 test reads the served markup with scripts off.
- **The script throws and the test passes anyway.** `runLinkedScripts` rejects on a
  load error and `afterEach` asserts `scriptErrors` (the error-log entry).
- **The script is renamed or moved and the page links to nothing.** `runLinkedScripts`
  fails on any answer but 200, and a test asserts the one `src`.
- **The test helper stands in for the browser's file input**, so "Retake empties the
  input" is proved for `input.value = ''` only (D15, D16). The by-hand check on a phone
  covers the real input.
- **A new class is used in the page and not styled, or the reverse.** A test in
  `src/add-page.test.ts` holds the nine new class names against both the rendered page
  and the stylesheet.
- **The new CSS breaks a 002 guard** (a px padding, a color literal, a third radius).
  `src/stylesheet.test.ts` runs unedited.
- **`server.ts` forgets the database or passes the wrong folder.** It does not compile
  without both (D2), and the AC11 tests in `src/server.test.ts` assert the path, the
  order and the argument of `createApp`.
- **Plain Node cannot load the new modules**, or a process with multer loaded does not
  exit. The edited test in `src/project.test.ts` loads the app with its dependencies
  and expects exit code 0 within its timeout.
- **Nothing here ran on Node 22 or 24.** `package.json` allows 22.18 and newer. The
  calls used are old (`crypto.randomUUID`, `fs.mkdir` with `recursive`, `fs.rm`), and
  multer supports Node 10.16 and newer. If the builder has a Node 22 or 24 at hand,
  running the suite on it once is worth a line in `build.md`; if not, say so under Not
  done.
- **A malformed multipart body is answered with 500** (D10, row 4). Known and left to
  job 023.
- **Anyone who can reach the server can fill the disk, 10 MB at a time.** Rate limiting
  and the cleanup of images without tasks are job 023; the spec puts both out of scope.
- **A phone hands over a type that is not one of the four** (HEIC, for one). It gets the
  type message; converting is out of scope. What a real phone's camera sends was not
  checked here. It is part of the spec's by-hand check on a phone, which the builder
  lists under Not done.
