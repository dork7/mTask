# mTask

## Project facts

- **Language**: TypeScript, nodejs APP
- **Package manager**: yarn.
- **Lint command**: none.

## Factory

Changes can be run through the factory pipeline (`/factory`): spec, architect, builder,
review rounds, each job on its own `factory/<job-id>` branch with its files in
`factory/jobs/<job-id>/`. The pipeline is defined in `.claude/skills/factory/SKILL.md`
and `.claude/agents/`. Errors and their fixes are logged in `docs/errors/`.
