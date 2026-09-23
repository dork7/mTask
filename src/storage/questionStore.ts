import type { PriorityQuestion } from './types';

const STORAGE_KEY = 'priorityQuestion';

export const DEFAULT_QUESTION: PriorityQuestion = { instructions: 'How urgent is this task?', mode: 'levels' };

export function loadQuestion(): PriorityQuestion {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_QUESTION;
  try {
    const parsed = JSON.parse(raw);
    const valid =
      typeof parsed?.instructions === 'string' && (parsed.mode === 'levels' || parsed.mode === 'yesno');
    return valid ? { instructions: parsed.instructions, mode: parsed.mode } : DEFAULT_QUESTION;
  } catch {
    return DEFAULT_QUESTION;
  }
}

export function saveQuestion(question: PriorityQuestion): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(question));
}
