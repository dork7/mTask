import { describe, expect, it, vi } from 'vitest';
import type { QuestionSet } from '../storage/questionsStore';

vi.mock('./laya-browser/model', () => ({
  classify: vi.fn(),
}));

const extra = { rl_agent: { act_probability: 0 } };

const QUESTIONS: QuestionSet = {
  requester: {
    type: 'choice',
    instructions: 'Who is this for?',
    criteria: { manager: 'A manager', self: 'Personal' },
  },
  blocks: { type: 'noul', instructions: 'Is anyone blocked?' },
  urgency: { type: 'score', instructions: 'How urgent?', criteria: ['low', 'medium', 'high', 'critical'] },
};

function response(answers: Record<string, unknown>) {
  return { model: 'laya-browser', answers, usage: { input_tokens: 10, output_tokens: 0 } } as never;
}

const ANSWERS = {
  requester: { type: 'choice', choice: 'manager', probabilities: { manager: 0.8, self: 0.2 }, confidence: 0.7, ...extra },
  blocks: { type: 'noul', noul: 0.81, ...extra },
  urgency: {
    type: 'score',
    score: 2.6,
    confidence: 0.75,
    legend: {},
    probabilities: { '0': 0.05, '1': 0.05, '2': 0.2, '3': 0.7 },
    ...extra,
  },
};

describe('computePriority', () => {
  it('asks every question in one call, with the task as state', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue(response(ANSWERS));

    await computePriority('Fix login bug', 'Users cannot log in', QUESTIONS);

    expect(classify).toHaveBeenCalledWith(
      { title: 'Fix login bug', description: 'Users cannot log in' },
      QUESTIONS,
      undefined,
    );
  });

  it('takes the headline from the score question and lists the other answers', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue(response(ANSWERS));

    const result = await computePriority('Task', '', QUESTIONS);

    expect(result).toEqual({
      label: 'critical',
      score: 2.6,
      confidence: 0.75,
      answers: [
        { question: 'requester', answer: 'manager' },
        { question: 'blocks', answer: 'yes' },
      ],
    });
  });

  it('uses the most probable level rather than rounding the mean score', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue(
      response({
        urgency: {
          ...ANSWERS.urgency,
          score: 1.5,
          probabilities: { '0': 0.45, '1': 0, '2': 0, '3': 0.55 },
        },
      }),
    );

    const result = await computePriority('Task', '', { urgency: QUESTIONS.urgency });

    expect(result.label).toBe('critical');
  });

  it('has no headline when no question is a score question', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue(response({ blocks: { type: 'noul', noul: 0.2, ...extra } }));

    const result = await computePriority('Task', '', { blocks: QUESTIONS.blocks });

    expect(result).toEqual({ label: '', score: 0, confidence: 0, answers: [{ question: 'blocks', answer: 'no' }] });
  });

  it('passes classify errors through', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockRejectedValue(new Error('model unavailable'));

    await expect(computePriority('Task', '', QUESTIONS)).rejects.toThrow('model unavailable');
  });
});
