import { classify } from './laya-browser/model';
import type { ProgressInfo } from './laya-browser/modelBundle';

const QUESTION_ID = 'task urgency';
const INSTRUCTIONS = 'How urgent is this task?';

export async function computePriority(
  title: string,
  description: string,
  criteria: string[],
  onProgress?: (info: ProgressInfo) => void,
): Promise<{ label: string; score: number; confidence: number }> {
  const result = await classify(
    { title, description },
    { [QUESTION_ID]: { type: 'score', instructions: INSTRUCTIONS, criteria } },
    onProgress,
  );
  const answer = result.answers[QUESTION_ID];
  // Use the most probable level: the criteria need not be an ordered scale, so the
  // probability-weighted mean index (answer.score) can land on a level nothing supports.
  const probs = criteria.map((_, i) => answer.probabilities[String(i)] ?? 0);
  const best = probs.indexOf(Math.max(...probs));
  return { label: criteria[best], score: answer.score, confidence: answer.confidence };
}
