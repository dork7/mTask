# 015-learning-loop: design

BLOCKED: AC6 requires `analyzeSource` to hand the stub an empty list when no task qualifies, but AC7 says no existing test changes, and seven existing assertions require the stub to get the input as its only argument.

## The contradiction

AC6: "With no such task, the stub receives an empty list." So with an empty
database, `analyzeSource` calls `deps.analyze(input, [])`.

AC7: "No existing test changes."

The tests from 006 and 007 run against an empty database. They use a `vi.fn<Analyze>()`
stub and pin its whole argument list to the input alone:

| File | Line | Assertion |
|---|---|---|
| `src/add-text.test.ts` | 240 | `expect(analyze.mock.calls[0]).toStrictEqual([{ kind: 'text', text: 'buy milk and finish the login bug' }])` |
| `src/add-text.test.ts` | 310 | `expect(analyze.mock.calls).toEqual([[{ kind: 'text', text: 'buy milk\ncall mum' }]])` |
| `src/add-text.test.ts` | 319 | `expect(analyze.mock.calls).toEqual([[{ kind: 'text', text: 'buy  milk' }]])` |
| `src/add-text.test.ts` | 534 | `expect(analyze.mock.calls[0]).toStrictEqual([{ kind: 'text', text: 'buy milk' }])` (retry) |
| `src/add-analysis.test.ts` | 219 | `expect(analyze.mock.calls[0]).toStrictEqual([{ kind: 'image', path: ... }])` |
| `src/add-analysis.test.ts` | 383 | `expect(analyze.mock.calls[0]).toStrictEqual([{ kind: 'image', path: ... }])` (retry) |
| `src/add-analysis.test.ts` | 474 | `expect(analyze.mock.calls).toEqual([[{ kind: 'image', path: ... }]])` (retry) |

If `analyzeSource` passes `[]` as a second argument, all seven fail. Both matchers compare
array lengths, so `toEqual` fails too, and it would also fail with `undefined` as the
second argument.

**Checked.** Node v26.8.2, yarn 1.22.22, and the repo's own vitest 5.0.1 run from a
throwaway folder under `$TMPDIR` (since deleted). A `vi.fn()` called as `fn(input, [])`
fails `expect(fn.mock.calls[0]).toStrictEqual([input])` and
`expect(fn.mock.calls).toEqual([[input]])`. Called as `fn(input, undefined)`, it fails
the `toEqual` form. Called as `fn(input)`, it passes both.

There is no clean design that meets both criteria. The list could reach the stub in other
ways: a non-enumerable property on the input, which `toStrictEqual` ignores, or a `this`
binding. Both are tricks to slip past the old assertions. They are not ways of handing
the analyzer its corrections, so I rejected them. Choosing one of the two criteria to
break is a spec decision, so the job is blocked rather than read one way.

## Ways to unblock (one sentence of the spec changes)

1. **Recommended: in AC6, without a qualifying task, `analyzeSource` calls the analyzer
   with the input only.** Replace "With no such task, the stub receives an empty list."
   with "With no such task, the stub is called with the input as its only argument."
   This keeps AC7's "No existing test changes" exactly. Nothing is lost: AC5 already
   makes the analyzer treat an empty list and a missing list the same way.
2. **Or: amend AC7 so the seven assertions above may change** to expect `[input, []]`,
   and no other existing test may change. This keeps a uniform call with the list always
   passed, at the cost of editing tests from 006 and 007.

## Notes for the re-run (the rest of the spec is buildable)

None of this is a decision yet. These notes save the next architect a re-read.
- `analyze(input, deps)` in `src/services/analyzer.ts` builds one `request` object and
  sends that same object on both attempts. If the lines are added to that object, the
  retry carries them (AC4), and the existing
  `create.mock.calls[1][0]` toStrictEqual `create.mock.calls[0][0]` test keeps holding.
- Putting the lines in `system` leaves `messages` untouched. The real-client test in
  `analyzer.test.ts` pins `body.messages` to the text block alone, so that test is not
  touched either. AC5 then holds if `system` stays the bare `SYSTEM_PROMPT` constant when
  the list is empty or missing.
- `Analyze` in `analyzer.ts` is `(input) => Promise<Analysis>`. Adding an optional second
  parameter `corrections?: readonly Correction[]` keeps every `vi.fn<Analyze>()` and the
  `createAnalyze` tests compiling.
- `src/db/tasks.ts` has no query by status, date and category beyond `listTasks`. Per
  CLAUDE.md, the driver lives only in `src/db/`, so a new query belongs there, or
  `corrections.ts` filters `listTasks(db, { status: 'done' })` in memory.
- `analyze-command.ts` stays untouched (out of scope: `yarn analyze` opens no database).
