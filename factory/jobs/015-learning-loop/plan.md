# 015-learning-loop: plan

This job is blocked. There are no build steps. AC6 needs the analyzer stub to receive an
empty list when no task qualifies. AC7 forbids changing existing tests, and seven of
them, in `src/add-text.test.ts` and `src/add-analysis.test.ts`, require the stub to get
the input as its only argument. `design.md` lists the seven assertions and two ways to
change the spec to unblock it.
