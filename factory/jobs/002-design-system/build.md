# 002-design-system: build

Branch `factory/002-design-system`, commit `87be91a`. Built on Node 25.4.0, yarn 1.22.22,
with the versions already in `package.json` (EJS 7.0.1, jsdom 30.1.1, Vitest 5.0.1,
TypeScript 5.9.3). No dependency was added or changed.

## What changed

Changed:

| File | Why |
|---|---|
| `public/css/base.css` | Rewritten in the sections of D3. The plain `:root` block holds the palette (`--light-X`, `--dark-X`, and `--X: var(--light-X)` for 22 color tokens), the type scale, the spacing scale, the two radii, the sizes and the layers. The two dark blocks re-point every color token and hold no literal (D1). Then base elements, `[hidden]`, `.visually-hidden`, the shell (tab bar, body padding), every component class, the `sg-` classes, the one `@media (min-width: 900px)` block (sidebar, D6) and the reduced-motion rule. The old rules (`body`, `a`, `.site-header`, `.page`, `h1`, `.muted`) are kept, on tokens. |
| `src/views/layout.ejs` | Includes `partials/theme-script` before the stylesheet link (D8), the theme toggle in the site header through the button partial (D9), and `partials/nav` between the header and `<main>`. The `<html>`, `<title>` and stylesheet lines are unchanged. |
| `src/app.ts` | `app.locals.ui = ui`; mounts `styleguideRouter` after `homeRouter`. |
| `src/render.ts` | `PageLocals` gains `nav?: NavId` (type-only import). |
| `src/routes/home.ts` | The `renderPage` call passes `nav: 'today'` (D7). |

Created:

| File | Why |
|---|---|
| `src/ui.ts` | `navItems`, `priorities`, `slots` (`as const`), the types `NavId`, `Priority`, `Slot`, the lookups `priority(id)` and `slot(id)` that throw on an unknown id, and `ui` holding all five (D7, D11). |
| `src/routes/styleguide.ts` | `styleguideRouter`: `GET /_styleguide` renders the `styleguide` page (D14). |
| `src/views/partials/theme-script.ejs` | The inline classic script: applies a saved `light` or `dark` theme, and one delegated click listener for `[data-theme-toggle]`. Every `localStorage` call is in `try`/`catch` (D8). |
| `src/views/partials/nav.ejs` | `<nav class="app-nav" aria-label="Main">` with the five links from `ui.navItems`; `aria-current="page"` on the item whose id equals the page's `nav` local. |
| `src/views/partials/page-header.ejs`, `button.ejs`, `priority-badge.ejs`, `slot-badge.ejs`, `chip.ejs`, `card.ejs`, `modal.ejs`, `bottom-sheet.ejs`, `toast.ejs`, `empty-state.ejs`, `skeleton.ejs` | The eleven component partials of the D10 table. Each reads one object named after its file. `body` and `actions` are written as HTML, every other field escaped. Badges go through the `ui` lookups (D11); the dialogs are `role="dialog" aria-modal="true"` named by their `<h2>` and hidden unless `open` (D12); the toast brings its `aria-live="polite"` region (D13). |
| `src/views/pages/styleguide.ejs` | The token sections (Colors, Type scale, Spacing, Radii) and one section per component, each a `section.sg-section` opening with its `<h2>`; modal, bottom sheet and toast inside `.sg-stage` (D14). |
| `src/testing/jsdom.d.ts` | `declare module 'jsdom'` with only what the tests call, so no DOM library enters the type program (D16). |
| `src/testing/dom.ts` | `parseHtml`, `openPage(html, { savedTheme?, systemDark?, storageThrows? })`, `scriptErrors(window)`, and the small helpers `all`, `one`, `textOf`, `visibleText`. |
| `src/testing/css.ts` | `parseCss` (flat list of `{ selector, selectors, at, declarations }`), `stripComments`, `findRule`, `findRules`, `valueOf`, `declarationsOf`. Throws on CSS it cannot read. |
| `src/testing/page.ts` | `getPage(path)`, `getStylesheet()` (href read from the home page), `renderView(view, locals)` through `app.render`. |
| `src/testing/css.test.ts`, `src/ui.test.ts`, `src/stylesheet.test.ts`, `src/shell.test.ts`, `src/components.test.ts` | The tests in the table below. |
| `docs/errors/jsdom-page-script-error-does-not-fail-test.md` | Error log entry (see Not done, point 3). |

