# 012-timeline: plan

Decision numbers (D1, D2, …) refer to `design.md`. Code given in full there is copied as
it is.

## Steps

1. **The Dubai helpers.** Files: `src/dubai.ts`. Serves AC1, AC2, AC5.
   - The changes of `design.md` (D2): export `DAY_MS` and `MONTHS`, `dayTimeLabel` calls
     `clockLabel`, append `clockLabel`, `dayOfDate`, `dateOfDay`.
   - Check: `yarn build`; `yarn vitest run src/dubai.test.ts` passes unedited.

2. **The timeline service.** Files: `src/services/timeline.ts`. Serves AC1 to AC10.
   - Create the file of `design.md` (D3 to D12).
   - Write `src/services/timeline.test.ts` (Tests, the unit part).
   - Check: `yarn build`; `yarn vitest run src/services/timeline.test.ts`.

3. **The route, the page and the wiring.** Files: `src/routes/timeline.ts`,
   `src/views/pages/timeline.ejs`, `src/app.ts`. Serves AC1, AC2, AC5, AC8 to AC11.
   - Create the two files of `design.md` (D5, D7, D11, D16) and add the two lines to
     `src/app.ts`.
   - Check: `yarn build`.

4. **The stylesheet.** Files: `public/css/base.css`. Serves AC4, AC6, AC8, AC9.
   - The one insertion of `design.md` (D13, D14), before the style guide section.
   - Check: `yarn vitest run src/stylesheet.test.ts src/app.test.ts` passes unedited.

5. **The two test lines.** Files: `src/shell.test.ts`. Serves AC1, AC12.
   - D15: remove `'/timeline', ` from the `it.each` of "marks no link as current on %s"
     and from the `it.each` of "%s answers with the not-found page until its job builds
     it". Nothing else in the file.
   - Check: `yarn vitest run src/shell.test.ts`.

6. **The page tests.** Files: `src/timeline-page.test.ts`. Serves AC1 to AC12.
   - Write them as listed under Tests.
   - For each criterion make one break, see a test fail, put the code back, and record
     it in `build.md`. At least: `dayOfDate` without the round-trip (AC1); `todayHref`
     always set (AC2); `axis.start` without the blocks (AC3); a band not cut to the axis
     (AC4); `isShownOn` without the status check (AC5); `.k-high` with `color` in place
     of `border-color` (AC6); `overlaps` with `<=` (AC7); conflict not excluding `done`
     (AC8); the now line without `day === today` (AC9); the empty state on every day
     (AC10); the route calling `updateTask(deps.db, 1, {})` for a shown block (AC11).
   - Check: `git diff --stat` shows no existing test file but `src/shell.test.ts`, with
     two lines changed.

7. **The whole run.** Serves AC12.
   - `env -u ANTHROPIC_API_KEY yarn build` and `env -u ANTHROPIC_API_KEY yarn test`, once
     each (not in a loop; `docs/errors/repeated-test-runs-run-out-of-ports.md`).
   - `git status --short` shows nothing under `data/` and no `.vitest/`.

## Tests

Shared setup of `src/timeline-page.test.ts` (as `src/tasks-page.test.ts` does it):

- `const NOW = '2026-10-12T09:36:00.000Z';` (1:36 PM on Monday 12 Oct in Dubai). In
  `beforeEach`: `vi.useFakeTimers({ toFake: ['Date'] })`, `vi.setSystemTime(new Date(NOW))`,
  `testApp = createTestApp({ analyze: vi.fn<Analyze>() })`. In `afterEach`:
  `testApp.close()`, `vi.useRealTimers()`, and `process.env.TZ` put back as it was
  (delete it when it was unset).
- `dubai(time, daysAhead = 0)`: `new Date(Date.UTC(2026, 9, 12 + daysAhead, hours - 4,
  minutes)).toISOString()`, written in the file; `src/dubai.ts` is not imported for
  expected values (009 D17).
- `block(from, to, extra = {})`: `createTask(testApp.db, { title: 'A task', status:
  'pending', priority: 'medium', scheduled_start: from, scheduled_end: to, ...extra })`.
- `timeline(query = '')`: `GET /timeline${query}`, expects 200, returns the parsed
  document.
- `percentOf(element, property)`: reads the element's `style` attribute with
  `` new RegExp(`(?:^|;)\\s*${property}:\\s*(-?[\\d.]+)%`) `` and returns the number;
  throws when there is none. Assertions on percents use `toBeCloseTo(value, 2)`.
- `heading(document)`: `textOf(one(document, '.day-switcher__day'))`.
- A draft needs a source: `createSource(testApp.db, { kind: 'text', transcript: 'x' })`.

