import { beforeAll, describe, expect, it } from 'vitest';
import { findRule, valueOf, type CssRule } from './testing/css.ts';
import { getStylesheet } from './testing/page.ts';

/*
 * Focus, touch targets (AC10) and reduced motion (AC11) in `public/css/base.css`, read
 * through the stylesheet the layout links to.
 */

const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';

let rules: CssRule[];

beforeAll(async () => {
  rules = (await getStylesheet()).rules;
});

/** A CSS time, `!important` dropped, in milliseconds. */
function milliseconds(value: string): number {
  const time = value.replace(/\s*!important$/, '').trim();
  const match = /^(\d*\.?\d+)(ms|s)$/.exec(time);
  if (match === null) throw new Error(`Not a CSS time: "${value}"`);
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1);
}

describe('focus and touch targets (AC10)', () => {
  it('keeps a visible :focus-visible outline', () => {
    const outline = valueOf(findRule(rules, ':focus-visible'), 'outline');

    expect(outline).toBeDefined();
    expect(outline).not.toMatch(/^(none|0)\b/);
  });

  it('turns the outline off nowhere', () => {
    for (const rule of rules) {
      for (const { property, value } of rule.declarations) {
        const where = `${rule.selector} { ${property}: ${value} }`;
        if (property === 'outline') expect(value, where).not.toMatch(/^(none|0(px)?)(\s|$)/);
        if (property === 'outline-style') expect(value, where).not.toMatch(/^none\b/);
        if (property === 'outline-width') expect(value, where).not.toMatch(/^0(px)?(\s|$)/);
      }
    }
  });

  it.each(['.btn', '.toast .btn'])('gives %s a touch-target min-height', (selector) => {
    expect(valueOf(findRule(rules, selector), 'min-height')).toBe('var(--touch-target)');
  });
});

describe('reduced motion (AC11)', () => {
  it('stops animations, transitions and smooth scrolling for every element', () => {
    const rule = findRule(rules, '*', REDUCED_MOTION);

    expect(rule.selectors).toEqual(expect.arrayContaining(['*', '*::before', '*::after']));
    expect(milliseconds(valueOf(rule, 'animation-duration') ?? '')).toBeLessThanOrEqual(0.01);
    expect(milliseconds(valueOf(rule, 'transition-duration') ?? '')).toBeLessThanOrEqual(0.01);
    expect(valueOf(rule, 'scroll-behavior')).toMatch(/^auto(\s*!important)?$/);
  });
});
