# 005-analyzer: AI analyzer that returns several tasks from a photo or text

## Goal

Task Image AI turns a photo or a few spoken or typed words into tasks (`docs/plan.md`,
task 4). This job adds the service that does it: it sends one image or one text to the
Anthropic API and returns a checked array of tasks, each with a title, a description, a
category, an estimate in minutes, an urgency and a confidence. One photo of a whiteboard
or a handwritten list can give several tasks. When the model's answer cannot be used, the
service asks once more, and after a second failure it returns a fallback result instead
of failing, so the review screen always has something to show.

The service is `src/services/analyzer.ts`, next to `photo-storage.ts` from 004. Nothing
calls it from a request yet: 006 runs it after an upload and stores the drafts. It does
not read or write the database. Its fields are shaped for what 003 stores and 008 reads:
`confidence` runs from 0 to 1 like `tasks.confidence`, and `urgency` uses the four
priority ids of `src/ui.ts`. The plan gives no values for `category` or `urgency`, no
fallback and no limits, so those below are this spec's choices.

## Acceptance criteria

- **AC1**: `src/services/analyzer.ts` exports an async function that analyzes one input:
  either an image, given as the path of a file on disk, or a text, given as a string. The
  Anthropic client it calls is handed to it, so a test passes a stub and no test reaches
  the network. It resolves to an object with `tasks`, an array, and `fallback`, a boolean.
  How the model is asked to carry the array in its reply (plain text, a tool call, a
  structured output) is the architect's choice.
- **AC2**: Every item of `tasks` has exactly these six fields, and a reply with an item
  that breaks one of them is invalid as a whole:
  - `title`: a string that is not blank.
  - `description`: a string, which may be empty.
  - `category`: one of `coding`, `shopping`, `work`, `home`, `personal`, `other`.
    Groceries are `shopping`.
  - `estimated_minutes`: an integer from 1 to 1440.
  - `urgency`: one of `urgent`, `high`, `medium`, `low`.
  - `confidence`: a number from 0 to 1.

  A field the reply adds beyond these six is dropped, not an error.
- **AC3**: When the stubbed client replies with one valid task, the result is
  `fallback: false` with that one task in `tasks`, and the client was called once.
- **AC4**: When the stubbed client replies with several valid tasks, `tasks` holds all of
  them in the reply's order, `fallback` is `false`, and the client was called once. A
  reply with an empty array is valid too: `tasks` is `[]` and `fallback` is `false`.
- **AC5**: The request the client receives has the configured model id as `model`. For a
  text input it contains the text. For an image input it contains one image block with
  the file's bytes in base64 and the media type that matches the file's extension, as
  004 stores them: `.jpg` is `image/jpeg`, `.png` is `image/png`, `.webp` is
  `image/webp`, `.gif` is `image/gif`.
- **AC6**: A reply is invalid when no array can be read from it (it is not JSON, it has
  no content, or the JSON has another shape) or when an item breaks AC2, for example
  `urgency: "asap"`, `confidence: 1.5`, `estimated_minutes: 0` or a missing `title`.
  After an invalid reply the client is called exactly once more. When that second reply
  is valid, its tasks are returned with `fallback: false`.
- **AC7**: A client call that rejects (an API error) is treated like an invalid reply: one
  more call, and a valid second reply is returned with `fallback: false`. This is the
  simplest reading of the backlog row, which names the retry only for invalid output.
- **AC8**: When both attempts fail, in any mix of invalid replies and API errors, the
  function does not reject. It resolves to `fallback: true` with exactly one task in
  `tasks`: `title` `Untitled task`, `description` the given text (an empty string for an
  image), `category` `other`, `estimated_minutes` 30, `urgency` `medium`, `confidence` 0.
  The client was called exactly twice.
- **AC9**: An input the analyzer cannot send is refused before any call: a blank text, an
  image path with no file behind it, and an image file with an extension other than the
  four in AC5 each make the function reject with an error, and the client is not called.
- **AC10**: The API key comes from `ANTHROPIC_API_KEY` and the model id from
  `ANTHROPIC_MODEL`, which has a default the architect picks (a Claude model that reads
  images). Both are read in `src/config.ts` only and listed in `.env.example`, the key
  with an empty value. `@anthropic-ai/sdk` is in `dependencies` and is the real client.
  The server starts and every existing route answers as before with `ANTHROPIC_API_KEY`
  unset.
- **AC11**: `yarn analyze <image file>` and `yarn analyze --text "<text>"` run the
  analyzer with the real client and print the result of AC1 as JSON on stdout. With
  `ANTHROPIC_API_KEY` unset or blank the command exits with code 1, writes
  `ANTHROPIC_API_KEY is not set.` to stderr and makes no request. This command exists so
  the hand check below can be done before 006 has a screen.
- **AC12**: `yarn build` and `yarn test` pass, with `ANTHROPIC_API_KEY` unset. The new
  tests cover one task, several tasks, bad JSON and an API error with a stubbed client,
  and none of them makes a network request.

## Out of scope

- Calling the analyzer after an upload, storing the tasks as drafts under a source, and
  the "Analyzing..." and error-with-retry states (006). `fallback` is there for 006 to
  choose between them.
- Text from the Voice and Type tabs (007). The analyzer takes any string already.
- Turning `category` and `urgency` into a priority and a time slot (008). The ids
  `coding` and `shopping` exist for those rules; the backlog's open decision 3 is taken
  at its default, that coding and groceries or shopping each have a slot of their own.
- Past estimate corrections as examples in the prompt (015).
- Rate limiting on the AI endpoints (023).
- Resizing a photo before it is sent. 004 accepts files up to 10 MB, which can be more
  than the API takes for one image; such a photo ends in the fallback of AC8. No job in
  the backlog resizes photos.
- Telling the caller why an attempt failed, and a time limit on a call beyond the
  client's own.
- The wording of the prompt. No criterion checks it, because only a live model shows
  whether it works.
- Checked by hand: with a real key, `yarn analyze` on a photo of a single item returns
  one task, and on a real handwritten list returns several.
