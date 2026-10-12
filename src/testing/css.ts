/*
 * A small CSS parser for the stylesheet tests. It reads what `public/css/base.css`
 * uses: comments, style rules, and at-rules that hold style rules (`@media`,
 * `@keyframes`, `@supports`). It keeps every value as written, which jsdom's CSSOM does
 * not. Nested style rules are not supported and throw.
 */

export interface CssDeclaration {
  property: string;
  /** The value as written, whitespace collapsed, `!important` included. */
  value: string;
}

export interface CssRule {
  /** The whole selector as written, whitespace collapsed. */
  selector: string;
  /** The selector split at its top-level commas. */
  selectors: string[];
  /** The prelude of the enclosing at-rule, such as `@media (min-width: 900px)`, or null. */
  at: string | null;
  declarations: CssDeclaration[];
}

/** At-rules whose block holds rules, not declarations. */
const GROUPING_AT_RULE = /^@(media|supports|keyframes|container|layer)\b/;

const QUOTES = new Set(['"', "'"]);

/** Removes comments. A comment marker inside a quoted string is left alone. */
export function stripComments(css: string): string {
  let out = '';
  let index = 0;
  while (index < css.length) {
    const char = css[index];
    if (QUOTES.has(char)) {
      const end = endOfString(css, index);
      out += css.slice(index, end);
      index = end;
    } else if (char === '/' && css[index + 1] === '*') {
      const close = css.indexOf('*/', index + 2);
      if (close === -1) throw new Error('Unclosed comment in CSS');
      out += ' ';
      index = close + 2;
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

/** Parses a stylesheet into a flat list of rules, in source order. */
export function parseCss(css: string): CssRule[] {
  const source = stripComments(css);
  const rules: CssRule[] = [];
  const end = parseRules(source, 0, null, rules);
  if (end < source.length) throw new Error(`Unexpected "}" at offset ${end} in CSS`);
  return rules;
}

/** The rules with this selector (alone or as one part of a selector list) and this at-rule. */
export function findRules(rules: CssRule[], selector: string, at: string | null = null): CssRule[] {
  return rules.filter((rule) => rule.at === at && rule.selectors.includes(selector));
}

/** The one rule with this selector and this at-rule. Throws when there is none or several. */
export function findRule(rules: CssRule[], selector: string, at: string | null = null): CssRule {
  const found = findRules(rules, selector, at);
  if (found.length !== 1) {
    const where = at === null ? 'outside any at-rule' : `inside ${at}`;
    throw new Error(`Expected one rule for "${selector}" ${where}, found ${found.length}`);
  }
  return found[0];
}

/** The value a rule gives a property (the last one, as the cascade would), or undefined. */
export function valueOf(rule: CssRule, property: string): string | undefined {
  return declarationsOf(rule)[property];
}

/** A rule's declarations as an object. A property declared twice keeps its last value. */
export function declarationsOf(rule: CssRule): Record<string, string> {
  return Object.fromEntries(rule.declarations.map(({ property, value }) => [property, value]));
}

/**
 * Reads rules from `start` until the block's closing brace or the end of the text, and
 * returns the offset of that brace (or the length of the text).
 */
function parseRules(source: string, start: number, at: string | null, rules: CssRule[]): number {
  let index = start;
  while (index < source.length) {
    const stop = scanTo(source, index, '{};');
    const prelude = collapse(source.slice(index, stop));
    const char = source[stop];

    if (char === undefined) {
      if (prelude !== '') throw new Error(`Unexpected end of CSS after "${prelude}"`);
      return source.length;
    }
    if (char === '}') {
      if (prelude !== '') throw new Error(`Unexpected "}" after "${prelude}"`);
      return stop;
    }
    if (char === ';') {
      // A statement at-rule such as `@import`: nothing to record.
      index = stop + 1;
      continue;
    }

    if (GROUPING_AT_RULE.test(prelude)) {
      const inner = at === null ? prelude : `${at} ${prelude}`;
      const close = parseRules(source, stop + 1, inner, rules);
      if (source[close] !== '}') throw new Error(`Unclosed block for "${prelude}"`);
      index = close + 1;
      continue;
    }

    const close = scanTo(source, stop + 1, '{}');
    if (source[close] === '{') throw new Error(`Nested rules are not supported: "${prelude}"`);
    if (source[close] !== '}') throw new Error(`Unclosed block for "${prelude}"`);
    rules.push({
      selector: prelude,
      selectors: splitTopLevel(prelude, ',').map(collapse),
      at,
      declarations: parseDeclarations(source.slice(stop + 1, close)),
    });
    index = close + 1;
  }
  return index;
}

function parseDeclarations(body: string): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];
  for (const part of splitTopLevel(body, ';')) {
    const text = part.trim();
    if (text === '') continue;
    const colon = text.indexOf(':');
    if (colon === -1) throw new Error(`Not a declaration: "${text}"`);
    declarations.push({
      property: text.slice(0, colon).trim(),
      value: collapse(text.slice(colon + 1)),
    });
  }
  return declarations;
}

/** The offset of the first of `stops` that is outside quotes and parentheses, or the length. */
function scanTo(source: string, start: number, stops: string): number {
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const char = source[index];
    if (QUOTES.has(char)) {
      index = endOfString(source, index);
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && stops.includes(char)) return index;
    index += 1;
  }
  return source.length;
}

/** Splits at a separator that is outside quotes and parentheses. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let index = 0;
  while (index <= text.length) {
    const stop = scanTo(text, index, separator);
    parts.push(text.slice(index, stop));
    index = stop + 1;
  }
  return parts;
}

/** The offset just past the quoted string that opens at `start`. */
function endOfString(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') index += 2;
    else if (source[index] === quote) return index + 1;
    else index += 1;
  }
  throw new Error('Unclosed string in CSS');
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
