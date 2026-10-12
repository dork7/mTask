# 002-design-system: design

## Spec problems

None that block the build. Four points in the spec can be read two ways, and one
existing test narrows how AC2 can be met. Each is settled under Decisions so the builder
and the reviewers work from the same reading:

- AC2 and AC7 together: an existing 001 test only treats a plain `:root { }` block as a
  token block, so dark blocks that hold hex values would fail it (D1).
- AC2, "color literal": whether `transparent` and named colors count (D2).
- AC1, "two corner radii": whether a pill or a circle is a third radius (D4).
- AC3, "the link for the current page": what is marked on the not-found page (D7).
- Out of scope, "any change to the scaffold's routes": `src/routes/home.ts` gets one new
  local so the layout knows which link is current (D7).

AC3's "bottom tab bar on narrow screens, sidebar on wide ones" and AC4's "before the
page first paints" cannot be observed in the test suite, which has no browser. The tests
assert the declarations and the markup that produce them (see `plan.md`), and the
visual result is listed as a by-hand check.

Everything marked "checked" below was run in a throwaway copy outside the repo with the
repo's own `node_modules` and `tsconfig.json` (Node 25.4.0, Express 5.3.0, EJS 7.0.1,
jsdom 30.1.1, Vitest 5.0.1, TypeScript 5.9.3).

## Approach

The job has four parts that share one stylesheet: tokens, the app shell, the component
partials and the style-guide page.

**Tokens.** `public/css/base.css` stays the only stylesheet. Its `:root` block holds a
palette (every color, light and dark, as a literal) and then the tokens rules use, each
pointing at its light palette entry. Two dark blocks re-point every color token at its
dark palette entry. So every hex value is written once, inside `:root`, and the dark
blocks hold no literal at all. The same `:root` block declares the type scale, the
spacing scale, the two radii and a few sizes. Rules below it use only tokens.

**Shell.** `src/views/layout.ejs` gains an inline theme script in `<head>`, a theme
toggle in the existing site header, and one `<nav>` with five links. The stylesheet is
mobile-first: with no media query the nav is a fixed bar at the bottom; inside the one
`@media (min-width: 900px)` block it becomes a fixed sidebar on the left. The list of
nav items, priorities and slots lives in a new typed module, `src/ui.ts`, and reaches
the views as `app.locals.ui`.

**Partials.** Eleven component partials go in `src/views/partials/`. Each reads exactly
one local, an object named after the partial, so a partial can never pick up a
same-named local of the page by accident. Containers (card, modal, bottom sheet) take
their content as an HTML string that the caller builds with `include()`, because EJS has
no slots.

**Style guide.** `GET /_styleguide` renders `pages/styleguide.ejs` through the normal
`renderPage`. Each component sits in its own `<section class="sg-section">` under an
`<h2>` with its name. The modal, bottom sheet and toast are `position: fixed` in real
use; on the style guide each sits in a small "stage" box that contains it, so all three
can be shown open on one page without covering it.

**Tests.** HTML is checked with jsdom (already a dev dependency), which also runs the
inline theme script against a real `localStorage`. CSS is checked with a small parser
written for the tests. Partials are rendered on their own through Express's
`app.render`. No test from job 001 is edited.

## Decisions

**D1. Colors are a palette plus aliases. Dark blocks hold `var()` only, never a hex
value.** The `:root` block declares, for each color token `X`:

```css
--light-X: <light value>;
--dark-X:  <dark value>;
--X: var(--light-X);
```

and both dark blocks declare `--X: var(--dark-X);` for every `X`, plus
`color-scheme: dark`. The two dark blocks are, exactly:

```css
:root[data-theme="dark"] { ... }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { ... }
}
```

Reason: `src/app.test.ts` ("has no color literal outside :root") strips only blocks that
match `/:root\s*\{([^}]*)\}/` and then forbids hex and `rgb(`/`hsl(` in what is left.
`:root[data-theme="dark"] {` does not match that pattern, so a dark block written the
way `docs/mockUps.html` writes it would fail a test that AC7 says must still pass.
With the palette, the existing test passes unedited (checked against a sample of this
layout), AC2's "redefined under both selectors" holds literally, and each dark value is
written once instead of twice. Rejected: editing the 001 test to accept the dark
selectors (AC7 says the existing tests pass, not that they are rewritten); the CSS
`light-dark()` function (the tokens would then not be redefined under the two selectors
AC2 names).