Shared setup of `src/services/timeline.test.ts`:

- `row(id, from, to, extra = {})`: a complete `Task` literal (every field of `Task`,
  `status: 'pending'`, `priority: 'medium'`, the rest `null` or a fixed timestamp), with
  the two times and `extra`. `HOURS = { start: '09:00', end: '22:00' }`;
  `DAY = 20738` (`Date.UTC(2026, 9, 12) / 86400000`, written out as the literal);
  `NOW` as above; `dubai()` as above.
- `styleOf(block)`: parses `block.style` into `{ top, height, left, width }` numbers.

### AC1: `src/timeline-page.test.ts`

- `/timeline`: 200; `<title>` is `Timeline - Task Image AI`; `main h1` is `Timeline`;
  the one `a[aria-current="page"]` has `href="/timeline"`; `heading` is
  `Today · 12 Oct`.
- `?date=2026-10-14` shows `Wed · 14 Oct`.
- `?date=2026-13-01`, `?date=2026-02-30`, `?date=tomorrow`, `?date=`,
  `?date=2026-10-14&date=2026-10-14`, `?date[]=2026-10-14`: each 200 with
  `Today · 12 Oct`.
- With a block at `dubai('10:00', 2)`: `?date=2026-10-14` shows `#block-1`; `/timeline`
  does not (the day really changes, not only the heading).
- Under `process.env.TZ = 'Pacific/Kiritimati'` (UTC+14) with `NOW`: `heading` is still
  `Today · 12 Oct` and a block at `dubai('09:00')` reads `9:00 AM–10:00 AM`.

### AC1, AC3: `src/services/timeline.test.ts`

- `readDay` gives `DAY + 2` for `{ date: '2026-10-14' }` and `DAY` for `undefined`,
  `{}`, `{ date: ['2026-10-14', '2026-10-14'] }`, `{ date: 5 }`, `{ date: '2026-02-29' }`;
  `{ date: '2028-02-29' }` is accepted (a leap day).
- `buildTimeline` with `HOURS = { start: '09:30', end: '17:45' }` and no task: hour
  labels `10 AM` … `5 PM` (no label at 9:30 or 17:45); the `10 AM` label's top is
  `30 / 495 × 100`.

### AC2: `src/timeline-page.test.ts`

- On `/timeline`: `a[aria-label="Previous day"]` has `href="/timeline?date=2026-10-11"`,
  `a[aria-label="Next day"]` has `href="/timeline?date=2026-10-13"`; `main` has no
  `a[href="/timeline"]`.
- `?date=2026-10-13`: `Tomorrow · 13 Oct`; `?date=2026-10-11`: `Yesterday · 11 Oct`;
  each has an `a` in `main` with the text `Today` and `href="/timeline"`.
- `?date=2026-12-31`: `Thu · 31 Dec`, next `/timeline?date=2027-01-01`, previous
  `/timeline?date=2026-12-30`. `?date=2026-03-01`: previous `/timeline?date=2026-02-28`.

### AC3: `src/timeline-page.test.ts`

- No task: one `.tl`; `.tl .hour` texts are `9 AM`, `10 AM`, … `10 PM` (14 labels);
  `12 PM` top `23.08`, `9 AM` `0`, `10 PM` `100`.
- A block 7:30–8:00 AM: the labels start `7 AM` at `0`, `9 AM` is at `2 / 15 × 100`
  (`13.33`), end `10 PM` at `100`.
- A block 11:30 PM to 12:30 AM the next day: the last label is `12 AM` at `100`, the
  axis has 16 labels (9 AM to 12 AM), and `#block-1`'s height is `30 / 900 × 100`
  (cut at midnight).
- `setSetting(db, 'working_hours', { start: '10:00', end: '18:00' })`: labels `10 AM` …
  `6 PM` (9 labels).

### AC4: `src/timeline-page.test.ts`

- No task: `.band` elements are, in order, `data-slot` `morning`, `afternoon`,
  `evening`, `night`, with `textOf` `Morning`, `Afternoon`, `Evening`, `Night` and
  `top`/`height` `0`/`23.08`, `23.08`/`38.46`, `61.54`/`23.08`, `84.62`/`15.38`.
- With working hours `13:00`–`18:00`: only `afternoon` (`0`/`80`) and `evening`
  (`80`/`20`); no `morning` or `night` band.
- With a block: every `.band` precedes `ol.tl__blocks` in the document
  (`compareDocumentPosition`), and both are inside `.tl`.
- The stylesheet: `.band[data-slot="<id>"]` has `background: var(--slot-<id>)` for each
  of the four; `.band` has no `z-index`.

