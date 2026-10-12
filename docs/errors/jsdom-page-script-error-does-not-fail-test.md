# A test passes although a script of the page it opened in jsdom threw

**Error**: no failure. The run only prints the exception and its stack to stderr, for
example `Error: localStorage is blocked` followed by `at http://localhost/:…` and
`at Script.runInContext (node:vm…)`, and the test is green.
**Where**: `vitest run src/shell.test.ts`, in the theme toggle tests, with the
`try`/`catch` around `localStorage.setItem` taken out of
`src/views/partials/theme-script.ejs` and storage blocked.
**Cause**: jsdom runs the scripts of a page opened with `runScripts: 'dangerously'` in
their own context. An exception no script catches, on load or in an event listener, is
reported to jsdom's virtual console and as an `error` event on the page's `window`. It
never reaches the test. A script that throws after it did the part the test looks at
(here: set `data-theme`, then failed to save) therefore passes.
**Fix**: `openPage` in `src/testing/dom.ts` listens for the window's `error` event in
`beforeParse` and keeps the messages; `scriptErrors(window)` returns them. A test file
that opens pages asserts `expect(scriptErrors(window)).toEqual([])` for every window it
opened (`src/shell.test.ts` does it in `afterEach`). Do the same in any new test that
runs page scripts.
**Seen in**: 002-design-system, 2026-10-12
