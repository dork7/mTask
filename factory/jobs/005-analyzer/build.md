# 005-analyzer: build

Branch `factory/005-analyzer`. Code commit `3eb4196`. Built on Node v26.8.2 and yarn
1.22.22, with `@anthropic-ai/sdk` 0.133.0, Vitest 5.0.1 and TypeScript 5.9.3.

**No request has reached the live Anthropic API, in the design or in this build.** There
is no `ANTHROPIC_API_KEY` in the shell and no `.env` in the repo, so the spec's by-hand
check with a real key is still open. See Not done.

## What changed

Created:

| File | Why | Decision |
|---|---|---|
| `src/services/analyzer.ts` | `analyze(input, deps)`: checks the input, builds one request with a JSON-schema structured output, reads and checks the reply, asks once more after a failure, then returns the fallback. Also `taskCategories`, the types, `AnalyzerInputError` and `createAnalyzerClient`. | D2 to D8, D12 |
| `src/analyze-command.ts` | `runAnalyzeCommand(args, deps)`, `NO_API_KEY`, `USAGE`: the command with its dependencies handed in, resolving to the exit code. | D11 |
| `src/analyze.ts` | The entry of `yarn analyze`: loads `.env`, reads the two settings, hands the real client factory and the two streams to the command, sets `process.exitCode`. | D11 |
| `src/services/analyzer.test.ts` | AC1 to AC9, and the real client of AC10, with the `fetch` guard. | D13 |
| `src/analyze-command.test.ts` | AC11, the command with a stubbed client and the `fetch` guard. | D11, D13 |
| `src/analyze.test.ts` | AC11, the entry with its three modules replaced, and once as a child process without a key. | D11, D13 |
| `src/config.anthropic.test.ts` | AC10: the two getters, `.env.example`, where `process.env` is read, the pinned SDK, the blank key under the test runner. | D1, D10 |

Changed:

| File | Why | Decision |
|---|---|---|
| `package.json`, `yarn.lock` | `@anthropic-ai/sdk` 0.133.0 through `yarn add --exact` (seven packages in the lock file: the SDK and six under it), and the script `"analyze": "node src/analyze.ts"` after `"dev"`. | D1, D11 |
| `src/config.ts` | `DEFAULT_ANTHROPIC_MODEL`, `getAnthropicApiKey`, `getAnthropicModel`, above `isMissingFile`. Nothing else in the file changed. | D9, D10 |
| `.env.example` | The four lines of D10 at its end. | D10 |
| `vitest.config.ts` | `ANTHROPIC_API_KEY: ''` in `env`, and the sentence about it in the comment. | D10 |
| `src/server.test.ts` | One `describe` with one parametrised test at the end. The eleven tests that were there are unchanged. | AC10 |

## Acceptance criteria

