# 015-learning-loop: feed estimate corrections back into the analyzer

## Goal

Since 013, Done after Start stores `actual_minutes` next to the analyzer's
`estimated_minutes`, but nothing reads the two together, so the analyzer keeps making the
same estimating mistakes. This job closes the loop (`docs/plan.md`, task 12, the learning
loop). A service picks the past tasks where the estimate was far off, up to the last 3
per category. The analyzer's request then carries them as examples, in the style the
plan gives ("coding bug fixes: estimated 30, actual 75"). The model can then estimate
closer to what that person actually takes. As the backlog row says, tests check the
request that is built, not what the model answers.

It builds on what is there. The analyzer is `src/services/analyzer.ts` (005); it reads
neither the database nor the environment, and this job keeps it that way. The corrections
are handed to it. The rows come from the `tasks` table through `src/db/tasks.ts` (003),
with the `status`, `completed_at` and `actual_minutes` that 010 and 013 write. The app
runs the analyzer from `analyzeSource` in `src/services/drafts.ts` (006, 007), which is
where the corrections are read and passed on. The plan gives no value for N, no
definition of a large gap and no wording, so the numbers, the line format and the module
name below are this spec's choices.

## Acceptance criteria

- **AC1**: Which tasks count. A new module, `src/services/corrections.ts`, exports a
  function that takes an open database and returns a list of corrections. Each
  correction has `category`, `title`, `estimated_minutes` and `actual_minutes`, copied
  from one task. A task can be a correction only when all of these hold:
  - `status` is `done`;
  - `completed_at`, `estimated_minutes` and `actual_minutes` are all set;
  - `category` is exactly one of the six analyzer categories (`coding`, `shopping`,
    `work`, `home`, `personal`, `other`).

  Each of these is a separate test case. A `pending`, `in_progress` or `draft` task with
  both minutes set is never returned. Neither is a done task whose `actual_minutes` is
  null (Done without Start), or a done task with category `Groceries`, null or `''`.
  The category is matched as stored, with no trimming or case folding, which is the
  simplest reading.
- **AC2**: Large gap. A task counts only when `|actual_minutes - estimated_minutes|` is
  at least half of `estimated_minutes`. Estimated 30: actual 75, 45 and 15 count, while
  actual 44, 30 and 16 do not. Estimated 60: actual 25 counts and actual 31 does not. The
  rule is the same whether the task ran over or finished early.
- **AC3**: Last N per category. For each category, at most the 3 matching tasks with the
  latest `completed_at` are returned, and when two tasks have the same `completed_at` the
  higher `id` counts as later. With five matching `coding` tasks and two matching
  `shopping` tasks, the result holds the three latest `coding` tasks and both `shopping`
  tasks. A category's limit does not depend on any other category. The list is ordered
  by category in the order of the six ids in AC1, and within one category with the latest
  first. With no matching task the result is `[]`.
- **AC4**: In the request. The analyzer accepts a list of corrections alongside its input.
  When the list is not empty, the request the stubbed client receives contains one line
  per correction, in the list's order, in exactly this form:

  `- coding: "Fix the login bug", estimated 30 min, actual 75 min`

  The title is written as a JSON string (`JSON.stringify`), so a quote or a line break in
  a title cannot break the line. This holds for a text input and for an image input. On
  a retry after an invalid reply (005 AC6), the second request carries the same lines.
  Whether the lines go in the system prompt or the user message is the architect's
  choice. A test can search either one.
- **AC5**: No corrections, no change. Given an empty list, or no list at all, the
  analyzer builds a request deep-equal to the one it built before this job, for the same
  input and model. The existing tests of `src/services/analyzer.test.ts` and
  `src/analyze-command.test.ts` pass unchanged. The result, the retry and the fallback of
  005 AC3-AC9 are not changed by corrections.
- **AC6**: The app passes them. When `analyzeSource` runs the analyzer on a photo, voice
  or text source, it also hands it the corrections that AC1-AC3 return for the app's
  database at that moment. This covers the first analysis after a `/add` post and the
  retry on the review page. A test uses an app built with a stub `analyze` that records
  its arguments. With one done `coding` task (estimated 30, actual 75) in the database, a
  text posted on `/add` reaches the stub with that one correction. With no such task, the
  stub is called with the input as its only argument: no second argument at all, neither
  `[]` nor `undefined`. This keeps the existing assertions of 006 and 007 on the stub's
  argument list true, and by AC5 the analyzer treats a missing list like an empty one.
- **AC7**: `yarn build` and `yarn test` pass with `ANTHROPIC_API_KEY` unset. Tests run
  against an in-memory or temporary database, leave nothing in `data/`, and make no
  network request. There are tests for:
  - each exclusion of AC1;
  - the boundaries of AC2;
  - the per-category limit and order of AC3;
  - the lines in a text and an image request, and in the retry (AC4);
  - the unchanged request without corrections (AC5);
  - the app passing the corrections, and calling with the input only when there are
    none (AC6).

  No existing test changes.

## Out of scope

- Checked by hand (backlog): with a real key, after a few Start-then-Done completions in
  one category whose actual time is far from the estimate, a new analysis of a similar
  task in that category gives an estimate that has moved toward the actual times.
- The wording around the example lines in the prompt. No criterion checks it, because
  only a live model shows whether it works (as in 005).
- Corrections in `yarn analyze`. The command opens no database and stays as in 005 AC11.
- Changing an estimate by arithmetic (an average or a per-category factor) instead of
  examples in the prompt.
- Settings for N or for the gap threshold. The settings page (022) shows slot rules and
  working hours only.
- Showing the corrections anywhere in the UI.
- Keeping the analyzer's original estimate apart from an estimate the user edited on
  review or in the sheet. There is one `estimated_minutes` column, and its stored value
  is the one that is compared.
- Recurring instances (016). A done instance counts like any other done task.
