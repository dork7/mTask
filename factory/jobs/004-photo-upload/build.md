# 004-photo-upload: build

Branch `factory/004-photo-upload`, code commit `9e2e95b`. Built on Node 26.8.2 and yarn
1.22.22, the only Node on this machine. Two packages were added, pinned: `multer` 2.4.0
(with busboy 1.6.0) and `@types/multer` 2.3.0. The rest is what `package.json` had
(Express 5.3.0, EJS 7.0.1, jsdom 30.1.1, supertest 7.3.1, Vitest 5.0.1, TypeScript 5.9.3).

## What changed

Created:

| File | Why |
|---|---|
| `src/services/photo-storage.ts` | The rules of a stored photo (D5, D7, D8, D9): `PHOTO_FIELD`, `MAX_PHOTO_BYTES`, `UPLOADS_URL_PATH`, `PhotoTypeError`, `photoExtension` (a `Map` lookup), `photoUrl`, `createPhotoUpload` (multer disk storage whose `destination` creates the folder on every call and whose `filename` is `randomUUID()` plus the extension of the declared type, the `fileFilter`, the size limit, `.single('photo')`) and `removePhoto`. `filename` fails closed with a `PhotoTypeError` when the lookup gives nothing. |
| `src/routes/add.ts` | `createAddRouter(deps)` with `GET /add` and `POST /add/photo` (D10, D11). The route calls the upload middleware itself and answers the six rows of D10 through the one function `renderAdd`. The three messages are constants and are not exported. |
| `src/views/pages/add.ejs` | The markup of D12 under a header comment that names `addPage` and its two fields. |
| `public/js/add-photo.js` | The preview script, the six things of D15 and nothing else. |
| `src/testing/app.ts` | `TestApp`, `createTestApp()`, `withTestApp(run)` (D17). |
| `src/add-page.test.ts` | AC1, AC2, AC3 (29 tests). |
| `src/add-photo.test.ts` | AC4 to AC11 through the route (47 tests). |
| `src/config.uploads.test.ts` | AC11 and AC12 for `getUploadsDir` (8 tests). |
| `src/services/photo-storage.test.ts` | AC6, AC7, AC8 for the lookups and the constants (15 tests). |
| `src/testing/app.test.ts` | AC12 for the test app (9 tests). |
| `docs/errors/failing-test-leaves-file-outside-its-temp-folder.md`, `docs/errors/tostrictequal-passes-for-a-copy-of-the-object.md`, `docs/errors/headless-chrome-screenshot-hangs-and-crops-narrow-windows.md` | Three errors hit while building. See Test run. |

Changed:

| File | Why |
|---|---|
| `package.json`, `yarn.lock` | The two packages of D1, through `yarn add --exact`. `yarn.lock` gained multer, busboy, streamsearch, append-field, type-is 1.6.18 and media-typer 0.3.0, and no second copy of `@types/express`. |
| `src/config.ts` | `getUploadsDir(env = process.env)` (D4). Nothing else in the file changed. |
| `.env.example` | The comment line and `UPLOADS_DIR=data/uploads` (D4). |
| `vitest.config.ts` | `UPLOADS_DIR: path.join(tmpdir(), 'mtask-vitest-uploads')` in `env`, the two imports, and the comment extended (D4). |
| `src/app.ts` | `AppDeps`, `createApp(deps)`, the absolute-path check (D2), the `/uploads` mount directly after the mount of `publicDir` (D6), and `createAddRouter(deps)` between `homeRouter` and `styleguideRouter`. |
| `src/server.ts` | The order of D3: `loadEnv()`, `getPort()`, `openDatabase(getDatabasePath())`, `createApp({ db, uploadsDir: getUploadsDir() })`, `listen`. The `listen` callback and its comment are as they were. |
| `public/css/base.css` | The block of D14, directly above the `Style guide` section comment. |
| `src/testing/dom.ts` | Exports the types `DomFile` and `DomFileInput`; adds `ObjectUrls`, `stubObjectUrls`, `setChosenFile`, `chooseFile` (D16). |
| `src/testing/page.ts` | `getPage`, `getStylesheet` and `renderView` run inside `withTestApp` (D17); adds `runLinkedScripts` (D16). |
| `src/testing/jsdom.d.ts` | The members D16 lists, and `DomFileList` for the `files` of a file input. |
| `src/app.test.ts` | D17: `createTestApp` in `beforeEach`, closed in `afterEach`; each `createApp()` is `testApp.app`. One test added (AC11). |
| `src/ui.test.ts` | D17: "is what the views get as `ui`" reads `app.locals.ui` inside `withTestApp`. |
| `src/project.test.ts` | D17: the plain-Node script builds the app with an in-memory database and a folder passed as its argument. The timeout and the exit-code assertion stay; one assertion is added, that the folder was not created. |
| `src/shell.test.ts` | `'/add'` taken out of the list of paths that answer with the not-found page (AC1). |
| `src/server.test.ts` | D17: `createApp` and `openDatabase` are spies. The seven tests that were there are unchanged. Four tests added (AC11). |

