# 002-design-system: design tokens, app shell and the style-guide page

## Goal

Every later screen of Task Image AI is built from the same parts (`docs/plan.md`, task
U1, and the dark-mode part of task 16). This job turns the scaffold's bare layout into
the app shell and gives later jobs a set of tokens and EJS partials to build with, shown
together on one style-guide page. The app is used mostly on a phone, so the shell is
mobile-first.

Token names and values come from `docs/mockUps.html`, which already extends the names
used in `public/css/base.css`. Components are server-rendered EJS partials styled with
plain CSS.

## Acceptance criteria

- **AC1**: The stylesheet declares these tokens as CSS variables on `:root`: the four
  priority colors (urgent, high, medium, low) each with a background tint, the four slot
  tints (morning, afternoon, evening, night), a second surface color, one type scale, a
  spacing scale in steps of 4px, and two corner radii.
- **AC2**: Every color token is redefined for dark, both under `:root[data-theme="dark"]`
  and under `prefers-color-scheme: dark` for a root that is not set to light. No rule
  outside the token blocks holds a color literal.
- **AC3**: Every page rendered in the layout has one navigation landmark with links to
  Today (`/`), Timeline (`/timeline`), Tasks (`/tasks`) and More (`/more`), and an Add
  link (`/add`) in the middle. The link for the current page carries
  `aria-current="page"`. The stylesheet lays the navigation out as a bottom tab bar on
  narrow screens and as a sidebar on wide ones.
- **AC4**: The layout has a theme toggle. Using it sets `data-theme` on the root element
  and saves the choice in localStorage. A saved choice is applied before the page first
  paints. With nothing saved, no `data-theme` is set and the system setting decides.
- **AC5**: There is an EJS partial for each of: page header, button (primary and ghost),
  priority badge, slot badge, chip, card, modal, bottom sheet, toast, empty state and
  skeleton loader. `GET /_styleguide` returns 200 and renders every one of them under a
  heading that names it, with the badges in all four priorities and all four slots.
- **AC6**: A priority badge and a slot badge always show their name as text, so neither
  relies on color alone. The modal and the bottom sheet are rendered with
  `role="dialog"` and an accessible name, and the toast sits in an `aria-live` region.
  Buttons, navigation links and the theme toggle have a minimum height of 44px.
- **AC7**: The home page and the not-found page still render in the layout, now with
  the navigation, and the existing tests still pass.

## Out of scope

- The pages behind the navigation links. `/timeline`, `/tasks`, `/more` and `/add`
  answer with the not-found page until their own jobs build them.
- Opening and closing the modal and bottom sheet, and showing and dismissing a toast.
  The style-guide page shows them in their open state. The behavior comes with the first
  job that uses each one (006 for the bottom bar and toast, 013 for the detail sheet).
- Swipe gestures, htmx, icons from an icon library, and the PWA manifest (job 017).
- Any change to the mockups or to the scaffold's routes beyond adding `/_styleguide`.
