import { describe, expect, it } from 'vitest';
import { declarationsOf, findRule, findRules, parseCss, valueOf } from './css.ts';

const FIXTURE = `
/* A comment before anything else. */
:root {
  --bg: #eef0f4; /* a comment after a declaration */
  --font-family: system-ui, "Segoe UI", sans-serif;
}

.card,
.sheet:not(.a, .b) {
  padding: var(--space-3)
    var(--space-4);
  background: var(--surface);
}

@media (min-width: 900px) {
  .card { padding: 0; }
  body { padding-left: var(--nav-width); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

[hidden] { display: none !important; }
`;

describe('parseCss', () => {
  it('returns every rule in source order with its selector and at-rule', () => {
    const rules = parseCss(FIXTURE);

    expect(rules.map((rule) => [rule.at, rule.selector])).toEqual([
      [null, ':root'],
      [null, '.card, .sheet:not(.a, .b)'],
      ['@media (min-width: 900px)', '.card'],
      ['@media (min-width: 900px)', 'body'],
      ['@keyframes pulse', '0%, 100%'],
      ['@keyframes pulse', '50%'],
      [null, '[hidden]'],
    ]);
  });

  it('reads declarations as written, with whitespace collapsed', () => {
    const rules = parseCss(FIXTURE);

    expect(rules[0].declarations).toEqual([
      { property: '--bg', value: '#eef0f4' },
      { property: '--font-family', value: 'system-ui, "Segoe UI", sans-serif' },
    ]);
    expect(rules[1].declarations).toEqual([
      { property: 'padding', value: 'var(--space-3) var(--space-4)' },
      { property: 'background', value: 'var(--surface)' },
    ]);
    expect(rules[6].declarations).toEqual([{ property: 'display', value: 'none !important' }]);
  });

  it('splits a selector list at its top-level commas only', () => {
    const rules = parseCss(FIXTURE);

    expect(rules[1].selectors).toEqual(['.card', '.sheet:not(.a, .b)']);
  });

  it('produces no rule from a comment that looks like CSS', () => {
    const css = `
      /* .ghost { color: red; } */
      /*
       * --fake: #123456;
       * :root {
       */
      .real { color: var(--text); }
    `;

    expect(parseCss(css)).toEqual([
      {
        selector: '.real',
        selectors: ['.real'],
        at: null,
        declarations: [{ property: 'color', value: 'var(--text)' }],
      },
    ]);
  });

  it('leaves braces, semicolons and comment markers inside a string alone', () => {
    const rules = parseCss('.a::before { content: "}; /* {"; color: var(--text); }');

    expect(rules).toHaveLength(1);
    expect(rules[0].declarations).toEqual([
      { property: 'content', value: '"}; /* {"' },
      { property: 'color', value: 'var(--text)' },
    ]);
  });

  it('returns nothing for an empty stylesheet', () => {
    expect(parseCss('')).toEqual([]);
    expect(parseCss('/* only a comment */')).toEqual([]);
  });

  it('throws on CSS it cannot read, instead of returning part of it', () => {
    expect(() => parseCss('.a { color: var(--text);')).toThrow(/Unclosed block/);
    expect(() => parseCss('.a { .b { margin: 0; } }')).toThrow(/Nested rules/);
    expect(() => parseCss('.a { margin: 0; } }')).toThrow(/Unexpected "}"/);
    expect(() => parseCss('.a { margin }')).toThrow(/Not a declaration/);
    expect(() => parseCss('/* never closed')).toThrow(/Unclosed comment/);
  });
});

describe('rule lookup', () => {
  const rules = parseCss(FIXTURE);

  it('finds a rule by selector outside any at-rule by default', () => {
    expect(valueOf(findRule(rules, '.card'), 'background')).toBe('var(--surface)');
  });

  it('finds a rule by one part of its selector list', () => {
    expect(findRule(rules, '.sheet:not(.a, .b)')).toBe(findRule(rules, '.card'));
  });

  it('finds a rule inside a named at-rule', () => {
    const wide = findRule(rules, '.card', '@media (min-width: 900px)');

    expect(declarationsOf(wide)).toEqual({ padding: '0' });
  });

  it('returns an empty list, and findRule throws, when nothing matches', () => {
    expect(findRules(rules, 'body')).toEqual([]);
    expect(() => findRule(rules, 'body')).toThrow(/found 0/);
    expect(() => findRule(rules, '.card', '@media print')).toThrow(/found 0/);
  });

  it('gives the last value when a property is declared twice', () => {
    const [rule] = parseCss('.a { display: block; display: flex; }');

    expect(valueOf(rule, 'display')).toBe('flex');
    expect(valueOf(rule, 'color')).toBeUndefined();
  });
});