### AC5: `src/timeline-page.test.ts`

- A `high` pending block 9:00–10:30 AM titled `<b>x</b>`: one `li#block-1` with the
  classes `blk` and `k-high`; `top` `0`, `height` `11.54`; no `b` element in it; its text
  holds `<b>x</b>` and `9:00 AM–10:30 AM`, and not `Done` or `In progress`.
- A block 4:00–5:00 PM: `top` `53.85`, `height` `7.69`.
- An `in_progress` block says `In progress`; a `done` one says `Done`.
- An `urgent` block: its first `[aria-hidden="true"]` is `▲` and `textOf` starts with
  `▲`; a `high` block has no `▲`. A block with `priority: null` has `k-none`.
- Hidden: a draft (with a source) with both times today, a pending task with no times,
  one with a start and no end, a pending one at `dubai('10:00', 1)`, and one at
  `dubai('23:55', -1)`: none has a `#block-<id>`. Shown: one at `dubai('02:00')` (22:00Z
  the day before).

### AC6: `src/timeline-page.test.ts`

- The stylesheet (`getStylesheet`): for each of `urgent`, `high`, `medium`, `low`,
  `.k-<p>` has `background: var(--<p>-bg)` and `border-color: var(--<p>)`; no
  declaration of `.k-none` holds `--urgent`, `--high`, `--medium` or `--low`.

### AC7: `src/timeline-page.test.ts` and `src/services/timeline.test.ts`

- Page: blocks 2:00–2:45 PM and 2:30–3:00 PM: `left`/`width` `0`/`50` and `50`/`50`;
  a third 3:00–3:30 PM: `0`/`100`; a lone 9:00 AM block: `0`/`100`.
- Unit: seven `row`s 10:00–11:00 AM that all overlap: seven distinct lefts; sorted by
  left, `left[i] + width[i] ≤ left[i + 1] + 1e-9`; the first `left` is `0` and the last
  `left + width` is `100` (within `1e-9`).
- Unit: A 9:00–11:00, B 9:30–10:00, C 10:00–10:30 (C reuses B's column): A `0`/`50`,
  B and C `50`/`50`, and B's and C's ranges do not intersect A's.

### AC8: `src/timeline-page.test.ts`

- Pending 2:00–2:45 PM and 2:30–3:00 PM, and a third 3:00–3:30 PM: the first two have
  `conflict`, the third not. A conflict block's `textOf` ends with `⚠`, its last
  `[aria-hidden="true"]` is `⚠`, and it has a `.visually-hidden` with the text
  `Conflict`. The third has no `⚠` and no `Conflict`.
- A `done` 2:00–2:45 PM and a pending 2:30–3:00 PM: neither has `conflict`; they are side
  by side (`width` `50` each).
- The stylesheet: `.conflict` has a `background-image` that starts with
  `repeating-linear-gradient(`; in the parsed rule list `.conflict` comes after each of
  the five `.k-*` rules.

### AC9: `src/timeline-page.test.ts`

- `/timeline` at `NOW`: one `.tl .now` with `top` `35.38`.
- `?date=2026-10-13` and `?date=2026-10-11`: no `.now`.
- `vi.setSystemTime(new Date(dubai('08:00')))` and `dubai('23:00')`: no `.now` on
  `/timeline`.
- At `dubai('08:00')` with a block 7:30–8:00 AM: `.now` at `1 / 15 × 100` (`6.67`).
- The stylesheet: `.now` has `background: var(--urgent)`.

### AC10: `src/timeline-page.test.ts`

- No task: `.empty-state h2` is `Nothing scheduled` and it holds an `a[href="/add"]`;
  `.tl`, 14 `.hour` and 4 `.band` are there; no `ol.tl__blocks`.
- A block on another day only: `/timeline` still says `Nothing scheduled`.
- With a block today: no `.empty-state`.

### AC11: `src/timeline-page.test.ts`

- Seed a pending, an `in_progress` and a `done` block today, a draft and a task with no
  times. Read every task with `listTasks` and every settings row with
  `SELECT key, value FROM settings ORDER BY key`, then `vi.setSystemTime` an hour later
  (so a write would change `updated_at`), and `GET` `/timeline`, `?date=2026-10-13` and
  `?date=bogus`. Both reads are `toEqual` to the ones before.

### AC12

- Step 7 runs `yarn build` and `yarn test` with `ANTHROPIC_API_KEY` unset. Every page
  test uses `createTestApp`, whose database is in memory and whose folder is under the
  system's temporary folder.
- Existing tests: only the D15 lines of `src/shell.test.ts` change (step 6's check).
