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