Not touched, checked with the `git diff --stat main -- ...` command of plan step 7, which
printed nothing: `src/db`, `src/views/layout.ejs`, `src/views/partials`, `src/render.ts`,
`src/ui.ts`, `src/stylesheet.test.ts`, `src/components.test.ts`, `tsconfig.json`,
`.gitignore`, `CLAUDE.md` (the language and the commands are the same).

## Acceptance criteria

Each row was checked the other way: one change that breaks the behaviour was made, the
named test was run and seen to fail, and the file was put back. 162 such changes were
made, one at a time, by a throwaway script kept outside the repo. Every one failed at
least one test in the end; three did not at first, and the tests were tightened (see
Test run). "Fails when" names the change. Test names are shortened; `page` is
`src/add-page.test.ts`, `photo` is `src/add-photo.test.ts`.

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1: `GET /add` returns 200 | page: "returns 200 with the Add page in the layout" | the route is `/add-task` | pass |
| AC1: renders in the layout | same test (one `<html`, the title `Add task - Task Image AI`, the site header, `main.page`) | `renderAdd` renders `pages/add` without the layout; the title is `Add` | pass |
| AC1: the heading `Add task` | page: "has the one heading Add task" | the heading is `Add` | pass |
| AC1: Add link marked `aria-current="page"` | page: "marks the Add link, and only it, as the current page" | `nav: 'add'` removed from `renderAdd` | pass |
| AC1: a tab list with exactly one tab, `Photo`, `aria-selected="true"` | page: "has a named tab list with exactly one tab, Photo, which is selected" | `role="tablist"` removed; its `aria-label` removed; the label is `Picture`; `aria-selected` removed; a second `role="tab"` added | pass |
| AC1 (plan): the tab is tied to its panel, which holds the form | page: "ties the tab to its panel, which holds the form" | the panel's id changed; `aria-labelledby` changed; the form moved out of the panel | pass |
| AC1 (plan): no message and no photo on a fresh page | page: "shows no message and no photo before anything is posted" | the alert, or the saved notice, rendered whenever the local is not `undefined` | pass |
| AC1: `/timeline`, `/tasks`, `/more` still the not-found page | `src/shell.test.ts`: "%s answers with the not-found page until its job builds it" | `/timeline` added to the Add route | pass |
| AC1: the existing test that expects that of `/add` is changed | `src/shell.test.ts`, same test, without `/add` | `/add` put back into the list: that row fails | pass |
| AC2: form with `method="post"`, `action="/add/photo"`, `enctype="multipart/form-data"` | page: "posts to /add/photo as multipart form data, with no script in the way" | `method="get"`; `action="/add"`; `enctype` removed | pass |
| AC2: one labelled file input, `name="photo"`, `accept="image/*"`, `capture="environment"` | page: "has one input, the file input as the plan writes it"; "labels the input" | `type="text"`; `name="image"`; `accept="image/png"`; `capture` removed; `multiple` added; a second input added; the label's `for` changed | pass |
| AC2: a submit button `Upload photo` | page: "has one submit button, Upload photo" | the label is `Upload`; `type: 'submit'` removed | pass |
| AC2: the form posts without any script | page: the same form test (no `onsubmit`); photo: every AC4 test posts what the form sends and runs no script | `onsubmit` added to the form | pass |
| AC2: every button carries the `btn` class | page: "gives every button of the page the btn class, whatever the page answers" (fresh, after a stored photo, after a rejection) | Retake written as a bare `<button>` | pass |
| AC2 (plan): the nine new classes are used and styled | page: "uses the class %s in the page and styles it in the stylesheet" | the `.photo-form__label` rule removed; the class `photo-form__actions` removed from the page; `notice--error` removed from the page | pass |
| AC3: preview and Retake hidden while no file is chosen, also without script | page: "is hidden in the served page, with the Retake button, before any script runs"; "stays hidden when the script loads with no file chosen" | `hidden` removed from the preview, or from Retake, in the view; `src=""` added to the preview; the `if (!file) return` removed from the script | pass |
| AC3: the page's script | page: "links to one script, deferred, which the app serves as JavaScript" | the script tag names `/js/photo.js`; `defer` removed; the tag removed; `public/` mounted elsewhere | pass |
| AC3: choosing a file shows both and sets the preview's `src` to the chosen file | page: "shows the chosen file and the Retake button when a file is chosen"; "shows a file the browser brought back before the script loaded" | `preview.src = objectUrl` removed; either `hidden = false` removed; the `change` listener removed; the object URL made from another file; the call on load removed | pass |
| AC3: Retake empties the input and hides both again | page: "empties the input and hides both again on Retake"; "shows a file that is chosen after Retake" | `input.value = ''` removed; `hidePreview()` removed from the listener; `removeAttribute('src')` removed; `retake.hidden = true` removed; `revokeObjectURL` removed; `input.focus()` removed; the `change` listener removed on Retake | pass |
| AC3 (plan): a second file, and a cleared choice | page: "shows the second file when another one is chosen without Retake"; "hides both again when the choice is cleared in the file picker" | `showChosenPhoto` keeps the first URL; `hidePreview()` moved after the `if (!file) return` | pass |
| AC3: loading the page and using the controls raises no script error | page: the `afterEach` asserts `scriptErrors(window)` is `[]` for every window; `start()` rejects on an error on load | a call of an undefined name on load (7 tests fail); the same at the end of the Retake listener (2 tests fail) | pass |
| AC4: a JPEG, PNG, WebP or GIF returns 201 | photo: "stores a file declared as %s and records it as a photo source" (four types) | the status is 200; `image/webp` removed from the map | pass |
| AC4: stores the file in the uploads folder | same test: one file with exactly the posted bytes | multer given memory storage | pass |
| AC4: exactly one source, `kind` `photo`, `image_path` `/uploads/<file name>` | same test: `sources()` equals the one row | `createSource` not called; called twice; called with `kind: 'text'`; `image_path` is the bare file name | pass |
| AC4: the Add page with `Photo saved.` and an `<img>` whose `src` is that `image_path` | same test | the text is `Saved.`; the `<img>` removed; its `src` fixed to another path; the form left out after a stored photo | pass |
| AC4 (D8): `IMAGE/PNG` and `image/png; charset=binary` are PNG | photo: "reads a declared type of "%s" as image/png" | PNG stored as `.PNG` | pass |
| AC4 (D10 row 6): no file without a source | photo: "answers 500 and keeps no file when the source cannot be written" | `next(failure)` without `removePhoto`; `removePhoto` that removes nothing | pass |
| AC5: `GET` on a stored `image_path` returns 200 with the bytes and the type | photo: "serves a stored %s file with its bytes and its type" (four types; the path is read from the source row; `nosniff` asserted) | the mount removed; the mount at `/photos`; GIF stored as `.png`; the type forced to `application/octet-stream`; the `nosniff` header removed | pass |
| AC5: a name that was never stored returns 404 | photo: "answers 404 with the not-found page for a name that was never stored"; "answers 404 and creates no folder in an app that never stored anything" | `fallthrough: false` on the mount; the folder created in `createApp` | pass |
| AC5 (D6): the folder is not listed | photo: "does not list the folder at %s" (`/uploads`, `/uploads/`) | `redirect: false` removed (the `/uploads` row fails); the mount replaced by a handler that joins the path itself and lists a folder (both rows fail) | pass |
| AC5 (D6): nothing beside the folder is served | photo: "does not serve the file beside the folder at %s" (three encodings, sent unchanged through `node:http`) | the same handler: all three fail | pass |
| AC6: the name is made by the server | photo: "takes nothing from the client name "%s"" (five names) | `filename` answers `file.originalname`; the client name kept in front of the UUID | pass |
| AC6: the extension is that of the image's type | photo: the same five tests (`.webp`) and the four AC4 tests; `photo-storage.test.ts`: "gives %s the extension %s" | the extension taken from the client name; JPEG mapped to `.jpeg` | pass |
| AC6: `../../evil.png` is stored inside the uploads folder | photo: "stores an upload named ../../evil.png inside the uploads folder, under a name of its own" | `originalname` with `preservePath: true`: the file really landed in the temporary folder, outside the test app's folder | pass |
| AC6: two uploads with the same client name are two files | photo: "stores two uploads with the same client name and the same bytes as two files" | the name made from a constant and the extension | pass |
| AC6 (plan): `photoUrl`, `PHOTO_FIELD` | `photo-storage.test.ts`: "builds the URL path of a stored photo under /uploads"; "names the form field photo" | `photoUrl` without `/uploads`; the field named `image` | pass |
| AC7: another declared type is rejected with 415 and the message | photo: "rejects a declared type of %s with 415, before anything touches the disk" (eight types) | the status is 400; the message shortened; the route does not handle `PhotoTypeError`; SVG added to the map; every `image/*` allowed | pass |
| AC7 (D8): refused before anything is written | the same tests: the uploads folder does not exist afterwards | the `fileFilter` removed with the guard in `filename` left in: the answer is still 415, the folder exists (`expected true to be false`), and all eight fail | pass |
| AC7: judged by what the upload declares, not the bytes | photo: "judges by the declared type, not by the name or the bytes"; "stores plain text that is declared as image/png: the bytes are not inspected" | the filter looks at the client name's extension | pass |
| AC7 (D8): a `Map`, not an object | `photo-storage.test.ts`: "gives "%s" no extension" for `constructor` and `toString` | the lookup made in a plain object | pass |
| AC7 and AC8 together: wrong type and too large is 415 | photo: "answers a file of a wrong type that is also too large with 415, not 413" | the filter and the guard both removed | pass |
| AC8: larger than 10 x 1024 x 1024 bytes is rejected with 413 and the message | photo: "rejects a photo of 10 MB and one byte with 413"; "rejects a photo of 25 MB with 413 and leaves nothing behind" | `fileSize` one byte higher; the limit removed; the limit 20 MB; the status 400; the message changed; the route does not handle `LIMIT_FILE_SIZE` | pass |
| AC8: exactly that size is accepted | photo: "stores a photo of exactly 10 MB" (the size is written out as 10485760) | `fileSize` one byte lower; the constant `10 * 1000 * 1000` | pass |
| AC8 (plan): the constant | `photo-storage.test.ts`: "limits a photo to 10 MB" | the constant changed | pass |
| AC9: no file in `photo` is rejected with 400 and `Choose a photo first.` | photo: six tests under "a post with no file in photo": no body, the empty part a browser sends, a text field, a urlencoded body, a file under `picture`, a file under `photo` followed by one under `picture` | the status 422; the message changed; a missing file answered with 201; the route does not handle `LIMIT_UNEXPECTED_FILE`; multer's `.any()` taking a file under any name; the empty part answered with the type message | pass |
| AC10: the Add page in the layout | photo: `expectRejected`, used by every rejection test of AC7 to AC9 | the 415 sent as plain text | pass |
| AC10: the message in an element with `role="alert"` | `expectRejected`: exactly one, with exactly the message, and no `role="status"` | the role is `status`; the message rendered twice; the saved notice rendered with a rejection | pass |
| AC10: the form of AC2 still on the page | `expectRejected` | the form left out when there is an error | pass |
| AC10: no file in the uploads folder, whole or partial | `expectRejected`: `storedFiles()` is `[]` | a file written in the 413 branch; multer told to accept the field `picture` too, so the first file stays | pass |
| AC10: no source | `expectRejected`: `sources()` is `[]` | `createSource` called in the no-file branch; in the type branch | pass |
| AC11: the folder is `data/uploads` under the repo root, which `.gitignore` covers | `src/config.uploads.test.ts`: "is data/uploads under the repo root when %s" (unset, empty, blank); "the default folder is inside the folder .gitignore ignores, beside the default database" | the default is `<rootDir>/uploads`; `.trim()` removed | pass |
| AC11: it can be moved with `UPLOADS_DIR` (D4) | same file: "starts a relative value at the repo root, not at the working folder"; "returns an absolute value unchanged" | `path.resolve(raw)`; `path.join(rootDir, raw)`; the variable ignored | pass |
| AC11: the variable is listed in `.env.example` | same file: ".env.example lists UPLOADS_DIR, and its value names the default folder"; `src/project.test.ts`: ".env.example lists every environment variable the app reads" (unedited) | the line removed (both fail); its value changed | pass |
| AC11: created when it is missing (D5: when a photo is stored, with its parents, and again after it was removed) | photo: "is created with its parents when the first photo is stored, not before"; "is created again when it was removed while the app runs" | `mkdir` removed; `recursive` removed; `destination` given as a string, which creates it once | pass |
| AC11 (D2): a relative folder is refused | `src/app.test.ts`: "must be an absolute path, so nothing is stored under the working folder" | the check removed; the value left out of the message | pass |
| AC11: `server.ts` opens the database once, at the path `getDatabasePath()` returns | `src/server.test.ts`: "opens the database once, at the configured path, before it listens"; "reads the database path after it has loaded .env" | not opened; opened twice; opened at `:memory:`; the path read before `loadEnv()` | pass |
| AC11: before it listens | the first of those tests (call order); "stops before it listens when the database cannot be opened" | the database opened in a microtask after `listen`; the error caught | pass |
| AC11 (D3): the app is built on that database and the configured folder | `src/server.test.ts`: "builds the app on that database and the configured uploads folder" | a copy of the database object passed; `getUploadsDir({})`; a third entry passed; the folder created at start | pass |
| AC12: the new tests use a temporary uploads folder and a temporary or in-memory database | `src/testing/app.test.ts`: the five tests under "createTestApp" | the folder nested one deeper; `uploadsDir` is `dir`; the uploads folder created up front; one database shared; one folder shared; a database without the schema | pass |
| AC12: and leave nothing behind | `src/testing/app.test.ts`: "removes the folder with what was stored in it, and closes the database"; "does not throw when it is called a second time"; the two `withTestApp` tests | `rmSync` removed; an empty folder only removed; the database left open; `close()` without the `isOpen` check; `withTestApp` without `finally`; without closing; without awaiting its callback | pass |
| AC12: nothing in `data/` | `src/config.uploads.test.ts`: "is under the temporary folder, never data/uploads" | the `UPLOADS_DIR` entry removed from `vitest.config.ts` | pass |
| AC12 (plan): plain Node loads the app with its dependencies | `src/project.test.ts`: "plain Node, the runtime of the dev command, can load the app" | the import in `src/routes/add.ts` written without `type` and `.ts`; the folder created in `createApp` | pass |
| AC12: `yarn build` and `yarn test` pass | the commands, under Test run | | pass |

