# 004-photo-upload: Add screen with the Photo tab and image upload

## Goal

Tasks enter Task Image AI through the Add screen (`docs/plan.md`, task 3 and the Photo
tab of U3). This job builds `/add` with its first input mode: the user takes or picks a
photo, sees a preview, can retake it, and uploads it. The server checks the file, saves
it, and records it as a `photo` source, so the analyzer (005) and the review screen (006)
have something to read. Nothing analyzes the photo yet.

`/add` is already the middle link of the navigation from 002 and answers with the
not-found page today. The source row is written with `createSource` from 003. This is
the first job that stores anything from a request, so it is also the first to hand the
app a database; 003 left that to it. The upload is parsed with multer, as the plan's
stack names. `docs/mockUps.html` has no Add screen, so the page is built from the 002
partials. The file field, the route, the limits and the messages below are this spec's
choices where the plan gives none.

## Acceptance criteria

- **AC1**: `GET /add` returns 200 and renders in the layout with the heading `Add task`
  and the Add navigation link marked `aria-current="page"`. The page has a tab list
  (`role="tablist"`) with exactly one tab, `Photo`, marked `aria-selected="true"`.
  `/timeline`, `/tasks` and `/more` still answer with the not-found page; the existing
  test that expects that of `/add` is changed.
- **AC2**: The Photo tab holds a form with `method="post"`, `action="/add/photo"` and
  `enctype="multipart/form-data"`. It contains one labelled
  `<input type="file" name="photo" accept="image/*" capture="environment">`, as the plan
  writes it, and a submit button `Upload photo`. The form posts without any script.
  Every button on the page carries the `btn` class of the button partial.
- **AC3**: The page has a preview image and a `Retake` button, both hidden while no file
  is chosen. When a file is chosen in the input, the page's script shows both and sets
  the preview's `src` to the chosen file. `Retake` empties the input and hides both
  again. Loading the page and using these controls raises no script error.
- **AC4**: `POST /add/photo` with a JPEG, PNG, WebP or GIF in the field `photo`, no
  larger than 10 MB, returns 201. It stores the file in the uploads folder and creates
  exactly one source with `kind` `photo` and `image_path` `/uploads/<file name>`. The
  response renders the Add page with the message `Photo saved.` and an `<img>` whose
  `src` is that `image_path`.
- **AC5**: `GET` on a stored `image_path` returns 200 with the uploaded bytes and the
  content type of the image. `GET /uploads/<a name that was never stored>` returns 404.
- **AC6**: The stored file name is made by the server and has the extension of the
  image's type (`.jpg`, `.png`, `.webp`, `.gif`). No part of the client's file name is
  used: an upload named `../../evil.png` is stored inside the uploads folder, and two
  uploads with the same client name are stored as two files.
- **AC7**: A file whose declared content type is not `image/jpeg`, `image/png`,
  `image/webp` or `image/gif` is rejected with 415 and the message
  `That file is not a photo. Choose a JPEG, PNG, WebP or GIF image.` The type is judged
  by what the upload declares; the bytes are not inspected.
- **AC8**: A file larger than 10 MB (10 x 1024 x 1024 bytes) is rejected with 413 and
  the message `That photo is larger than 10 MB. Choose a smaller one.` A file of exactly
  that size is accepted.
- **AC9**: A post with no file in `photo` is rejected with 400 and the message
  `Choose a photo first.`
- **AC10**: Every rejection in AC7 to AC9 renders the Add page in the layout, with the
  message in an element with `role="alert"` and the form of AC2 still on the page. It
  leaves no file in the uploads folder, whole or partial, and creates no source.
- **AC11**: The uploads folder is `data/uploads` under the repo root, which `.gitignore`
  already covers, and is created when it is missing. Whether it can be moved with an
  environment variable is the architect's choice; a variable that is added is listed in
  `.env.example`. `src/server.ts` opens the database once, at the path
  `getDatabasePath()` returns, before it listens.
- **AC12**: `yarn build` and `yarn test` pass. The new tests use a temporary uploads
  folder and a temporary or in-memory database, and leave nothing in `data/`.

## Out of scope

- Running the analyzer on the photo, draft tasks, and the redirect to
  `/review/:sourceId` that replaces the `Photo saved.` response (006). The "Analyzing..."
  state and the error state with retry also come with 006.
- The Voice and Type tabs (007). Only the Photo tab is rendered until then.
- The quick-add buttons on the Today page (014).
- Deleting images that end up with no tasks, and rate limiting (023).
- A separate "choose from gallery" control. U3 says "camera or gallery", but the plan's
  task 3 and the backlog row give a single input with `capture="environment"`, which on
  most phones opens the camera only. On a desktop the same input opens the file picker.
  No job in the backlog adds the second control.
- Resizing or compressing photos, converting HEIC, and checking that a file's bytes
  match its declared type.
- Accounts. The backlog's open decision 4 is taken at its default, one user and no
  login, so a source has no owner and `/uploads/` is not guarded.
- Checked by hand: a photo taken on a phone opens the camera, shows in the preview and
  is saved.
