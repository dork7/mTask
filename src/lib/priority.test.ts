import { describe, expect, it, vi } from 'vitest';

vi.mock('./laya-browser/model', () => ({
  classify: vi.fn(),
}));

describe('computePriority', () => {
  it('sends a single score question built from the given criteria and maps the answer to a label', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue({
      model: 'laya-browser',
      answers: { urgency: { type: 'score', score: 2.6, confidence: 0.75, legend: {}, probabilities: {}, rl_agent: { act_probability: 0 } } },
      usage: { input_tokens: 10, output_tokens: 0 },
    } as never);

    const result = await computePriority('Fix login bug', 'Users cannot log in', ['low', 'medium', 'high', 'critical']);

    expect(classify).toHaveBeenCalledWith(
      { title: 'Fix login bug', description: 'Users cannot log in' },
      { urgency: { type: 'score', instructions: expect.any(String), criteria: ['low', 'medium', 'high', 'critical'] } },
      undefined,
    );
    expect(result).toEqual({ label: 'critical', score: 2.6, confidence: 0.75 });
  });

  it('rounds the score to the nearest criteria index and clamps to the valid range', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockResolvedValue({
      model: 'laya-browser',
      answers: { urgency: { type: 'score', score: 0.4, confidence: 0.5, legend: {}, probabilities: {}, rl_agent: { act_probability: 0 } } },
      usage: { input_tokens: 10, output_tokens: 0 },
    } as never);

    const result = await computePriority('Task', '', ['low', 'high']);

    expect(result.label).toBe('low');
  });

  it('propagates rejection from classify so the caller can decide how to surface the failure', async () => {
    const { classify } = await import('./laya-browser/model');
    const { computePriority } = await import('./priority');
    vi.mocked(classify).mockRejectedValue(new Error('model unavailable'));

    await expect(computePriority('Task', '', ['low', 'high'])).rejects.toThrow('model unavailable');
  });
});
