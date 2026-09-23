# Task Priority Notes — Design Spec

Date: 2026-09-23

## Summary

A standalone React app for taking notes/tasks, marking them done or deleting
them, and automatically scoring each task's urgency using the `@receptron/laya`
model — run entirely client-side in the browser, with no backend dependency.
Lives at `apps/task-priority-notes/` inside this repo, as its own package
(separate `package.json`, `vite.config.ts`), not wired into the zho-backend
Express app or its build/deploy pipeline.

## Why client-side Laya, not the `/api/laya/classify` endpoint

The user explicitly asked for a backend-free app: the ONNX model is downloaded
and cached in the browser, and task data lives in `localStorage`. This was a
deliberate choice made during design (see "Laya integration" decision below),
not an oversight — the zho-backend endpoint built earlier in this project
exists but is intentionally unused here.

`@receptron/laya` (the npm package) cannot be imported as-is in a browser
bundle: it depends on `onnxruntime-node` (a native Node addon) and Node's
`fs`/`node:fs/promises` for reading a locally cached model bundle. Two of its
three dependency surfaces are browser-safe already:

- `@huggingface/tokenizers` ships a `"browser"` build (pure JS/WASM, no Node
  APIs) — usable unmodified.
- `sequence.js` (tokenization-adjacent math: `buildSequence`, `softmax`,
  `confidenceFromProbs`, `tempBucket`, `renderOptions`, `toInternal`) is pure
  JS with zero Node dependencies — usable unmodified.

Only the ONNX runtime and the model-bundle download/cache logic need a
browser-native replacement: `onnxruntime-web` in place of `onnxruntime-node`,
and the browser Cache Storage API in place of `~/.cache/receptron-laya`.

## Data model

```ts
interface Task {
  id: string;
  title: string;
  description: string;
  createdAt: string; // ISO timestamp
  done: boolean;
  priority?: {
    label: string;    // winning criterion label, e.g. "high"
    score: number;     // 0..levels-1, Laya's score answer
    confidence: number; // Laya's confidence (1 - normalized entropy)
    status: 'pending' | 'done' | 'error';
  };
}
```

Deleting a task removes it from the list outright — no soft-delete/trash/undo.

### Persistence (`localStorage`)

- `tasks` — `Task[]`, the full list.
- `priorityCriteria` — `string[]`, user-editable ordered list of urgency
  level labels (e.g. `["low", "medium", "high", "critical"]`), edited via a
  settings panel. This list becomes the `criteria` array of the Laya `score`
  question. Must contain at least 2 levels; the panel blocks emptying it
  below that.

The ONNX model bundle itself is *not* stored in `localStorage` (it's ~1.7GB,
`localStorage` caps around 5–10MB per origin) — see Model caching below.

## UI

- Task list: checkbox (done), delete button, priority badge (label +
  confidence, or a spinner while `status === 'pending'`, or a "couldn't
  classify" badge with a retry button when `status === 'error'`).
- Add-task form: title + description. On submit, the task is created with
  `priority.status = 'pending'` and classification kicks off immediately
  (auto-trigger, not a manual button — accepted tradeoff: the very first task
  created in a fresh browser blocks on the ~1.7GB model download).
- Criteria panel (settings icon): add / remove / reorder / rename urgency
  levels, backed by `priorityCriteria`. Existing tasks keep their
  last-computed priority when criteria change; only new classifications use
  the updated list.
- First-use model download shows a progress indicator (bytes received per
  file, aggregated) rather than just appearing to hang.

## Laya browser port — `src/lib/laya-browser/`

- **`sequence.ts`** — copied verbatim from `@receptron/laya`'s
  `dist/sequence.js` (relocated, with a credit comment pointing at the
  upstream package/version it was copied from). No logic changes.
- **`tokenizer.ts`** — thin wrapper around `@huggingface/tokenizers`'
  browser build; mirrors the upstream package's `encode`/special-token-id
  lookup.
- **`model.ts`** — reimplementation of `Laya.load()` / `systemOne()`:
  - Fetches `laya.onnx`, `laya.onnx.data`, `laya_config.json`,
    `tokenizer/tokenizer.json`, `tokenizer/tokenizer_config.json` from
    `https://huggingface.co/receptron/laya-onnx/resolve/main/...`.
  - Caches each fetched file in Cache Storage (`caches.open('laya-model-v1')`),
    keyed by URL. Subsequent loads check the cache before fetching.
    `navigator.storage.persist()` is requested (best-effort) to reduce
    eviction risk.
  - Builds the ONNX session via `ort.InferenceSession.create(onnxArrayBuffer,
    { executionProviders: ['wasm'], externalData: [{ path: 'laya.onnx.data',
    data: dataArrayBuffer }] })`, using `onnxruntime-web`.
  - `systemOne()` batches/build tensors the same way the upstream
    `laya.js` does, using `onnxruntime-web`'s `Tensor` type instead of
    `onnxruntime-node`'s.
  - Emits a download-progress callback (bytes received per file) for the UI
    progress indicator.
- The app calls this module with a single `score` question per task:
  `instructions` fixed (e.g. "How urgent is this task?"), `criteria` sourced
  live from `priorityCriteria`, `state` = `{ title, description }`.

### Known constraints (accepted, not blocking)

- WASM inference will be slower than the native Node build; no hard number
  without measuring.
- Requires HTTPS or localhost (Cache Storage + WASM threading) and a current
  Chrome/Edge/Firefox; Safari's Cache Storage quota behavior is flakier for
  multi-GB entries.
- If `huggingface.co` is unreachable, classification degrades to the
  `'error'` status per task rather than blocking the whole app.

## Testing strategy

Vitest + React Testing Library, TDD as usual for this codebase.

**Unit-tested:**
- `sequence.ts` — sequence building, softmax, confidence math (ported tests,
  same shape as what the upstream package would test).
- Task store (add / toggle-done / delete, `localStorage` read/write).
- Criteria panel logic (add / remove / reorder / validate non-empty,
  minimum-2-levels rule).
- `model.ts`'s `classify()` orchestration — mocked at the `onnxruntime-web` /
  `fetch` boundary (never touches the real 1.7GB model in tests), verifying
  it tokenizes → builds tensors → runs the session → maps output the same
  way the backend's `services/laya` does.
- Components — render states: no priority yet, classifying (with progress),
  classified badge, error badge.

**Not practically testable in CI:** real ONNX inference against the real
downloaded model. One manual smoke test (real browser, dev server, add a
task, watch it classify end-to-end) will be done once implemented, to
confirm the mocked-unit coverage isn't hiding an integration gap.

## Error handling summary

- Model download/network failure → task's `priority.status = 'error'`,
  retry button; task remains fully usable (done/delete unaffected).
- Cache Storage unavailable (old browser / private mode) → classification
  disabled app-wide with an explanatory banner, rest of the app unaffected.
- Criteria list would drop below 2 levels → blocked in the panel UI.

## Out of scope

- Any backend component (explicitly rejected by the user in favor of a fully
  client-side app).
- Soft-delete/trash/undo for tasks.
- Editing an existing task's title/description after creation (not
  requested; add/done/delete/classify only).
- Multi-user/auth/sync — single-browser, `localStorage`-only.