Every new test was seen failing. A script outside the repo applied one change to the
source at a time, ran the five test files that this job adds to, recorded the failing
tests and put the file back: 136 changes, and each of the 156 new tests failed under at
least one of them. "Fails when" names the change that was made. After the last one the
whole suite passed again and `git status` showed no difference.

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1: resolves to `tasks`, an array, and `fallback`, a boolean (text and image) | `analyzer.test.ts` "is an object with a tasks array and a fallback boolean, for a text / for an image" | the result gets a third key; `tasks` is an object; `fallback` is `0` | PASS |
| AC1: the client is handed in, a stub in tests, no network | every test with `stubClient()`; the `fetch` guard in `afterEach` of `analyzer.test.ts` and `analyze-command.test.ts` | the command ignores the client it is handed and makes the real one: four tests fail with `expected 6 to be +0` | PASS |
| AC1, AC10: the SDK's client fits and is called as it must be | "sends the request through the real client and reads the message it gets back" | `create` is called detached from the client; `max_tokens` is 64000; the reply is read by position; the model is fixed; no `output_config`; the client gets another key | PASS |
| AC2: exactly six fields, an extra field is dropped | "drops a field the reply adds beyond the six" | the item is returned as it came | PASS |
| AC2: a key beside `tasks` is not an error | "accepts a reply with a key beside tasks" | a reply with a second key is invalid | PASS |
| AC2: `category` is one of the six | "returns the category coding / shopping / work / home / personal / other" | that id is taken out of `taskCategories` (six changes, one each) | PASS |
| AC2: `urgency` is one of the four | "returns the urgency urgent / high / medium / low" | that id is filtered out of the urgencies (four changes) | PASS |
| AC2: `estimated_minutes` from 1 to 1440 | "accepts estimated_minutes 1", "accepts estimated_minutes 1440" | the least is 2; the largest is 1439 | PASS |
| AC2: `confidence` from 0 to 1 | "accepts confidence 0", "accepts confidence 1" | the range excludes its ends | PASS |
| AC2: `description` may be empty | "accepts an empty description" | an empty description is invalid | PASS |
| AC2, D5: values come back as given | "returns a title with the spaces the reply gave it" | the title is trimmed | PASS |
| AC3: one valid task, `fallback: false`, one call | "returns the one task of the reply, after one call" | a valid reply is reported as a fallback; the client is called a second time after the reply is in (`called 1 times, but got 2 times`) | PASS |
| AC3, D3: the text block is found by type | "reads the text block of a reply that begins with a thinking block" | the reply is read by position | PASS |
| AC4: several tasks in the reply's order, one call | "returns all tasks of the reply in its order: milk, bug, dentist / dentist, milk, bug" | the tasks are collected in reverse; the client is called a second time | PASS |
| AC4: an empty array is valid | "returns no tasks, and no fallback, for a reply with an empty array" | an empty list counts as invalid | PASS |
| AC5: `model` is the configured id | "asks the model it was handed: claude-test-model / claude-other-model" | the model is fixed to the other of the two | PASS |
| AC5: a text input contains the text | "sends a text exactly as given, in one text block and with no image" | the text is trimmed before it is sent | PASS |
| AC5: one image block, base64 bytes, media type by extension | "sends list.jpg / list.png / list.webp / list.gif / IMG_0412.JPG / Board.Png as one image block …" | every extension maps to another type; the file is read as UTF-8 text; the extension is matched with its case (the last two rows) | PASS |
| AC5, D7: the four extensions are 004's | "reads .jpg / .png / .webp / .gif as the type whose stored photos get that extension" | the map in `photo-storage.ts` is given other extensions | PASS |
| AC5, D4: the image comes first | "puts the image before the text" | the two blocks are swapped | PASS |
| AC5, D4: `system`, `max_tokens`, no setting a model may refuse | "has a system prompt and a token limit, and names no setting a model may refuse" | the system prompt is blank; the request sets `temperature`; the request sets `thinking` | PASS |
| AC5, D2: the schema | "asks for a structured output: an object with a tasks array of the six fields" | an id is missing from an `enum`; `confidence` is not required; no `output_config` | PASS |
| AC5, D2: no limit and no open object in the schema | "sends a schema with no limit the API answers with a 400, and no open object" | `minimum` on the estimate; `minLength` on the title; `additionalProperties` missing on the item; missing on the root | PASS |
| AC5, D6: the second request is the first | "sends the same request again after an invalid reply" | the second call gets a request with another `max_tokens` | PASS |
| AC6: no array can be read (16 rows) | "asks once more after <row>, and returns the second reply" | text that is not JSON gives an empty list (not JSON, cut off, empty text); a code fence is stripped; a reply with no text block gives an empty list (no blocks, only thinking, no `text`); the content check is removed (`undefined`, `{}`, a string as content); a bare array is accepted; `items` is accepted; `tasks` as an object is accepted; JSON of another shape gives an empty list (`null`, `"tasks"`, `42`) | PASS |
| AC6: an item breaks AC2 (26 rows) | "asks once more after an item with <row>, and returns the second reply" | the check of that field is removed or widened: title (4 rows), description (2), category (3), estimate (6: least -10, largest 1441, no integer check, coerced with `Number`, no check), urgency (3), confidence (5: up to 2, down to -1, no type check, no check); an item of `null` becomes a task; a string item becomes a task; an array item is unwrapped | PASS |
| AC6: exactly one more call, the second reply is returned | all rows above assert two calls and the second reply | one attempt only (55 tests fail) | PASS |
| AC6: one bad item makes the whole reply invalid | "returns no part of a list with one good and one bad item", "returns the fallback, not the good item, when the mixed list comes twice" | a bad item is dropped and the rest returned | PASS |
| AC7: a rejected call is retried | "calls once more after a call that rejects, and returns the second reply" | the error is thrown on | PASS |
| AC7, D6: a call that throws at once is retried | "calls once more after a call that throws at once" | the error is thrown on | PASS |
| AC7: through the real client | "calls the real client once more after the API answers 400" | the error is thrown on; one attempt only; `create` is called detached | PASS |
| AC8: both attempts fail, resolves to the fallback task, two calls | "resolves to the fallback task after invalid then invalid / error then error / invalid then error / error then invalid, with the text as given" | three attempts; the error is thrown on; the fallback estimate is 15; the description is trimmed | PASS |
| AC8: an empty description for an image | "has an empty description for an image" | the path is used as the description | PASS |
| AC8: does not reject | "does not reject when the client resolves to undefined twice" | the content check is removed, so reading the reply throws | PASS |
| AC8: exactly twice | "does not make a third call, even when it would be answered" | three attempts | PASS |
| AC9: a blank text | "refuses an empty text / spaces / a newline and a tab before any call" | the check is removed; only `''` is refused (the last two rows) | PASS |
| AC9: no file behind the path | "refuses an image path with no file behind it" | the file-system error is thrown as it is; the `cause` is left out | PASS |
| AC9, D7: a folder | "refuses a folder with the name of an image" | the file-system error is thrown as it is | PASS |
| AC9: another extension | "refuses the existing file list.jpeg / list.heic / list.txt / list / list.png.txt …" | `.jpeg` is added to the map (first row); a file of another type is sent as a JPEG (all five) | PASS |
| AC9, D7: the extension before the disk | "checks the extension before it looks for the file" | a file of another type is sent as a JPEG, so the missing file is found first | PASS |
| AC9: the error | "rejects with an Error named AnalyzerInputError" | `name` is not set | PASS |
| AC10: the key from `ANTHROPIC_API_KEY` | `config.anthropic.test.ts` "is undefined when ANTHROPIC_API_KEY is not set / empty / blank", "is the value of ANTHROPIC_API_KEY, without the spaces around it" | a missing key is returned as `''`; the value is not trimmed | PASS |
| AC10: the model from `ANTHROPIC_MODEL`, with a default | "is the default model when ANTHROPIC_MODEL is not set / empty / blank", "has claude-opus-5-5 as its default", "is the value of ANTHROPIC_MODEL, without the spaces around it" | the default is another model; the value is not trimmed; the setting is ignored | PASS |
| AC10: both read in `src/config.ts` only | "no source file but src/config.ts reads process.env" | `createAnalyzerClient` reads `process.env.ANTHROPIC_API_KEY` | PASS |
| AC10: both listed in `.env.example`, the key empty | "lists ANTHROPIC_API_KEY with an empty value", "lists ANTHROPIC_MODEL with the default model"; the unedited 001 test in `project.test.ts` | the key has a value; the key line is removed; the model is another; the model line is removed | PASS |
| AC10: the SDK in `dependencies` | "is a dependency, pinned to 0.133.0, and not a dev dependency" | the version is `^0.133.0` | PASS |
| AC10: the SDK is the real client | `analyzer.test.ts` "is the SDK's client, with the key it was handed", and the two real-client tests | `createAnalyzerClient` returns a hand-made object; it passes another key | PASS |
| AC10: the server starts with the key unset | `server.test.ts` "starts when ANTHROPIC_API_KEY is not set / empty" | `server.ts` throws when `getAnthropicApiKey()` is `undefined` | PASS |
| AC10: every existing route answers as before | the 667 tests of earlier jobs, unedited, run with the key blank | not broken on purpose: no route was changed | PASS |
| AC11: an image file, the result as JSON on stdout | `analyze-command.test.ts` "analyzes an image file and prints the result as JSON on stdout" | the JSON is printed on one line; it goes to stderr; the code is 3; the client is made with another key; another model is asked | PASS |
| AC11: `--text "<text>"` | "analyzes a text given as --text and the text / --text=<text>" | the result goes to stderr; the code is 3; with `--text=…` the whole argument is taken as the text | PASS |
| AC11, D11: the fallback is printed with code 0 | "prints the fallback, and exits with 0, when both attempts fail" | a fallback exits with 1 | PASS |
| AC11: no key: code 1, the message on stderr, no request | "exits with 1 and makes no client, for a text / an image file / no arguments / an unknown option", "NO_API_KEY is that message" | the key check is removed; the arguments are checked first (the last two rows); the message is reworded; the code is 2; the message goes to stdout | PASS |
| AC11, D11: wrong arguments | "exits with 1 and the usage for no arguments / two files / a text and a file / --text with no value / an unknown option", "the usage names both forms" | no positional counts as an image; the first of two files is taken; a file beside `--text` is ignored; arguments that cannot be parsed are taken as a text (the last two rows); no newline; the code is 0; the usage names one form only | PASS |
| AC11, D11: a refused input | "exits with 1 and the reason for a blank text / an image file that does not exist / a file that is no image" | the error is thrown on; the code is 0; no newline | PASS |
| AC11, D11: another error is not caught | "does not catch an error that is no refused input" | the client is made inside the `try` and every error is caught | PASS |
| AC11: the entry runs the command with the real settings and client | `analyze.test.ts` "runs the command once, with the arguments after the script", "loads .env, the default file, before it runs the command", "reads the key and the model after it has loaded .env", "hands over no key and the default model when neither is set", "hands over the function that makes the real client", "sets the exit code to the 0 / 1 the command resolved to", "writes to stdout and to stderr" | `argv.slice(1)`; `loadEnv()` removed, called with a file name, called after the command; the settings read before `loadEnv()`; a missing key handed over as `''`; the factory wrapped in an arrow function; the exit code not set; the two streams swapped | PASS |
| AC11: as a real process without a key | "exits with 1 and says that the key is not set, without a key" | the key check is removed; the message is reworded; the exit code is not set; the streams are swapped | PASS |
| AC11: the script | "package.json has the analyze script" | the script runs another file | PASS |
| AC12: no test makes a network request | the `fetch` guard; `config.anthropic.test.ts` "is blank, so no test gets a key from getAnthropicApiKey()" | the line is removed from `vitest.config.ts`; a test reaches `fetch` (see AC1) | PASS |
| AC12: one task, several tasks, bad JSON, an API error, with a stub | AC3 first test; AC4 first test; AC6 "text that is not JSON" and "JSON that is cut off"; AC7 first test and AC8 "error then error" | as in their rows above | PASS |
| AC12: `yarn build` and `yarn test` pass with the key unset | the two commands under Test run | | PASS |