Two things the breaking showed that the tables above do not say:

- The route test with a declared type of `constructor` holds only that such an upload is
  rejected before the disk is touched. busboy cannot parse a part type without a slash
  and hands multer `text/plain` for it, so the name `constructor` never reaches
  `photoExtension` through the route. With the lookup made in a plain object that route
  test still passes. The two tests in `src/services/photo-storage.test.ts` are the ones
  that hold D8's `Map`.
- "No file, whole or partial" after a 413 is multer's own clean-up. It was not broken
  inside multer; the row above broke it by writing a file in the route's 413 branch.

Checked by hand, with the real server on a folder made with `mktemp -d`
(`PORT=4871 DATABASE_PATH=<folder>/app.db UPLOADS_DIR=<folder>/uploads node src/server.ts`;
the port was free before, the server was stopped and the folder removed afterwards):

- Start: `Task Image AI is running at http://localhost:4871`. The folder then held
  `app.db` and no `uploads`.
- `GET /add`: 200, `text/html; charset=utf-8`.
- A real 64 x 48 PNG posted with curl as `image/png`: 201, `<p class="notice" role="status">Photo saved.</p>`
  and `<img class="photo" src="/uploads/837188a0-7c74-4bd7-8819-2e23ea2f6dcb.png" …>`.
  `uploads/` now existed and held that one file. `GET` on that path: 200, `image/png`,
  6302 bytes, `X-Content-Type-Options: nosniff`, and `cmp` found the bytes identical to
  the file posted. The `sources` table held one row, `{ id: 1, kind: 'photo', image_path: '/uploads/837188a0-….png' }`.
