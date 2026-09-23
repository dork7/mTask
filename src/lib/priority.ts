import { classify } from './laya-browser/model';
import type { ProgressInfo } from './laya-browser/modelBundle';
import { DEFAULT_QUESTION } from '../storage/questionStore';
import type { PriorityMode, PriorityQuestion } from '../storage/types';

const QUESTION_ID = 'task urgency';

export interface PriorityRequest extends PriorityQuestion {
  /** Urgency levels; only used in 'levels' mode. */
  criteria: string[];
}

export interface PriorityResult {
  label: string;
  score: number;
  confidence: number;
  mode: PriorityMode;
}

export async function computePriority(
  title: string,
  description: string,
  request: PriorityRequest,
  onProgress?: (info: ProgressInfo) => void,
): Promise<PriorityResult> {
  const instructions = request.instructions.trim() || DEFAULT_QUESTION.instructions;
  const state = { title, description };

  if (request.mode === 'yesno') {
    // Laya's "noul" question needs no criteria: it answers the instructions yes or no.
    const result = await classify(state, { [QUESTION_ID]: { type: 'noul', instructions } }, onProgress);
    const answer = result.answers[QUESTION_ID];
    const yes = answer.noul;
    return { label: yes >= 0.5 ? 'yes' : 'no', score: yes, confidence: Math.max(yes, 1 - yes), mode: 'yesno' };
  }

  const { criteria } = request;
  const result = await classify(state, { [QUESTION_ID]: { type: 'score', instructions, criteria } }, onProgress);
  const answer = result.answers[QUESTION_ID];
  // Use the most probable level: the criteria need not be an ordered scale, so the
  // probability-weighted mean index (answer.score) can land on a level nothing supports.
  const probs = criteria.map((_, i) => answer.probabilities[String(i)] ?? 0);
  const best = probs.indexOf(Math.max(...probs));
  return { label: criteria[best], score: answer.score, confidence: answer.confidence, mode: 'levels' };
}
