---
name: verification-loop
description: Check a change before it is called done - build, tests and a read of the diff - and report READY or NOT READY. Use before committing finished work or handing it to review.
---
# Verification loop

Run every check, in order, each time. The commands are the ones under Project facts in
`CLAUDE.md`; if a check has no command there, mark it SKIPPED. Fix what fails and run the
whole loop again, until the verdict is READY.

1. **Build**: the build and type-check command. No errors.
2. **Tests**: the test command, the whole suite. Nothing failing, nothing newly skipped.
3. **Lint**: the lint command, if Project facts lists one.
4. **Diff**: read `git status` and `git diff main...HEAD` plus the uncommitted changes.
   - Every changed file belongs to the job.
   - No debug output, commented-out code, `.only`, `.skip` or stray TODOs left in.
   - No secrets, keys or machine-specific paths.
   - Every acceptance criterion in the job's spec has a test that would fail without
     the change.

## Report

End with this block, filled from output you actually saw in this run:

```
VERIFICATION
Build: PASS | FAIL | SKIPPED
Tests: PASS | FAIL   (<passed> passed, <failed> failed)
Lint:  PASS | FAIL | SKIPPED
Diff:  PASS | FAIL
Verdict: READY | NOT READY
```

Under a NOT READY verdict, list each thing to fix with its file and line. The verdict is
READY only when no check is FAIL. A check you did not run this time is not a PASS.
