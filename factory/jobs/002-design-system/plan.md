# 002-design-system: plan

Decision numbers (D1, D2, ...) refer to `design.md`.

There is no Parallel tasks section: every step from 2 to 8 edits `public/css/base.css`,
so the job does not split into parts that share no files.

## Steps

After each step, `yarn test` and `yarn build` must pass, including the four test files
from job 001, which are never edited (D16).

1. **Test support.** Files: `src/testing/jsdom.d.ts`, `src/testing/dom.ts`,
   `src/testing/css.ts`, `src/testing/page.ts`, `src/testing/css.test.ts`. Serves the
   tests of every criterion.
   - The `jsdom` module declaration and `parseHtml` / `openPage` (D16).
   - `parseCss` with rule lookup by selector and enclosing at-rule.
   - `getPage`, `getStylesheet`, `renderView`.
   - Check: `src/testing/css.test.ts` passes; `yarn build` is clean with no DOM library
     added to `tsconfig.json`.

2. **Tokens.** Files: `public/css/base.css`, `src/stylesheet.test.ts`. Serves AC1, AC2.
   - Write the `:root` block (palette, aliases, type, spacing, radii, sizes) and the two
     dark blocks (D1, D4).
   - Move the existing rules (`body`, `a`, `.site-header`, `.page`, `h1`, `.muted`) onto
     the tokens. Add `[hidden]` and `.visually-hidden`.
   - Check: the AC1 and AC2 tests and the token-use guards pass; the 001 stylesheet
     tests still pass.

3. **UI tables.** Files: `src/ui.ts`, `src/ui.test.ts`, `src/app.ts`, `src/render.ts`.
   Serves AC3, AC5, AC6.
   - `navItems`, `priorities`, `slots`, the lookups and the types (D7, D11).
   - `app.locals.ui = ui`; `PageLocals.nav?: NavId`.
   - Check: `src/ui.test.ts` passes.

4. **Navigation and shell.** Files: `src/views/partials/nav.ejs`,
   `src/views/layout.ejs`, `src/routes/home.ts`, `public/css/base.css`,
   `src/shell.test.ts`, `src/stylesheet.test.ts`. Serves AC3, AC7.
   - The nav partial, included in the layout between the header and `<main>`.
   - `nav: 'today'` in the home route.
   - Shell CSS: site header, tab bar, body padding, the wide block with the sidebar (D6).
   - Check: the AC3 and AC7 tests pass.

5. **Button and theme.** Files: `src/views/partials/button.ejs`,
   `src/views/partials/theme-script.ejs`, `src/views/layout.ejs`,
   `public/css/base.css`, `src/components.test.ts`, `src/shell.test.ts`,
   `src/stylesheet.test.ts`. Serves AC4, and the button parts of AC5 and AC6.
   - The button partial with `variant`, `href`, `type` and `attrs` (D10); `.btn` and
     `.btn--ghost`.
   - The theme script in `<head>` before the stylesheet link (D8); the toggle in the site
     header (D9).
   - Check: the AC4 tests and the 44px tests pass.

6. **Static components.** Files: `src/views/partials/page-header.ejs`,
   `priority-badge.ejs`, `slot-badge.ejs`, `chip.ejs`, `card.ejs`, `empty-state.ejs`,
   `skeleton.ejs`, `public/css/base.css`, `src/components.test.ts`. Serves AC5, AC6.
   - Each partial per the D10 table; badges through the `ui` lookups (D11).
   - The skeleton animation and its `prefers-reduced-motion` rule.
   - Check: the partial tests for these seven pass.

7. **Overlay components.** Files: `src/views/partials/modal.ejs`, `bottom-sheet.ejs`,
   `toast.ejs`, `public/css/base.css`, `src/components.test.ts`. Serves AC5, AC6.
   - `.overlay`, `.modal`, `.sheet`, `.toast-region`, `.toast` (D12, D13).
   - Check: the dialog and toast tests pass, including the closed-by-default test.

8. **Style-guide page.** Files: `src/routes/styleguide.ts`,
   `src/views/pages/styleguide.ejs`, `src/app.ts`, `public/css/base.css`,
   `src/components.test.ts`, `src/shell.test.ts`. Serves AC5, and AC3 for this page.
   - The route, the page with its token and component sections, the `sg-` classes and
     the stages (D14).
   - Check: the style-guide tests pass.

