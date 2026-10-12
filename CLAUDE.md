# mTask

## Project facts

- **Language**: TypeScript, nodejs APP. Node 22.18 or newer runs the `.ts` files
  directly, with no compile step: relative imports end in `.ts`, and only erasable
  syntax is allowed (no `enum`, no `namespace` with values, no constructor parameter
  properties; type-only imports use `import type`).
- **Package manager**: yarn.
- **Test command**: `yarn test`.
- **Build command**: `yarn build`.
- **Dev command**: `yarn dev`.
- **Lint command**: none.

## Factory

Changes can be run through the factory pipeline (`/factory`): spec, architect, builder,
then a build and test check, each job on its own `factory/<job-id>` branch with its files
in `factory/jobs/<job-id>/`. Reviewers run only when asked for, with
`/factory review <job-id>`. The pipeline is defined in `.claude/skills/factory/SKILL.md`
and `.claude/agents/`. Errors and their fixes are logged in `docs/errors/`. The dashboard
is `python3 factory/serve.py`, then http://localhost:8000/dashboard.html.
