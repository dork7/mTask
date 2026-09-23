import { beforeEach, describe, expect, it } from 'vitest';

describe('criteriaStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default criteria when nothing is stored', async () => {
    const { loadCriteria, DEFAULT_CRITERIA } = await import('./criteriaStore');
    expect(loadCriteria()).toEqual(DEFAULT_CRITERIA);
  });

  it('returns the default criteria when localStorage holds invalid JSON', async () => {
    localStorage.setItem('priorityCriteria', 'not json');
    const { loadCriteria, DEFAULT_CRITERIA } = await import('./criteriaStore');
    expect(loadCriteria()).toEqual(DEFAULT_CRITERIA);
  });

  it('round-trips criteria through saveCriteria/loadCriteria', async () => {
    const { loadCriteria, saveCriteria } = await import('./criteriaStore');
    saveCriteria(['minor', 'major']);
    expect(loadCriteria()).toEqual(['minor', 'major']);
  });

  it('rejects saving fewer than 2 levels', async () => {
    const { saveCriteria } = await import('./criteriaStore');
    expect(() => saveCriteria(['only-one'])).toThrow('criteria must have at least 2 levels');
  });

  it('defaults to the task urgency levels', async () => {
    const { DEFAULT_CRITERIA } = await import('./criteriaStore');
    expect(DEFAULT_CRITERIA).toEqual([
      'not urgent',
      'somewhat urgent',
      'urgent',
      'critical',
      'ignore',
      'immediate action required',
      'nothing required',
    ]);
  });
});
