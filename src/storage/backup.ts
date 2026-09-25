import type { Task } from './types';

const APP = 'task-priority-notes';

export interface Backup {
  app: typeof APP;
  version: 1;
  exportedAt: string;
  tasks: Task[];
  /** The questions field exactly as typed. */
  questions: string;
}

export type ImportResult = { ok: true; tasks: Task[]; questions?: string } | { ok: false; error: string };

export function makeBackup(tasks: Task[], questions: string, now = new Date()): string {
  const backup: Backup = { app: APP, version: 1, exportedAt: now.toISOString(), tasks, questions };
  return JSON.stringify(backup, null, 2);
}

export function backupFileName(now = new Date()): string {
  return `${APP}-${now.toISOString().slice(0, 10)}.json`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function toTask(value: unknown, index: number): Task | string {
  if (!isObject(value)) return `task ${index + 1} is not an object`;
  const { id, title, createdAt } = value;
  if (typeof id !== 'string' || !id) return `task ${index + 1} has no "id"`;
  if (typeof title !== 'string') return `task ${index + 1} has no "title"`;
  return {
    ...(value as unknown as Task),
    description: typeof value.description === 'string' ? value.description : '',
    createdAt: typeof createdAt === 'string' ? createdAt : new Date(0).toISOString(),
    done: value.done === true,
  };
}

/** Reads an exported backup; a bare array of tasks is accepted too. */
export function parseBackup(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'the file is not valid JSON' };
  }
  const rawTasks = Array.isArray(data) ? data : isObject(data) ? data.tasks : undefined;
  if (!Array.isArray(rawTasks)) return { ok: false, error: 'no "tasks" list found in the file' };
  const tasks: Task[] = [];
  for (const [i, raw] of rawTasks.entries()) {
    const task = toTask(raw, i);
    if (typeof task === 'string') return { ok: false, error: task };
    tasks.push(task);
  }
  const questions = isObject(data) && typeof data.questions === 'string' ? data.questions : undefined;
  return { ok: true, tasks, questions };
}

/** Adds imported tasks; one with the same id as an existing task replaces it. */
export function mergeTasks(existing: Task[], incoming: Task[]): Task[] {
  const incomingIds = new Set(incoming.map((t) => t.id));
  return [...existing.filter((t) => !incomingIds.has(t.id)), ...incoming];
}
