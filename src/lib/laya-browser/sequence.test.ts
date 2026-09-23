import { describe, expect, it } from 'vitest';
import {
  QTYPES,
  buildSequence,
  confidenceFromProbs,
  renderOptions,
  softmax,
  tempBucket,
  toInternal,
  type SpecialTokenIds,
} from './sequence';

describe('QTYPES', () => {
  it('maps question types to their model indices', () => {
    expect(QTYPES).toEqual({ choice: 0, score: 1, noul: 2 });
  });
});

describe('softmax', () => {
  it('normalizes logits into a probability distribution', () => {
    const p = softmax([1, 3]);
    expect(p[0]).toBeCloseTo(0.1192, 4);
    expect(p[1]).toBeCloseTo(0.8808, 4);
  });

  it('is uniform for equal logits', () => {
    const p = softmax([0, 0, 0]);
    expect(p[0]).toBeCloseTo(1 / 3, 6);
    expect(p[1]).toBeCloseTo(1 / 3, 6);
    expect(p[2]).toBeCloseTo(1 / 3, 6);
  });
});

describe('confidenceFromProbs', () => {
  it('is 1 for a fully certain distribution', () => {
    expect(confidenceFromProbs([1, 0])).toBe(1);
  });

  it('is 0 for a maximally uncertain two-way distribution', () => {
    expect(confidenceFromProbs([0.5, 0.5])).toBeCloseTo(0, 6);
  });
});

describe('tempBucket', () => {
  it('buckets by question type name and option-count range', () => {
    expect(tempBucket(QTYPES.score, 4)).toBe('score:3-5');
    expect(tempBucket(QTYPES.choice, 2)).toBe('choice:2');
    expect(tempBucket(QTYPES.noul, 11)).toBe('noul:11+');
  });
});

describe('toInternal + renderOptions', () => {
  it('renders score options as "level N: label"', () => {
    const q = toInternal({ type: 'score', instructions: 'urgent?', criteria: ['low', 'high'] });
    expect(renderOptions(q)).toEqual(['level 0: low', 'level 1: high']);
  });

  it('converts array criteria for choice questions into a key->null map, then renders keys only', () => {
    const q = toInternal({ type: 'choice', instructions: 'x', criteria: ['a', 'b'] });
    expect(q.crit).toEqual({ a: null, b: null });
    expect(renderOptions(q)).toEqual(['a', 'b']);
  });

  it('renders choice options with descriptions as "key: description"', () => {
    const q = toInternal({
      type: 'choice',
      instructions: 'x',
      criteria: { billing: 'payments', support: 'help' },
    });
    expect(renderOptions(q)).toEqual(['billing: payments', 'support: help']);
  });

  it('renders noul options with default wording when no criteria given', () => {
    const q = toInternal({ type: 'noul', instructions: 'x' });
    expect(renderOptions(q)).toEqual([
      'false: no, the statement does not hold',
      'true: yes, the statement holds',
    ]);
  });
});

describe('buildSequence', () => {
  const ids: SpecialTokenIds = { cls: 101, sep: 102, mask: 103, pad: 0, maskTok: '[MASK]' };
  // Deterministic stand-in tokenizer: each whitespace-separated word becomes its 0-based index.
  const encode = (text: string) => text.trim().split(/\s+/).filter(Boolean).map((_, i) => i);

  it('lays out [CLS] head [SEP] option0 option1 [SEP] state [SEP] with correct marker positions', () => {
    const q = toInternal({ type: 'score', instructions: 'urgent?', criteria: ['low', 'high'] });

    const result = buildSequence(encode, ids, 'refund issue', q, 64, 32);

    expect(result).toEqual({
      ids: [101, 0, 1, 2, 102, 103, 0, 1, 2, 103, 0, 1, 2, 102, 0, 1, 102],
      markers: [5, 9],
    });
  });

  it('shrinks option text evenly when too many/long options exceed head_max_len', () => {
    const q = toInternal({
      type: 'score',
      instructions: 'urgent?',
      criteria: ['level with a very long description one', 'level with a very long description two'],
    });

    // headMaxLen=10 is deliberately too small for 2 options at full length, forcing the
    // optBudget < 16 shrink branch.
    const result = buildSequence(encode, ids, 'state', q, 64, 10);

    expect(result.markers).toHaveLength(2);
    expect(result.ids[0]).toBe(ids.cls);
    // Each option still starts with the [MASK] marker token even after shrinking.
    expect(result.ids[result.markers[0]]).toBe(ids.mask);
    expect(result.ids[result.markers[1]]).toBe(ids.mask);
  });

  it('truncates to maxLen and drops markers that fall past the cutoff', () => {
    const q = toInternal({ type: 'score', instructions: 'urgent?', criteria: ['low', 'high'] });

    const result = buildSequence(encode, ids, 'refund issue', q, 6, 32);

    expect(result.ids.length).toBeLessThanOrEqual(6);
    expect(result.markers.every((m) => m < 6)).toBe(true);
  });
});
