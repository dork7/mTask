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

export function createTask(title: string, description: string, recurrence?: import('./types').RecurrenceRule): Task {
  return {
    id: crypto.randomUUID(),
    title,
    description,
    createdAt: new Date().toISOString(),
    done: false,
    priority: { label: '', score: 0, confidence: 0, status: 'pending' },
    recurrence,
  };
}