Not touched, checked with the command of plan step 9, which printed nothing:
`src/app.test.ts`, `src/config.test.ts`, `src/server.test.ts`, `src/project.test.ts`,
`home.ejs`, `not-found.ejs`, `package.json`, `yarn.lock`, `tsconfig.json`. `CLAUDE.md` is
unchanged too: the language and the commands are the same.

## Acceptance criteria

Every row was also checked the other way. A script copied the repo to a scratch folder,
made one change that breaks the behaviour, and ran the five new test files; it did this
for 89 changes, one at a time. The "Fails when" column names the ones that belong to the
row. All 89 made at least one test fail. One did not at first (see Not done, point 3).

| Criterion | Test | Fails when | Result |
|---|---|---|---|
| AC1: four priority colors, each with a tint | `src/stylesheet.test.ts` > tokens on :root (AC1) > declares the four priority colors, each with a background tint | the `--urgent-bg` line removed | PASS |
| AC1: four slot tints | same > declares the four slot tints | `--slot-night` removed | PASS |
| AC1: a second surface color | same > declares a second surface color that differs from the first | `--light-surface-2` set to the value of `--light-surface` | PASS |
| AC1: one type scale | same > declares one type scale, in rem, from small to large; rules use the tokens (AC1) > takes every font size from the type scale | a size written in px; `--font-size-lg` made smaller than `-md`; `h1 { font-size: 22px }` | PASS |
| AC1: spacing in steps of 4px | tokens on :root (AC1) > declares a spacing scale in steps of 4px; rules use the tokens (AC1) > writes no px length in a margin, a padding or a gap | `--space-3: 14px`; `.card { padding: 12px }` | PASS |
| AC1: two corner radii | tokens on :root (AC1) > declares exactly two corner radii; rules use the tokens (AC1) > takes every corner radius from the two radii, a pill or a circle | a `--radius-pill` token added; `border-radius: 6px` in a rule | PASS |
| AC1: declared on `:root`, values from the mockups | tokens on :root (AC1) > declares each token once; > keeps the colors and radii of the mockups | `--dark-high` changed by one digit | PASS |
| AC2: every color token redefined under `:root[data-theme="dark"]` | `src/stylesheet.test.ts` > dark theme (AC2) > has a color token for each mockup color, the scrim and the shadow; > gives every color token a light value, a dark value and an alias to the light one; > has no dark palette entry without a light one; > redefines every color token under :root[data-theme="dark"] | `--muted` removed from that block; a color token added without a dark value | PASS |
| AC2: and under `prefers-color-scheme: dark` for a root not set to light | same > redefines the same under prefers-color-scheme: dark for a root not set to light; > has each token block once | the media block removed; its selector changed; `--muted` removed from it | PASS |
| AC2: no color literal outside the token blocks | same > holds no color literal in any rule outside :root; > writes color literals in the palette only; > declares custom properties in the three token blocks only; > recognises a color literal when it sees one; rules use the tokens (AC1) > never reaches past a token for a palette entry; and the two unedited 001 tests in `src/app.test.ts` | `background: transparent`, `color: gray` and `color-mix(...)` in a rule; a hex value in a dark block; a literal token outside the palette; a custom property in `.card` | PASS |
| AC3: one navigation landmark on every page | `src/shell.test.ts` > navigation (AC3) > `<path>` has one named navigation landmark (for `/`, `/no-such-page`, `/_styleguide`); > sits between the site header and the main content | nav written as a `<div>`; its `aria-label` removed; a second `<nav>` on the style guide; the include removed from the layout | PASS |
| AC3: links to Today, Timeline, Tasks, More, with Add in the middle | same > `<path>` links to Today, Timeline, Add, Tasks and More, with Add in the middle; > names every link by its label alone; `src/ui.test.ts` > navigation items (AC3) | Add and Tasks swapped in `ui.ts` | PASS |
| AC3: the current page's link carries `aria-current="page"` | `src/shell.test.ts` > navigation (AC3) > marks Today as the current page on the home page, and nothing else; > marks exactly the `<id>` link when the page names it (five ids); > marks no link when the page names none; > marks no link as current on `<path>` | the attribute removed from the partial; put on every link; `nav: 'today'` removed from the home route | PASS |
| AC3: bottom tab bar on narrow screens, sidebar on wide ones | `src/stylesheet.test.ts` > navigation layout (AC3) > all five tests | `bottom: 0` replaced by `top: 0`; `flex-direction: column` removed from the wide block; body `padding-bottom` removed; the query turned into `max-width`; `display: none` on the Add label | PASS (declarations; see Not done, point 1, for the screen) |
| AC4: the layout has a theme toggle | `src/shell.test.ts` > theme toggle (AC4) > is one button with a text label, in the site header | `data-theme-toggle` removed from the layout | PASS |
| AC4: using it sets `data-theme` and saves the choice | same > switches a light system to dark, saves it, and switches back on the next click; > treats a browser without matchMedia as a light system; > switches a dark system to light on the first click; > switches a saved dark theme to light and saves that; > switches a saved light theme to dark on a dark system; > answers a click on an element inside the toggle; > leaves the theme alone on a click anywhere else; > still switches the theme for the page when storage is blocked | `setItem` removed; the system setting ignored; `closest` replaced by a check of the target only; the toggle check removed; either `try`/`catch` removed; the `matchMedia` existence check removed | PASS |
| AC4: a saved choice is applied before first paint | same > applies a saved "dark" / "light" theme while the page loads; > has applied the saved theme by the time the body is parsed; > has its script inline in the head, before the stylesheet link; > keeps out of the script the text that page-level checks search for | the apply line removed; `defer` added; the script moved after the stylesheet link; moved to the end of `<body>` | PASS (see Not done, point 1) |
| AC4: with nothing saved no `data-theme` is set | same > is rendered by the server without a theme on the root element; > sets no theme when nothing is saved, so the system setting decides; > ignores a saved value of "purple" / "" / "DARK" / "dark " | `data-theme` written by the layout; any saved value applied | PASS |
| AC5: a partial for each of the eleven components | `src/components.test.ts` > component partials (AC5) > has the eleven components the spec lists; > `<name>` exists as a partial file; > `<name>` renders from its own object; > `<name>` rejects when its object is left out; > `<name>` does not pick up a local of the page; > `<name>` includes no other partial; > `<name>` emits no section and no navigation landmark; and the describes button, page header, chip, card, empty state, skeleton | `skeleton.ejs` deleted; the button made to ignore `variant`, accept any variant, write its label or an attribute value unescaped; the chip made to read a flat `label`; the page header made to read the page `title`; the skeleton made to ignore `lines` | PASS |
| AC5: `GET /_styleguide` is 200 and renders each under a heading that names it | `src/components.test.ts` > GET /_styleguide (AC5, AC6) > returns 200 with an HTML page; > renders inside the layout; > includes the `<name>` partial, not a copy of its markup; > opens every section with its own heading, and nests none; > shows `<heading>` under a heading that names it (eleven headings); > shows the modal and the bottom sheet open, each inside a stage; > shows the toast inside a stage; > uses inline styles only to point one property at a declared token; > shows a swatch for every color token; > shows the `<heading>` tokens in a section | the router not mounted; the Toast section removed; a heading renamed; the ghost button removed; the card written as copied markup; the modal rendered closed; the toast taken out of its stage; a literal inline style | PASS |
| AC5: badges in all four priorities and all four slots | same > shows the badges in all four priorities and all four slots, each with its name | the loop cut to three priorities; to three slots | PASS |
| AC6: a badge always shows its name as text | `src/components.test.ts` > badges show their name as text (AC6) > the `<id>` badge reads "`<label>`" (eight cases); > renders no badge for an unknown priority or slot; GET /_styleguide > gives every badge on the page a name as text; `src/ui.test.ts` > priorities and slots (AC5, AC6) | the label removed from either badge; the label moved inside the `aria-hidden` span; the lookup made to fall back instead of throwing | PASS |
| AC6: modal and bottom sheet have `role="dialog"` and an accessible name | `src/components.test.ts` > modal is a named dialog (AC6) and > bottom-sheet is a named dialog (AC6), five tests each; GET /_styleguide > gives every dialog an accessible name; > gives no two elements the same id | `role` removed; `aria-labelledby` removed; the heading's id changed; `hidden` always or never written; the id check removed | PASS |
| AC6: the toast sits in an `aria-live` region | `src/components.test.ts` > toast (AC6) > sits in a polite live region and holds its message; > escapes its message and writes its actions as HTML; GET /_styleguide > puts every toast in a live region | `aria-live` removed | PASS |
| AC6: buttons, navigation links and the theme toggle are at least 44px high | `src/stylesheet.test.ts` > touch targets and hidden elements (AC6) > sets the touch target to 44px; > gives .btn / .app-nav__link a minimum height of 44px that takes effect; > lets no other rule lower the minimum height of a button or a navigation link; > gives the app-name link in the header the same minimum height; `src/shell.test.ts` > touch targets in the shell (AC6) > `<path>` builds its nav links, toggle and buttons from the 44px classes | `min-height` removed from `.btn`; from `.app-nav__link`; `.btn` made `display: inline`; the token set to 40px; `min-height: 0` on `.btn--ghost`; the toggle written without the `btn` class; the nav link class renamed | PASS |
| AC6 (support): a closed dialog stays hidden; hidden text stays readable | `src/stylesheet.test.ts` > touch targets and hidden elements (AC6) > makes the hidden attribute win over a component that sets display; > has a visually-hidden utility that keeps text for screen readers; > stops the skeleton animation for people who ask for reduced motion | the `[hidden]` rule removed | PASS |
| AC7: home and not-found still render in the layout, with the navigation | `src/shell.test.ts` > existing pages in the new layout (AC7) > renders the home page in the layout, with the navigation; > renders the not-found page in the layout, with the navigation; > `<path>` answers with the not-found page until its job builds it (`/timeline`, `/tasks`, `/more`, `/add`) | the nav include removed from the layout; a `/tasks` route added | PASS |
| AC7: the existing tests still pass | `src/app.test.ts` (11), `src/config.test.ts` (14), `src/server.test.ts` (7), `src/project.test.ts` (5), unedited | see the run below | PASS |

