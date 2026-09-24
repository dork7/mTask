import type { ProgressInfo } from './modelBundle';
import type { Question, SystemOneResult } from './types';

export interface ClassifyRequest {
  id: number;
  state: unknown;
  questions: Record<string, Question>;
}

export type ClassifyResponse =
  | { id: number; progress: ProgressInfo }
  | { id: number; result: SystemOneResult<Record<string, Question>> }
  | { id: number; error: string };

interface Pending {
  resolve: (result: SystemOneResult<Record<string, Question>>) => void;
  reject: (error: Error) => void;
  onProgress?: (info: ProgressInfo) => void;
}

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./classify.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (event: MessageEvent<ClassifyResponse>) => {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    if ('progress' in msg) {
      entry.onProgress?.(msg.progress);
      return;
    }
    pending.delete(msg.id);
    if ('result' in msg) entry.resolve(msg.result);
    else entry.reject(new Error(msg.error));
  };
  // The worker itself failed (e.g. its script didn't load): fail everything waiting and
  // start a fresh worker on the next request.
  w.onerror = (event) => {
    event.preventDefault();
    const error = new Error(event.message || 'classification worker failed');
    pending.forEach((entry) => entry.reject(error));
    pending.clear();
    w.terminate();
    worker = undefined;
  };
  worker = w;
  return w;
}

/** Same contract as `classify` in ./model, but runs in a Web Worker. */
export function classify<Q extends Record<string, Question>>(
  state: unknown,
  questions: Q,
  onProgress?: (info: ProgressInfo) => void,
): Promise<SystemOneResult<Q>> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as Pending['resolve'], reject, onProgress });
    const request: ClassifyRequest = { id, state, questions };
    getWorker().postMessage(request);
  });
}
