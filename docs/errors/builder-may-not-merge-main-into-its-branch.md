# A rework that asks for "merge main" stops: the builder may not merge

**Error**: the builder answered the round-1 note "merge main and resolve the conflicts"
with "I did not merge `main`, because my rules forbid merging", and committed a build
report saying the finding was still open. Before that, `git merge --no-ff --no-commit
factory/020-digest` on `main` had stopped with conflicts in `factory/backlog.md`,
`src/app.ts`, `src/server.ts` and `src/server.test.ts`.
**Where**: `/factory approve 020-digest`, then `/factory rework 020-digest`, 2026-10-18.
**Cause**: 020's branch was cut before 016-recurring and 021-calendar-export merged, and
both added lines in the same places as 020. `.claude/agents/builder.md` says "Never switch
branches, commit to `main`, merge, push, amend or rebase", and the factory skill names no
one who brings `main` into a job branch.
**Fix**: the orchestrator ran `git merge --no-ff --no-commit main` on `factory/020-digest`
and resolved `factory/backlog.md` (both 020 and 021 ticked). The builder resolved the three
`src/` files, keeping both sides, and staged them without committing. The orchestrator
committed the merge. Next time a job branch conflicts with `main`, split the work the same
way, or add a rule to the skill that says who does the merge.
**Seen in**: 020-digest, 2026-10-18
