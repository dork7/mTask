// Ported from @receptron/laya's dist/types.d.ts (npm package "@receptron/laya"). This app
// reimplements the model/tokenizer layers against onnxruntime-web instead of depending on
// the npm package directly, since that package hard-requires onnxruntime-node (a native
// Node addon that cannot run in a browser). The request/response shapes are kept identical.

export type QuestionType = 'choice' | 'score' | 'noul';

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string | object;
  criteria: Record<string, string | null> | string[];
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string | object;
  criteria: string[];
}

export interface NoulQuestion {
  type: 'noul';
  instructions: string | object;
  criteria?: { true?: string; false?: string };
}

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  rl_agent: { act_probability: number };
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
  rl_agent: { act_probability: number };
}

export interface NoulAnswer {
  type: 'noul';
  noul: number;
  rl_agent: { act_probability: number };
}

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export type AnswerFor<Q extends Question> = Q extends ChoiceQuestion
  ? ChoiceAnswer
  : Q extends ScoreQuestion
    ? ScoreAnswer
    : NoulAnswer;

export interface SystemOneResult<Q extends Record<string, Question>> {
  model: string;
  answers: { [K in keyof Q]: AnswerFor<Q[K]> };
  usage: { input_tokens: number; output_tokens: number };
}

export interface LayaConfig {
  max_len: number;
  head_max_len: number;
  temperature: [number, number, number];
  temperature_by_options: Record<string, number>;
}

/** Internal (post-toInternal) question shape used by sequence building. */
export interface InternalQuestion {
  t: QuestionType;
  ins: string;
  crit: Record<string, string | null> | string[] | { true?: string; false?: string } | undefined;
}
