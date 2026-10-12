# 001-scaffold: Express + EJS server, test runner and project commands

## Goal

Task Image AI is a Node.js + Express app with server-rendered EJS pages (`docs/plan.md`,
task 1). The old browser app has been removed and `src/` is empty. This job lays the
foundation every later job builds on: a server that renders a styled home page through
a shared layout, a test setup that can exercise routes without opening a port, and the
project's test, build and dev commands.

The code is TypeScript under `src/`, in the folders the plan names: `routes/`,
`services/`, `views/` and `db/`. The package manager is yarn, and Vitest is already a
dev dependency.

## Acceptance criteria

- **AC1**: `GET /` returns 200 with an HTML page rendered from an EJS view inside a
  shared layout. The layout carries the app name "Task Image AI".
- **AC2**: The layout links a base stylesheet. Requesting that stylesheet returns 200
  with content type `text/css`, and it defines its colors as CSS variables on `:root`.
- **AC3**: A request to an unknown path returns 404 with an HTML page rendered in the
  same layout.
- **AC4**: The Express app is created separately from the listener, so tests exercise
  it without opening a port. The server listens on `PORT` read from `.env`, and on 3000
  when `PORT` is not set.
- **AC5**: `.env.example` lists every environment variable the app reads, and `.env` is
  git-ignored.
- **AC6**: `yarn test` runs the suite with Vitest and supertest and passes. `yarn build`
  type-checks the project with no errors. Project facts in `CLAUDE.md` lists the test,
  build and dev commands.

## Out of scope

- The design system, navigation and style-guide page (job 002). The base stylesheet
  here is only enough for a styled home page that later jobs extend.
- The database and any data access (job 003). `src/db/` exists but holds no code yet.
- Any feature route: upload, analysis, tasks, timeline.
- The old app's leftover dependencies in `package.json` (`onnxruntime-web`,
  `@huggingface/tokenizers`, `jsdom`). This job leaves them alone.