Rules never use `--light-*` or `--dark-*` directly. Only the aliases do.

**D2. What a "color literal" is, and four rules that follow from the 001 tests.**
A color literal is a hex color, a color function (`rgb`, `rgba`, `hsl`, `hsla`, `hwb`,
`lab`, `lch`, `oklab`, `oklch`, `color`, `color-mix`, `light-dark`) or a named color,
and `transparent` counts as a named color. `currentColor` is a reference, not a
literal, and is allowed. Color literals appear only in the plain `:root { }` block.
In practice:

- A ghost button uses `background: none`, not `transparent`. A selected chip sets its
  border color to the same token as its background.
- Shadows and the overlay backdrop get their own color tokens (`--shadow`, `--scrim`).
- No custom property is declared outside the three token blocks. The 001 test "declares
  on :root every variable it uses" fails on any `var(--x)` whose `--x` is not in the
  plain `:root` block, so a component-scoped variable is not possible.
- No id selectors in the stylesheet, and no `#` followed by hex-like text in a comment
  outside `:root`. The 001 test matches `/#[0-9a-fA-F]{3,8}\b/`, which also hits
  `#add` or `#fade` (checked).
- No comment contains the text `:root {`, and the plain `:root` block contains no `}`
  before its end; either would confuse the same 001 regex.

Rejected: allowing `transparent` because it is the same in both themes. A reviewer
reading AC2 literally could fail it, and it costs nothing to avoid.

**D3. One stylesheet, `public/css/base.css`.** AC1 says "the stylesheet", the 001 tests
read the first stylesheet link of the layout, and every guard in this job runs on that
one file. Sections, in order: tokens, dark blocks, reset and base elements, utilities,
shell, components, style guide, the one wide-screen media block, reduced motion.
Rejected: `tokens.css` + `components.css` + `styleguide.css` (two more render-blocking
requests, and each would need the same guards wired to it).

**D4. The tokens.** Names of the 20 mockup colors and the two radii are unchanged.

Color tokens (22). Light and dark values of the first 20 are copied from
`docs/mockUps.html`; a test compares them.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#eef0f4` | `#0c0e12` |
| `--surface` | `#ffffff` | `#171a21` |
| `--surface-2` | `#f4f5f8` | `#1f232c` |
| `--text` | `#14171c` | `#eceef3` |
| `--muted` | `#5d6675` | `#9aa3b2` |
| `--border` | `#e1e4ea` | `#2b303b` |
| `--accent` | `#4f46e5` | `#8b86ff` |
| `--accent-text` | `#ffffff` | `#0c0e12` |
| `--urgent` / `--urgent-bg` | `#d93025` / `#fde8e6` | `#ff6b5e` / `#3a1c1a` |
| `--high` / `--high-bg` | `#e8710a` / `#fdeedc` | `#ffa24d` / `#3a2a16` |
| `--medium` / `--medium-bg` | `#1a73e8` / `#e3eefd` | `#6ea8ff` / `#18283f` |
| `--low` / `--low-bg` | `#6b7280` / `#eceef1` | `#a0a7b4` / `#262a32` |
| `--slot-morning` | `#fff6dd` | `#2a2614` |
| `--slot-afternoon` | `#e8f3ff` | `#16222f` |
| `--slot-evening` | `#f1ebff` | `#241d35` |
| `--slot-night` | `#e6e9f7` | `#1c2033` |
| `--scrim` (new) | `#14171c80` | `#000000b3` |
| `--shadow` (new) | `#14171c1f` | `#00000080` |

