# 020-digest: build

Branch `factory/020-digest`. Code commit `6cca738`. Built on Node v26.8.2 and yarn 1.22.22
(the design's throwaway checks were on the same Node).

## What changed

Created:

| File | Why | Decision |
| --- | --- | --- |
| `src/services/digest.ts` | `buildDigest(tasks, now)` for the page and the push, and `startDigestJob(db, send)` for the 7:30 AM daily push | AC7, AC8 (AC9) |
| `src/routes/digest.ts` | `GET /digest`, renders `buildDigest(listTasks(db), requestTime(res))` | AC1, AC7 |
| `src/views/pages/digest.ejs` | The digest page: count, planned minutes, the first task, the overdue list, the overdue and timeline links, and the empty states | AC1–AC5 |
| `src/digest-page.test.ts` | AC1 to AC6 on the rendered page | AC1–AC6 |
| `src/services/digest.test.ts` | `buildDigest` on the data of AC2 to AC4, and `startDigestJob` on fake timers and the no-subscription case | AC7, AC8 |
| `src/digest-job.test.ts` | The push payload (AC9) and the server wiring (AC10) | AC9, AC10 |
| `public/css/base.css` | The digest stat, first, list and item styles | AC1 |

Changed:

| File | Why | Decision |
| --- | --- | --- |
| `src/app.ts` | Mount the digest router after the timeline router | AC1 |
| `src/server.ts` | Start the digest job after `createApp` and before `listen`, with the same `PushSender` the push job got, only when the VAPID keys are there | AC10 |
| `src/server.test.ts` | The digest job is spied like the reminder and push jobs; one assertion that it starts with the database and the push sender when the keys are there, and none when they are not | AC10 |

Nothing else in the spec, the design or the plan was changed. The schema is untouched: no
migration is added, so `src/db/migrations.test.ts` stays as it is.

## Acceptance criteria

| Criterion | Test | Fails when | Result |
| --- | --- | --- | --- |
| AC1 page | `src/digest-page.test.ts` | I dropped the page-header partial from `digest.ejs`: `answers 200 with the app layout and <h1>Digest</h1>` failed | PASS |
| AC2 count and minutes | `src/digest-page.test.ts` | I summed `estimated_minutes` over every task, not just today's: the AC2 example showed `8 tasks today` instead of `4 tasks today` | PASS |
| AC3 first task and empty state | `src/digest-page.test.ts` | I took the first pending task regardless of its end: an overdue 9:00 task was first instead of the 2:00 PM one; and with nothing left the empty-state heading was missing | PASS |
| AC4 overdue list | `src/digest-page.test.ts` | I sorted overdue by `id` only: the 11 Oct task came after today's; and the `Review overdue` link was absent | PASS |
| AC5 timeline link | `src/digest-page.test.ts` | I removed the `#timeline-link` link: `always has one link to /timeline with the text View timeline` failed | PASS |
| AC6 page writes nothing | `src/digest-page.test.ts` | I forgot the page only reads — nothing to drop, this is the guard that the route makes no write | PASS |
| AC7 `buildDigest` | `src/services/digest.test.ts` | I dropped the `count === 1 ? '' : 's'` in `countText`: `renders 1 task today, not 2 tasks today` failed | PASS |
| AC8 daily job | `src/digest-job.test.ts`, `src/services/digest.test.ts` | I fired once at the start instead of at the next 7:30: the first push was at the start time, not at the next Dubai 07:30 | PASS |
| AC9 push payload | `src/digest-job.test.ts` | I left the overdue part off the summary: the one-overdue case showed `4 tasks today · 210 min planned` without `· 1 overdue task` | PASS |
| AC10 server wiring | `src/server.test.ts` | I started the digest job even without the keys: the no-key test saw `startDigestJob` called when it should not be | PASS |
| AC11 build and tests | `yarn build`, `yarn test` | Not a single break: the whole suite is the check. `git status --porcelain data/` is empty | PASS |

Checked by hand:

- `ANTHROPIC_API_KEY= VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= VAPID_SUBJECT= yarn build` and the
  same `yarn test` are clean: the suite passes with the API key and the three `VAPID_*` unset
  (AC11).
- `git status --porcelain data/` and `git status --porcelain` are empty after the run: no
  database or uploads file was left behind.
- The spec's own hand check — a device, a real key pair, an HTTPS origin, a closed tab, the
  digest arriving on the phone at 7:30 AM and opening `/digest` when tapped — was **not**
  done: there is no such device or origin here. The suite cannot assert a real push, the OS
  notification or the closed tab.

## Test run

Build (`yarn build`, `tsc --noEmit`):

```
$ tsc --noEmit
Done in 2.38s.
```

Test (`yarn test`, default reporter):

```
 Test Files  77 passed (77)
      Tests  2064 passed (2064)
```

(0 failed, 0 skipped.) The same commands with `ANTHROPIC_API_KEY=` and the three `VAPID_*`
empty were also clean.

```
VERIFICATION
Build: PASS
Tests: PASS   (2064 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY
```

## Not done

- **The spec's "Checked by hand" was not done.** No device, key pair or HTTPS origin; the
  real push at 7:30 AM, the OS notification and the closed tab are out of the suite's reach
  (the design's risks say the same). The suite asserts the built payload, the schedule and
  the page, not a push that arrives.
- **A real `web-push` send is never exercised.** Only `createPushSender`'s `setVapidDetails`
  runs, in the one `src/server.test.ts` AC10 test with the checked key pair; no push is sent.
- **`buildDigest` is tested on hand-built task lists, not on a live model's output.** The
  analyzer is not in this job at all — it only reads the stored tasks.
- **Node 22 and 24 were not checked.** This build ran on Node 26.8.2 only.

Nothing else in the spec, the design or the plan was skipped.

## Round 1

| Finding | What I did | What I saw fail |
|---|---|---|
| review-human.md: "merge main and resolve the conflicts" (CHANGES) | Not done. The builder's rules forbid merging, rebasing or switching branches (merges belong to the orchestrator). I previewed the merge without touching the branch, with `git merge-tree --write-tree --name-only main HEAD`: main has moved on with 016-recurring and 021-calendar-export, and four files conflict: `factory/backlog.md`, `src/app.ts`, `src/server.ts`, `src/server.test.ts`. No code changed this round. | Nothing to break; no behaviour changed. |

To go ahead, the orchestrator (or the user) needs to either merge `main` into
`factory/020-digest` and resolve those four files itself, or give the builder an explicit
exception to the no-merge rule for this round.

### Test run

`yarn build`:

```
$ tsc --noEmit
Done in 2.15s.
```

`yarn test`:

```
 Test Files  77 passed (77)
      Tests  2064 passed (2064)
Done in 4.47s.
```

```
VERIFICATION
Build: PASS
Tests: PASS   (2064 passed, 0 failed)
Lint:  SKIPPED
Diff:  PASS
Verdict: READY (for the branch as it stands; the round 1 finding is still open, see above)
```
