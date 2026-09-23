import { beforeEach, describe, expect, it } from 'vitest';

describe('questionStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to asking how urgent the task is, answered with levels', async () => {
    const { loadQuestion, DEFAULT_QUESTION } = await import('./questionStore');
    expect(DEFAULT_QUESTION).toEqual({ instructions: 'How urgent is this task?', mode: 'levels' });
    expect(loadQuestion()).toEqual(DEFAULT_QUESTION);
  });

  it('round-trips the instructions and mode', async () => {
    const { loadQuestion, saveQuestion } = await import('./questionStore');
    saveQuestion({ instructions: 'Does this need doing today?', mode: 'yesno' });
    expect(loadQuestion()).toEqual({ instructions: 'Does this need doing today?', mode: 'yesno' });
  });

  it('falls back to the default when stored data is corrupt or has an unknown mode', async () => {
    const { loadQuestion, DEFAULT_QUESTION } = await import('./questionStore');
    localStorage.setItem('priorityQuestion', '{not json');
    expect(loadQuestion()).toEqual(DEFAULT_QUESTION);
    localStorage.setItem('priorityQuestion', JSON.stringify({ instructions: 'x', mode: 'banana' }));
    expect(loadQuestion()).toEqual(DEFAULT_QUESTION);
  });
});