9. **Verify.** No files. Serves AC7.
   - `yarn build` and `yarn test`, then the verification loop.
   - `git diff --stat main -- src/app.test.ts src/config.test.ts src/server.test.ts src/project.test.ts src/views/pages/home.ejs src/views/pages/not-found.ejs package.json yarn.lock tsconfig.json`
     prints nothing.
   - If a browser is at hand: open `/_styleguide` at 375px and 1200px wide, in both
     themes, and reload with a saved theme. Either way, write under Not done in
     `build.md` which of these were looked at and which were not.

## Tests

Shared setup. `getPage(path)` requests `createApp()` with supertest and parses the body
with jsdom, scripts off. `openPage(html, options)` parses the same HTML with the inline
scripts running. `getStylesheet()` reads the stylesheet `href` out of the home page,
requests it and returns the parsed rules. In the stylesheet tests, "the `:root` rule"
means the rule whose selector is exactly `:root` with no enclosing at-rule; "outside
`:root`" means every other rule.

### Test support: `src/testing/css.test.ts`

- A fixture with a comment, a top-level rule, a rule inside `@media` and a
  `@keyframes` block parses to the expected selectors, `at` values and declarations.
- A comment containing `{` or a declaration-like line produces no rule.

### AC1: `src/stylesheet.test.ts`

- The `:root` rule declares `--urgent`, `--high`, `--medium`, `--low` and
  `--urgent-bg`, `--high-bg`, `--medium-bg`, `--low-bg`.
- It declares `--slot-morning`, `--slot-afternoon`, `--slot-evening`, `--slot-night`.
- It declares `--surface` and `--surface-2`, with different light values.
- Type scale: `--font-size-xs`, `-sm`, `-md`, `-lg`, `-xl`, `-2xl` are declared, each is
  a `rem` length, and the six values are strictly increasing in that order.
- Spacing: `--space-1` to `--space-6` are declared, and every declared `--space-N`
  equals `N × 4` followed by `px`.
- Radii: the names that start with `--radius` are exactly `--radius` and `--radius-sm`,
  and both are `px` lengths.
- Token-use guards, on every rule outside `:root`: each `font-size` value is
  `var(--font-size-...)` or `inherit`, and each `font` shorthand is `inherit` or
  contains `var(--font-size-`; each space-separated part of a `border-radius` is
  `var(--radius)`, `var(--radius-sm)`, `999px`, `50%` or `0`; no `margin*`, `padding*`,
  `gap`, `row-gap` or `column-gap` value contains a `px` length. Each guard first
  asserts that it found at least one such declaration.
- Mockup values: for each of the 20 color names in the `:root` block of
  `docs/mockUps.html`, `--light-<name>` equals the mockup's light value and
  `--dark-<name>` equals its `:root[data-theme="dark"]` value (compared without regard
  to case); `--radius` and `--radius-sm` equal the mockup's.

### AC2: `src/stylesheet.test.ts`

- The color tokens are the names `X` for which `:root` declares `--light-X`. The list
  contains the 20 mockup names, `scrim` and `shadow`.
- For each `X`, `:root` declares `--dark-X` with a color literal and `--X` as exactly
  `var(--light-X)`.
- Every declaration in `:root` whose value holds a color literal is named `--light-*`
  or `--dark-*`.
- There is a rule with selector `:root[data-theme="dark"]` and no enclosing at-rule. It
  declares `--X: var(--dark-X)` for every `X`, and nothing else except `color-scheme`.
- There is a rule with selector `:root:not([data-theme="light"])` whose enclosing
  at-rule is `@media (prefers-color-scheme: dark)`. Its declarations equal those of the
  rule above.
- No custom property is declared in any rule other than these three.
- In every rule outside `:root`, no declaration value contains a hex color, one of the
  color functions of D2, or (after `var(...)` references are removed) one of
  `transparent`, `black`, `white`, `red`, `green`, `blue`, `yellow`, `orange`, `purple`,
  `pink`, `gray`, `grey`, `silver`, `brown`, `cyan`, `magenta`, `navy`, `teal`, `lime`,
  `maroon`, `olive`, `aqua`, `fuchsia` as a whole word.
