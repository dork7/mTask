# The JSON reporter of Vitest prints nothing to read and leaves `.vitest/` in the repo

**Error**: `json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)` in
the script the output was piped to, and afterwards `?? .vitest/` in `git status --short`.
The one line Vitest printed was
`JSON report written to <repo>/.vitest/json/output.json`.
**Where**: `yarn -s vitest run <files> --reporter=json | python3 -c "json.load(sys.stdin)"`,
run by hand to count the tests of each file (Vitest 5.0.1).
**Cause**: without `--outputFile` the JSON reporter of this Vitest does not print the
report. It writes it to `.vitest/json/output.json` under the repo root and prints only
where it put it. `.gitignore` does not name `.vitest`, so the folder shows as untracked.
**Fix**: nothing in the repo changed. The folder was deleted and the command run again
with `--outputFile=<a file outside the repo>`, which was read and then deleted;
`git status --porcelain` was empty after it. Whenever a reporter other than the default
is used by hand, give it `--outputFile` outside the repo, and look at `git status --short`
after any command that was run for the first time.
**Seen in**: 008-slot-rules, 2026-10-13