- A text file posted as `text/plain`: 415 with
  `That file is not a photo. Choose a JPEG, PNG, WebP or GIF image.` in `role="alert"`.
- A post with nothing: 400 with `Choose a photo first.`
- `curl --path-as-is` on `/uploads/%2e%2e/app.db` and `/uploads/../app.db`: 404 both.
  `/uploads/nothing.png`: 404. `/js/add-photo.js`: 200, `text/javascript; charset=utf-8`.
- In headless Chrome 154, driven over the DevTools protocol against the same server:
  on load the input had no file and the preview and Retake were hidden. With `list.png`
  set on the real file input, the preview was shown with a `blob:` `src` and a natural
  width of 64, and Retake was shown. A click on Retake left `files.length` 0, `value`
  `''`, both hidden, no `src`, and the focus on the input. Chosen again, both were shown
  again. A click on `Upload photo` led to `/add/photo` with `Photo saved.` and the saved
  image at its natural width of 64. No exception was reported; the one console entry
  was the 404 for `/favicon.ico`, which every page of the app has.
- Screenshots in the same Chrome, looked at one by one. At a real 375px viewport: the
  fresh page in the light theme, the page after a stored photo in the dark theme, and
  the page after a rejection in both. At 1200px: the fresh page in the dark theme and
  the page after a rejection in the light theme. In all six nothing overflows, the
  selected tab has the accent color, the notice and the error notice are readable, and
  the "Choose File" button has the height of the other buttons; at 1200px Add is the
  highlighted item of the sidebar. Not looked at: the fresh page in the light theme and
  the page after a stored photo, at 1200px.

