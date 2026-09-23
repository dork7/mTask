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