Other tests: `src/testing/css.test.ts` (12) proves the parser returns what is in the file
and throws on what it cannot read, so the stylesheet guards cannot pass on an empty
result. `src/stylesheet.test.ts` > component classes (4) checks that every class the
partials use has a rule, that each badge class takes its own token, and the stage and
overlay declarations of D12 and D14. `src/ui.test.ts` > ui (2) checks `app.locals.ui`.

## Test run

`yarn test`:

```
$ vitest run

 RUN  v5.0.1 /Users/hamza/Documents/mTask


 Test Files  9 passed (9)
      Tests  291 passed (291)
   Start at  15:10:02
   Duration  1.48s (import 56%, tests 30%, transform 13%, worker 1%)

Done in 2.20s.
```

Per file: `app` 11, `config` 14, `server` 7, `project` 5 (the 37 tests of job 001),
`testing/css` 12, `ui` 8, `stylesheet` 39, `shell` 46, `components` 149. Nothing skipped.

`yarn build`:

```
$ tsc --noEmit
Done in 1.75s.
```

Plan step 9,
`git diff --stat main -- src/app.test.ts src/config.test.ts src/server.test.ts src/project.test.ts src/views/pages/home.ejs src/views/pages/not-found.ejs package.json yarn.lock tsconfig.json`,
printed nothing.

