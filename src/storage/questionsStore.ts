import type { Question } from '../lib/laya-browser/types';

const STORAGE_KEY = 'priorityQuestions';

export type QuestionSet = Record<string, Question>;

export type ParseResult = { ok: true; questions: QuestionSet } | { ok: false; error: string };

const DEFAULT_QUESTIONS: QuestionSet = {
  requester: {
    type: 'choice',
    instructions: 'Who is this task for or requested by?',
    criteria: {
      manager: 'Task is for, from, or requested by a manager, boss, director, or leadership',
      customer: 'Task is for a customer or client',
      colleague: 'Task is for a teammate or colleague',
      self: 'Personal task, or no person mentioned',
    },
  },
  deadline: {
    type: 'choice',
    instructions: 'When is this task due?',
    criteria: {
      hours: 'Due today, ASAP, or within 24 hours',
      days: 'Due within a few days',
      weeks: 'Due in a week or more',
      none: 'No deadline mentioned',
    },
  },
  blocksOthers: {
    type: 'choice',
    instructions: 'Is someone else waiting on or blocked by this task?',
    criteria: {
      yes: 'Someone is waiting on this, or others are blocked until it is done',
      no: 'Nobody is waiting on this task',
    },
  },
  urgency: {
    type: 'score',
    instructions: 'How urgent is this task overall? manager = critical',
    criteria: ['low', 'medium', 'high', 'critical'],
  },
};

export const DEFAULT_QUESTIONS_TEXT = JSON.stringify(DEFAULT_QUESTIONS, null, 2);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validateQuestion(id: string, q: unknown): string | null {
  const at = `question "${id}"`;
  if (!isObject(q)) return `${at} must be an object`;
  if (q.type !== 'choice' && q.type !== 'score' && q.type !== 'noul') {
    return `${at}: "type" must be "choice", "score" or "noul"`;
  }
  const ins = q.instructions;
  if (!(typeof ins === 'string' ? ins.trim() : isObject(ins))) return `${at}: "instructions" is required`;
  if (q.type === 'score') {
    const ok = Array.isArray(q.criteria) && q.criteria.length >= 2 && q.criteria.every((c) => typeof c === 'string');
    if (!ok) return `${at}: a score question needs "criteria" as a list of at least 2 levels`;
  }
  if (q.type === 'choice') {
    const c = q.criteria;
    const count = Array.isArray(c) ? c.length : isObject(c) ? Object.keys(c).length : 0;
    if (count < 2) return `${at}: a choice question needs at least 2 "criteria"`;
  }
  return null;
}

/**
 * Parses the questions field. Accepts the questions map itself, the map wrapped as
 * {"questions": {...}}, or that same wrapper pasted without its outer braces.
 */
export function parseQuestions(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    try {
      parsed = JSON.parse(`{${text}}`);
    } catch {
      return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  if (!isObject(parsed)) return { ok: false, error: 'Expected a JSON object of questions' };
  const inner = parsed.questions;
  const questions = Object.keys(parsed).length === 1 && isObject(inner) && typeof inner.type !== 'string' ? inner : parsed;
  const ids = Object.keys(questions);
  if (ids.length === 0) return { ok: false, error: 'Define at least one question' };
  for (const id of ids) {
    const error = validateQuestion(id, questions[id]);
    if (error) return { ok: false, error };
  }
  return { ok: true, questions: questions as unknown as QuestionSet };
}

export function loadQuestionsText(): string {
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_QUESTIONS_TEXT;
}

export function saveQuestionsText(text: string): void {
  localStorage.setItem(STORAGE_KEY, text);
}
