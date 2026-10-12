import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { rootDir } from './paths.ts';
import {
  declarationsOf,
  findRule,
  findRules,
  parseCss,
  stripComments,
  valueOf,
  type CssDeclaration,
  type CssRule,
} from './testing/css.ts';
import { getStylesheet } from './testing/page.ts';

const DARK_SELECTOR = ':root[data-theme="dark"]';
const SYSTEM_DARK_SELECTOR = ':root:not([data-theme="light"])';
const SYSTEM_DARK_MEDIA = '@media (prefers-color-scheme: dark)';
const WIDE_MEDIA = '@media (min-width: 900px)';

/** The 20 colors of `docs/mockUps.html`. */
const MOCKUP_COLORS = [
  'bg',
  'surface',
  'surface-2',
  'text',
  'muted',
  'border',
  'accent',
  'accent-text',
  'urgent',
  'high',
  'medium',
  'low',
  'urgent-bg',
  'high-bg',
  'medium-bg',
  'low-bg',
  'slot-morning',
  'slot-afternoon',
  'slot-evening',
  'slot-night',
];

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const WHOLE_HEX_COLOR = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const COLOR_FUNCTION =
  /(?<![\w-])(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i;
const NAMED_COLOR =
  /(?<![\w-])(transparent|black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|brown|cyan|magenta|navy|teal|lime|maroon|olive|aqua|fuchsia)(?![\w-])/i;
const VAR_REFERENCE = /var\([^()]*\)/g;
const PX_LENGTH = /\d\s*px\b/i;

/** Whether a value holds a color literal: a hex color, a color function or a named color. */
function hasColorLiteral(value: string): boolean {
  if (HEX_COLOR.test(value) || COLOR_FUNCTION.test(value)) return true;
  return NAMED_COLOR.test(value.replace(VAR_REFERENCE, ''));
}

function isCustomProperty(declaration: CssDeclaration): boolean {
  return declaration.property.startsWith('--');
}

/** `selector` with its at-rule, for assertion messages. */
function describeRule(rule: CssRule): string {
  return rule.at === null ? rule.selector : `${rule.at} { ${rule.selector} }`;
}

let css: string;
let rules: CssRule[];
/** The rule whose selector is exactly `:root`, outside any at-rule. */
let root: CssRule;
let tokens: Record<string, string>;
/** Every rule but the plain `:root` one. */
let outsideRoot: CssRule[];
let dark: CssRule;
let systemDark: CssRule;
/** Every rule that is not one of the three token blocks. */
let styleRules: CssRule[];
/** The names `X` for which `:root` declares `--light-X`. */
let colorTokens: string[];

beforeAll(async () => {
  const stylesheet = await getStylesheet();
  css = stylesheet.css;
  rules = stylesheet.rules;
  root = findRule(rules, ':root');
  tokens = declarationsOf(root);
  outsideRoot = rules.filter((rule) => rule !== root);
  dark = findRule(rules, DARK_SELECTOR);
  systemDark = findRule(rules, SYSTEM_DARK_SELECTOR, SYSTEM_DARK_MEDIA);
  styleRules = rules.filter((rule) => rule !== root && rule !== dark && rule !== systemDark);
  colorTokens = Object.keys(tokens)
    .filter((name) => name.startsWith('--light-'))
    .map((name) => name.slice('--light-'.length));
});

/** Every declaration outside `:root` whose property passes the filter, with its rule. */
function declarationsWhere(
  matches: (property: string) => boolean,
): { rule: CssRule; declaration: CssDeclaration }[] {
  return outsideRoot.flatMap((rule) =>
    rule.declarations
      .filter((declaration) => matches(declaration.property))
      .map((declaration) => ({ rule, declaration })),
  );
}

describe('tokens on :root (AC1)', () => {
  it('declares each token once', () => {
    const names = root.declarations.map((declaration) => declaration.property);

    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });

  it('declares the four priority colors, each with a background tint', () => {
    for (const name of ['urgent', 'high', 'medium', 'low']) {
      expect(tokens, `--${name}`).toHaveProperty(`--${name}`);
      expect(tokens, `--${name}-bg`).toHaveProperty(`--${name}-bg`);
      expect(tokens[`--light-${name}`], `--${name} and its tint must differ`).not.toBe(
        tokens[`--light-${name}-bg`],
      );
    }
  });

  it('declares the four slot tints', () => {
    for (const name of ['morning', 'afternoon', 'evening', 'night']) {
      expect(tokens, `--slot-${name}`).toHaveProperty(`--slot-${name}`);
    }
  });

  it('declares a second surface color that differs from the first', () => {
    expect(tokens['--surface']).toBe('var(--light-surface)');
    expect(tokens['--surface-2']).toBe('var(--light-surface-2)');
    expect(tokens['--light-surface-2']).toMatch(WHOLE_HEX_COLOR);
    expect(tokens['--light-surface-2'].toLowerCase()).not.toBe(
      tokens['--light-surface'].toLowerCase(),
    );
  });

  it('declares one type scale, in rem, from small to large', () => {
    const steps = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
    const declared = Object.keys(tokens).filter((name) => name.startsWith('--font-size-'));
    expect(declared).toEqual(steps.map((step) => `--font-size-${step}`));

    const sizes = steps.map((step) => {
      const value = tokens[`--font-size-${step}`];
      expect(value, `--font-size-${step}`).toMatch(/^\d*\.?\d+rem$/);
      return Number.parseFloat(value);
    });
    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index], `--font-size-${steps[index]}`).toBeGreaterThan(sizes[index - 1]);
    }
  });

  it('declares a spacing scale in steps of 4px', () => {
    for (const step of [1, 2, 3, 4, 5, 6]) {
      expect(tokens, `--space-${step}`).toHaveProperty(`--space-${step}`);
    }

    const declared = Object.keys(tokens).filter((name) => name.startsWith('--space-'));
    for (const name of declared) {
      const step = name.slice('--space-'.length);
      expect(step, name).toMatch(/^[1-9]\d*$/);
      expect(tokens[name], name).toBe(`${Number(step) * 4}px`);
    }
  });

  it('declares exactly two corner radii', () => {
    const declared = Object.keys(tokens).filter((name) => name.startsWith('--radius'));

    expect(declared.sort()).toEqual(['--radius', '--radius-sm']);
    expect(tokens['--radius']).toMatch(/^\d+px$/);
    expect(tokens['--radius-sm']).toMatch(/^\d+px$/);
    expect(tokens['--radius']).not.toBe(tokens['--radius-sm']);
  });

  it('keeps the colors and radii of the mockups', () => {
    const html = readFileSync(path.join(rootDir, 'docs', 'mockUps.html'), 'utf8');
    const style = /<style>([\s\S]*?)<\/style>/.exec(html);
    if (!style) throw new Error('docs/mockUps.html has no <style> element');
    const mockRules = parseCss(style[1]);
    const mockLight = declarationsOf(findRule(mockRules, ':root'));
    const mockDark = declarationsOf(findRule(mockRules, DARK_SELECTOR));

    const mockColors = Object.keys(mockLight)
      .filter((name) => WHOLE_HEX_COLOR.test(mockLight[name]))
      .map((name) => name.slice(2));
    expect(mockColors.sort()).toEqual([...MOCKUP_COLORS].sort());

    for (const name of MOCKUP_COLORS) {
      expect(tokens[`--light-${name}`]?.toLowerCase(), `--light-${name}`).toBe(
        mockLight[`--${name}`].toLowerCase(),
      );
      expect(tokens[`--dark-${name}`]?.toLowerCase(), `--dark-${name}`).toBe(
        mockDark[`--${name}`].toLowerCase(),
      );
    }
    expect(tokens['--radius']).toBe(mockLight['--radius']);
    expect(tokens['--radius-sm']).toBe(mockLight['--radius-sm']);
  });
});