Checked by hand:

- Without a key, through yarn. Each of the three printed the same, and `echo $?` printed
  `1`:

  ```
  $ ANTHROPIC_API_KEY= yarn analyze --text "buy milk"; echo $?
  yarn run v1.22.22
  $ node src/analyze.ts --text 'buy milk'
  ANTHROPIC_API_KEY is not set.
  error Command failed with exit code 1.
  info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.
  1
  ```

  `ANTHROPIC_API_KEY= yarn analyze nothing.png` and `ANTHROPIC_API_KEY= yarn analyze`
  printed the same message and `1`.
- The three paths that end before a client is made, with a made-up key
  (`ANTHROPIC_API_KEY=not-a-key`), so no request was sent: `yarn -s analyze` printed the
  two usage lines; `yarn -s analyze nothing.png` printed
  `The image file "nothing.png" cannot be read.`; `yarn -s analyze README.md` printed
  `"README.md" is not a .jpg, .png, .webp or .gif file.`. Each exited with 1.
- The server with the key blank: `ANTHROPIC_API_KEY= PORT=4571 DATABASE_PATH=:memory: node src/server.ts`
  (the port was free) printed `Task Image AI is running at http://localhost:4571`; `/`,
  `/add` and `/css/base.css` answered 200 and `/nope` answered 404. The process was
  stopped afterwards and nothing listens on the port.
