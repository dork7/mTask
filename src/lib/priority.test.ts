import { describe, expect, it, vi } from 'vitest';

vi.mock('./laya-browser/model', () => ({
  classify: vi.fn(),
}));

const LEVELS = [
  'not urgent',
  'somewhat urgent',
  'urgent',
  'critical',
  'ignore',
  'immediate action required',
  'nothing required',
];

function scoreAnswer(score: number, probabilities: Record<string, number>, confidence = 0.5) {
  return {
    model: 'laya-browser',
    answers: {
      'task urgency': { type: 'score', score, confidence, legend: {}, probabilities, rl_agent: { act_probability: 0 } },
    },
    usage: { input_tokens: 10, output_tokens: 0 },
  } as never;
}

function noulAnswer(noul: number) {
  return {
    model: 'laya-browser',
    answers: { 'task urgency': { type: 'noul', noul, rl_agent: { act_probability: 0 } } },
    usage: { input_tokens: 10, output_tokens: 0 },
  } as never;
}

describe('computePriority in levels mode', () => {
  it('asks a single "task urgency" score question with the given instructions and criteria', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue(scoreAnswer(2.6, { '0': 0.1, '1': 0.1, '2': 0.1, '3': 0.7 }, 0.75));

    const result = await computePriority('Fix login bug', 'Users cannot log in', {
      instructions: 'How urgent is this task?',
      mode: 'levels',
      criteria: ['low', 'medium', 'high', 'critical'],
    });

    expect(classify).toHaveBeenCalledWith(
      { title: 'Fix login bug', description: 'Users cannot log in' },
      {
        'task urgency': {
          type: 'score',
          instructions: 'How urgent is this task?',
          criteria: ['low', 'medium', 'high', 'critical'],
        },
      },
      undefined,
    );
    expect(result).toEqual({ label: 'critical', score: 2.6, confidence: 0.75, mode: 'levels' });
  });

  it('labels the task with its most probable level, not the rounded mean index', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    // Mean index 0*0.55 + 6*0.45 = 2.7 would round to "critical", which neither option supports.
    vi.mocked(classify).mockResolvedValue(
      scoreAnswer(2.7, { '0': 0.55, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0.45 }),
    );

    const result = await computePriority('Task', '', { instructions: 'How urgent?', mode: 'levels', criteria: LEVELS });

    expect(result.label).toBe('not urgent');
  });

  it('propagates rejection from classify so the caller can decide how to surface the failure', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockRejectedValue(new Error('model unavailable'));

    await expect(
      computePriority('Task', '', { instructions: 'How urgent?', mode: 'levels', criteria: ['low', 'high'] }),
    ).rejects.toThrow('model unavailable');
  });
});

describe('computePriority in yes/no (instructions only) mode', () => {
  it('asks the instructions as a yes/no question with no criteria list', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue(noulAnswer(0.78));

    const result = await computePriority('Fix login bug', 'Users cannot log in', {
      instructions: 'Does this need doing today?',
      mode: 'yesno',
      criteria: LEVELS,
    });

    expect(classify).toHaveBeenCalledWith(
      { title: 'Fix login bug', description: 'Users cannot log in' },
      { 'task urgency': { type: 'noul', instructions: 'Does this need doing today?' } },
      undefined,
    );
    expect(result).toEqual({ label: 'yes', score: 0.78, confidence: 0.78, mode: 'yesno' });
  });

  it('answers no, with the probability of no, when yes is under 50%', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue(noulAnswer(0.3));

    const result = await computePriority('Task', '', { instructions: 'Urgent?', mode: 'yesno', criteria: [] });

    expect(result.label).toBe('no');
    expect(result.score).toBe(0.3);
    expect(result.confidence).toBeCloseTo(0.7, 10);
  });

  it('falls back to the default instructions when they are blank', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue(noulAnswer(0.6));

    await computePriority('Task', '', { instructions: '   ', mode: 'yesno', criteria: [] });

    expect(classify).toHaveBeenCalledWith(
      expect.anything(),
      { 'task urgency': { type: 'noul', instructions: 'How urgent is this task?' } },
      undefined,
    );
  });
});