- The 001 tests "has no color literal outside :root" and "declares on :root every
  variable it uses" in `src/app.test.ts` still pass, unedited.

### AC3: `src/shell.test.ts` and `src/stylesheet.test.ts`

`src/shell.test.ts`:
- On `/`, `/no-such-page` and `/_styleguide`, exactly one element matches
  `nav, [role="navigation"]`, and it has an accessible name (`aria-label`).
- On each of those pages, the `href`s of the links in the nav, in document order, are
  `/`, `/timeline`, `/add`, `/tasks`, `/more`, and their text contains `Today`,
  `Timeline`, `Add`, `Tasks`, `More` in the same order. `/add` is the third of five.
- On `/`, exactly one link in the nav has `aria-current="page"`, and its `href` is `/`.
- For each nav id, `renderView('layout', { title: 'x', page: 'home', nav: <id> })` marks
  exactly the link of that id.
- On `/no-such-page`, `/timeline` and `/_styleguide`, no element has
  `aria-current="page"` (D7).

`src/stylesheet.test.ts`:
- The `.app-nav` rule with no enclosing at-rule declares `position: fixed`, `left: 0`,
  `right: 0` and `bottom: 0`, and no `top`.
- The `body` rule with no enclosing at-rule has a `padding-bottom` that contains
  `var(--nav-height)`.
- Exactly one at-rule prelude in the file starts with `@media (min-width:`, and none
  contains `max-width`. Inside it, the `.app-nav` rule declares `top: 0`, `right: auto`,
  `width: var(--nav-width)` and `flex-direction: column`, and the `body` rule declares
  `padding-left: var(--nav-width)` and `padding-bottom: 0`.

### AC4: `src/shell.test.ts`

All on the HTML of `GET /`.

- The raw HTML has `<html lang="en">` with no `data-theme` attribute.
- Exactly one element has the attribute `data-theme-toggle`; it is a `<button>` inside
  `header.site-header`, with text.
- The theme script is a `<script>` inside `<head>`, with no `src`, `defer`, `async` or
  `type` attribute, and it comes before the stylesheet `<link>`.
- `openPage(html)` with nothing saved: the root element has no `data-theme`.
- `openPage(html, { savedTheme: 'dark' })`: `data-theme` is `dark`. The same for
  `light`.
- `openPage(html, { savedTheme: 'purple' })`: no `data-theme`.
- Nothing saved, system light: clicking the toggle sets `data-theme="dark"` and
  `localStorage.getItem('theme')` is `dark`; a second click gives `light` in both
  places.
- Nothing saved, `systemDark: true`: no `data-theme` before the click; the first click
  gives `light`.
- `savedTheme: 'dark'`: the click gives `light`, saved.
- A click on a child element of the toggle works the same as a click on the toggle.
- `storageThrows: true`: no `data-theme` on load, and a click still sets
  `data-theme="dark"`.

### AC5: `src/components.test.ts`

- Each of `page-header`, `button`, `priority-badge`, `slot-badge`, `chip`, `card`,
  `modal`, `bottom-sheet`, `toast`, `empty-state`, `skeleton` exists as
  `src/views/partials/<name>.ejs`.
- The source of `src/views/pages/styleguide.ejs` includes each of them
  (`include('../partials/<name>'`), so the page shows the partials and not copies of
  their markup.
- `GET /_styleguide` has status 200 and a `content-type` starting with `text/html`, and
  renders inside the layout (one `<main>`, the site header).
- For each pair below there is exactly one `section.sg-section` whose `<h2>` text is the
  heading, and inside that section the selector matches:
  `Page header` → `.page-header h1`; `Button` → `.btn:not(.btn--ghost)` and
  `.btn.btn--ghost`; `Priority badge` → `.badge--urgent`, `.badge--high`,
  `.badge--medium`, `.badge--low`; `Slot badge` → `.badge--slot-morning`,
  `.badge--slot-afternoon`, `.badge--slot-evening`, `.badge--slot-night`;
  `Chip` → `.chip`; `Card` → `.card`; `Modal` → `.modal`; `Bottom sheet` → `.sheet`;
  `Toast` → `.toast`; `Empty state` → `.empty-state`;
  `Skeleton loader` → `.skeleton .skeleton__line`.
- On the style guide, the modal's and the sheet's `.overlay` have no `hidden` attribute,
  and each of `.overlay` and `.toast-region` is inside a `.sg-stage`.
