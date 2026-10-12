# 005-analyzer: plan

Decision numbers (D1, D2, …) refer to `design.md`.

## Steps

After each step `yarn build` and `yarn test` must pass, the tests of earlier jobs
included (667 before this job). No existing test is edited; `src/server.test.ts` only
gains one `describe` at its end.

No step sends a request to the Anthropic API, and no key is ever written into a file of
the repo, a test or `build.md`.

1. **The dependency.** Files: `package.json`, `yarn.lock`. Serves AC10.
   - `yarn add --exact @anthropic-ai/sdk@0.133.0` (D1). Nothing else is installed.
   - Check: `package.json` has `"@anthropic-ai/sdk": "0.133.0"` under `dependencies`,
     with no range; `yarn build` and `yarn test` pass as before (667 tests).

2. **The two settings.** Files: `src/config.ts`, `.env.example`, `vitest.config.ts`,
   `src/config.anthropic.test.ts`. Serves AC10, AC12.
   - `DEFAULT_ANTHROPIC_MODEL`, `getAnthropicApiKey(env)` and `getAnthropicModel(env)`
     (D10), written like `getUploadsDir`: `env.ANTHROPIC_API_KEY?.trim() ?? ''`.
   - The four lines of D10 at the end of `.env.example`.
   - `ANTHROPIC_API_KEY: ''` in the `env` of `vitest.config.ts`, and the sentence in the
     comment above it (D10).
   - Check: `yarn vitest run src/config.anthropic.test.ts src/project.test.ts` passes.
     The unedited 001 test ".env.example lists every environment variable the app reads"
     is in the second file and now covers the two new names.

3. **The analyzer.** Files: `src/services/analyzer.ts`,
   `src/services/analyzer.test.ts`. Serves AC1 to AC9, AC10 (the real client), AC12.
   - Everything listed for the file under Files in the design.
   - The request exactly as in D4, the schema exactly as in D2, the prompt as in D4. No
     `minimum`, `maximum` or `minLength` in the schema, and no `thinking`,
     `temperature`, `tools` or `tool_choice` in the request.
   - Read the reply by the five steps of D3, with the reply as `unknown`. Check an item
     by the table of D5 and build the task field by field.
   - Two attempts with the same request; only the call is inside the `try` (D6).
   - Refuse the three inputs of D7 before the first call, the extension before the disk.
   - Call `deps.client.messages.create(request)` as a method (D8).
   - Check: `yarn vitest run src/services/analyzer.test.ts` and `yarn build` pass.

4. **The command.** Files: `src/analyze-command.ts`, `src/analyze.ts`, `package.json`,
   `src/analyze-command.test.ts`, `src/analyze.test.ts`. Serves AC11.
   - `runAnalyzeCommand` with the four rows of D11 in their order, and `parseArgs` as
     written there.
   - `src/analyze.ts` exactly as in D11, with its three imports.
   - The script `"analyze": "node src/analyze.ts"` in `package.json`, after `"dev"`.
   - Check: `yarn vitest run src/analyze-command.test.ts src/analyze.test.ts` passes.
     Then, by hand: `ANTHROPIC_API_KEY= yarn analyze --text "buy milk"; echo $?` prints
     `ANTHROPIC_API_KEY is not set.` and `1`. Write the key as empty, as here, and not
     with `env -u`: an empty value also wins over a `.env` on the machine (D11).

5. **The server without a key.** Files: `src/server.test.ts`. Serves AC10.
   - Add the `describe` of AC10 below at the end of the file. `src/server.ts` and
     `src/app.ts` are not changed.
   - Check: `yarn vitest run src/server.test.ts` passes, with the eleven tests that were
     there unchanged.