Type scale, one set, in `rem` so the user's browser font size is respected:
`--font-size-xs: 0.6875rem` (11px), `--font-size-sm: 0.8125rem` (13px),
`--font-size-md: 0.9375rem` (15px, body), `--font-size-lg: 1.125rem` (18px),
`--font-size-xl: 1.375rem` (22px), `--font-size-2xl: 1.75rem` (28px). With them:
`--font-family` (the stack already in `base.css`) and `--line-height: 1.4`. The prefix
is `--font-size-`, not `--text-`, because `--text` is already the text color.
Rejected: px sizes as in the scaffold (they ignore the browser's font-size setting).

Spacing: `--space-N` is always `N × 4px`. Declare `--space-1` to `--space-6`,
`--space-8`, `--space-10` and `--space-12`.

Radii: exactly two tokens, `--radius: 14px` and `--radius-sm: 8px`. A pill (`999px`) and
a circle (`50%`) are shapes, not a third radius, and are written as those two literals.
Rejected: a `--radius-pill` token, which would make three radius tokens against AC1's
"two".

Sizes: `--touch-target: 44px`, `--nav-height: 64px`, `--nav-width: 220px`,
`--content-width: 720px`, and `--z-nav: 10`, `--z-overlay: 20`, `--z-toast: 30`.

Rules use the tokens, and tests hold them to it:

- every `font-size` is a `var(--font-size-*)` (or `inherit`); the `font` shorthand is
  `inherit` or built from the tokens;
- every part of a `border-radius` is `var(--radius)`, `var(--radius-sm)`, `999px`, `50%`
  or `0`;
- `margin`, `padding` and `gap` (and their longhands) contain no `px` length. Use the
  spacing tokens, `0`, `auto` and `calc()` on tokens. A badge that wants 2px of vertical
  padding uses `0` and its line height instead. The `.visually-hidden` utility is written
  without the usual `margin: -1px` (`position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap`).

**D5. Class names.** `block`, `block__part`, `block--variant`. The scaffold's
`.site-header`, `.page` and `.muted` keep their names. The classes tests rely on are
listed under Files.

**D6. The shell is mobile-first with one breakpoint, and the nav is `position: fixed`.**
There is exactly one `@media (min-width: 900px)` block and no `max-width` query. The
declarations below are fixed, because the AC3 test reads them:

- Outside any media query: `.app-nav` has `position: fixed; left: 0; right: 0;
  bottom: 0;` and no `top`. `body` has a `padding-bottom` built from
  `var(--nav-height)`, so the bar never covers the end of a page.
- Inside the wide block: `.app-nav` has `top: 0; right: auto; width: var(--nav-width);
  flex-direction: column;`. `body` has `padding-left: var(--nav-width)` and
  `padding-bottom: 0`.

In the DOM the order is site header, nav, main. The Add link is the third of the five
links. On the tab bar it is a round accent button raised above the bar; its text label
stays in the DOM and is hidden with the clip technique, never `display: none`, so "Add"
remains its accessible name. In the sidebar the label is shown.

900px keeps phones, including large ones held sideways, on the tab bar. Rejected: a CSS
grid on `body` with the nav as a grid area (a fixed overlay, sheet or toast then has to
know about the grid; fixed positioning plus body padding does not interact with them).
Safe-area insets are left to job 017, which owns `viewport-fit`.

Page background: `body` is `var(--surface)` on narrow screens and `.page` is a plain
padded column, as in the mockups, where the phone screen is the surface and cards are
`--surface-2`. In the wide block `body` becomes `var(--bg)` and `.page` gets the
surface background, border and radius it has today.

**D7. Nav items come from `src/ui.ts`; the current one is named by the route.**
`navItems` is the ordered list (`today` `/`, `timeline` `/timeline`, `add` `/add`,
`tasks` `/tasks`, `more` `/more`), each with a label and a text glyph from the mockups
(`◉ ▤ + ☰ ⋯`, wrapped in `aria-hidden="true"`). `PageLocals` gains `nav?: NavId`. A
route that belongs to a nav item passes it: the home route passes `nav: 'today'`. The
nav partial puts `aria-current="page"` on the item whose id equals `nav`, and on none
when `nav` is absent.

Two readings follow. The not-found page and the style guide pass no `nav`, so no link
is marked on them, including when `/timeline` answers 404: the page shown is not the
Timeline page. And adding `nav: 'today'` to the `renderPage` call in
`src/routes/home.ts` is not a change to the scaffold's routes in the sense of Out of
scope: the URL, status and view are the same.

Rejected: marking the link whose `href` equals `req.path`. It needs no route edit, but
it marks "Timeline" on a 404 page, and it cannot place `/overdue`, `/review/:id` or
`/settings` under a nav item when later jobs add them.

**D8. The theme script is inline in `<head>`, before the stylesheet link.**
`src/views/partials/theme-script.ejs` holds one classic `<script>` (no `src`, `defer`,
`async` or `type`). The layout includes it before `<link rel="stylesheet">`, so it never
waits for the stylesheet. It does two things:

1. Reads `localStorage.getItem('theme')`. If the value is exactly `light` or `dark`, it
   sets `data-theme` on `document.documentElement`. Any other value is ignored.
2. Adds one `click` listener on `document`. A click on, or inside, an element with the
   attribute `data-theme-toggle` works out the theme in effect (the `data-theme`
   attribute if set, otherwise `prefers-color-scheme` through `window.matchMedia`, when
   that function exists), sets `data-theme` to the other one and saves it under the key
   `theme`.

Every `localStorage` call is inside `try`/`catch`: with storage blocked the toggle still
switches the theme for that page. The server never writes `data-theme`; `<html lang="en">`
is unchanged. The script must not contain the text `<html` or `<main` (the 001 tests
count and search for them) or the EJS opener `<%`.

The storage key `theme` and the values `light` / `dark` are a contract for job 022.

The listener is delegated from `document` because the script runs before `<body>`
exists (checked: `document.body` is `null` when it runs, and a later click on the
button is handled).

Rejected: `<script src="/js/theme.js">` in `<head>` (a second render-blocking request on
every navigation; with `defer` the saved theme would be applied after first paint and
break AC4); the mockup's script at the end of `<body>` (flashes the wrong theme). If a
Content-Security-Policy is added later, this script gets a hash.

**D9. The theme toggle is the button partial.** The layout renders it as a ghost button
with the label `Toggle theme` and `attrs: { 'data-theme-toggle': '' }`, inside the site
header after the app-name link. It gets its 44px height from `.btn`. The header element
keeps `class="site-header"` as its only class: the 001 tests match that exact attribute.

**D10. How partials take their input.** Checked with EJS 7.0.1: an included partial
sees every local of the page, so a partial that reads an optional `title` gets the
page's `title` when the caller leaves it out. Therefore:

- Each component partial reads exactly one local: an object named after its file in
  camelCase (`button`, `pageHeader`, `priorityBadge`, ...). The caller always passes it:
  `<%- include('../partials/button', { button: { label: 'Start' } }) %>`. Leaving it out
  is a `ReferenceError` and a 500, not a silently wrong page (checked).
- Fields named `body` and `actions` are HTML and are written with `<%- %>`. Every other
  field is text and is written with `<%= %>`. User text must never be put into `body` or
  `actions` unless it went through a template that escaped it.
- Content for a container is built by the caller: `body: include('../partials/...')` or
  a short literal. EJS has no slots, and a callback whose body is template markup does
  not compile (checked).
- A component partial never includes another component partial. That keeps one
  partial's object from leaking into another.
- Bad input fails loudly: an unknown priority, slot or button variant, or a dialog
  without `id` or `heading`, throws.

The shell partials (`nav`, `theme-script`) are not components. They take no include
data; `nav` reads `ui.navItems` and the page's `nav` local.

Rejected: flat parameters (`{ label, variant }`) with a list of reserved names. `title`
is on every page, and `id` or `href` would collide the first time one partial sits
inside another.

The partials and their fields (`?` marks an optional field):

| Partial | Local | Fields | Root element |
|---|---|---|---|
| `page-header` | `pageHeader` | `heading`, `sub?`, `actions?` | `<header class="page-header">` with a bare `<h1>` |
| `button` | `button` | `label`, `variant?` (`primary` default, or `ghost`), `href?`, `type?` (`button` default), `attrs?` | `<button class="btn">`, or `<a class="btn">` when `href` is set; `btn--ghost` for ghost |
| `priority-badge` | `priorityBadge` | `priority` | `<span class="badge badge--<id>">` |
| `slot-badge` | `slotBadge` | `slot` | `<span class="badge badge--slot-<id>">` |
| `chip` | `chip` | `label`, `selected?`, `tone?` (a priority id) | `<span class="chip">`, plus `chip--on` and `chip--<tone>` |
| `card` | `card` | `body` | `<div class="card">` |
| `modal` | `modal` | `id`, `heading`, `body`, `actions?`, `open?` | `<div class="overlay overlay--modal">` around `<div class="modal" role="dialog">` |
| `bottom-sheet` | `bottomSheet` | `id`, `heading`, `body`, `actions?`, `open?` | `<div class="overlay overlay--sheet">` around `<div class="sheet" role="dialog">` |
| `toast` | `toast` | `message`, `actions?` | `<div class="toast-region" aria-live="polite">` around `<div class="toast">` |
| `empty-state` | `emptyState` | `heading`, `text?`, `actions?` | `<div class="empty-state">` |
| `skeleton` | `skeleton` | `lines?` (3), `label?` (`Loading`) | `<div class="skeleton">` |

`attrs` on the button is an object of extra attributes written as `name="value"` with
the value escaped (checked). The names are written by developers, never taken from a
request. It is what lets the theme toggle, and later a form button, be this partial.

The page header's `<h1>` has no attributes and is styled through `.page-header h1`, so a
page can adopt the partial later without breaking the 001 test that looks for the exact
text `<h1>Today</h1>`.

**D11. Badges carry their name as text, from one table.** `src/ui.ts` holds
`priorities` (`urgent` Urgent ▲, `high` High ●, `medium` Medium ■, `low` Low ▼) and
`slots` (`morning` Morning, `afternoon` Afternoon, `evening` Evening, `night` Night),
with lookups `priority(id)` and `slot(id)` that throw on an unknown id. The badge
partials call the lookup, so a badge either shows its label or the render fails; there is
no path to a colored badge without a name. The glyph of a priority badge is wrapped in
`aria-hidden="true"` and the label follows it as text.

**D12. Modal and bottom sheet are `<div role="dialog" aria-modal="true">`, not
`<dialog>`.** Each has `aria-labelledby="<id>-title"` pointing at its `<h2
id="<id>-title">`. The outer `.overlay` carries `id="<id>"` and is the backdrop
(`position: fixed; inset: 0; background: var(--scrim)`). It has the `hidden` attribute
unless `open` is true. Because `.overlay` sets `display`, the stylesheet needs
`[hidden] { display: none !important; }`, or a closed dialog would show. Opening,
closing, focus and Escape belong to the jobs named in the spec.

Rejected: the native `<dialog>` element. Shown with the `open` attribute and without
`showModal()` it has no backdrop and is placed by browser rules, so the style guide
could not show what a user will see; `::backdrop` also cannot read `:root` variables in
Safari before 17.4. A job that adds the behavior may revisit this.

**D13. The toast partial renders its own live region.** AC6 then holds wherever the
partial is used. The layout gets no toast region in this job: showing a toast is out of
scope, and job 006 decides how one reaches the page. The toast uses the inverted pair
`background: var(--text); color: var(--bg)`, so it needs no new token.

**D14. The style-guide page.**

- `src/routes/styleguide.ts` exports `styleguideRouter`; `GET /_styleguide` calls
  `renderPage(res, 'styleguide', { title: 'Style guide' })`. It is mounted after the
  home router and is not switched off by any environment setting: the spec asks for a
  200.
- The page opens with `<h1>Style guide</h1>`. Every block after it is a
  `<section class="sg-section">` whose first child is an `<h2>`. Sections are never
  nested and no partial emits a `<section>`, so a test can find a component by its
  section.
- Component sections, with these exact headings: `Page header`, `Button`,
  `Priority badge`, `Slot badge`, `Chip`, `Card`, `Modal`, `Bottom sheet`, `Toast`,
  `Empty state`, `Skeleton loader`. Button shows primary and ghost. The badge sections
  loop over `ui.priorities` and `ui.slots`. Modal and bottom sheet are rendered with
  `open: true` and ids `sg-modal` and `sg-sheet`.
- Before them, token sections (`Colors`, `Type scale`, `Spacing`, `Radii`), because the
  Goal says the tokens are shown on the page too. Swatches are the only place an inline
  `style` attribute is allowed, and its value may only reference tokens, such as
  `style="background: var(--urgent-bg)"`.
- The modal, bottom sheet and toast each sit inside `<div class="sg-stage">`. The stage
  has `position: relative; overflow: hidden; transform: translateZ(0)` and a fixed
  height; a transformed element is the containing block of its `position: fixed`
  descendants, so the real component CSS is shown, boxed. No style-guide-only variant of
  a component exists.
- The page header demo puts a second `<h1>` on this page. Accepted: it is the real
  partial, on a page only developers open.
- Style-guide classes start with `sg-` and live at the end of `base.css` (D3).

**D15. `home.ejs` and `not-found.ejs` are not edited.** AC7 needs them in the new
layout, which they get from `layout.ejs`. Job 014 rebuilds the home page.

**D16. Tests use jsdom with a hand-written type declaration, and a small CSS parser.**

- jsdom 30.1.1 is already in `devDependencies` and ships no types. Add
  `src/testing/jsdom.d.ts` with `declare module 'jsdom'` covering only what the tests
  call (`JSDOM`, its `window`, and a minimal element, document and storage interface).
  Checked: `tsc --noEmit` passes with the repo's `tsconfig.json`, and Vitest runs the
  tests. Rejected: `@types/jsdom` 30.0.0. Its first line is
  `/// <reference lib="dom" />`, which would put `document` and `window` into the type
  program of all of `src/`, undoing 001's rule that `src/` is checked as Node code with
  no DOM library. Rejected: the `// @vitest-environment jsdom` docblock, for the same
  missing types. No dependency is added or removed in this job.
- The theme script is tested by giving jsdom the real rendered page with
  `runScripts: 'dangerously'` and `url: 'http://localhost/'`, seeding `localStorage`
  and `matchMedia` in `beforeParse`. jsdom has no `matchMedia` of its own, which is why
  D8 says "when that function exists". External resources are not loaded.
- CSS is parsed by `src/testing/css.ts`: comments stripped, then a flat list of
  `{ selector, at, declarations }`, where `at` is the enclosing `@media` or `@keyframes`
  prelude or `null`. It has its own small test so that a parser that returns nothing
  cannot make the guards pass by default. Rejected: jsdom's CSSOM, which rewrites or
  drops values it does not understand.
- Partials are rendered alone with `createApp().render('partials/<name>', locals, cb)`,
  which goes through the configured view engine and `app.locals`.
- `src/app.test.ts`, `src/config.test.ts`, `src/server.test.ts` and
  `src/project.test.ts` are not edited. New tests go in new files.

## Files

Created:

- `src/ui.ts`: `navItems`, `priorities`, `slots` (each `as const`), the types `NavId`,
  `Priority`, `Slot`, the lookups `priority(id: string)` and `slot(id: string)` that
  throw on an unknown id, and `ui`, the object holding all five for the views.
- `src/routes/styleguide.ts`: `styleguideRouter` (D14).
- `src/views/partials/theme-script.ejs`: the inline script (D8).
- `src/views/partials/nav.ejs`: `<nav class="app-nav" aria-label="Main">` with one
  `<a class="app-nav__link" href="...">` per item, each holding
  `<span class="app-nav__icon" aria-hidden="true">` and `<span class="app-nav__label">`.
  The Add item also has `app-nav__link--add`. `aria-current="page"` per D7.
- `src/views/partials/page-header.ejs`, `button.ejs`, `priority-badge.ejs`,
  `slot-badge.ejs`, `chip.ejs`, `card.ejs`, `modal.ejs`, `bottom-sheet.ejs`,
  `toast.ejs`, `empty-state.ejs`, `skeleton.ejs`: as in the D10 table, with D11, D12 and
  D13.
- `src/views/pages/styleguide.ejs`: D14.
- `src/testing/jsdom.d.ts`, `src/testing/dom.ts`, `src/testing/css.ts`,
  `src/testing/page.ts`: test support (D16). `dom.ts` exports `parseHtml(html)` and
  `openPage(html, { savedTheme?, systemDark?, storageThrows? })`. `css.ts` exports
  `parseCss(css)` and helpers to find a rule by selector and `at`. `page.ts` exports
  `getPage(path)` (status, html, parsed document), `getStylesheet()` (the href is read
  from the layout, as 001 does) and `renderView(view, locals)`.
- `src/testing/css.test.ts`, `src/ui.test.ts`, `src/stylesheet.test.ts`,
  `src/shell.test.ts`, `src/components.test.ts`: see `plan.md`.

Changed:

- `public/css/base.css`: rewritten in the sections of D3. The `:root` block per D1 and
  D4, the two dark blocks, `[hidden]`, `.visually-hidden`, the shell (D6), every
  component class in the D10 table, `.sg-*`, the wide block, and a
  `prefers-reduced-motion: reduce` rule that stops the skeleton animation. Existing
  rules (`body`, `a`, `.site-header`, `.page`, `h1`, `.muted`) are kept and moved onto
  tokens. `.btn` and `.app-nav__link` each declare `min-height: var(--touch-target)` in
  the same rule as a `display` of `flex` or `inline-flex`; `min-height` does nothing on
  an inline element.
- `src/views/layout.ejs`: include `partials/theme-script` before the stylesheet link;
  the site header keeps the app-name link and gains the toggle (D9); include
  `partials/nav` between the header and `<main class="page">`. The `<html>`, `<title>`
  and `<link rel="stylesheet" href="/css/base.css">` lines stay as they are.
- `src/app.ts`: `app.locals.ui = ui`; mount `styleguideRouter` after `homeRouter`.
- `src/render.ts`: `PageLocals` gains `nav?: NavId` (a type-only import from `./ui.ts`).
- `src/routes/home.ts`: the `renderPage` call passes `nav: 'today'`.

Not touched: `home.ejs`, `not-found.ejs`, the four 001 test files, `package.json`,
`yarn.lock`, `tsconfig.json`, `vitest.config.ts`, `CLAUDE.md`, `docs/`, and everything
under `factory/` except this job's `build.md`.

## Risks

- **A dark block gets a hex value, or a rule gets a literal color.** The 001 test "has no
  color literal outside :root" fails, and so does the AC2 test in
  `src/stylesheet.test.ts`, which also covers named colors and the newer color functions.
- **A color token is added without a dark value.** The AC2 test derives the list of color
  tokens from the `--light-*` names and requires each in both dark blocks, and requires
  every literal in `:root` to belong to a `--light-*` or `--dark-*` name.
- **The two dark blocks drift apart.** The AC2 test requires them to hold the same
  declarations.
- **Token values drift from the mockups.** A test in `src/stylesheet.test.ts` reads the
  `<style>` of `docs/mockUps.html` and compares the 20 colors, both themes, and the two
  radii. If the mockups are changed on purpose later, this test is the reminder to
  change the tokens with them.
- **A closed modal shows because `.overlay` overrides `hidden`.** A stylesheet test
  requires the `[hidden]` rule with `display: none !important`; a component test checks
  that a dialog rendered without `open` has the `hidden` attribute.
- **A partial picks up a page local, or one partial's object leaks into another.** D10
  prevents it by construction. `src/components.test.ts` renders each partial alone
  through `renderView` with a page-level `title` set and checks that it does not appear.
- **The theme script throws when storage is blocked and takes the toggle with it.** The
  AC4 test with `storageThrows` clicks the toggle and expects `data-theme` to change.
- **The script is moved out of `<head>`, or made `defer`, and the theme flashes.** The
  AC4 test asserts where the script is and which attributes it lacks. The flash itself
  is a by-hand check.
- **The layout change breaks a 001 test.** Those tests match `class="site-header"`
  exactly, the first `<link rel="stylesheet" href=...>`, one `<html`, and
  `<h1>Today</h1>` inside `<main>`. `yarn test` runs them unedited.
- **A second `<nav>` appears on some page** (a component demo, a later page). The AC3
  test counts navigation landmarks on the home page, the not-found page and the style
  guide.
- **`min-height` has no effect because the element is inline.** The AC6 stylesheet test
  requires the `display` in the same rule.
- **Later CSS brings in off-scale sizes.** The three token-use guards in D4 fail on a
  literal font size, an off-scale radius or a `px` in padding, margin or gap.
- **The plain-Node runtime cannot load the new modules** (a missing `.ts` extension in
  `app.ts` or `render.ts`). The 001 test in `src/project.test.ts` and `yarn build`
  catch it.
- **Layout on a real screen is wrong although the declarations are right** (the bar
  covers content, a stage does not contain its overlay, the sidebar overlaps the
  header). No test can see this. The builder lists it under Not done as a by-hand check:
  the style guide at 375px and 1200px wide, in both themes, and a reload with a saved
  theme.
- **Contrast of the mockup colors** (for example urgent text on its tint in the light
  theme) is not checked here. The spec takes the values from the mockups, and job 023
  owns the contrast check.