describe('rules use the tokens (AC1)', () => {
  it('takes every font size from the type scale', () => {
    const sizes = declarationsWhere((property) => property === 'font-size');
    const shorthands = declarationsWhere((property) => property === 'font');

    expect(sizes.length).toBeGreaterThan(0);
    expect(shorthands.length).toBeGreaterThan(0);
    for (const { rule, declaration } of sizes) {
      expect(declaration.value, describeRule(rule)).toMatch(/^(var\(--font-size-[\w-]+\)|inherit)$/);
    }
    for (const { rule, declaration } of shorthands) {
      const fromScale = declaration.value === 'inherit' || declaration.value.includes('var(--font-size-');
      expect(fromScale, `${describeRule(rule)}: font: ${declaration.value}`).toBe(true);
    }
  });

  it('takes every corner radius from the two radii, a pill or a circle', () => {
    const allowed = ['var(--radius)', 'var(--radius-sm)', '999px', '50%', '0'];
    const radii = declarationsWhere((property) => /^border(-[a-z]+)*-radius$/.test(property));

    expect(radii.length).toBeGreaterThan(0);
    for (const { rule, declaration } of radii) {
      for (const part of declaration.value.split(/[\s/]+/)) {
        expect(allowed, `${describeRule(rule)}: ${declaration.property}: ${declaration.value}`).toContain(part);
      }
    }
  });

  it('writes no px length in a margin, a padding or a gap', () => {
    const spacing = declarationsWhere((property) =>
      /^((margin|padding)(-[a-z-]+)?|gap|row-gap|column-gap)$/.test(property),
    );

    expect(spacing.length).toBeGreaterThan(0);
    for (const { rule, declaration } of spacing) {
      expect(
        declaration.value,
        `${describeRule(rule)}: ${declaration.property}: ${declaration.value}`,
      ).not.toMatch(PX_LENGTH);
    }
  });

  it('never reaches past a token for a palette entry', () => {
    for (const rule of styleRules) {
      for (const declaration of rule.declarations) {
        expect(declaration.value, describeRule(rule)).not.toMatch(/var\(\s*--(light|dark)-/);
      }
    }
  });
});

describe('dark theme (AC2)', () => {
  it('has a color token for each mockup color, the scrim and the shadow', () => {
    expect([...colorTokens].sort()).toEqual([...MOCKUP_COLORS, 'scrim', 'shadow'].sort());
  });

  it('gives every color token a light value, a dark value and an alias to the light one', () => {
    for (const name of colorTokens) {
      expect(tokens[`--light-${name}`], `--light-${name}`).toMatch(WHOLE_HEX_COLOR);
      expect(tokens[`--dark-${name}`], `--dark-${name}`).toMatch(WHOLE_HEX_COLOR);
      expect(tokens[`--${name}`], `--${name}`).toBe(`var(--light-${name})`);
    }
  });

  it('has no dark palette entry without a light one', () => {
    const darkNames = Object.keys(tokens)
      .filter((name) => name.startsWith('--dark-'))
      .map((name) => name.slice('--dark-'.length));

    expect(darkNames.sort()).toEqual([...colorTokens].sort());
  });

  it('writes color literals in the palette only', () => {
    const withLiteral = root.declarations.filter((declaration) => hasColorLiteral(declaration.value));

    expect(withLiteral.length).toBe(colorTokens.length * 2);
    for (const declaration of withLiteral) {
      expect(declaration.property).toMatch(/^--(light|dark)-/);
    }
  });

  it('redefines every color token under :root[data-theme="dark"]', () => {
    const expected: Record<string, string> = { 'color-scheme': 'dark' };
    for (const name of colorTokens) expected[`--${name}`] = `var(--dark-${name})`;

    expect(dark.at).toBeNull();
    expect(dark.declarations).toHaveLength(colorTokens.length + 1);
    expect(declarationsOf(dark)).toEqual(expected);
  });

  it('redefines the same under prefers-color-scheme: dark for a root not set to light', () => {
    expect(systemDark.at).toBe(SYSTEM_DARK_MEDIA);
    expect(systemDark.selector).toBe(SYSTEM_DARK_SELECTOR);
    expect(systemDark.declarations).toHaveLength(dark.declarations.length);
    expect(declarationsOf(systemDark)).toEqual(declarationsOf(dark));
  });

  it('has each token block once', () => {
    expect(rules.filter((rule) => rule.selectors.includes(':root'))).toEqual([root]);
    expect(rules.filter((rule) => rule.selector.includes('data-theme'))).toEqual([dark, systemDark]);
    expect(rules.filter((rule) => rule.at?.includes('prefers-color-scheme'))).toEqual([systemDark]);
  });

  it('declares custom properties in the three token blocks only', () => {
    expect(styleRules.length).toBeGreaterThan(0);
    for (const rule of styleRules) {
      expect(rule.declarations.filter(isCustomProperty), describeRule(rule)).toEqual([]);
    }
  });

  it('holds no color literal in any rule outside :root', () => {
    expect(outsideRoot.length).toBeGreaterThan(styleRules.length);
    for (const rule of outsideRoot) {
      for (const declaration of rule.declarations) {
        expect(
          hasColorLiteral(declaration.value),
          `${describeRule(rule)}: ${declaration.property}: ${declaration.value}`,
        ).toBe(false);
      }
    }
  });

  it('recognises a color literal when it sees one', () => {
    const literals = [
      '#fff',
      '1px solid #14171c80',
      'rgb(0 0 0 / 50%)',
      'color-mix(in srgb, var(--a), var(--b))',
      'light-dark(var(--a), var(--b))',
      'oklch(60% 0.1 20)',
      'transparent',
      '0 0 4px black',
      'White',
    ];
    const references = [
      'var(--surface)',
      'var(--low-bg)',
      'none',
      'currentColor',
      'nowrap',
      '1px solid var(--border)',
      '0 4px 12px var(--shadow)',
      'var(--font-size-md) / var(--line-height) var(--font-family)',
      'skeleton-pulse 1.2s ease-in-out infinite',
    ];

    for (const value of literals) expect(hasColorLiteral(value), value).toBe(true);
    for (const value of references) expect(hasColorLiteral(value), value).toBe(false);
  });
});

describe('navigation layout (AC3)', () => {
  it('lays the navigation out as a bar fixed to the bottom on narrow screens', () => {
    const nav = declarationsOf(findRule(rules, '.app-nav'));

    expect(nav).toMatchObject({ position: 'fixed', left: '0', right: '0', bottom: '0' });
    expect(nav).not.toHaveProperty('top');
    expect(nav).not.toHaveProperty('inset');
    expect(nav.display).toBe('flex');
    expect(nav['flex-direction'] ?? 'row').toBe('row');
  });

  it('keeps the end of a page clear of the bar', () => {
    expect(valueOf(findRule(rules, 'body'), 'padding-bottom')).toContain('var(--nav-height)');
  });

  it('has one min-width block and no max-width query', () => {
    const stripped = stripComments(css);
    const mediaPreludes = [...stripped.matchAll(/@media[^{;]*/g)].map((match) => match[0].trim());

    expect(mediaPreludes.filter((prelude) => prelude.includes('min-width'))).toEqual([WIDE_MEDIA]);
    expect(mediaPreludes.filter((prelude) => prelude.includes('max-width'))).toEqual([]);
  });

  it('turns the navigation into a sidebar on wide screens', () => {
    const nav = declarationsOf(findRule(rules, '.app-nav', WIDE_MEDIA));
    const body = declarationsOf(findRule(rules, 'body', WIDE_MEDIA));

    expect(nav).toMatchObject({
      top: '0',
      right: 'auto',
      width: 'var(--nav-width)',
      'flex-direction': 'column',
    });
    expect(nav).not.toHaveProperty('bottom');
    expect(nav).not.toHaveProperty('position');
    expect(body).toMatchObject({ 'padding-left': 'var(--nav-width)', 'padding-bottom': '0' });
  });

  it('hides the Add label on the bar without removing it, and shows it in the sidebar', () => {
    const selector = '.app-nav__link--add .app-nav__label';
    const narrow = findRules(rules, selector);
    const wide = declarationsOf(findRule(rules, selector, WIDE_MEDIA));

    expect(narrow.length).toBeGreaterThan(0);
    for (const rule of narrow) {
      expect(declarationsOf(rule)).not.toHaveProperty('display');
      expect(declarationsOf(rule)).not.toHaveProperty('visibility');
    }
    expect(declarationsOf(narrow[0])).toMatchObject({ position: 'absolute', 'clip-path': 'inset(50%)' });
    expect(wide).toMatchObject({ position: 'static', 'clip-path': 'none', width: 'auto', height: 'auto' });
  });
});

describe('touch targets and hidden elements (AC6)', () => {
  it('sets the touch target to 44px', () => {
    expect(tokens['--touch-target']).toBe('44px');
  });

  it.each(['.btn', '.app-nav__link'])('gives %s a minimum height of 44px that takes effect', (selector) => {
    const rule = declarationsOf(findRule(rules, selector));

    expect(rule['min-height']).toBe('var(--touch-target)');
    expect(['flex', 'inline-flex']).toContain(rule.display);
  });

  it('lets no other rule lower the minimum height of a button or a navigation link', () => {
    const others = rules.filter((rule) => /\.btn\b|\.app-nav__link\b/.test(rule.selector));

    expect(others.length).toBeGreaterThan(2);
    for (const rule of others) {
      const minHeight = valueOf(rule, 'min-height');
      if (minHeight !== undefined) expect(minHeight, describeRule(rule)).toBe('var(--touch-target)');
      expect(valueOf(rule, 'display'), describeRule(rule)).not.toBe('inline');
    }
  });

  it('gives the app-name link in the header the same minimum height', () => {
    const link = declarationsOf(findRule(rules, '.site-header a'));

    expect(link['min-height']).toBe('var(--touch-target)');
    expect(['flex', 'inline-flex']).toContain(link.display);
  });

  it('makes the hidden attribute win over a component that sets display', () => {
    expect(valueOf(findRule(rules, '[hidden]'), 'display')).toBe('none !important');
    expect(valueOf(findRule(rules, '.overlay'), 'display')).toBe('flex');
  });

  it('has a visually-hidden utility that keeps text for screen readers', () => {
    const hidden = declarationsOf(findRule(rules, '.visually-hidden'));

    expect(hidden).toMatchObject({
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      'clip-path': 'inset(50%)',
      'white-space': 'nowrap',
    });
    expect(hidden).not.toHaveProperty('display');
    expect(hidden).not.toHaveProperty('margin');
  });

  it('stops the skeleton animation for people who ask for reduced motion', () => {
    const moving = findRule(rules, '.skeleton__line');
    const still = findRule(rules, '.skeleton__line', '@media (prefers-reduced-motion: reduce)');

    expect(valueOf(moving, 'animation')).toBeDefined();
    expect(valueOf(still, 'animation')).toBe('none');
  });
});

describe('component classes', () => {
  it('styles every class the partials and the shell use', () => {
    const styled = [
      '.site-header',
      '.page',
      '.app-nav',
      '.app-nav__link',
      '.app-nav__link--add',
      '.page-header',
      '.btn',
      '.btn--ghost',
      '.badge',
      '.badge--urgent',
      '.badge--high',
      '.badge--medium',
      '.badge--low',
      '.badge--slot-morning',
      '.badge--slot-afternoon',
      '.badge--slot-evening',
      '.badge--slot-night',
      '.chip',
      '.chip--on',
      '.card',
      '.overlay',
      '.overlay--modal',
      '.overlay--sheet',
      '.modal',
      '.sheet',
      '.toast-region',
      '.toast',
      '.empty-state',
      '.skeleton',
      '.skeleton__line',
      '.sg-section',
      '.sg-stage',
    ];

    for (const selector of styled) {
      expect(findRules(rules, selector).length, selector).toBeGreaterThan(0);
    }
  });

  it('gives each priority badge its own color on its own tint', () => {
    for (const name of ['urgent', 'high', 'medium', 'low']) {
      expect(declarationsOf(findRule(rules, `.badge--${name}`))).toEqual({
        background: `var(--${name}-bg)`,
        color: `var(--${name})`,
      });
    }
  });

  it('gives each slot badge its tint', () => {
    for (const name of ['morning', 'afternoon', 'evening', 'night']) {
      expect(valueOf(findRule(rules, `.badge--slot-${name}`), 'background')).toBe(`var(--slot-${name})`);
    }
  });

  it('boxes a fixed component on the style guide', () => {
    expect(declarationsOf(findRule(rules, '.sg-stage'))).toMatchObject({
      position: 'relative',
      overflow: 'hidden',
      transform: 'translateZ(0)',
    });
    expect(declarationsOf(findRule(rules, '.overlay'))).toMatchObject({
      position: 'fixed',
      inset: '0',
      background: 'var(--scrim)',
    });
  });
});
