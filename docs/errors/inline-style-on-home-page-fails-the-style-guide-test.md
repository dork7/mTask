# An inline style on `/` fails the style guide's "no inline style" test

**Error**: `FAIL src/components.test.ts > GET /_styleguide (AC5, AC6) > has no inline style outside the style guide` with `AssertionError: /: expected [ HTMLDivElement{} ] to deeply equal []`.
**Where**: `yarn test`, `src/components.test.ts:580`.
**Cause**: the Today page drew its progress fill as `<div class="progress__fill" style="width: 31%">`. The test of 002 allows no `[style]` element on `/` or on the 404 page. Other pages (the timeline) may carry inline styles because that test does not read them.
**Fix**: the bar became `<svg class="progress__track" aria-hidden="true"><rect class="progress__fill" width="31%" height="100%"></rect></svg>`, with `fill: var(--accent)` in the stylesheet. The width is an SVG attribute, not a style. Rule: before a design puts an inline style on a page, grep the tests for `[style]` and the page's path.
**Seen in**: 014-today-dashboard, 2026-10-15