```
VERIFICATION
Build: PASS
Tests: PASS   (291 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

Lint is skipped because Project facts lists no lint command. Diff: every changed file is
in the tables above; no debug output, `.only`, `.skip`, TODO, secret or machine path in
the diff (the one `console.log` under `src/` is job 001's start-up line in `server.ts`).

## Not done

Nothing in the spec was skipped. What follows is what was checked outside the test
suite, what I added that the design does not name, and what I settled where the design
left a choice.

**1. The by-hand checks of the plan.** No person looked at a screen. I drove headless
Chrome 150 through its DevTools protocol against a real listener (`PORT=4317 node
src/server.ts`), measured the layout with `getBoundingClientRect` and `getComputedStyle`,
and read the screenshots. Width 375 was a 375x812 mobile viewport, width 1200 a 1200x900
one. The system theme was set with DevTools media emulation, not in macOS settings.

| Check | Looked at | What was seen |
|---|---|---|
| `/_styleguide` at 375px: tab bar at the bottom | yes, headless Chrome | nav is `position: fixed`, row, at y 748 to 812, full width; links 73x44 each; no horizontal scroll |
| Add raised in the middle | yes | third link, 52x52, round, accent background, top at y 745 (3px above the bar's top edge, 14px above the other links); its label is a 1x1 box, not `display: none` |
| last section not covered by the bar | yes | scrolled to the end: the last section ends at y 708, the bar starts at 748 and the Add button at 745 |
| the same page at 1200px: sidebar, content beside it | yes | nav at x 0 to 220, full height, column; site header starts at x 220; `main` is 720 wide, centered in the rest; Add shows its label, 195x44, radius 8px |
| both themes through the toggle, every component readable | partly | a real mouse click on the toggle set `data-theme="dark"` and saved `dark`; a second click gave `light`. Computed colors of the body, nav, badges, chips and toast changed to the dark values at both widths, and I read the full-page screenshots of both themes at both widths: all text is legible to me in them. No contrast ratio was measured (job 023 owns that) |
| a reload with a saved theme shows no flash | not by eye | after a reload with `dark` saved, `data-theme` was already `dark` at the first animation frame, which runs before the first paint. Nobody watched a reload |
| modal, bottom sheet and toast stay inside their stages | yes | at both widths and in both themes the rectangles of `.overlay`, `.modal`, `.sheet`, `.toast-region` and `.toast` lie inside their `.sg-stage` |
| system dark with nothing saved | yes (emulated) | no `data-theme`, dark colors applied; the first click on the toggle gave `light` and a light page |
| home page and `/timeline` at 375px | yes | home: Today is in the accent color and bold; `/timeline`: the not-found page, no link marked |

Not looked at: Safari and Firefox, a real phone, a real touch, and the page with the
browser's font size changed.

**2. Added beyond what the design names.** Each is small and has a test unless noted.

- `.site-header a` (the app-name link) is `inline-flex` with the 44px minimum height. AC6
  names navigation links; this link is outside the landmark but is the way back to
  Today on a phone.
- A `:focus-visible` outline in the accent color, and `h2 { font-size }` from the scale.
  No test for the outline.
- The button partial throws on an attribute name that is not a plain lowercase name
  (`[a-z][a-z0-9-]*`). D10 says the names are written by developers; `<%= %>` escapes a
  name but cannot stop a space in it from starting a second attribute.
- `.toast .btn` takes the toast's colors. A ghost button is `--text` on a toast that is
  `--text`, so without it an Undo button would be invisible.
- The skeleton has `role="status"` and its label in a `.visually-hidden` span; the bars
  are `aria-hidden`. The empty state's heading is an `<h2>`.
- The style guide also shows a link styled as a button, and a toast with an Undo button.
- `src/testing/dom.ts` exports `scriptErrors`, `all`, `one`, `textOf` and `visibleText`
  besides the two functions of D16, and `css.ts` exports `stripComments`, `findRules`,
  `valueOf` and `declarationsOf`. `openPage`'s `systemDark` has three states: left out
  means the window has no `matchMedia` (how jsdom comes), `false` and `true` define it.
- Tests the plan does not list: the nav sits between header and main; each nav link is
  named by its label alone; the saved theme is on the root by the time `<body>` is
  parsed; a click elsewhere changes nothing; no partial includes another; no inline
  style outside the style guide; every color token has a swatch; no duplicate id on the
  style guide.

**3. An error log entry under `docs/`, which the design lists as not touched.** The
mutation run found one change no test caught: with the `try`/`catch` around
`localStorage.setItem` removed, the click handler still set `data-theme` and then threw,
and jsdom reported the exception to its own console only. `openPage` now records the
`error` events of the page's window, and `src/shell.test.ts` fails any test whose page
threw. The builder rules ask for a log entry for an error that needed a fix, so
`docs/errors/jsdom-page-script-error-does-not-fail-test.md` is in the commit. No other
error came up during the build, and the three existing entries did not apply.

**4. Choices where the design left room.**

- `Priority` and `Slot` are the unions of ids (`'urgent' | ...`), like `NavId`. The
  lookups return the whole entry.
- A selected chip without a tone uses `--border` for its background and its border. D2
  asks for the border to match the background; `--surface-2` for both would vanish on a
  card, which is `--surface-2`.
- On wide screens the toast region only moves down (`bottom: var(--space-6)`); it stays
  centered on the viewport, not on the content column. Job 006 decides how a toast
  reaches a page.
- A tone on a chip that is not selected adds the class and no color, as in the mockups.
- The style guide's dialogs are open with `aria-modal="true"`, so a screen reader may
  treat the rest of that page as inert. It is the real partial on a developer page, the
  same trade as the second `<h1>` in D14.
- Port 3000 was held by another process on this machine during the build. I left it
  alone and used 4317 for the browser check, then stopped my server and the browser.
