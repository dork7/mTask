import { describe, expect, it, vi } from 'vitest';

vi.mock('@huggingface/tokenizers', () => {
  return {
    Tokenizer: vi.fn().mockImplementation(function () {
      return {
        encode: (text: string, opts: { add_special_tokens: boolean }) => ({
          ids: opts.add_special_tokens
            ? [0, ...Array.from(text, (c) => c.charCodeAt(0)), 0]
            : Array.from(text).map((c) => c.charCodeAt(0)),
        }),
        token_to_id: (token: string) => (token === '[CLS]' ? 101 : undefined),
      };
    }),
  };
});

describe('loadTokenizer', () => {
  it('wraps Tokenizer.encode with add_special_tokens disabled and exposes the ids', async () => {
    const { loadTokenizer } = await import('./tokenizer');
    const tok = loadTokenizer({ fake: 'tokenizer.json' }, { fake: 'tokenizer_config.json' });

    expect(tok.encode('AB')).toEqual(['A'.charCodeAt(0), 'B'.charCodeAt(0)]);
  });

  it('passes through token_to_id, including undefined for unknown tokens', async () => {
    const { loadTokenizer } = await import('./tokenizer');
    const tok = loadTokenizer({}, {});

    expect(tok.tokenToId('[CLS]')).toBe(101);
    expect(tok.tokenToId('[NOPE]')).toBeUndefined();
  });
});