6. **The whole job.** Serves AC12.
   - `yarn build`, then `env -u ANTHROPIC_API_KEY yarn test`, once, the whole suite.
   - After the run: `git status --short` shows this job's files only; there is no `.env`
     and no `data` folder in the repo; and
     `ls "$(node -p 'os.tmpdir()')" | grep '^mtask-'` prints nothing, so no test left a
     folder behind.
   - `git diff --stat main -- src/server.ts src/app.ts src/ui.ts src/db src/routes src/views src/services/photo-storage.ts src/testing src/project.test.ts public tsconfig.json .gitignore CLAUDE.md README.md`
     prints nothing (the design's Not touched list).
   - By hand, without a key: `ANTHROPIC_API_KEY= yarn analyze nothing.png; echo $?` and
     `ANTHROPIC_API_KEY= yarn analyze; echo $?` each print the key message and `1`.
     Write what was printed into `build.md`.
   - By hand, with a key (the spec's check). Only when a key is already in the shell or
     in `.env`; do not ask for one and do not create `.env`. Run
     `yarn -s analyze --text "buy milk and fix the login bug"`, then `yarn -s analyze` on
     a photo of a single item and on a photo of a handwritten list. Expected:
     `"fallback": false`, with two tasks, one task and several tasks. When `fallback` is
     `true`, run the same command with `ANTHROPIC_LOG=debug` in front: the SDK then
     prints, before the JSON, each request and what the API answered (D8). Write the
     model id, the number of tasks and anything the API rejected into `build.md`,
     without the photo's content and without the key.
   - With no key at hand, list the three commands under Not done in `build.md`, and say
     that no request has reached the live API in the design or in the build.

## Tests

Shared setup.

- **The stubbed client** (D13), in `src/services/analyzer.test.ts` and
  `src/analyze-command.test.ts`: `stubClient()` returns `{ client, create }`, where
  `create` is `vi.fn<AnalyzerClient['messages']['create']>()` and `client` is
  `{ messages: { create } }`.
- **Replies.** `reply(value)` is `{ content: [{ type: 'text', text: JSON.stringify(value) }] }`.
  `textReply(text)` is the same with the text as it is. A reply the type does not allow
  (`undefined`, `{}`) is cast with `as unknown as AnalyzerReply`.
- **Tasks**, written out in the test file, each with the six fields: `milk`
  (`Buy milk`, `2 litres`, `shopping`, 15, `medium`, 0.9), `bug` (`Fix the login bug`,
  `''`, `coding`, 60, `high`, 0.7) and `dentist` (`Call the dentist`, `''`, `personal`,
  10, `low`, 0.4).
- **The fallback**, written out: `fallbackOf(description)` is
  `{ tasks: [{ title: 'Untitled task', description, category: 'other', estimated_minutes: 30, urgency: 'medium', confidence: 0 }], fallback: true }`.
- **The model** is `'claude-test-model'` wherever the client is a stub.
- **Images.** `beforeEach` makes a folder with `mkdtempSync(path.join(tmpdir(), 'mtask-analyzer-'))`
  and `afterEach` removes it. `writeImage(name, bytes)` writes into it and returns the
  path. The bytes are `Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10, 0x80, 0xfe])`: they
  are not valid UTF-8, so a file read as text does not give them back.
- **The network guard** (D13), in both files: `beforeEach` sets `expectedFetchCalls = 0`,
  makes `fetchSpy` reject with `new Error('A test tried to reach the network')` and
  installs it with `vi.stubGlobal('fetch', fetchSpy)`. `afterEach` reads the number of
  calls, calls `vi.unstubAllGlobals()` and `fetchSpy.mockReset()`, and then asserts the
  number is `expectedFetchCalls`.
- **A message of the API**, for the real-client tests:
  `message(text)` is `Response.json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } })`.
- **Reading a request.** `sentContent(create, call = 0)` returns the `content` array of
  the request of that call, after asserting that `messages` is exactly one message with
  the role `user` and that its content is an array.
- `text` below is `'buy milk and fix the login bug'` unless a test says otherwise.

### AC1: `src/services/analyzer.test.ts`

- For a text input and for an image input, with a stub that replies `{ tasks: [milk] }`:
  the result has exactly the keys `tasks` and `fallback`, `tasks` is an array and
  `fallback` is a boolean.
- The real client, `createAnalyzerClient('test-key')`, with the spy resolving to
  `message(JSON.stringify({ tasks: [milk] }))` and `expectedFetchCalls = 1`, model
  `'claude-opus-5-5'`: the result is `{ tasks: [milk], fallback: false }`; the one call is
  a `POST` to a URL that ends in `/v1/messages`; its header `x-api-key` is `test-key`;
  its JSON body has `model` `claude-opus-5-5`, the text in its one user message, and
  `output_config.format.type` `json_schema`. (Fails when `create` is called detached,
  when `max_tokens` is above what the SDK sends without streaming, and when the reply
  is read by position: the message starts with a `thinking` block.)

### AC2: `src/services/analyzer.test.ts`

- A reply whose item has two more keys, `time_slot: 'night'` and `id: 7`: the returned
  task `toStrictEqual`s the six fields, and `Object.keys` of it is exactly
  `['title', 'description', 'category', 'estimated_minutes', 'urgency', 'confidence']`.
  One call, `fallback` false.
- A reply with a key beside `tasks` (`{ tasks: [milk], note: 'x' }`) is valid.
- For each of the six categories, and for each of the four urgencies: an item with that
  value is returned with it, in one call.
- The edges are valid, in one call each: `estimated_minutes` 1 and 1440, `confidence` 0
  and 1, `description` `''`.
- Values come back as given: a title of `'  Buy milk '` is returned with its spaces
  (D5).
- That a broken item makes the whole reply invalid is the table and the mixed-list test
  of AC6.

### AC3: `src/services/analyzer.test.ts`

- A stub that replies `{ tasks: [milk] }`: the result `toStrictEqual`s
  `{ tasks: [milk], fallback: false }` and `create` was called once.
- The same with a `{ type: 'thinking' }` block in front of the text block: the same
  result, one call (D3).

### AC4: `src/services/analyzer.test.ts`

- A reply with `[milk, bug, dentist]`: `tasks` is those three in that order, `fallback`
  is false, one call. A second test with `[dentist, milk, bug]` gives that order.
- A reply with `{ tasks: [] }`: the result is `{ tasks: [], fallback: false }`, one call.

### AC5: `src/services/analyzer.test.ts`

- The request's `model` is `'claude-test-model'`, and `'claude-other-model'` when that is
  handed in.
- A text input of `'  buy milk\nfix the login bug '`: `sentContent` `toStrictEqual`s
  `[{ type: 'text', text: <that text, unchanged> }]`, so there is no image block.
- For each of `['list.jpg', 'image/jpeg']`, `['list.png', 'image/png']`,
  `['list.webp', 'image/webp']`, `['list.gif', 'image/gif']`, `['IMG_0412.JPG', 'image/jpeg']`
  and `['Board.Png', 'image/png']`: the content has exactly one block of type `image`;
  its `source` `toStrictEqual`s `{ type: 'base64', media_type, data }` where `data` is
  the file's bytes in base64, written with `bytes.toString('base64')`; and
  `Buffer.from(data, 'base64')` equals the bytes.
- For each of the four lower-case rows: `photoExtension(media_type)` from
  `photo-storage.ts` is the extension (D7).
- The image block is the first block of the content.
- The request has a `system` that is a string and not blank, a `max_tokens` that is a
  positive integer, and none of the keys `thinking`, `temperature`, `top_p`, `top_k`,
  `tools`, `tool_choice` (D4).
- The schema that is sent: `output_config.format.type` is `json_schema`; the root is an
  object with the one property `tasks`, an array; its items are an object with exactly
  the six properties, all six in `required`; the `enum` of `category` is the six ids and
  the `enum` of `urgency` the four, both written out in the test. Walking the whole
  schema: every node with `type: 'object'` has `additionalProperties` strictly `false`,
  and no node has any of `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`,
  `multipleOf`, `minLength`, `maxLength`, `maxItems` (D2).
- After an invalid first reply, the request of the second call `toStrictEqual`s the
  request of the first (D6).

### AC6: `src/services/analyzer.test.ts`

Each row is one test: the stub gives the row's reply first and `reply({ tasks: [bug] })`
second. Asserted: the result is `{ tasks: [bug], fallback: false }` and `create` was
called exactly twice.

No array can be read:

- text that is not JSON: `Here are your tasks: buy milk.`
- JSON cut off: `{"tasks":[{"title":"Buy`
- JSON inside a code fence
- an empty text
- `content: []`
- only a `thinking` block
- a text block with no `text`
- a bare array: `[milk]`
- `{ items: [milk] }`
- `{ tasks: { 0: milk } }`
- the JSON values `null`, `"tasks"` and `42`
- a reply of `undefined`, of `{}`, and of `{ content: 'text' }`

An item breaks AC2 (each is `milk` with one change):

- the spec's four: `urgency: 'asap'`, `confidence: 1.5`, `estimated_minutes: 0`, no
  `title`
- `title`: `''`, `'   '`, `7`
- `description`: missing, `null`
- `category`: `'groceries'`, `'Shopping'`, missing
- `estimated_minutes`: `1441`, `30.5`, `'30'`, `-5`, missing
- `urgency`: `'URGENT'`, missing
- `confidence`: `-0.1`, `'0.9'`, `null`, missing
- the item is `null`, the string `'Buy milk'`, or an array

And:

- A list of one good and one bad item, `[milk, { ...bug, urgency: 'asap' }]`, then a
  valid reply: two calls and the second reply's tasks. `milk` alone is never returned.
- The same mixed list twice: the result is `fallbackOf(text)`, not `[milk]`.

### AC7: `src/services/analyzer.test.ts`

- `create` rejects with an `Error` once and then replies `{ tasks: [milk, bug] }`: the
  result is those two tasks with `fallback` false, and two calls.
- `create` throws at once (`mockImplementationOnce(() => { throw … })`) and then
  replies: the same.
- The real client: the `fetch` spy answers
  `Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'no' } }, { status: 400 })`
  and then `message(JSON.stringify({ tasks: [milk] }))`, with `expectedFetchCalls = 2`:
  the result is `{ tasks: [milk], fallback: false }`.

### AC8: `src/services/analyzer.test.ts`

- For each of the four pairs (invalid then invalid, error then error, invalid then
  error, error then invalid), with a text input of `'  call mum '`: the promise
  resolves, the result `toStrictEqual`s `fallbackOf('  call mum ')` with the spaces
  kept, and `create` was called exactly twice.
- An image input with two rejected calls: `fallbackOf('')`, two calls.
- Two replies of `undefined`: resolves to the fallback and does not reject.
- A stub that would reply validly on a third call (`invalid`, `invalid`, `valid`): the
  result is the fallback and `create` was called twice, not three times.

### AC9: `src/services/analyzer.test.ts`

In every test `create` was not called.

- For each text of `''`, `'   '` and `'\n\t'`: rejects with an `AnalyzerInputError`
  whose message is `The text to analyze is blank.`
- An image path `<folder>/nothing.png` with no file: rejects with an
  `AnalyzerInputError` whose message is `The image file "<path>" cannot be read.` and
  whose `cause` has the code `ENOENT`.
- A folder named `shots.png`: the same message.
- For each existing file named `list.jpeg`, `list.heic`, `list.txt`, `list` and
  `list.png.txt`: rejects with an `AnalyzerInputError` whose message is
  `"<path>" is not a .jpg, .png, .webp or .gif file.`
- `<folder>/nothing.bmp`, which does not exist: the extension message, not the
  cannot-be-read one (the extension is checked first).
- `AnalyzerInputError` is an `Error` and its `name` is `AnalyzerInputError`.

### AC10: `src/config.anthropic.test.ts`, `src/services/analyzer.test.ts`, `src/server.test.ts`

`src/config.anthropic.test.ts`:

- `getAnthropicApiKey` is `undefined` when `ANTHROPIC_API_KEY` is not set, is empty, or
  is blank; it is `sk-test` for `'  sk-test '`.
- `getAnthropicModel` is `'claude-opus-5-5'` (written out) when `ANTHROPIC_MODEL` is not
  set, is empty, or is blank, and `DEFAULT_ANTHROPIC_MODEL` is that string; it is
  `claude-haiku-5-5` for `' claude-haiku-5-5 '`.
- `.env.example` has the keys `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`; the value of the
  first is the empty string and `getAnthropicApiKey` of the parsed file is `undefined`;
  the value of the second is `claude-opus-5-5`.
- No file under `src/` that ends in `.ts` and not in `.test.ts`, other than
  `src/config.ts`, contains `process.env`. The list of files has more than ten entries
  and holds `src/services/analyzer.ts`, so the test cannot pass on an empty list.
- `package.json` has `@anthropic-ai/sdk` under `dependencies` with the value `0.133.0`,
  and not under `devDependencies`.
- Under the test runner `process.env.ANTHROPIC_API_KEY` is `''` and
  `getAnthropicApiKey()`, read from the real environment, is `undefined`. It fails when
  the line is removed from `vitest.config.ts`.

`src/services/analyzer.test.ts`:

- `createAnalyzerClient('test-key')` is an instance of the SDK's `Anthropic` class and
  its `apiKey` is `test-key`. With the two real-client tests of AC1 and AC7 this is "the
  SDK is the real client".

`src/server.test.ts` (one new `describe`, with the file's existing spies):

- For `ANTHROPIC_API_KEY` stubbed to `undefined` and to `''`: importing the server
  resolves, `createApp` was called once and `listen` was called once.

The unedited route tests (`src/add-page.test.ts`, `src/add-photo.test.ts`,
`src/shell.test.ts`, `src/app.test.ts`) run with the key blank and show that every
existing route answers as before. The unedited 001 test in `src/project.test.ts`,
".env.example lists every environment variable the app reads", fails when one of the
two names is read and not listed.

### AC11: `src/analyze-command.test.ts`, `src/analyze.test.ts`

`src/analyze-command.test.ts`. Its helper `run(args, overrides = {})` builds the deps
(`apiKey: 'test-key'`, `model: 'claude-test-model'`, `createClient` a spy that returns
the stubbed client, `write` and `writeError` that append to two strings), awaits
`runAnalyzeCommand` and returns `{ code, stdout, stderr, createClient, create }`. It has
the network guard and the image folder of the shared setup.

- An image file as the one argument, the stub replying `{ tasks: [milk, bug] }`: the
  code is 0; `stdout` is exactly
  `JSON.stringify({ tasks: [milk, bug], fallback: false }, null, 2) + '\n'`; `stderr` is
  `''`; `createClient` was called once, with `'test-key'`; the request's `model` is
  `'claude-test-model'` and it holds one image block with the file's bytes in base64.
- `['--text', 'buy milk']`: code 0, `JSON.parse(stdout)` is the result, and the request's
  content is `[{ type: 'text', text: 'buy milk' }]`. The same for `['--text=buy milk']`.
- `['--text', 'buy milk']` with `create` rejecting twice: code 0, and
  `JSON.parse(stdout)` is `fallbackOf('buy milk')`.
- With `apiKey: undefined`, for each of `['--text', 'buy milk']`, `[<an image file>]`,
  `[]` and `['--nope']`: code 1; `stderr` is exactly `ANTHROPIC_API_KEY is not set.\n`;
  `stdout` is `''`; neither `createClient` nor `create` was called.
- With a key, for each of `[]`, `['a.png', 'b.png']`, `['--text', 'buy milk', 'a.png']`,
  `['--text']` and `['--nope']`: code 1; `stderr` is exactly `USAGE + '\n'`; `stdout` is
  `''`; `createClient` was not called.
- `USAGE` names both forms: it contains `yarn analyze <image file>` and
  `yarn analyze --text "<text>"`.
- For each of `['--text', '   ']`, `[<folder>/nothing.png]` and `[<an existing notes.txt>]`:
  code 1; `stderr` is the message of D7 for that input and a newline; `stdout` is `''`;
  `create` was not called.
- With `createClient` throwing `new Error('boom')`: the promise rejects with that very
  error (`toBe`), and `stdout` is `''`.

`src/analyze.test.ts`. The entry is imported with `vi.resetModules()` and `vi.doMock`
for `./analyze-command.ts` (a spy `runAnalyzeCommand` that resolves to 0),
`./services/analyzer.ts` (a spy `createAnalyzerClient`) and `./config.ts` (the real
module with `loadEnv` replaced by a spy), as `src/server.test.ts` does. `beforeEach`
keeps `process.argv` and `process.exitCode`; `afterEach` puts both back, unmocks the
three modules, and calls `vi.unstubAllEnvs()`, `vi.restoreAllMocks()`,
`vi.resetModules()` and `vi.resetAllMocks()`.

- With `process.argv` set to `['node', 'src/analyze.ts', '--text', 'buy milk']`:
  `runAnalyzeCommand` was called once, and its first argument is
  `['--text', 'buy milk']`.
- `loadEnv` was called once, with no argument, before `runAnalyzeCommand`.
- With `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` stubbed to `undefined` and `loadEnv`
  replaced by a function that stubs them to `from-env-file` and `claude-from-env-file`:
  the deps have `apiKey` `from-env-file` and `model` `claude-from-env-file`, so both are
  read after `.env` is loaded.
- With both stubbed to `undefined`: the deps have `apiKey` `undefined` and `model`
  `claude-opus-5-5`.
- The deps' `createClient` is the very `createAnalyzerClient` of the analyzer module
  (`toBe`).
- For a command that resolves to 0 and one that resolves to 1: `process.exitCode` is
  that number after the import.
- With `process.stdout.write` and `process.stderr.write` replaced by spies that return
  `true`: the deps' `write('out')` reaches the first with `'out'` and `writeError('err')`
  the second with `'err'`.
- A child process (D13):
  `spawnSync(process.execPath, ['src/analyze.ts', '--text', 'buy milk'], { cwd: rootDir, encoding: 'utf8', timeout: 10_000, env: { ...process.env, ANTHROPIC_API_KEY: '', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' } })`,
  in a test with a timeout of 15 seconds. The status is 1, with `result.error`,
  `result.signal` or stderr as the assertion's message; stderr contains
  `ANTHROPIC_API_KEY is not set.`; stdout is `''`. This is also the test that plain Node
  can load the entry, the command, the analyzer and the SDK.
- `package.json` has the script `analyze` with the value `node src/analyze.ts`.

### AC12: the commands, and where the four named cases are

- One task: AC3, first test. Several tasks: AC4, first test. Bad JSON: AC6, the rows
  "text that is not JSON" and "JSON cut off". An API error: AC7, first test, and AC8,
  "error then error". All four use the stubbed client.
- No network request: the guard in `afterEach` of `src/services/analyzer.test.ts` and
  `src/analyze-command.test.ts` fails any test that reaches `fetch` without saying so.
  The two tests that do say so (the real client, in AC1 and AC7) get their answer from
  the spy. `src/analyze.test.ts` replaces the command and the client, and its child
  process has no key and a base URL nothing listens on.
- `yarn build` exits 0 and `env -u ANTHROPIC_API_KEY yarn test` passes as a whole, in
  step 6, followed by the three looks at what the run left behind.
