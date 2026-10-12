# 004-photo-upload: plan

Decision numbers (D1, D2, …) refer to `design.md`.

## Steps

After each step `yarn build` and `yarn test` must pass, the tests of earlier jobs
included. The only edits to existing test files are the ones in the table of D17.

1. **Dependencies.** Files: `package.json`, `yarn.lock`. Serves AC4.
   - `yarn add --exact multer@2.4.0`, then `yarn add --exact --dev @types/multer@2.3.0`
     (D1). Nothing else is installed.
   - Check: `package.json` has `"multer": "2.4.0"` under `dependencies` and
     `"@types/multer": "2.3.0"` under `devDependencies`, neither with a range; `yarn build`
     and `yarn test` pass as before (555 tests).

2. **The uploads folder in the configuration.** Files: `src/config.ts`, `.env.example`,
   `vitest.config.ts`, `src/config.uploads.test.ts`. Serves AC11, AC12.
   - `getUploadsDir(env)` (D4), built like `getDatabasePath` without the `:memory:` case.
   - The comment line and `UPLOADS_DIR=data/uploads` in `.env.example`.
   - `UPLOADS_DIR` in the `env` of `vitest.config.ts`, with the two imports (D4).
   - Check: `yarn vitest run src/config.uploads.test.ts src/project.test.ts` passes. The
     unedited 001 test ".env.example lists every environment variable the app reads"
     is in the second file and now covers `UPLOADS_DIR`.

3. **The photo storage service.** Files: `src/services/photo-storage.ts`,
   `src/services/photo-storage.test.ts`. Serves AC4, AC6, AC7, AC8.
   - The constants, `PhotoTypeError`, `photoExtension`, `photoUrl`, `createPhotoUpload`
     and `removePhoto`, as listed under Files in the design (D5, D7, D8, D9).
   - The types are a `Map`, never a plain object looked up with `in` (D8).
   - `filename` fails closed when the lookup gives nothing (D7).
   - `destination` is a function that creates the folder on every call; do not pass a
     string and do not use `dest` (D5).
   - Check: `yarn vitest run src/services/photo-storage.test.ts` passes. The middleware
     itself is tested through the route in step 5.

4. **The app takes its dependencies; the server opens the database.** Files:
   `src/app.ts`, `src/server.ts`, `src/testing/app.ts`, `src/testing/app.test.ts`,
   `src/testing/page.ts`, `src/app.test.ts`, `src/ui.test.ts`, `src/project.test.ts`,
   `src/server.test.ts`. Serves AC11, AC12, and AC5 (the mount).
   - `AppDeps` and `createApp(deps)` with the absolute-path check (D2) and the `/uploads`
     mount (D6). The Add router is not mounted yet.
   - `src/server.ts` in the order of D3.
   - `src/testing/app.ts` (D17), then the edits of the D17 table to `page.ts`,
     `app.test.ts`, `ui.test.ts`, `project.test.ts` and `server.test.ts`. The row for
     `shell.test.ts` belongs to step 5.
   - The new tests: `src/testing/app.test.ts`, the four in `src/server.test.ts`, and the
     one in `src/app.test.ts` (see AC11 and AC12 below).
   - Check: `yarn build` and `yarn test` pass. `grep -rn "createApp()" src` prints one
     line at most, the comment above the plain-Node test in `src/project.test.ts`: no
     call is left without arguments, in code or in a script string.

5. **The Add page and the upload route.** Files: `src/routes/add.ts`,
   `src/views/pages/add.ejs`, `src/app.ts`, `public/css/base.css`, `src/shell.test.ts`,
   `src/add-page.test.ts`, `src/add-photo.test.ts`. Serves AC1, AC2, AC4 to AC11.
   - `createAddRouter(deps)` with `GET /add`, `POST /add/photo`, `renderAdd` and the
     three messages (D10, D11). Mount it in `createApp` between `homeRouter` and
     `styleguideRouter`.
   - `pages/add.ejs` exactly as in D12, under its header comment. The script tag is part
     of it; the file it names arrives in step 6.
   - The CSS block of D14, above the `Style guide` section comment.
   - Take `'/add'` out of the not-found list in `src/shell.test.ts` (D17).
   - `src/add-page.test.ts` with the AC1 and AC2 tests; `src/add-photo.test.ts` with the
     tests of AC4 to AC11.
   - Check: `yarn vitest run src/add-page.test.ts src/add-photo.test.ts src/shell.test.ts src/stylesheet.test.ts`
     passes. `src/stylesheet.test.ts` is unedited and holds the new CSS to the 002
     rules.

