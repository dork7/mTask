# Task Image AI

Task Image AI turns a photo of notes, a spoken description or a typed text into tasks.
The Anthropic API reads the photo or the text and suggests each task's title, duration
and priority; you review the drafts, and the app schedules the confirmed tasks into your
working day, reminds you when they are due and tracks how long they take.

## Requirements

- Node `22.18` or newer, which runs the `.ts` files directly, with no compile step.
- yarn.

Then install the dependencies:

```sh
yarn install
```

## Commands

| Command | What it does |
| --- | --- |
| `yarn dev` | Starts the server, reloading on change, at http://localhost:3000. |
| `yarn test` | Runs the test suite once with Vitest. |
| `yarn build` | Type checks the project with `tsc --noEmit`. |
| `yarn analyze` | Runs the analyzer on its own from the command line. |

## Configuration

Copy `.env.example` to `.env` and set the values you need. Every variable is optional;
an unset or blank one takes its default.

| Variable | What it is for | Default |
| --- | --- | --- |
| `PORT` | The port the server listens on. | `3000` |
| `DATABASE_PATH` | The SQLite database file. A relative path starts at the project folder; `:memory:` is allowed. | `data/app.db` |
| `UPLOADS_DIR` | The folder uploaded photos are stored in. A relative path starts at the project folder. | `data/uploads` |
| `ANTHROPIC_API_KEY` | The key the analyzer sends photos and text with. Without it the analyzer refuses every photo and text; the rest of the app runs. | none |
| `ANTHROPIC_MODEL` | The Claude model the analyzer asks. | `claude-opus-5-5` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | The Web Push keys the server signs notifications with. All three are needed for Web Push; without them the in-page alarm is used. Make them with `npx web-push generate-vapid-keys`. | none |

## Limits and cleanup

- **Rate limit.** The four AI endpoints, `POST /add/photo`, `POST /add/voice`,
  `POST /add/text` and `POST /review/:sourceId/analyze`, share a limit of 10 requests per
  client IP in any 60 seconds. The 11th is answered with 429 and a `Retry-After` header,
  and refused requests count toward the limit.
- **Photo cleanup.** Once at start and then every hour, photo sources with no task that
  are older than 24 hours are removed with their files, and so are files in the uploads
  folder that no source names and that are older than 24 hours.
- **Undo.** The Undo of a Delete or a Done lasts until the server restarts.
