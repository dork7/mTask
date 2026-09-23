# Task Priority Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone React app (notes/tasks with done/delete) that scores each task's urgency using the `@receptron/laya` model running entirely client-side in the browser, no backend involved.

**Architecture:** New independent package at `apps/task-priority-notes/` (own `package.json`, not a yarn workspace member of the root repo). Task/criteria data lives in `localStorage`. The Laya model (~1.7GB, split across 5 files hosted on Hugging Face) is fetched once, cached via the browser Cache Storage API, and run through `onnxruntime-web` (WASM). The model's request/response shapes and pure-math logic (`sequence.js` from the upstream npm package) are ported verbatim; only the ONNX runtime and file-caching layers are reimplemented for the browser.

**Tech Stack:** React 19.3.0, TypeScript 5.9.3 (pinned below the new 7.x major for tooling stability), Vite 8.3.0, Vitest 5.0.1 + Testing Library, `onnxruntime-web` 1.30.0, `@huggingface/tokenizers` 0.2.0.

**Spec:** `docs/superpowers/specs/2026-09-23-task-priority-notes-design.md`

## Global Constraints

- New app lives at `apps/task-priority-notes/`, a standalone package (no root `workspaces` field exists in this repo's `package.json`) — install and run commands happen inside that directory, not the repo root.
- No backend component. All task/criteria persistence is `localStorage`. The model bundle is cached via the browser Cache Storage API (`caches.open('laya-model-v1')`), never `localStorage` (too large: `localStorage` caps ~5-10MB/origin, the model is ~1.7GB).
- Model source: `https://huggingface.co/receptron/laya-onnx/resolve/main/`, five files: `laya.onnx`, `laya.onnx.data`, `laya_config.json`, `tokenizer/tokenizer.json`, `tokenizer/tokenizer_config.json`.
- `onnxruntime-web`'s `InferenceSession.create(buffer, options)` accepts `options.executionProviders: ['wasm']` and `options.externalData: [{ path: string, data: ArrayBufferLike }]` — confirmed against the package's real shipped type declarations (not assumed).
- Deleting a task is a hard delete — no trash/undo.
- The criteria list (urgency levels) must always have at least 2 entries; the UI blocks removing below that floor.
- TDD throughout: write the failing test, watch it fail for the stated reason, then implement.

## Review Focus

- Submitting the add-task form with an empty/whitespace-only title must not create a blank task — Task 11 tests this.
- `localStorage` holding corrupted/non-JSON data for `tasks` or `priorityCriteria` (e.g. hand-edited, or written by a future incompatible version) must not crash the app on load — falls back to `[]` / default criteria — Tasks 2 and 3 test this.
- Editing the criteria list after a task already has a computed priority must not retroactively change or corrupt that task's displayed label (the label is captured at classification time, not re-derived live from the current criteria array by index) — Task 9 tests this.
- Retrying a task's classification after a prior model-load failure must actually attempt again, not stay permanently broken (the model loader must not cache a rejected load) — Task 7 tests this at the model layer, Task 14 tests it at the App/UI layer.
- A criteria list with more/longer levels than fit in `head_max_len` tokens must degrade via the existing shrink-budget logic, not silently drop or corrupt option markers — Task 4 adds a dedicated `buildSequence` test for the shrink path.

---

## File Structure

```
apps/task-priority-notes/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  src/
    main.tsx
    App.tsx
    App.test.tsx
    setupTests.ts
    storage/
      types.ts
      taskStore.ts
      taskStore.test.ts
      criteriaStore.ts
      criteriaStore.test.ts
    lib/
      priority.ts
      priority.test.ts
      laya-browser/
        types.ts
        sequence.ts
        sequence.test.ts
        tokenizer.ts
        tokenizer.test.ts
        modelBundle.ts
        modelBundle.test.ts
        model.ts
        model.test.ts
    components/
      DownloadProgress.tsx
      DownloadProgress.test.tsx
      TaskForm.tsx
      TaskForm.test.tsx
      CriteriaPanel.tsx
      CriteriaPanel.test.tsx
      TaskItem.tsx
      TaskList.tsx
      TaskItem.test.tsx
```

---

### Task 1: Scaffold the Vite + React + TypeScript + Vitest app

**Files:**
- Create: `apps/task-priority-notes/package.json`
- Create: `apps/task-priority-notes/tsconfig.json`
- Create: `apps/task-priority-notes/vite.config.ts`
- Create: `apps/task-priority-notes/index.html`
- Create: `apps/task-priority-notes/src/main.tsx`
- Create: `apps/task-priority-notes/src/App.tsx`
- Create: `apps/task-priority-notes/src/setupTests.ts`
- Test: `apps/task-priority-notes/src/App.test.tsx`

**Interfaces:**
- Produces: `App` (default export, `apps/task-priority-notes/src/App.tsx`) — a React component, currently a placeholder heading. Later tasks replace its body (Task 14 owns the final version).

- [ ] **Step 1: Create the package directory and `package.json`**

```bash
mkdir -p apps/task-priority-notes/src
```

Create `apps/task-priority-notes/package.json`:

```json
{
  "name": "task-priority-notes",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@huggingface/tokenizers": "0.2.0",
    "onnxruntime-web": "1.30.0",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.1",
    "@vitest/coverage-v8": "5.0.1",
    "jsdom": "30.1.1",
    "typescript": "5.9.3",
    "vite": "8.3.0",
    "vitest": "5.0.1"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Task Priority Notes</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/setupTests.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Create a placeholder `src/App.tsx` (scaffolding, not yet the tested behavior)**

```tsx
function App() {
  return null;
}

export default App;
```

- [ ] **Step 8: Install dependencies**

```bash
cd apps/task-priority-notes && yarn install
```

- [ ] **Step 9: Write the failing test for the real heading behavior**

Create `apps/task-priority-notes/src/App.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the app heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Task Priority Notes' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run (from `apps/task-priority-notes/`): `yarn test`
Expected: FAIL — no heading found (App renders `null`).

- [ ] **Step 11: Implement the minimal heading**

Update `apps/task-priority-notes/src/App.tsx`:

```tsx
function App() {
  return <h1>Task Priority Notes</h1>;
}

export default App;
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `yarn test`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add apps/task-priority-notes
git commit -m "Scaffold task-priority-notes Vite + React + TypeScript app"
```

---

### Task 2: Task data model and `localStorage`-backed task store

**Files:**
- Create: `apps/task-priority-notes/src/storage/types.ts`
- Create: `apps/task-priority-notes/src/storage/taskStore.ts`
- Test: `apps/task-priority-notes/src/storage/taskStore.test.ts`

**Interfaces:**
- Produces: `TaskPriority` — `{ label: string; score: number; confidence: number; status: 'pending' | 'done' | 'error' }`.
- Produces: `Task` — `{ id: string; title: string; description: string; createdAt: string; done: boolean; priority?: TaskPriority }`.
- Produces: `loadTasks(): Task[]`, `saveTasks(tasks: Task[]): void`, `createTask(title: string, description: string): Task` (`storage/taskStore.ts`). Used by App (Task 14) and indirectly by every component that receives `Task[]`.

- [ ] **Step 1: Write `storage/types.ts`**

```ts
export interface TaskPriority {
  label: string;
  score: number;
  confidence: number;
  status: 'pending' | 'done' | 'error';
}

export interface Task {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  done: boolean;
  priority?: TaskPriority;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/task-priority-notes/src/storage/taskStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from './types';

describe('taskStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty array when nothing is stored', async () => {
    const { loadTasks } = await import('./taskStore');
    expect(loadTasks()).toEqual([]);
  });

  it('returns an empty array when localStorage holds invalid JSON', async () => {
    localStorage.setItem('tasks', '{not json');
    const { loadTasks } = await import('./taskStore');
    expect(loadTasks()).toEqual([]);
  });

  it('round-trips tasks through saveTasks/loadTasks', async () => {
    const { loadTasks, saveTasks } = await import('./taskStore');
    const tasks: Task[] = [
      { id: '1', title: 'Buy milk', description: '', createdAt: '2026-01-01T00:00:00.000Z', done: false },
    ];
    saveTasks(tasks);
    expect(loadTasks()).toEqual(tasks);
  });

  it('creates a task with a generated id, timestamp, done=false, and pending priority', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00.000Z'));
    const { createTask } = await import('./taskStore');

    const task = createTask('Buy milk', 'Whole milk, 2%');

    expect(task.title).toBe('Buy milk');
    expect(task.description).toBe('Whole milk, 2%');
    expect(task.done).toBe(false);
    expect(task.createdAt).toBe('2026-09-23T10:00:00.000Z');
    expect(task.id).toEqual(expect.any(String));
    expect(task.id.length).toBeGreaterThan(0);
    expect(task.priority).toEqual({ label: '', score: 0, confidence: 0, status: 'pending' });
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `yarn test src/storage/taskStore.test.ts`
Expected: FAIL — `Cannot find module './taskStore'`.

- [ ] **Step 4: Implement `storage/taskStore.ts`**

```ts
import type { Task } from './types';

const STORAGE_KEY = 'tasks';

export function loadTasks(): Task[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Task[]) : [];
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

export function createTask(title: string, description: string): Task {
  return {
    id: crypto.randomUUID(),
    title,
    description,
    createdAt: new Date().toISOString(),
    done: false,
    priority: { label: '', score: 0, confidence: 0, status: 'pending' },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/storage/taskStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/task-priority-notes/src/storage
git commit -m "Add task data model and localStorage-backed task store"
```

---

### Task 3: `localStorage`-backed priority criteria store

**Files:**
- Create: `apps/task-priority-notes/src/storage/criteriaStore.ts`
- Test: `apps/task-priority-notes/src/storage/criteriaStore.test.ts`

**Interfaces:**
- Produces: `DEFAULT_CRITERIA: string[]`, `loadCriteria(): string[]`, `saveCriteria(levels: string[]): void` (`storage/criteriaStore.ts`). Used by App (Task 14) and `CriteriaPanel` (Task 12).
- `saveCriteria` throws `Error('criteria must have at least 2 levels')` if given fewer than 2 entries — callers (the criteria panel) are expected to prevent this before calling, but the store enforces it as the final guard.

- [ ] **Step 1: Write the failing test**

Create `apps/task-priority-notes/src/storage/criteriaStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

describe('criteriaStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default criteria when nothing is stored', async () => {
    const { loadCriteria, DEFAULT_CRITERIA } = await import('./criteriaStore');
    expect(loadCriteria()).toEqual(DEFAULT_CRITERIA);
  });

  it('returns the default criteria when localStorage holds invalid JSON', async () => {
    localStorage.setItem('priorityCriteria', 'not json');
    const { loadCriteria, DEFAULT_CRITERIA } = await import('./criteriaStore');
    expect(loadCriteria()).toEqual(DEFAULT_CRITERIA);
  });

  it('round-trips criteria through saveCriteria/loadCriteria', async () => {
    const { loadCriteria, saveCriteria } = await import('./criteriaStore');
    saveCriteria(['minor', 'major']);
    expect(loadCriteria()).toEqual(['minor', 'major']);
  });

  it('rejects saving fewer than 2 levels', async () => {
    const { saveCriteria } = await import('./criteriaStore');
    expect(() => saveCriteria(['only-one'])).toThrow('criteria must have at least 2 levels');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/storage/criteriaStore.test.ts`
Expected: FAIL — `Cannot find module './criteriaStore'`.

- [ ] **Step 3: Implement `storage/criteriaStore.ts`**

```ts
const STORAGE_KEY = 'priorityCriteria';

export const DEFAULT_CRITERIA: string[] = ['low', 'medium', 'high', 'critical'];

export function loadCriteria(): string[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_CRITERIA;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length >= 2 ? (parsed as string[]) : DEFAULT_CRITERIA;
  } catch {
    return DEFAULT_CRITERIA;
  }
}

export function saveCriteria(levels: string[]): void {
  if (levels.length < 2) {
    throw new Error('criteria must have at least 2 levels');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/storage/criteriaStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/task-priority-notes/src/storage/criteriaStore.ts apps/task-priority-notes/src/storage/criteriaStore.test.ts
git commit -m "Add localStorage-backed priority criteria store"
```

---

### Task 4: Port `@receptron/laya`'s request/response types and pure sequence logic

**Files:**
- Create: `apps/task-priority-notes/src/lib/laya-browser/types.ts`
- Create: `apps/task-priority-notes/src/lib/laya-browser/sequence.ts`
- Test: `apps/task-priority-notes/src/lib/laya-browser/sequence.test.ts`

**Interfaces:**
- Produces (`types.ts`): `QuestionType`, `ChoiceQuestion`, `ScoreQuestion`, `NoulQuestion`, `Question`, `ChoiceAnswer`, `ScoreAnswer`, `NoulAnswer`, `Answer`, `AnswerFor<Q>`, `SystemOneResult<Q>`, `LayaConfig`, `InternalQuestion` — mirror `@receptron/laya`'s `dist/types.d.ts` exactly (ported for type parity; this app does not depend on the npm package itself, since it pulls in `onnxruntime-node`).
- Produces (`sequence.ts`): `QTYPES: Record<QuestionType, number>`, `toInternal(q: Question): InternalQuestion`, `renderOptions(q: InternalQuestion): string[]`, `pyJsonDumps(v: unknown): string`, `serializeState(state: unknown): string`, `tempBucket(qtype: number, k: number): string`, `confidenceFromProbs(p: number[]): number`, `softmax(z: number[]): number[]`, `SpecialTokenIds` (`{ cls: number; sep: number; mask: number; pad: number; maskTok: string }`), `buildSequence(encode: (text: string) => number[], ids: SpecialTokenIds, state: unknown, q: InternalQuestion, maxLen: number, headMaxLen: number): { ids: number[]; markers: number[] }`. Used by `model.ts` (Task 8).

- [ ] **Step 1: Write `lib/laya-browser/types.ts`**

```ts
// Ported from @receptron/laya's dist/types.d.ts (npm package "@receptron/laya"). This app
// reimplements the model/tokenizer layers against onnxruntime-web instead of depending on
// the npm package directly, since that package hard-requires onnxruntime-node (a native
// Node addon that cannot run in a browser). The request/response shapes are kept identical.

export type QuestionType = 'choice' | 'score' | 'noul';

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string | object;
  criteria: Record<string, string | null> | string[];
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string | object;
  criteria: string[];
}

export interface NoulQuestion {
  type: 'noul';
  instructions: string | object;
  criteria?: { true?: string; false?: string };
}

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  rl_agent: { act_probability: number };
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
  rl_agent: { act_probability: number };
}

export interface NoulAnswer {
  type: 'noul';
  noul: number;
  rl_agent: { act_probability: number };
}

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export type AnswerFor<Q extends Question> = Q extends ChoiceQuestion
  ? ChoiceAnswer
  : Q extends ScoreQuestion
    ? ScoreAnswer
    : NoulAnswer;

export interface SystemOneResult<Q extends Record<string, Question>> {
  model: string;
  answers: { [K in keyof Q]: AnswerFor<Q[K]> };
  usage: { input_tokens: number; output_tokens: number };
}

export interface LayaConfig {
  max_len: number;
  head_max_len: number;
  temperature: [number, number, number];
  temperature_by_options: Record<string, number>;
}

/** Internal (post-toInternal) question shape used by sequence building. */
export interface InternalQuestion {
  t: QuestionType;
  ins: string;
  crit: Record<string, string | null> | string[] | { true?: string; false?: string } | undefined;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/task-priority-notes/src/lib/laya-browser/sequence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  QTYPES,
  buildSequence,
  confidenceFromProbs,
  renderOptions,
  softmax,
  tempBucket,
  toInternal,
  type SpecialTokenIds,
} from './sequence';

describe('QTYPES', () => {
  it('maps question types to their model indices', () => {
    expect(QTYPES).toEqual({ choice: 0, score: 1, noul: 2 });
  });
});

describe('softmax', () => {
  it('normalizes logits into a probability distribution', () => {
    const p = softmax([1, 3]);
    expect(p[0]).toBeCloseTo(0.1192, 4);
    expect(p[1]).toBeCloseTo(0.8808, 4);
  });

  it('is uniform for equal logits', () => {
    const p = softmax([0, 0, 0]);
    expect(p[0]).toBeCloseTo(1 / 3, 6);
    expect(p[1]).toBeCloseTo(1 / 3, 6);
    expect(p[2]).toBeCloseTo(1 / 3, 6);
  });
});

describe('confidenceFromProbs', () => {
  it('is 1 for a fully certain distribution', () => {
    expect(confidenceFromProbs([1, 0])).toBe(1);
  });

  it('is 0 for a maximally uncertain two-way distribution', () => {
    expect(confidenceFromProbs([0.5, 0.5])).toBeCloseTo(0, 6);
  });
});

describe('tempBucket', () => {
  it('buckets by question type name and option-count range', () => {
    expect(tempBucket(QTYPES.score, 4)).toBe('score:3-5');
    expect(tempBucket(QTYPES.choice, 2)).toBe('choice:2');
    expect(tempBucket(QTYPES.noul, 11)).toBe('noul:11+');
  });
});

describe('toInternal + renderOptions', () => {
  it('renders score options as "level N: label"', () => {
    const q = toInternal({ type: 'score', instructions: 'urgent?', criteria: ['low', 'high'] });
    expect(renderOptions(q)).toEqual(['level 0: low', 'level 1: high']);
  });

  it('converts array criteria for choice questions into a key->null map, then renders keys only', () => {
    const q = toInternal({ type: 'choice', instructions: 'x', criteria: ['a', 'b'] });
    expect(q.crit).toEqual({ a: null, b: null });
    expect(renderOptions(q)).toEqual(['a', 'b']);
  });

  it('renders choice options with descriptions as "key: description"', () => {
    const q = toInternal({
      type: 'choice',
      instructions: 'x',
      criteria: { billing: 'payments', support: 'help' },
    });
    expect(renderOptions(q)).toEqual(['billing: payments', 'support: help']);
  });

  it('renders noul options with default wording when no criteria given', () => {
    const q = toInternal({ type: 'noul', instructions: 'x' });
    expect(renderOptions(q)).toEqual([
      'false: no, the statement does not hold',
      'true: yes, the statement holds',
    ]);
  });
});

describe('buildSequence', () => {
  const ids: SpecialTokenIds = { cls: 101, sep: 102, mask: 103, pad: 0, maskTok: '[MASK]' };
  // Deterministic stand-in tokenizer: each whitespace-separated word becomes its 0-based index.
  const encode = (text: string) => text.trim().split(/\s+/).filter(Boolean).map((_, i) => i);

  it('lays out [CLS] head [SEP] option0 option1 [SEP] state [SEP] with correct marker positions', () => {
    const q = toInternal({ type: 'score', instructions: 'urgent?', criteria: ['low', 'high'] });

    const result = buildSequence(encode, ids, 'refund issue', q, 64, 32);

    expect(result).toEqual({
      ids: [101, 0, 1, 2, 102, 103, 0, 1, 2, 103, 0, 1, 2, 102, 0, 1, 102],
      markers: [5, 9],
    });
  });

  it('shrinks option text evenly when too many/long options exceed head_max_len', () => {
    const q = toInternal({
      type: 'score',
      instructions: 'urgent?',
      criteria: ['level with a very long description one', 'level with a very long description two'],
    });

    // headMaxLen=10 is deliberately too small for 2 options at full length, forcing the
    // optBudget < 16 shrink branch.
    const result = buildSequence(encode, ids, 'state', q, 64, 10);

    expect(result.markers).toHaveLength(2);
    expect(result.ids[0]).toBe(ids.cls);
    // Each option still starts with the [MASK] marker token even after shrinking.
    expect(result.ids[result.markers[0]]).toBe(ids.mask);
    expect(result.ids[result.markers[1]]).toBe(ids.mask);
  });

  it('truncates to maxLen and drops markers that fall past the cutoff', () => {
    const q = toInternal({ type: 'score', instructions: 'urgent?', criteria: ['low', 'high'] });

    const result = buildSequence(encode, ids, 'refund issue', q, 6, 32);

    expect(result.ids.length).toBeLessThanOrEqual(6);
    expect(result.markers.every((m) => m < 6)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `yarn test src/lib/laya-browser/sequence.test.ts`
Expected: FAIL — `Cannot find module './sequence'`.

- [ ] **Step 4: Implement `lib/laya-browser/sequence.ts`**

```ts
// Ported from @receptron/laya's dist/sequence.js (npm package "@receptron/laya", the
// pure-JS tokenization-adjacent logic with zero Node dependencies). Logic unchanged from
// upstream; only converted to TypeScript against this app's local types.ts.

import type { InternalQuestion, Question, QuestionType } from './types';

export const QTYPES: Record<QuestionType, number> = { choice: 0, score: 1, noul: 2 };
const QTYPE_NAMES: QuestionType[] = ['choice', 'score', 'noul'];

export function toInternal(q: Question): InternalQuestion {
  let crit = q.criteria;
  if (q.type === 'choice' && Array.isArray(crit)) {
    crit = Object.fromEntries(crit.map((c) => [c, null]));
  }
  return {
    t: q.type,
    ins: typeof q.instructions === 'string' ? q.instructions : JSON.stringify(q.instructions),
    crit,
  };
}

export function renderOptions(q: InternalQuestion): string[] {
  if (q.t === 'choice') {
    const crit = q.crit as Record<string, string | null>;
    return Object.entries(crit).map(([k, v]) => (v ? `${k}: ${v}` : k));
  }
  if (q.t === 'score') {
    const crit = q.crit as string[];
    return crit.map((c, i) => `level ${i}: ${c}`);
  }
  const c = (q.crit ?? {}) as { true?: string; false?: string };
  return [
    'false: ' + (c.false || 'no, the statement does not hold'),
    'true: ' + (c.true || 'yes, the statement holds'),
  ];
}

export function pyJsonDumps(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map(pyJsonDumps).join(', ') + ']';
  return (
    '{' +
    Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${JSON.stringify(k)}: ${pyJsonDumps(x)}`)
      .join(', ') +
    '}'
  );
}

export function serializeState(state: unknown): string {
  return typeof state === 'string' ? state : pyJsonDumps(state);
}

function sizeBucket(k: number): string {
  if (k <= 2) return '2';
  if (k <= 5) return '3-5';
  if (k <= 10) return '6-10';
  return '11+';
}

export function tempBucket(qtype: number, k: number): string {
  return `${QTYPE_NAMES[qtype]}:${sizeBucket(k)}`;
}

export function confidenceFromProbs(p: number[]): number {
  const k = p.length;
  if (k < 2) return 1;
  let ent = 0;
  for (const x of p) ent -= x * Math.log(Math.max(x, 1e-12));
  return 1 - ent / Math.log(k);
}

export function softmax(z: number[]): number[] {
  const zmax = Math.max(...z);
  const e = z.map((v) => Math.exp(v - zmax));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

export interface SpecialTokenIds {
  cls: number;
  sep: number;
  mask: number;
  pad: number;
  maskTok: string;
}

/**
 * rl_common.build_sequence:
 *   [CLS] <type> question: instructions [SEP] [MASK] opt0 [MASK] opt1 ... [SEP] state [SEP]
 * Returns the ids and the position of each option's [MASK] marker.
 */
export function buildSequence(
  encode: (text: string) => number[],
  ids: SpecialTokenIds,
  state: unknown,
  q: InternalQuestion,
  maxLen: number,
  headMaxLen: number,
): { ids: number[]; markers: number[] } {
  const scrub = (s: string) => s.split(ids.maskTok).join(' ');
  const opts = renderOptions(q);
  let headIds = encode(`${q.t} question: ${scrub(q.ins)}`);
  let optIds = opts.map((o) => [ids.mask, ...encode(' ' + scrub(o)).slice(0, 48)]);
  const total = (xs: number[][]) => xs.reduce((s, o) => s + o.length, 0);
  let optBudget = headMaxLen - total(optIds);
  if (optBudget < 16) {
    const per = Math.max(4, Math.floor((headMaxLen - 16) / Math.max(1, optIds.length)));
    optIds = optIds.map((o) => o.slice(0, per));
    optBudget = headMaxLen - total(optIds);
  }
  headIds = headIds.slice(0, Math.max(8, optBudget));
  const seq = [ids.cls, ...headIds, ids.sep];
  const markers: number[] = [];
  for (const o of optIds) {
    markers.push(seq.length);
    seq.push(...o);
  }
  seq.push(ids.sep);
  const room = Math.max(0, maxLen - seq.length - 1);
  const st = encode(scrub(serializeState(state))).slice(0, room);
  seq.push(...st, ids.sep);
  return { ids: seq.slice(0, maxLen), markers: markers.filter((m) => m < maxLen) };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/lib/laya-browser/sequence.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/task-priority-notes/src/lib/laya-browser/types.ts apps/task-priority-notes/src/lib/laya-browser/sequence.ts apps/task-priority-notes/src/lib/laya-browser/sequence.test.ts
git commit -m "Port Laya's request/response types and pure sequence logic to TypeScript"
```

---

### Task 5: Browser tokenizer wrapper

**Files:**
- Create: `apps/task-priority-notes/src/lib/laya-browser/tokenizer.ts`
- Test: `apps/task-priority-notes/src/lib/laya-browser/tokenizer.test.ts`

**Interfaces:**
- Consumes: `Tokenizer` from `@huggingface/tokenizers` (its `package.json` declares a `"browser"` build — usable unmodified in this app).
- Produces: `LoadedTokenizer` (`{ encode: (text: string) => number[]; tokenToId: (token: string) => number | undefined }`), `loadTokenizer(tokenizerJson: unknown, tokenizerConfigJson: unknown): LoadedTokenizer` (`lib/laya-browser/tokenizer.ts`). Used by `model.ts` (Task 7).

- [ ] **Step 1: Write the failing test**

Create `apps/task-priority-notes/src/lib/laya-browser/tokenizer.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@huggingface/tokenizers', () => {
  return {
    Tokenizer: vi.fn().mockImplementation(() => ({
      encode: (text: string, opts: { add_special_tokens: boolean }) => ({
        ids: opts.add_special_tokens ? [0, ...text.length, 0] : Array.from(text).map((c) => c.charCodeAt(0)),
      }),
      token_to_id: (token: string) => (token === '[CLS]' ? 101 : undefined),
    })),
  };
});

describe('loadTokenizer', () => {
  it('wraps Tokenizer.encode with add_special_tokens disabled and exposes the ids', async () => {
    const { loadTokenizer } = await import('./tokenizer');
    const tok = loadTokenizer({ fake: 'tokenizer.json' }, { fake: 'tokenizer_config.json' });

    expect(tok.encode('AB')).toEqual(['A'.charCodeAt(0), 'B'.charCodeAt(0)]);
  });

  it('passes through token_to_id, including undefined for unknown tokens', async () => {
    const { loadTokenizer } = await import('./tokenizer');
    const tok = loadTokenizer({}, {});

    expect(tok.tokenToId('[CLS]')).toBe(101);
    expect(tok.tokenToId('[NOPE]')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/lib/laya-browser/tokenizer.test.ts`
Expected: FAIL — `Cannot find module './tokenizer'`.

- [ ] **Step 3: Install `@huggingface/tokenizers` (already declared in Task 1's `package.json`; confirm it's present)**

Run: `cd apps/task-priority-notes && yarn install` (no-op if already installed from Task 1).

- [ ] **Step 4: Implement `lib/laya-browser/tokenizer.ts`**

```ts
import { Tokenizer } from '@huggingface/tokenizers';

export interface LoadedTokenizer {
  encode: (text: string) => number[];
  tokenToId: (token: string) => number | undefined;
}

export function loadTokenizer(tokenizerJson: unknown, tokenizerConfigJson: unknown): LoadedTokenizer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tok = new (Tokenizer as any)(tokenizerJson, tokenizerConfigJson);
  return {
    encode: (text: string) => tok.encode(text, { add_special_tokens: false }).ids,
    tokenToId: (token: string) => tok.token_to_id(token),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/lib/laya-browser/tokenizer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/task-priority-notes/src/lib/laya-browser/tokenizer.ts apps/task-priority-notes/src/lib/laya-browser/tokenizer.test.ts
git commit -m "Add browser tokenizer wrapper around @huggingface/tokenizers"
```

---

### Task 6: Model bundle download + Cache Storage caching

**Files:**
- Create: `apps/task-priority-notes/src/lib/laya-browser/modelBundle.ts`
- Test: `apps/task-priority-notes/src/lib/laya-browser/modelBundle.test.ts`

**Interfaces:**
- Produces: `ProgressInfo` (`{ file: string; index: number; total: number }`), `BundleFiles` (`{ onnx: ArrayBuffer; onnxData: ArrayBuffer; config: LayaConfig; tokenizerJson: unknown; tokenizerConfigJson: unknown }`), `ensureBundle(onProgress?: (info: ProgressInfo) => void): Promise<BundleFiles>` (`lib/laya-browser/modelBundle.ts`). Used by `model.ts` (Task 7) and `DownloadProgress` (Task 10, via the `ProgressInfo` type) and `App.tsx` (Task 14).

- [ ] **Step 1: Write the failing test**

Create `apps/task-priority-notes/src/lib/laya-browser/modelBundle.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REPO_BASE = 'https://huggingface.co/receptron/laya-onnx/resolve/main';

function jsonBuffer(value: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
}

describe('ensureBundle', () => {
  let cachePut: ReturnType<typeof vi.fn>;
  let cacheMatch: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cachePut = vi.fn().mockResolvedValue(undefined);
    cacheMatch = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({ match: cacheMatch, put: cachePut }),
    });
    fetchMock = vi.fn().mockImplementation((url: string) => {
      const file = url.replace(`${REPO_BASE}/`, '');
      const bodies: Record<string, ArrayBuffer> = {
        'laya.onnx': new ArrayBuffer(4),
        'laya.onnx.data': new ArrayBuffer(8),
        'laya_config.json': jsonBuffer({ max_len: 64, head_max_len: 32, temperature: [1, 1, 1], temperature_by_options: {} }),
        'tokenizer/tokenizer.json': jsonBuffer({ fake: 'tokenizer' }),
        'tokenizer/tokenizer_config.json': jsonBuffer({ fake: 'config' }),
      };
      return Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(bodies[file]),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches all 5 bundle files from the Hugging Face repo and parses the JSON ones', async () => {
    const { ensureBundle } = await import('./modelBundle');

    const bundle = await ensureBundle();

    expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/laya.onnx`);
    expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/laya.onnx.data`);
    expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/laya_config.json`);
    expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/tokenizer/tokenizer.json`);
    expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/tokenizer/tokenizer_config.json`);
    expect(bundle.onnx.byteLength).toBe(4);
    expect(bundle.onnxData.byteLength).toBe(8);
    expect(bundle.config).toEqual({ max_len: 64, head_max_len: 32, temperature: [1, 1, 1], temperature_by_options: {} });
    expect(bundle.tokenizerJson).toEqual({ fake: 'tokenizer' });
    expect(bundle.tokenizerConfigJson).toEqual({ fake: 'config' });
  });

  it('reports progress once per file, in order, with an increasing index', async () => {
    const { ensureBundle } = await import('./modelBundle');
    const onProgress = vi.fn();

    await ensureBundle(onProgress);

    expect(onProgress).toHaveBeenCalledTimes(5);
    expect(onProgress).toHaveBeenNthCalledWith(1, { file: 'laya.onnx', index: 1, total: 5 });
    expect(onProgress).toHaveBeenNthCalledWith(5, {
      file: 'tokenizer/tokenizer_config.json',
      index: 5,
      total: 5,
    });
  });

  it('serves a file from Cache Storage instead of fetching when already cached', async () => {
    cacheMatch.mockImplementation((url: string) =>
      url.endsWith('laya_config.json')
        ? Promise.resolve({
            arrayBuffer: () =>
              Promise.resolve(
                jsonBuffer({ max_len: 1, head_max_len: 1, temperature: [1, 1, 1], temperature_by_options: {} }),
              ),
          })
        : Promise.resolve(undefined),
    );
    const { ensureBundle } = await import('./modelBundle');

    await ensureBundle();

    expect(fetchMock).not.toHaveBeenCalledWith(`${REPO_BASE}/laya_config.json`);
  });

  it('throws when a file fails to download', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    const { ensureBundle } = await import('./modelBundle');

    await expect(ensureBundle()).rejects.toThrow('failed to download laya.onnx: 404');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/lib/laya-browser/modelBundle.test.ts`
Expected: FAIL — `Cannot find module './modelBundle'`.

- [ ] **Step 3: Implement `lib/laya-browser/modelBundle.ts`**

```ts
import type { LayaConfig } from './types';

export interface ProgressInfo {
  file: string;
  index: number;
  total: number;
}

export interface BundleFiles {
  onnx: ArrayBuffer;
  onnxData: ArrayBuffer;
  config: LayaConfig;
  tokenizerJson: unknown;
  tokenizerConfigJson: unknown;
}

const REPO_BASE = 'https://huggingface.co/receptron/laya-onnx/resolve/main';
const CACHE_NAME = 'laya-model-v1';
const FILES = [
  'laya.onnx',
  'laya.onnx.data',
  'laya_config.json',
  'tokenizer/tokenizer.json',
  'tokenizer/tokenizer_config.json',
] as const;

async function fetchFile(file: string): Promise<ArrayBuffer> {
  const url = `${REPO_BASE}/${file}`;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    return cached.arrayBuffer();
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to download ${file}: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  await cache.put(url, new Response(buffer.slice(0)));
  return buffer;
}

export async function ensureBundle(onProgress?: (info: ProgressInfo) => void): Promise<BundleFiles> {
  const buffers: Record<string, ArrayBuffer> = {};
  for (let i = 0; i < FILES.length; i += 1) {
    const file = FILES[i];
    buffers[file] = await fetchFile(file);
    onProgress?.({ file, index: i + 1, total: FILES.length });
  }
  const decode = (buf: ArrayBuffer) => JSON.parse(new TextDecoder().decode(buf));
  return {
    onnx: buffers['laya.onnx'],
    onnxData: buffers['laya.onnx.data'],
    config: decode(buffers['laya_config.json']) as LayaConfig,
    tokenizerJson: decode(buffers['tokenizer/tokenizer.json']),
    tokenizerConfigJson: decode(buffers['tokenizer/tokenizer_config.json']),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/lib/laya-browser/modelBundle.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/task-priority-notes/src/lib/laya-browser/modelBundle.ts apps/task-priority-notes/src/lib/laya-browser/modelBundle.test.ts
git commit -m "Add Laya model bundle downloader with Cache Storage caching"
```

---

### Task 7: Model loading (`onnxruntime-web` session bootstrap)

**Files:**
- Modify (create): `apps/task-priority-notes/src/lib/laya-browser/model.ts`
- Test: `apps/task-priority-notes/src/lib/laya-browser/model.test.ts`

**Interfaces:**
- Consumes: `ensureBundle` (Task 6), `loadTokenizer` (Task 5), `ort.InferenceSession` from `onnxruntime-web`.
- Produces: `SpecialIds` (`{ cls: number; sep: number; mask: number; pad: number; maskTok: string }`), `LayaModel` (`{ session: ort.InferenceSession; tok: LoadedTokenizer; config: LayaConfig; ids: SpecialIds }`), `loadModel(onProgress?: (info: ProgressInfo) => void): Promise<LayaModel>` (`lib/laya-browser/model.ts`). `loadModel` caches the resolved model in a module-level singleton, retrying (not staying broken) after a failed attempt — same contract as this repo's backend `services/laya`. Used by Task 8 (`classify`) and Task 14 (`App.tsx`, for progress wiring only).

- [ ] **Step 1: Write the failing test**

Create `apps/task-priority-notes/src/lib/laya-browser/model.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const fakeBundle = {
  onnx: new ArrayBuffer(4),
  onnxData: new ArrayBuffer(8),
  config: { max_len: 64, head_max_len: 32, temperature: [1, 1, 1] as [number, number, number], temperature_by_options: {} },
  tokenizerJson: { fake: 'tokenizer' },
  tokenizerConfigJson: { fake: 'config' },
};

const specialTokenIds: Record<string, number> = { '[CLS]': 101, '[SEP]': 102, '[MASK]': 103, '[PAD]': 0 };

function mockTokenizer() {
  return { encode: vi.fn(), tokenToId: (t: string) => specialTokenIds[t] };
}

describe('loadModel', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('resolves the special token ids and opens an onnxruntime-web session with externalData', async () => {
    const ensureBundle = vi.fn().mockResolvedValue(fakeBundle);
    vi.doMock('./modelBundle', () => ({ ensureBundle }));
    const loadTokenizer = vi.fn().mockReturnValue(mockTokenizer());
    vi.doMock('./tokenizer', () => ({ loadTokenizer }));
    const fakeSession = { run: vi.fn() };
    const create = vi.fn().mockResolvedValue(fakeSession);
    vi.doMock('onnxruntime-web', () => ({ InferenceSession: { create } }));

    const { loadModel } = await import('./model');
    const model = await loadModel();

    expect(loadTokenizer).toHaveBeenCalledWith(fakeBundle.tokenizerJson, fakeBundle.tokenizerConfigJson);
    expect(model.ids).toEqual({ cls: 101, sep: 102, mask: 103, pad: 0, maskTok: '[MASK]' });
    expect(create).toHaveBeenCalledWith(
      fakeBundle.onnx,
      expect.objectContaining({
        executionProviders: ['wasm'],
        externalData: [{ path: 'laya.onnx.data', data: fakeBundle.onnxData }],
      }),
    );
    expect(model.session).toBe(fakeSession);
    expect(model.config).toBe(fakeBundle.config);
  });

  it('loads the bundle only once across multiple loadModel calls', async () => {
    const ensureBundle = vi.fn().mockResolvedValue(fakeBundle);
    vi.doMock('./modelBundle', () => ({ ensureBundle }));
    vi.doMock('./tokenizer', () => ({ loadTokenizer: vi.fn().mockReturnValue(mockTokenizer()) }));
    vi.doMock('onnxruntime-web', () => ({ InferenceSession: { create: vi.fn().mockResolvedValue({ run: vi.fn() }) } }));

    const { loadModel } = await import('./model');
    await loadModel();
    await loadModel();

    expect(ensureBundle).toHaveBeenCalledTimes(1);
  });

  it('retries loading if a previous attempt failed', async () => {
    const ensureBundle = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(fakeBundle);
    vi.doMock('./modelBundle', () => ({ ensureBundle }));
    vi.doMock('./tokenizer', () => ({ loadTokenizer: vi.fn().mockReturnValue(mockTokenizer()) }));
    vi.doMock('onnxruntime-web', () => ({ InferenceSession: { create: vi.fn().mockResolvedValue({ run: vi.fn() }) } }));

    const { loadModel } = await import('./model');

    await expect(loadModel()).rejects.toThrow('network down');
    await expect(loadModel()).resolves.toBeDefined();
    expect(ensureBundle).toHaveBeenCalledTimes(2);
  });

  it('throws a clear error when a required special token is missing from the tokenizer', async () => {
    vi.doMock('./modelBundle', () => ({ ensureBundle: vi.fn().mockResolvedValue(fakeBundle) }));
    vi.doMock('./tokenizer', () => ({
      loadTokenizer: vi.fn().mockReturnValue({ encode: vi.fn(), tokenToId: () => undefined }),
    }));
    vi.doMock('onnxruntime-web', () => ({ InferenceSession: { create: vi.fn() } }));

    const { loadModel } = await import('./model');

    await expect(loadModel()).rejects.toThrow('special token [CLS] missing from tokenizer');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/lib/laya-browser/model.test.ts`
Expected: FAIL — `Cannot find module './model'`.

- [ ] **Step 3: Implement the loading half of `lib/laya-browser/model.ts`**

```ts
import * as ort from 'onnxruntime-web';
import { ensureBundle, type ProgressInfo } from './modelBundle';
import { loadTokenizer, type LoadedTokenizer } from './tokenizer';
import type { LayaConfig } from './types';

export interface SpecialIds {
  cls: number;
  sep: number;
  mask: number;
  pad: number;
  maskTok: string;
}

export interface LayaModel {
  session: ort.InferenceSession;
  tok: LoadedTokenizer;
  config: LayaConfig;
  ids: SpecialIds;
}

let modelPromise: Promise<LayaModel> | undefined;

export function loadModel(onProgress?: (info: ProgressInfo) => void): Promise<LayaModel> {
  if (!modelPromise) {
    modelPromise = buildModel(onProgress).catch((error) => {
      modelPromise = undefined;
      throw error;
    });
  }
  return modelPromise;
}

async function buildModel(onProgress?: (info: ProgressInfo) => void): Promise<LayaModel> {
  const bundle = await ensureBundle(onProgress);
  const tok = loadTokenizer(bundle.tokenizerJson, bundle.tokenizerConfigJson);
  const id = (t: string) => {
    const v = tok.tokenToId(t);
    if (v === undefined) throw new Error(`special token ${t} missing from tokenizer`);
    return v;
  };
  const ids: SpecialIds = { cls: id('[CLS]'), sep: id('[SEP]'), mask: id('[MASK]'), pad: id('[PAD]'), maskTok: '[MASK]' };
  const session = await ort.InferenceSession.create(bundle.onnx, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    externalData: [{ path: 'laya.onnx.data', data: bundle.onnxData }],
  });
  return { session, tok, config: bundle.config, ids };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/lib/laya-browser/model.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/task-priority-notes/src/lib/laya-browser/model.ts apps/task-priority-notes/src/lib/laya-browser/model.test.ts
git commit -m "Add onnxruntime-web session bootstrap for the Laya browser port"
```

---

### Task 8: Classification (`systemOne` port) and the public `classify` entry point

**Files:**
- Modify: `apps/task-priority-notes/src/lib/laya-browser/model.ts`
- Modify: `apps/task-priority-notes/src/lib/laya-browser/model.test.ts`

**Interfaces:**
- Consumes: `LayaModel`, `loadModel` (Task 7); `toInternal`, `buildSequence`, `renderOptions`, `QTYPES`, `tempBucket`, `softmax`, `confidenceFromProbs` (Task 4).
- Produces: `classifyWithModel<Q extends Record<string, Question>>(model: LayaModel, state: unknown, questions: Q): Promise<SystemOneResult<Q>>` and `classify<Q extends Record<string, Question>>(state: unknown, questions: Q, onProgress?: (info: ProgressInfo) => void): Promise<SystemOneResult<Q>>` (`lib/laya-browser/model.ts`). `classify` is the function `lib/priority.ts` (Task 9) calls.

- [ ] **Step 1: Add the failing tests (append to the existing `model.test.ts`)**

Add to `apps/task-priority-notes/src/lib/laya-browser/model.test.ts` (new top-level `describe` block, alongside the existing `loadModel` one — keep the existing tests and imports):

```ts
describe('classifyWithModel', () => {
  it('scores a single score-type question and maps the output to a SystemOneResult', async () => {
    vi.resetModules();
    const { classifyWithModel } = await import('./model');

    const fakeModel = {
      session: {
        run: vi.fn().mockResolvedValue({
          logits: { data: new Float32Array([1, 3]) },
          act_probs: { data: new Float32Array([0.42]), dims: [1, 1] },
        }),
      },
      tok: { encode: (text: string) => text.trim().split(/\s+/).filter(Boolean).map((_, i) => i), tokenToId: () => 0 },
      config: { max_len: 64, head_max_len: 32, temperature: [1, 1, 1] as [number, number, number], temperature_by_options: {} },
      ids: { cls: 101, sep: 102, mask: 103, pad: 0, maskTok: '[MASK]' },
    };

    const result = await classifyWithModel(fakeModel as never, 'refund issue', {
      urgency: { type: 'score', instructions: 'urgent?', criteria: ['low', 'high'] },
    });

    expect(result.model).toBe('laya-browser');
    expect(result.usage).toEqual({ input_tokens: 17, output_tokens: 0 });
    expect(result.answers.urgency.type).toBe('score');
    expect(result.answers.urgency.score).toBeCloseTo(0.8808, 4);
    expect(result.answers.urgency.confidence).toBeCloseTo(0.4729, 4);
    expect(result.answers.urgency.legend).toEqual({ '0': 'low', '1': 'high' });
    expect(result.answers.urgency.probabilities).toEqual({ '0': 0.1192, '1': 0.8808 });
    expect(result.answers.urgency.rl_agent).toEqual({ act_probability: 0.42 });
    expect(fakeModel.session.run).toHaveBeenCalledWith(
      expect.objectContaining({
        input_ids: expect.anything(),
        attention_mask: expect.anything(),
        marker_pos: expect.anything(),
        marker_mask: expect.anything(),
        qtype: expect.anything(),
      }),
    );
  });

  it('throws when no questions are given', async () => {
    vi.resetModules();
    const { classifyWithModel } = await import('./model');
    await expect(classifyWithModel({} as never, 'x', {})).rejects.toThrow(
      'classify: at least one question is required',
    );
  });
});

describe('classify', () => {
  it('loads the model then delegates to classifyWithModel', async () => {
    vi.resetModules();
    const fakeModel = {
      session: {
        run: vi.fn().mockResolvedValue({
          logits: { data: new Float32Array([1, 3]) },
          act_probs: { data: new Float32Array([0.42]), dims: [1, 1] },
        }),
      },
      tok: { encode: (text: string) => text.trim().split(/\s+/).filter(Boolean).map((_, i) => i), tokenToId: () => 0 },
      config: { max_len: 64, head_max_len: 32, temperature: [1, 1, 1] as [number, number, number], temperature_by_options: {} },
      ids: { cls: 101, sep: 102, mask: 103, pad: 0, maskTok: '[MASK]' },
    };
    vi.doMock('./modelBundle', () => ({ ensureBundle: vi.fn() }));
    vi.doMock('./tokenizer', () => ({ loadTokenizer: vi.fn() }));
    vi.doMock('onnxruntime-web', () => ({ InferenceSession: { create: vi.fn() } }));

    const model = await import('./model');
    vi.spyOn(model, 'loadModel').mockResolvedValue(fakeModel as never);

    const result = await model.classify('refund issue', {
      urgency: { type: 'score', instructions: 'urgent?', criteria: ['low', 'high'] },
    });

    expect(result.answers.urgency.score).toBeCloseTo(0.8808, 4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/lib/laya-browser/model.test.ts`
Expected: FAIL — `classifyWithModel is not a function` / `classify is not a function` (or similar — `Property does not exist`).

- [ ] **Step 3: Implement `classifyWithModel` and `classify`, appended to `lib/laya-browser/model.ts`**

Add these imports to the top of `apps/task-priority-notes/src/lib/laya-browser/model.ts` (alongside the existing ones from Task 7):

```ts
import { buildSequence, confidenceFromProbs, QTYPES, renderOptions, softmax, tempBucket, toInternal } from './sequence';
import type { Answer, Question, SystemOneResult } from './types';
```

Append to the end of the file:

```ts
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

export async function classifyWithModel<Q extends Record<string, Question>>(
  model: LayaModel,
  state: unknown,
  questions: Q,
): Promise<SystemOneResult<Q>> {
  const qids = Object.keys(questions);
  if (qids.length === 0) {
    throw new Error('classify: at least one question is required');
  }
  const items = qids.map((qid) => {
    const q = toInternal(questions[qid]);
    const { ids, markers } = buildSequence(model.tok.encode, model.ids, state, q, model.config.max_len, model.config.head_max_len);
    if (markers.length !== renderOptions(q).length) {
      throw new Error(`question ${JSON.stringify(qid)}: options do not fit in head_max_len=${model.config.head_max_len} tokens`);
    }
    return { q, ids, markers, qtype: QTYPES[q.t] };
  });

  const n = items.length;
  const L = Math.max(...items.map((it) => it.ids.length));
  const K = Math.max(...items.map((it) => it.markers.length));
  const inputIds = new BigInt64Array(n * L).fill(BigInt(model.ids.pad));
  const attention = new BigInt64Array(n * L);
  const markerPos = new BigInt64Array(n * K);
  const markerMask = new Uint8Array(n * K);
  const qtype = new BigInt64Array(n);
  let nTokens = 0;

  items.forEach((it, i) => {
    it.ids.forEach((v, j) => {
      inputIds[i * L + j] = BigInt(v);
      attention[i * L + j] = 1n;
    });
    nTokens += it.ids.length;
    it.markers.forEach((m, j) => {
      markerPos[i * K + j] = BigInt(m);
      markerMask[i * K + j] = 1;
    });
    qtype[i] = BigInt(it.qtype);
  });

  const out = await model.session.run({
    input_ids: new ort.Tensor('int64', inputIds, [n, L]),
    attention_mask: new ort.Tensor('int64', attention, [n, L]),
    marker_pos: new ort.Tensor('int64', markerPos, [n, K]),
    marker_mask: new ort.Tensor('bool', markerMask, [n, K]),
    qtype: new ort.Tensor('int64', qtype, [n]),
  });

  const logits = out.logits?.data;
  const act = out.act_probs;
  if (!(logits instanceof Float32Array) || !act || !(act.data instanceof Float32Array)) {
    throw new Error('unexpected model outputs (expected float32 logits and act_probs)');
  }
  const actData = act.data;
  const nAct = (act.dims as readonly number[])[1] ?? 1;
  const answers: Record<string, Answer> = {};

  items.forEach((it, r) => {
    const qid = qids[r];
    const k = it.markers.length;
    const temp = model.config.temperature_by_options[tempBucket(it.qtype, k)] ?? model.config.temperature[it.qtype] ?? 1;
    const p = softmax(Array.from(logits.subarray(r * K, r * K + k), (v) => v / temp));
    const ext = { act_probability: actData[r * nAct] ?? 0 };
    const q = it.q;
    if (q.t === 'choice') {
      const keys = Object.keys(q.crit as Record<string, string | null>);
      const best = p.indexOf(Math.max(...p));
      answers[qid] = {
        type: 'choice',
        choice: keys[best],
        probabilities: Object.fromEntries(keys.map((kk, i) => [kk, round4(p[i] ?? 0)])),
        confidence: round4(confidenceFromProbs(p)),
        rl_agent: ext,
      };
    } else if (q.t === 'score') {
      const crit = q.crit as string[];
      answers[qid] = {
        type: 'score',
        score: round4(p.reduce((s, v, i) => s + i * v, 0)),
        legend: Object.fromEntries(crit.map((c, i) => [String(i), c])),
        probabilities: Object.fromEntries(p.map((v, i) => [String(i), round4(v)])),
        confidence: round4(confidenceFromProbs(p)),
        rl_agent: ext,
      };
    } else {
      answers[qid] = { type: 'noul', noul: round4(p[1] ?? 0), rl_agent: ext };
    }
  });

  return {
    model: 'laya-browser',
    answers: answers as SystemOneResult<Q>['answers'],
    usage: { input_tokens: nTokens, output_tokens: 0 },
  };
}

export async function classify<Q extends Record<string, Question>>(
  state: unknown,
  questions: Q,
  onProgress?: (info: ProgressInfo) => void,
): Promise<SystemOneResult<Q>> {
  const model = await loadModel(onProgress);
  return classifyWithModel(model, state, questions);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/lib/laya-browser/model.test.ts`
Expected: PASS (8 tests total across both describe blocks added so far).

- [ ] **Step 5: Commit**

```bash
git add apps/task-priority-notes/src/lib/laya-browser/model.ts apps/task-priority-notes/src/lib/laya-browser/model.test.ts
git commit -m "Port Laya's systemOne classification to onnxruntime-web"
```

---

### Task 9: Priority orchestration (`lib/priority.ts`)

**Files:**
- Create: `apps/task-priority-notes/src/lib/priority.ts`
- Test: `apps/task-priority-notes/src/lib/priority.test.ts`

**Interfaces:**
- Consumes: `classify` (Task 8), `ProgressInfo` (Task 6).
- Produces: `computePriority(title: string, description: string, criteria: string[], onProgress?: (info: ProgressInfo) => void): Promise<{ label: string; score: number; confidence: number }>` (`lib/priority.ts`). Throws on failure (does not itself set an `'error'` status — the caller, `App.tsx` in Task 14, decides how to represent failure). Used by `App.tsx` (Task 14).

- [ ] **Step 1: Write the failing test**

Create `apps/task-priority-notes/src/lib/priority.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('./laya-browser/model', () => ({
  classify: vi.fn(),
}));

describe('computePriority', () => {
  it('sends a single score question built from the given criteria and maps the answer to a label', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue({
      model: 'laya-browser',
      answers: { urgency: { type: 'score', score: 2.6, confidence: 0.75, legend: {}, probabilities: {}, rl_agent: { act_probability: 0 } } },
      usage: { input_tokens: 10, output_tokens: 0 },
    } as never);

    const result = await computePriority('Fix login bug', 'Users cannot log in', ['low', 'medium', 'high', 'critical']);

    expect(classify).toHaveBeenCalledWith(
      { title: 'Fix login bug', description: 'Users cannot log in' },
      { urgency: { type: 'score', instructions: expect.any(String), criteria: ['low', 'medium', 'high', 'critical'] } },
      undefined,
    );
    expect(result).toEqual({ label: 'critical', score: 2.6, confidence: 0.75 });
  });

  it('rounds the score to the nearest criteria index and clamps to the valid range', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue({
      model: 'laya-browser',
      answers: { urgency: { type: 'score', score: 0.4, confidence: 0.5, legend: {}, probabilities: {}, rl_agent: { act_probability: 0 } } },
      usage: { input_tokens: 10, output_tokens: 0 },
    } as never);

    const result = await computePriority('Task', '', ['low', 'high']);

    expect(result.label).toBe('low');
  });

  it('propagates rejection from classify so the caller can decide how to surface the failure', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockRejectedValue(new Error('model unavailable'));

    await expect(computePriority('Task', '', ['low', 'high'])).rejects.toThrow('model unavailable');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/lib/priority.test.ts`
Expected: FAIL — `Cannot find module './priority'`.

- [ ] **Step 3: Implement `lib/priority.ts`**

```ts
import { classify } from './laya-browser/model';
import type { ProgressInfo } from './laya-browser/modelBundle';

const INSTRUCTIONS = 'How urgent is this task?';

export async function computePriority(
  title: string,
  description: string,
  criteria: string[],
  onProgress?: (info: ProgressInfo) => void,
): Promise<{ label: string; score: number; confidence: number }> {
  const result = await classify(
    { title, description },
    { urgency: { type: 'score', instructions: INSTRUCTIONS, criteria } },
    onProgress,
  );
  const answer = result.answers.urgency;
  const index = Math.min(criteria.length - 1, Math.max(0, Math.round(answer.score)));
  return { label: criteria[index], score: answer.score, confidence: answer.confidence };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/lib/priority.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/task-priority-notes/src/lib/priority.ts apps/task-priority-notes/src/lib/priority.test.ts
git commit -m "Add priority orchestration that turns a task into a Laya score question"
```

---

### Task 10: `DownloadProgress` component

**Files:**
- Create: `apps/task-priority-notes/src/components/DownloadProgress.tsx`
- Test: `apps/task-priority-notes/src/components/DownloadProgress.test.tsx`

**Interfaces:**
- Consumes: `ProgressInfo` (Task 6).
- Produces: `DownloadProgress` (default export, `{ progress: ProgressInfo | null }` props) (`components/DownloadProgress.tsx`). Used by `App.tsx` (Task 14).

- [ ] **Step 1: Write the failing test**

Create `apps/task-priority-notes/src/components/DownloadProgress.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DownloadProgress } from './DownloadProgress';

describe('DownloadProgress', () => {
  it('renders nothing when there is no progress', () => {
    const { container } = render(<DownloadProgress progress={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current file count and percent complete', () => {
    render(<DownloadProgress progress={{ file: 'laya.onnx', index: 2, total: 5 }} />);
    expect(screen.getByText(/2 of 5 files/)).toBeInTheDocument();
    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/components/DownloadProgress.test.tsx`
Expected: FAIL — `Cannot find module './DownloadProgress'`.

- [ ] **Step 3: Implement `components/DownloadProgress.tsx`**

```tsx
import type { ProgressInfo } from '../lib/laya-browser/modelBundle';

export interface DownloadProgressProps {
  progress: ProgressInfo | null;
}

export function DownloadProgress({ progress }: DownloadProgressProps) {
  if (!progress) return null;
  const percent = Math.round((progress.index / progress.total) * 100);
  return (
    <div role="status" aria-label="Downloading priority model">
      <p>
        Downloading priority model… {progress.index} of {progress.total} files ({percent}%)
      </p>
      <progress value={progress.index} max={progress.total} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/components/DownloadProgress.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/task-priority-notes/src/components/DownloadProgress.tsx apps/task-priority-notes/src/components/DownloadProgress.test.tsx
git commit -m "Add DownloadProgress component for first-use model download"
```

---

### Task 11: `TaskForm` component

**Files:**
- Create: `apps/task-priority-notes/src/components/TaskForm.tsx`
- Test: `apps/task-priority-notes/src/components/TaskForm.test.tsx`

**Interfaces:**
- Produces: `TaskForm` (`{ onAdd: (title: string, description: string) => void }` props) (`components/TaskForm.tsx`). Used by `App.tsx` (Task 14).

- [ ] **Step 1: Write the failing test**

Create `apps/task-priority-notes/src/components/TaskForm.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskForm } from './TaskForm';

describe('TaskForm', () => {
  it('calls onAdd with the trimmed title and description, then clears the form', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<TaskForm onAdd={onAdd} />);

    await user.type(screen.getByLabelText('Title'), '  Buy milk  ');
    await user.type(screen.getByLabelText('Description'), ' 2% please ');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(onAdd).toHaveBeenCalledWith('Buy milk', '2% please');
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it('does not call onAdd when the title is empty or whitespace-only', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<TaskForm onAdd={onAdd} />);

    await user.type(screen.getByLabelText('Title'), '   ');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(onAdd).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/components/TaskForm.test.tsx`
Expected: FAIL — `Cannot find module './TaskForm'`.

- [ ] **Step 3: Install `@testing-library/user-event` (already declared in Task 1's `package.json`; confirm present)**

Run: `cd apps/task-priority-notes && yarn install` (no-op if already installed).

- [ ] **Step 4: Implement `components/TaskForm.tsx`**

```tsx
import { useState, type FormEvent } from 'react';

export interface TaskFormProps {
  onAdd: (title: string, description: string) => void;
}

export function TaskForm({ onAdd }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onAdd(trimmedTitle, description.trim());
    setTitle('');
    setDescription('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="task-title">Title</label>
      <input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="task-description">Description</label>
      <textarea id="task-description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <button type="submit">Add task</button>
    </form>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/components/TaskForm.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/task-priority-notes/src/components/TaskForm.tsx apps/task-priority-notes/src/components/TaskForm.test.tsx
git commit -m "Add TaskForm component"
```

---

### Task 12: `CriteriaPanel` component

**Files:**
- Create: `apps/task-priority-notes/src/components/CriteriaPanel.tsx`
- Test: `apps/task-priority-notes/src/components/CriteriaPanel.test.tsx`

**Interfaces:**
- Produces: `CriteriaPanel` (`{ criteria: string[]; onChange: (next: string[]) => void }` props) (`components/CriteriaPanel.tsx`). Used by `App.tsx` (Task 14).

- [ ] **Step 1: Write the failing test**

Create `apps/task-priority-notes/src/components/CriteriaPanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CriteriaPanel } from './CriteriaPanel';

describe('CriteriaPanel', () => {
  it('renders one input per criteria level', () => {
    render(<CriteriaPanel criteria={['low', 'high']} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Criteria level 1')).toHaveValue('low');
    expect(screen.getByLabelText('Criteria level 2')).toHaveValue('high');
  });

  it('calls onChange with a renamed level', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CriteriaPanel criteria={['low', 'high']} onChange={onChange} />);

    await user.clear(screen.getByLabelText('Criteria level 1'));
    await user.type(screen.getByLabelText('Criteria level 1'), 'minor');

    expect(onChange).toHaveBeenLastCalledWith(['minor', 'high']);
  });

  it('calls onChange with an appended level when "Add level" is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CriteriaPanel criteria={['low', 'high']} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Add level' }));

    expect(onChange).toHaveBeenCalledWith(['low', 'high', 'level 3']);
  });

  it('disables Remove on every level when only 2 levels remain', () => {
    render(<CriteriaPanel criteria={['low', 'high']} onChange={vi.fn()} />);
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    expect(removeButtons).toHaveLength(2);
    removeButtons.forEach((button) => expect(button).toBeDisabled());
  });

  it('calls onChange without the removed level when more than 2 levels exist', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CriteriaPanel criteria={['low', 'medium', 'high']} onChange={onChange} />);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]);

    expect(onChange).toHaveBeenCalledWith(['low', 'high']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/components/CriteriaPanel.test.tsx`
Expected: FAIL — `Cannot find module './CriteriaPanel'`.

- [ ] **Step 3: Implement `components/CriteriaPanel.tsx`**

```tsx
export interface CriteriaPanelProps {
  criteria: string[];
  onChange: (next: string[]) => void;
}

export function CriteriaPanel({ criteria, onChange }: CriteriaPanelProps) {
  const handleRename = (index: number, value: string) => {
    const next = criteria.slice();
    next[index] = value;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    if (criteria.length <= 2) return;
    onChange(criteria.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...criteria, `level ${criteria.length + 1}`]);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= criteria.length) return;
    const next = criteria.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <section aria-label="Priority criteria">
      <h2>Priority criteria</h2>
      <ul>
        {criteria.map((level, index) => (
          <li key={index}>
            <label htmlFor={`criteria-${index}`}>{`Criteria level ${index + 1}`}</label>
            <input
              id={`criteria-${index}`}
              value={level}
              onChange={(e) => handleRename(index, e.target.value)}
            />
            <button type="button" onClick={() => handleMove(index, -1)} disabled={index === 0}>
              Up
            </button>
            <button type="button" onClick={() => handleMove(index, 1)} disabled={index === criteria.length - 1}>
              Down
            </button>
            <button type="button" onClick={() => handleRemove(index)} disabled={criteria.length <= 2}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={handleAdd}>
        Add level
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/components/CriteriaPanel.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/task-priority-notes/src/components/CriteriaPanel.tsx apps/task-priority-notes/src/components/CriteriaPanel.test.tsx
git commit -m "Add CriteriaPanel component for editing urgency levels"
```

---

### Task 13: `TaskItem` and `TaskList` components

**Files:**
- Create: `apps/task-priority-notes/src/components/TaskItem.tsx`
- Create: `apps/task-priority-notes/src/components/TaskList.tsx`
- Test: `apps/task-priority-notes/src/components/TaskItem.test.tsx`

**Interfaces:**
- Consumes: `Task` (Task 2).
- Produces: `TaskItem` (`{ task: Task; onToggleDone: (id: string) => void; onDelete: (id: string) => void; onRetry: (id: string) => void }` props), `TaskList` (`{ tasks: Task[]; onToggleDone; onDelete; onRetry }` props, same handler signatures) (`components/TaskItem.tsx`, `components/TaskList.tsx`). Used by `App.tsx` (Task 14).

- [ ] **Step 1: Write the failing test**

Create `apps/task-priority-notes/src/components/TaskItem.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '../storage/types';
import { TaskItem } from './TaskItem';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    title: 'Buy milk',
    description: '2%',
    createdAt: '2026-09-23T00:00:00.000Z',
    done: false,
    priority: { label: '', score: 0, confidence: 0, status: 'pending' },
    ...overrides,
  };
}

describe('TaskItem', () => {
  it('shows a classifying indicator while priority.status is pending', () => {
    render(<TaskItem task={makeTask()} onToggleDone={vi.fn()} onDelete={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText('Classifying…')).toBeInTheDocument();
  });

  it('shows the label and confidence once classified', () => {
    render(
      <TaskItem
        task={makeTask({ priority: { label: 'high', score: 2.4, confidence: 0.81, status: 'done' } })}
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/Priority: high/)).toBeInTheDocument();
    expect(screen.getByText(/81%/)).toBeInTheDocument();
  });

  it('shows a retry button on error and calls onRetry with the task id', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <TaskItem
        task={makeTask({ priority: { label: '', score: 0, confidence: 0, status: 'error' } })}
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledWith('1');
  });

  it('calls onToggleDone when the checkbox is clicked', async () => {
    const user = userEvent.setup();
    const onToggleDone = vi.fn();
    render(<TaskItem task={makeTask()} onToggleDone={onToggleDone} onDelete={vi.fn()} onRetry={vi.fn()} />);

    await user.click(screen.getByRole('checkbox'));

    expect(onToggleDone).toHaveBeenCalledWith('1');
  });

  it('calls onDelete when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<TaskItem task={makeTask()} onToggleDone={vi.fn()} onDelete={onDelete} onRetry={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith('1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/components/TaskItem.test.tsx`
Expected: FAIL — `Cannot find module './TaskItem'`.

- [ ] **Step 3: Implement `components/TaskItem.tsx`**

```tsx
import type { Task } from '../storage/types';

export interface TaskItemProps {
  task: Task;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

export function TaskItem({ task, onToggleDone, onDelete, onRetry }: TaskItemProps) {
  return (
    <li>
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => onToggleDone(task.id)}
        aria-label={`Mark ${task.title} done`}
      />
      <span style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</span>
      {task.description && <p>{task.description}</p>}
      {task.priority?.status === 'pending' && <span role="status">Classifying…</span>}
      {task.priority?.status === 'done' && (
        <span>
          Priority: {task.priority.label} ({Math.round(task.priority.confidence * 100)}% confidence)
        </span>
      )}
      {task.priority?.status === 'error' && (
        <span>
          Couldn&apos;t classify.
          <button type="button" onClick={() => onRetry(task.id)}>
            Retry
          </button>
        </span>
      )}
      <button type="button" onClick={() => onDelete(task.id)}>
        Delete
      </button>
    </li>
  );
}
```

- [ ] **Step 4: Implement `components/TaskList.tsx`** (no dedicated test — trivial mapping over the already-tested `TaskItem`; exercised end-to-end in Task 14's `App.test.tsx`)

```tsx
import type { Task } from '../storage/types';
import { TaskItem } from './TaskItem';

export interface TaskListProps {
  tasks: Task[];
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

export function TaskList({ tasks, onToggleDone, onDelete, onRetry }: TaskListProps) {
  if (tasks.length === 0) {
    return <p>No tasks yet.</p>;
  }
  return (
    <ul>
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} onToggleDone={onToggleDone} onDelete={onDelete} onRetry={onRetry} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/components/TaskItem.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/task-priority-notes/src/components/TaskItem.tsx apps/task-priority-notes/src/components/TaskList.tsx apps/task-priority-notes/src/components/TaskItem.test.tsx
git commit -m "Add TaskItem and TaskList components"
```

---

### Task 14: Wire everything together in `App.tsx`

**Files:**
- Modify: `apps/task-priority-notes/src/App.tsx`
- Modify: `apps/task-priority-notes/src/App.test.tsx`

**Interfaces:**
- Consumes: `loadTasks`, `saveTasks`, `createTask` (Task 2); `loadCriteria`, `saveCriteria` (Task 3); `computePriority` (Task 9); `ProgressInfo` (Task 6); `TaskForm` (Task 11); `CriteriaPanel` (Task 12); `TaskList` (Task 13); `DownloadProgress` (Task 10).
- Produces: the final `App` default export.

- [ ] **Step 1: Write the failing tests (replace the placeholder `App.test.tsx` from Task 1)**

Replace `apps/task-priority-notes/src/App.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./lib/priority', () => ({
  computePriority: vi.fn(),
}));

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
  });

  it('renders the app heading and an empty task list', async () => {
    const App = (await import('./App')).default;
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Task Priority Notes' })).toBeInTheDocument();
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument();
  });

  it('adding a task shows it pending, then classified once computePriority resolves', async () => {
    const { computePriority } = await import('./lib/priority');
    vi.mocked(computePriority).mockResolvedValue({ label: 'high', score: 2.6, confidence: 0.9 });
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    await user.type(screen.getByLabelText('Title'), 'Fix login bug');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(screen.getByText('Classifying…')).toBeInTheDocument();
    expect(await screen.findByText(/Priority: high/)).toBeInTheDocument();
  });

  it('adding a task shows a retry button when computePriority rejects, and retry re-runs it', async () => {
    const { computePriority } = await import('./lib/priority');
    vi.mocked(computePriority)
      .mockRejectedValueOnce(new Error('model unavailable'))
      .mockResolvedValueOnce({ label: 'low', score: 0.2, confidence: 0.6 });
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    await user.type(screen.getByLabelText('Title'), 'Fix login bug');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    await screen.findByRole('button', { name: 'Retry' });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(/Priority: low/)).toBeInTheDocument();
    expect(computePriority).toHaveBeenCalledTimes(2);
  });

  it('toggling done and deleting a task both work', async () => {
    const { computePriority } = await import('./lib/priority');
    vi.mocked(computePriority).mockResolvedValue({ label: 'low', score: 0, confidence: 0.5 });
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    await user.type(screen.getByLabelText('Title'), 'Fix login bug');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await screen.findByText(/Priority: low/);

    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument();
  });

  it('editing criteria does not change an already-classified task\'s displayed label', async () => {
    const { computePriority } = await import('./lib/priority');
    vi.mocked(computePriority).mockResolvedValue({ label: 'high', score: 2, confidence: 0.9 });
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    await user.type(screen.getByLabelText('Title'), 'Fix login bug');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await screen.findByText(/Priority: high/);

    await user.clear(screen.getByLabelText('Criteria level 3'));
    await user.type(screen.getByLabelText('Criteria level 3'), 'urgent');

    expect(screen.getByText(/Priority: high/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/App.test.tsx`
Expected: FAIL — the current `App` renders only a static heading with no form/list, so `getByLabelText('Title')`, `'No tasks yet.'`, etc. are not found.

- [ ] **Step 3: Implement the final `App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { createTask, loadTasks, saveTasks } from './storage/taskStore';
import { loadCriteria, saveCriteria } from './storage/criteriaStore';
import type { Task } from './storage/types';
import { computePriority } from './lib/priority';
import type { ProgressInfo } from './lib/laya-browser/modelBundle';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { CriteriaPanel } from './components/CriteriaPanel';
import { DownloadProgress } from './components/DownloadProgress';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [criteria, setCriteria] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setTasks(loadTasks());
    setCriteria(loadCriteria());
    setLoaded(true);
  }, []);

  const updateTasksState = (updater: (prev: Task[]) => Task[]) => {
    setTasks((prev) => {
      const next = updater(prev);
      saveTasks(next);
      return next;
    });
  };

  const patchPriority = (id: string, priority: Task['priority']) => {
    updateTasksState((prev) => prev.map((t) => (t.id === id ? { ...t, priority } : t)));
  };

  const runClassification = async (task: Task, levels: string[]) => {
    try {
      const result = await computePriority(task.title, task.description, levels, setProgress);
      patchPriority(task.id, { ...result, status: 'done' });
    } catch {
      patchPriority(task.id, { label: '', score: 0, confidence: 0, status: 'error' });
    } finally {
      setProgress(null);
    }
  };

  const handleAdd = (title: string, description: string) => {
    const task = createTask(title, description);
    updateTasksState((prev) => [...prev, task]);
    void runClassification(task, criteria);
  };

  const handleToggleDone = (id: string) => {
    updateTasksState((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const handleDelete = (id: string) => {
    updateTasksState((prev) => prev.filter((t) => t.id !== id));
  };

  const handleRetry = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    patchPriority(id, { label: '', score: 0, confidence: 0, status: 'pending' });
    void runClassification(task, criteria);
  };

  const handleCriteriaChange = (next: string[]) => {
    setCriteria(next);
    saveCriteria(next);
  };

  if (!loaded) return null;

  return (
    <main>
      <h1>Task Priority Notes</h1>
      <DownloadProgress progress={progress} />
      <TaskForm onAdd={handleAdd} />
      <TaskList tasks={tasks} onToggleDone={handleToggleDone} onDelete={handleDelete} onRetry={handleRetry} />
      <CriteriaPanel criteria={criteria} onChange={handleCriteriaChange} />
    </main>
  );
}

export default App;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/App.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full test suite**

Run: `yarn test`
Expected: PASS, all suites across every task green.

- [ ] **Step 6: Commit**

```bash
git add apps/task-priority-notes/src/App.tsx apps/task-priority-notes/src/App.test.tsx
git commit -m "Wire task store, criteria store, and priority classification into App"
```

---

### Task 15: Manual smoke test in a real browser

**Files:** none (verification only).

**Interfaces:** none — this task consumes the finished app as a whole.

- [ ] **Step 1: Start the dev server**

```bash
cd apps/task-priority-notes && yarn dev
```

- [ ] **Step 2: Open the printed local URL in a real browser (Chrome or Edge, current version)**

- [ ] **Step 3: Add a task** with a title and description, and confirm:
  - It appears immediately with "Classifying…".
  - `DownloadProgress` shows "1 of 5 files" through "5 of 5 files" the first time (this is the ~1.7GB download — expect it to take a while on a real connection; on a fast connection you can watch the file counter advance).
  - Once done, the task shows "Priority: `<label>` (`<N>`% confidence)".

- [ ] **Step 4: Add a second task** and confirm it classifies quickly (model already cached — no re-download).

- [ ] **Step 5: Toggle done, delete, and edit criteria levels**, confirming each works as in the automated tests.

- [ ] **Step 6: Reload the page** and confirm tasks and criteria persist (from `localStorage`) and the model does not re-download (served from Cache Storage).

- [ ] **Step 7: Record the outcome**

If anything above doesn't match — note exactly what happened (error text, which step, browser/OS) instead of silently reclassifying it as passing. If everything matches, no code changes are needed; this step is confirmation only, not a place to introduce new behavior.

- [ ] **Step 8: Stop the dev server** (Ctrl+C).

---

## Execution Handoff

(Filled in by the assistant after this document is written, per the writing-plans skill's Execution Handoff step — not a task to implement.)