- After the whole suite: `git status --short` showed this job's files only; there is no
  `.env` and no `data` folder in the repo; `ls "$(node -p 'os.tmpdir()')" | grep '^mtask-'`
  printed nothing.
- `git diff --stat main -- src/server.ts src/app.ts src/ui.ts src/db src/routes src/views src/services/photo-storage.ts src/testing src/project.test.ts public tsconfig.json .gitignore CLAUDE.md README.md`
  printed nothing.

## Test run

`yarn build`:

```
yarn run v1.22.22
$ tsc --noEmit
Done in 0.83s.
```

`env -u ANTHROPIC_API_KEY yarn test`, the whole suite, once:

```
 Test Files  26 passed (26)
      Tests  823 passed (823)
   Start at  00:29:49
   Duration  861ms (tests 43%, import 33%, transform 23%, worker 1%)

Done in 1.27s.
```

823 is the 667 tests of earlier jobs and 156 new ones: 111 in `analyzer.test.ts`, 19 in
`analyze-command.test.ts`, 10 in `analyze.test.ts`, 14 in `config.anthropic.test.ts` and
2 in `server.test.ts`. None is skipped.

```
VERIFICATION
Build: PASS
Tests: PASS   (823 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

Diff: besides the files in the design's Files list, `git diff main...HEAD` holds only
this job's `spec.md`, `design.md` and `plan.md` and one line of `factory/backlog.md`,
all from the commits before the build. No `.only`, `.skip`, TODO, commented-out code,
debug output, key or path of this machine is in it.

## Not done

- **The spec's by-hand check with a real key.** No key was in the shell and there is no
  `.env`, and the plan says not to ask for one. These three commands have not been run:
  `yarn -s analyze --text "buy milk and fix the login bug"` (expected: two tasks),
  `yarn -s analyze <a photo of a single item>` (one task) and
  `yarn -s analyze <a photo of a handwritten list>` (several), each with
  `"fallback": false`. No request has reached the live API in the design or in the
  build, so it is not known that `claude-opus-5-5` accepts this exact request. If one
  of them prints the fallback, run it again with `ANTHROPIC_LOG=debug` in front to see
  what the API answered.
- **Nothing ran on Node 22 or 24.** Node 26.8.2 is the only Node on this machine.
- `yarn analyze` is not listed under Project facts in `CLAUDE.md`. The design leaves
  `CLAUDE.md` untouched: the language rules and the test, build and dev commands are
  the same.
- No entry was added to `docs/errors/`: no error needed a fix during the build.

Nothing else in the spec, the design or the plan was skipped or done differently.