## Test run

`yarn build`:

```
yarn run v1.22.22
$ tsc --noEmit
Done in 0.74s.
```

`yarn test`:

```
 RUN  v5.0.1 /Users/dork/repos/mTask


 Test Files  22 passed (22)
      Tests  667 passed (667)
   Start at  23:05:22
   Duration  822ms (tests 43%, import 33%, transform 23%, worker 1%)

Done in 1.27s.
```

667 is the 555 of `main`, minus the `/add` row of the shell test, plus 113 new tests:
29, 47, 8, 15 and 9 in the five new files, one in `src/app.test.ts` and four in
`src/server.test.ts`.

After the run, as plan step 7 asks: `git status --short` printed nothing, `ls data`
failed with `No such file or directory`, the temporary folder held no entry starting
with `mtask-`, and `grep -rn "createApp()" src` printed only the comment line in
`src/project.test.ts`.

What went wrong on the way, each logged in `docs/errors/`:

- A break that stored a file under the client's path wrote `<tmpdir>/evil.png`, and the
  traversal test then failed on every later run. The file was removed and the test now
  removes that path in `finally`
  (`failing-test-leaves-file-outside-its-temp-folder.md`).
- The server test for "the app gets that database" passed for a copy of the object. It
  now asserts identity with `toBe` (`tostrictequal-passes-for-a-copy-of-the-object.md`).