6. **The preview script.** Files: `public/js/add-photo.js`, `src/testing/dom.ts`,
   `src/testing/page.ts`, `src/testing/jsdom.d.ts`, `src/add-page.test.ts`. Serves AC3.
   - The script, doing the six things of D15 and nothing else.
   - `stubObjectUrls`, `setChosenFile`, `chooseFile` in `dom.ts`; `runLinkedScripts` in
     `page.ts`; the new members in `jsdom.d.ts` (D16).
   - The AC3 tests, added to `src/add-page.test.ts`.
   - Check: `yarn vitest run src/add-page.test.ts` passes, and `yarn build` passes with
     the new declarations.

7. **The whole job.** Serves AC12.
   - `yarn build`, then `yarn test`, once, the whole suite.
   - After the run: `git status --short` shows this job's files only; there is no
     `data` folder in the repo (`ls data` fails); and
     `ls "$(node -p 'os.tmpdir()')" | grep '^mtask-'` prints nothing, so no test left a
     folder behind.
   - `git diff --stat main -- src/db src/views/layout.ejs src/views/partials src/render.ts src/ui.ts src/stylesheet.test.ts src/components.test.ts tsconfig.json .gitignore CLAUDE.md`
     prints nothing (the design's Not touched list).
   - By hand, with the real server kept out of `data/`: pick a free port (look with
     `lsof -nP -iTCP:<port> -sTCP:LISTEN` first), make a folder with `mktemp -d`, and
     start `PORT=<port> DATABASE_PATH=<folder>/app.db UPLOADS_DIR=<folder>/uploads node src/server.ts`.
     Open `/add`, upload a picture, see `Photo saved.` and the picture; post a text
     file and see the type message. Stop the server and remove the folder. Write what
     was seen into `build.md`.
   - Not possible here, so listed under Not done in `build.md`: a photo taken on a phone
     (the spec's by-hand check), and the look of `/add` at 375px and 1200px in both
     themes if no browser is at hand.

## Tests

Shared setup.

- `src/add-page.test.ts` and `src/add-photo.test.ts` each create a `TestApp` with
  `createTestApp()` in `beforeEach` and call `close()` in `afterEach` (D17). No test in
  this job calls `getUploadsDir()` or `getDatabasePath()` to find a place to write.
- `src/add-photo.test.ts` has these helpers:
  - `upload({ bytes, filename, type, field })`: a multipart `POST /add/photo` through
    supertest's `attach`. Defaults: eight arbitrary bytes, `list.png`, `image/png`,
    `photo`.
  - `storedFiles(dir = testApp.uploadsDir)`: the names in the folder, or `[]` when the
    folder does not exist.
  - `sources()`: every row of `sources` as `{ id, kind, image_path, transcript }`, read
    with SQL from `testApp.db`.
  - `expectRejected(response, status, message)`: the assertions of AC10, below.
  - `STORED_NAME`: a UUID followed by `.jpg`, `.png`, `.webp` or `.gif`, and nothing
    else.
- `src/add-page.test.ts` keeps every window it opens and, in `afterEach`, closes each
  and asserts `scriptErrors(window)` is `[]`
  (`docs/errors/jsdom-page-script-error-does-not-fail-test.md`). Its helper `openAdd()`
  requests `/add` from the test app, opens it with `openPage`, calls `stubObjectUrls`,
  and returns the window, the recorded URLs, the file input, the preview, the Retake
  button and `start()`, which is `runLinkedScripts(testApp.app, window)`.
- A file for the input is `new window.File(['abc'], 'list.png', { type: 'image/png' })`.

### AC1: `src/add-page.test.ts`, `src/shell.test.ts`

- `GET /add` answers 200 with `text/html`; the page has one `<html`, the title
  `Add task - Task Image AI`, the site header with the app name, and `main.page`.
- `main` holds exactly one `h1`, and its text is `Add task`.
- The page has one navigation landmark with five links; exactly one element has
  `aria-current="page"`, and its `href` is `/add`.
- `main` holds one `[role="tablist"]` with a non-empty `aria-label`; the whole page has
  exactly one `[role="tab"]`; it is inside the tab list, its text is `Photo`, and it has
  `aria-selected="true"`.
- The tab's `aria-controls` is the id of the page's one `[role="tabpanel"]`, the
  panel's `aria-labelledby` is the tab's id, and the form is inside the panel.
- Before anything is posted the page has no `[role="alert"]`, no `[role="status"]` and
  no `img` with a `src` inside `main`.
- `src/shell.test.ts` (edited): `/timeline`, `/tasks` and `/more` each answer 404 with
  the heading `Page not found`. `/add` is no longer in the list.

### AC2: `src/add-page.test.ts`

- `main` holds exactly one `form`; its `method` is `post`, its `action` is
  `/add/photo`, its `enctype` is `multipart/form-data`, and it has no `onsubmit`.
- The form holds exactly one `input`: `type="file"`, `name="photo"`,
  `accept="image/*"`, `capture="environment"`, with no `multiple` and no `disabled`.
- The input has an `id`, and the form holds exactly one `label` whose `for` is that id,
  with text.
- The form holds exactly one `button[type="submit"]`, its text is `Upload photo`, it is
  not `disabled`, and the form has no `input[type="submit"]`.
- On the fresh page, on the page after a stored photo and on the page after a post with
  no file: the page has at least four buttons and every `button` has the class `btn`.
- For each of the nine class names of D14 (`tabs`, `tab-panel`, `notice`,
  `notice--error`, `photo`, `photo-form`, `photo-form__label`, `photo-form__input`,
  `photo-form__actions`): some element of those three pages has the class, and some
  rule of the stylesheet names it in its selector.
- That the form posts without script is shown by AC4: those tests post what the form
  sends and run no script.

### AC3: `src/add-page.test.ts`

- With scripts off (`parseHtml`): `img[data-photo-preview]` is inside the form, has
  `hidden`, has no `src`, and has an `alt`; `button[data-photo-retake]` has the text
  `Retake`, `type="button"` and `hidden`.
- The page has exactly one `script[src]`; its `src` is `/js/add-photo.js` and it has
  `defer`. `GET` on that `src` answers 200 with a JavaScript content type.
- With no file chosen, `start()` resolves to `['/js/add-photo.js']`, both elements
  still have `hidden`, and no object URL was made.
- After `chooseFile` with a file: neither element has `hidden`, the preview's `src` is
  `urls.urlOf(0)`, and `urls.created` is `[file]`, the very file that was chosen.
- After choosing a file and clicking Retake: `input.files.length` is 0 and
  `input.value` is `''`; both elements have `hidden`; the preview has no `src`;
  `urls.revoked` is `[urls.urlOf(0)]`; `document.activeElement` is the input.
- Choosing a second file without Retake: the preview's `src` is `urls.urlOf(1)`,
  `urls.created` is both files in order, and `urls.revoked` is `[urls.urlOf(0)]`.
- Choosing a file, clicking Retake and choosing again: both elements are shown and the
  preview's `src` is `urls.urlOf(1)`.
- Choosing a file and then clearing the choice (`chooseFile` with `null`): both
  elements have `hidden`, the preview has no `src`, and no second object URL was made.
- A file put into the input with `setChosenFile` before `start()`: after `start()` both
  elements are shown and the preview's `src` is `urls.urlOf(0)`.
- "Raises no script error" is the `afterEach` of the shared setup, for every window of
  the tests above, and the rejection of `start()` for an error on load.

### AC4: `src/add-photo.test.ts`

- For each of `image/jpeg`, `image/png`, `image/webp`, `image/gif`: the post answers
  201; the uploads folder holds one file with exactly the posted bytes; `sources()` is
  one row, `{ id: 1, kind: 'photo', image_path: '/uploads/<that file's name>', transcript: null }`;
  the page is in the layout with Add marked current and the heading `Add task`;
  `main [role="status"]` has the text `Photo saved.`; the `img` elements in `main` that
  have a `src` are exactly one, with that `image_path`; there is no `[role="alert"]`;
  the form is still on the page.
- A declared type of `IMAGE/PNG`, and one of `image/png; charset=binary`: 201, and the
  stored file ends in `.png` (D8).
- With the database closed before the post: the answer is 500 and the uploads folder
  holds no file (D10, row 6).

### AC5: `src/add-photo.test.ts`

- For each of the four types: `GET` on the `image_path` read from the source row
  answers 200, the `content-type` header is exactly that type, the body is the posted
  bytes, and `x-content-type-options` is `nosniff`.
- After a photo was stored, `GET /uploads/<a UUID that was never stored>.png` answers
  404 with the not-found page.
- In an app that never stored anything, the same request answers 404 and the uploads
  folder still does not exist.
- `GET /uploads` and `GET /uploads/` answer 404: the folder is not listed.
- With a file `secret.txt` written beside the uploads folder,
  `/uploads/%2e%2e/secret.txt`, `/uploads/..%2fsecret.txt` and
  `/uploads/%2e%2e%2fsecret.txt` each answer 404 and the body never holds the file's
  text.

### AC6: `src/add-photo.test.ts`, `src/services/photo-storage.test.ts`

- A post named `../../evil.png`: 201; the path `uploadsDir/../../evil.png` does not
  exist before or after; the test app's folder holds `uploads` and nothing else; the
  one stored name matches `STORED_NAME` and does not contain `evil`.
- For each client name of `notes.gif`, `notes`, `notes.html`, `.png` and `a/b\c.jpeg`,
  posted as `image/webp`: one stored file, its name matches `STORED_NAME` and ends in
  `.webp`.
- Two posts with the same client name and the same bytes: two files with different
  names, and two sources whose `image_path`s are those two names.
- `photo-storage.test.ts`: `photoExtension` gives `.jpg`, `.png`, `.webp` and `.gif`
  for the four types, and `undefined` for `image/svg+xml`, `image/heic`,
  `application/pdf`, `IMAGE/PNG`, `''`, `constructor` and `toString`.
- `photo-storage.test.ts`: `photoUrl('a.png')` is `/uploads/a.png`, and `PHOTO_FIELD`
  is `photo`.

### AC7: `src/add-photo.test.ts`

- For each declared type of `application/pdf`, `text/plain`, `text/html`,
  `image/svg+xml`, `image/heic`, `image/bmp`, `application/octet-stream` and
  `constructor`: `expectRejected` with 415 and
  `That file is not a photo. Choose a JPEG, PNG, WebP or GIF image.`, and the uploads
  folder does not exist afterwards: the type is refused before anything touches the
  disk. (This last assertion is the one that fails when the `fileFilter` is removed;
  see D7 and D8.)
- A file named `real.png` that starts with the PNG signature, declared as
  `application/pdf`: the same rejection. The declared type decides, not the name or the
  bytes.
- A file of plain text named `notes.txt`, declared as `image/png`: 201, stored as
  `.png`. The bytes are not inspected.
- A file one byte over the limit, declared as `application/pdf`: 415 with the type
  message, not 413 (D8).

### AC8: `src/add-photo.test.ts`, `src/services/photo-storage.test.ts`

- `photo-storage.test.ts`: `MAX_PHOTO_BYTES` is `10 * 1024 * 1024`.
- A JPEG of exactly `10 * 1024 * 1024` bytes: 201, the stored file equals the posted
  bytes, and there is one source. The size is written out in the test, not taken from
  the constant.
- A JPEG of `10 * 1024 * 1024 + 1` bytes: `expectRejected` with 413 and
  `That photo is larger than 10 MB. Choose a smaller one.`
- A JPEG of 25 MB: the same rejection. The answer arrives, and nothing is left.

### AC9: `src/add-photo.test.ts`

Each is `expectRejected` with 400 and `Choose a photo first.`

- A post with no body.
- The body a browser sends for the form with nothing chosen, written out by hand: one
  part named `photo` with `filename=""`, `Content-Type: application/octet-stream` and
  no bytes.
- A multipart post whose `photo` is a text field.
- A urlencoded post with `photo=list.png`.
- A PNG posted under the field name `picture`.
- A PNG under `photo` followed by a PNG under `picture`: the first file is not kept.

### AC10: `src/add-photo.test.ts`

Every rejection test of AC7, AC8 and AC9 goes through `expectRejected`, which asserts:

- the status;
- the layout: five navigation links, and the heading `Add task` in `main`;
- exactly one `main [role="alert"]`, whose text is exactly the message;
- no `[role="status"]`;
- one form in `main` with the action `/add/photo` and one `input[type="file"][name="photo"]`;
- `storedFiles()` is `[]`: no file, whole or partial, is in the uploads folder;
- `sources()` is `[]`.

### AC11: `src/config.uploads.test.ts`, `src/add-photo.test.ts`, `src/app.test.ts`, `src/server.test.ts`

`src/config.uploads.test.ts`:

- `getUploadsDir` is `<rootDir>/data/uploads` when `UPLOADS_DIR` is not set, is empty,
  or is blank.
- A relative value starts at `rootDir`: `var/photos` gives `<rootDir>/var/photos`.
- An absolute value is returned unchanged.
- `.env.example` has the key `UPLOADS_DIR`, and `getUploadsDir` of the parsed file
  equals the default.
- `.gitignore` has the line `/data/`, the default folder is `uploads` directly inside
  `<rootDir>/data`, and it has the same parent as the default database file.

`src/add-photo.test.ts`:

- An app built with `uploadsDir` at `<dir>/not/there/uploads`: after `GET /add`,
  `<dir>/not` does not exist; after one stored photo the folder exists and holds one
  file.
- After a stored photo the uploads folder is removed; the next post answers 201 and
  the folder holds one file again.

`src/app.test.ts` (one new test):

- `createApp` throws `The uploads folder must be an absolute path, got "uploads"` for
  `uploads`, and throws for `''`.

`src/server.test.ts` (four new tests; `openDatabase` and `createApp` are spies, D17):

- With `DATABASE_PATH` stubbed to an absolute path under `tmpdir()`: `openDatabase` is
  called once, with exactly that path, before `listen`; the folder of that path was not
  created.
- With `loadEnv` replaced by a function that sets `DATABASE_PATH`: `openDatabase` gets
  that path, so the path is read after `.env` is loaded.
- With `UPLOADS_DIR` stubbed to an absolute path: `createApp` is called once with
  exactly `{ db: <what openDatabase returned>, uploadsDir: <that path> }`, and that
  folder was not created.
- With `openDatabase` throwing: importing the server rejects with that error and
  `listen` is not called.

The unedited 001 test in `src/project.test.ts`, ".env.example lists every environment
variable the app reads", fails when `UPLOADS_DIR` is read and not listed.

### AC12: `src/testing/app.test.ts`, `src/config.uploads.test.ts`, the commands

`src/testing/app.test.ts` (each test closes what it creates):

- `createTestApp()`: `dir` exists and is directly inside `tmpdir()`; `uploadsDir` is
  `<dir>/uploads` and does not exist; `db` is open and has an empty `sources` table.
- `close()` removes `dir` with a file written into `uploadsDir`, leaves `db` closed,
  and does not throw when called a second time.
- Two test apps have different folders, and a source created in one is not in the
  other.
- `withTestApp` resolves to what its callback returns, and afterwards the folder is
  gone and the database is closed.
- `withTestApp` with a callback that throws: it rejects with that error, and the folder
  is gone and the database is closed all the same.

`src/config.uploads.test.ts`:

- Under the test runner `getUploadsDir()`, read from the real environment, is
  `<tmpdir()>/mtask-vitest-uploads` and is not inside `rootDir`. It fails when the line
  is removed from `vitest.config.ts`.

`src/project.test.ts` (edited, same assertion): plain Node loads `src/app.ts` and
`src/db/database.ts`, builds the app with an in-memory database and a folder that is
never created, and exits with code 0 within the timeout.

The commands, in step 7: `yarn build` exits 0; `yarn test` passes as a whole; then
`git status --short`, `ls data` and the listing of the temporary folder show that the
run left nothing in the repo, in `data/` or in the temporary folder.