- Every `var(--name)` in a `style` attribute of the page is declared in the `:root`
  rule, and no `style` attribute holds anything but `property: var(--name)` pairs.
- Per partial, through `renderView`:
  - `button`: default renders `<button type="button" class="btn">` with the label;
    `variant: 'ghost'` adds `btn--ghost`; `href` renders an `<a>`; `attrs` are written
    with their values escaped; an unknown `variant` rejects.
  - `page-header`, `chip`, `card`, `empty-state`, `skeleton`: the root element of the
    D10 table, the given text escaped (a label of `<b>` appears as text, not as an
    element), optional fields absent when not given, `skeleton` with `lines: 5` has five
    `.skeleton__line`.
  - Each partial rendered with a page-level `title: 'PAGE-TITLE'` beside its own object
    does not contain `PAGE-TITLE`.
  - Rendering a partial without its object rejects.

### AC6: `src/components.test.ts`, `src/stylesheet.test.ts`, `src/shell.test.ts`, `src/ui.test.ts`

`src/ui.test.ts`:
- `priorities` has the ids `urgent`, `high`, `medium`, `low` and `slots` has `morning`,
  `afternoon`, `evening`, `night`, each with a non-empty label.
- `priority('nope')` and `slot('nope')` throw; `navItems` has `add` at index 2 of 5.

`src/components.test.ts`:
- For each of the four priorities, the rendered `priority-badge` has, once its
  `aria-hidden` children are removed, text equal to the label (`Urgent`, `High`,
  `Medium`, `Low`). For each of the four slots, the `slot-badge` text is `Morning`,
  `Afternoon`, `Evening`, `Night`.
- `priority-badge` with an unknown priority rejects, and `slot-badge` with an unknown
  slot rejects: there is no badge without a name.
- `modal` and `bottom-sheet`: one element with `role="dialog"`; its `aria-labelledby`
  is the id of an element inside it whose text is the given heading. Without `open` the
  `.overlay` has `hidden`; with `open: true` it has not. Without `id`, or without
  `heading`, the render rejects.
- `toast`: the `.toast` element has an ancestor with `aria-live="polite"`, and contains
  the message.
- On `/_styleguide`: every `[role="dialog"]` has a non-empty accessible name through
  `aria-labelledby`, every `.toast` is inside an `[aria-live]` element, and every
  `.badge` has non-empty text outside its `aria-hidden` children.

`src/stylesheet.test.ts`:
- `:root` declares `--touch-target: 44px`.
- The `.btn` rule and the `.app-nav__link` rule (no enclosing at-rule) each declare
  `min-height: var(--touch-target)` and a `display` of `flex` or `inline-flex`.
- No other rule whose selector mentions `.btn` or `.app-nav__link` declares a
  `min-height` with a different value.
- A rule with selector `[hidden]` declares `display: none !important`.

`src/shell.test.ts`:
- On `/` and `/_styleguide`: every link in the nav has the class `app-nav__link`; the
  theme toggle has the class `btn`; every `<button>` element on the page has the class
  `btn`.

### AC7: the 001 test files and `src/shell.test.ts`

- `src/app.test.ts`, `src/config.test.ts`, `src/server.test.ts` and
  `src/project.test.ts` pass with no edit (step 9 checks the diff is empty).
- `GET /` is 200, has the nav, and `<main>` contains an `<h1>` with the text `Today`.
- `GET /no-such-page` is 404, has the nav, and `<main>` contains an `<h1>` with the text
  `Page not found`.
- `GET /timeline`, `/tasks`, `/more` and `/add` are each 404 with the not-found page:
  the job added no route but `/_styleguide`.
- "`yarn test` passes" and "`yarn build` is clean" are proved by running the two
  commands; step 9 records their real output in `build.md`.

### Checked by hand, not by tests

Listed under Not done in `build.md`, each marked as looked at or not:

- `/_styleguide` at 375px wide: tab bar at the bottom, Add raised in the middle, the last
  section not covered by the bar.
- The same page at 1200px wide: sidebar on the left, content beside it.
- Both themes through the toggle; every component readable in each.
- A reload with a saved theme shows no flash of the other theme.
- The modal, bottom sheet and toast stay inside their stages.
