import { classify } from './laya-browser/classifyClient';
import type { Answer, Question } from './laya-browser/types';
import type { ProgressInfo } from './laya-browser/modelBundle';
import type { QuestionSet } from '../storage/questionsStore';
import type { AnswerSummary } from '../storage/types';

export interface PriorityResult {
  /** Headline result from the first 'score' question; '' when there is none. */
  label: string;
  score: number;
  confidence: number;
  /** Answers to every other question, in the order they were defined. */
  answers: AnswerSummary[];
}

interface Summary {
  label: string;
  score: number;
  confidence: number;
}

function summarise(question: Question, answer: Answer): Summary {
  if (question.type === 'score' && answer.type === 'score') {
    // Use the most probable level: the criteria need not be an ordered scale, so the
    // probability-weighted mean index (answer.score) can land on a level nothing supports.
    const probs = question.criteria.map((_, i) => answer.probabilities[String(i)] ?? 0);
    const best = probs.indexOf(Math.max(...probs));
    return { label: question.criteria[best], score: answer.score, confidence: answer.confidence };
  }
  if (answer.type === 'choice') {
    return { label: answer.choice, score: 0, confidence: answer.confidence };
  }
  if (answer.type === 'noul') {
    const yes = answer.noul;
    return { label: yes >= 0.5 ? 'yes' : 'no', score: yes, confidence: Math.max(yes, 1 - yes) };
  }
  return { label: '', score: 0, confidence: 0 };
}

export async function computePriority(
  title: string,
  description: string,
  questions: QuestionSet,
  onProgress?: (info: ProgressInfo) => void,
): Promise<PriorityResult> {
  const result = await classify({ title, description }, questions, onProgress);
  const ids = Object.keys(questions);
  const headlineId = ids.find((id) => questions[id].type === 'score');
  const summaries = new Map(ids.map((id) => [id, summarise(questions[id], result.answers[id])]));
  const headline = headlineId ? summaries.get(headlineId) : undefined;
  return {
    label: headline?.label ?? '',
    score: headline?.score ?? 0,
    confidence: headline?.confidence ?? 0,
    answers: ids
      .filter((id) => id !== headlineId)
      .map((id) => ({ question: id, answer: summaries.get(id)!.label })),
  };
}