- Headless Chrome did not exit after a screenshot, cropped a 375px window instead of
  laying the page out at 375px, and ignored `--force-dark-mode`
  (`headless-chrome-screenshot-hangs-and-crops-narrow-windows.md`).

Two more tests were tightened after a break left them green, with no log entry because
nothing failed: `withTestApp` without `await` passed until the callback of its test
waited a turn before it looked at the folder, and "starts a relative value at the repo
root" in `src/config.uploads.test.ts` passed for `path.resolve(raw)`, because the tests
run from the repo root, until it replaced `process.cwd` for the call.

```
VERIFICATION
Build: PASS
Tests: PASS   (667 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

Diff: `git diff main...HEAD` holds the files of the design's Files list and the three
`docs/errors/` entries, and nothing else. No `.only`, `.skip`, TODO, commented-out code,
debug output, secret or path from this machine. The one `console.log` is the start-up
line `src/server.ts` already had.

## Not done

Nothing in the spec was skipped. What differs from the design or the plan, and what
could not be checked:

1. **A photo taken on a phone** (the spec's by-hand check) was not done: there is no
   phone here. It would show whether `capture="environment"` opens the camera, and what
   type a real camera declares (HEIC gets the type message; converting is out of scope).
   The preview, Retake and the upload were checked in desktop Chrome instead, as above.
2. **Nothing ran on Node 22 or 24.** Node 26.8.2 is the only Node installed.
   `package.json` allows 22.18 and newer.
3. **`upload()` in `src/add-photo.test.ts` is not the only way a test posts a file.** The
   plan has every post go through supertest's `attach`. `attach` reduces a file name to
   its last segment before it sends it, so `../../evil.png` and `a/b\c.jpeg` would never
   have reached the server as written. The six client-name tests of AC6 and the
   empty-form test of AC9 write the multipart body out by hand (`postParts`).
4. **The three traversal requests of AC5 are sent with `node:http`**, not supertest:
   supertest resolves `%2e%2e` away before it sends, and the request would have been for
   `/secret.txt`. The helper `getRaw` listens on a port the system picks, on 127.0.0.1,
   and closes the server when the answer is in. Each of those tests first asks for a
   stored photo the same way and expects 200.
5. **`src/testing/jsdom.d.ts` has one interface the design does not name**,
   `DomFileList`, for the `files` of `DomFileInput`.
6. **`src/project.test.ts` got one more assertion** than D17 says: after the child
   exits, the folder passed to it does not exist.
7. **`node --watch src/server.ts` was not run.** The design checked it on the prototype;
   here the server was started with `node src/server.ts` only.
