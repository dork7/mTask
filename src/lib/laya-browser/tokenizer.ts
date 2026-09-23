import { Tokenizer } from '@huggingface/tokenizers';

export interface LoadedTokenizer {
  encode: (text: string) => number[];
  tokenToId: (token: string) => number | undefined;
}

export function loadTokenizer(tokenizerJson: unknown, tokenizerConfigJson: unknown): LoadedTokenizer {
  const tok = new Tokenizer(tokenizerJson as object, tokenizerConfigJson as object);
  return {
    encode: (text: string) => tok.encode(text, { add_special_tokens: false }).ids,
    tokenToId: (token: string) => tok.token_to_id(token),
  };
}
