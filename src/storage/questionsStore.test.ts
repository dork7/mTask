import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_QUESTIONS_TEXT,
  loadQuestionsText,
  parseQuestions,
  saveQuestionsText,
} from './questionsStore';

const SCORE = { type: 'score', instructions: 'How urgent?', criteria: ['low', 'high'] };

describe('parseQuestions', () => {
  it('accepts a bare map of questions', () => {
    const result = parseQuestions(JSON.stringify({ urgency: SCORE }));
    expect(result).toEqual({ ok: true, questions: { urgency: SCORE } });
  });

  it('unwraps {"questions": {...}}', () => {
    const result = parseQuestions(JSON.stringify({ questions: { urgency: SCORE } }));
    expect(result).toEqual({ ok: true, questions: { urgency: SCORE } });
  });

  it('accepts the wrapper pasted without its outer braces', () => {
    const result = parseQuestions(`"questions": ${JSON.stringify({ urgency: SCORE })}`);
    expect(result).toEqual({ ok: true, questions: { urgency: SCORE } });
  });

  it('does not mistake a question with the id "questions" for the wrapper', () => {
    const result = parseQuestions(JSON.stringify({ questions: SCORE }));
    expect(result).toEqual({ ok: true, questions: { questions: SCORE } });
  });

  it('accepts the default questions', () => {
    expect(parseQuestions(DEFAULT_QUESTIONS_TEXT).ok).toBe(true);
  });

  it('accepts choice criteria as a list, and a noul question with no criteria', () => {
    const result = parseQuestions(
      JSON.stringify({
        a: { type: 'choice', instructions: 'x', criteria: ['one', 'two'] },
        b: { type: 'noul', instructions: 'y' },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    ['not json', '{"a": ', /invalid json/i],
    ['a non-object', '[1]', /expected a json object/i],
    ['no questions', '{}', /at least one question/i],
    ['a bad type', JSON.stringify({ a: { ...SCORE, type: 'rank' } }), /question "a".*"type"/],
    ['missing instructions', JSON.stringify({ a: { ...SCORE, instructions: ' ' } }), /question "a".*instructions/],
    ['a score with one level', JSON.stringify({ a: { ...SCORE, criteria: ['low'] } }), /question "a".*2 levels/],
    ['a score with object criteria', JSON.stringify({ a: { ...SCORE, criteria: { low: 'x', high: 'y' } } }), /question "a"/],
    ['a choice with one option', JSON.stringify({ a: { type: 'choice', instructions: 'x', criteria: { only: 'x' } } }), /question "a".*2/],
    ['a non-object question', JSON.stringify({ a: 'nope' }), /question "a" must be an object/],
  ])('rejects %s', (_name, text, message) => {
    const result = parseQuestions(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });
});

describe('questions storage', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to the default questions', () => {
    expect(loadQuestionsText()).toBe(DEFAULT_QUESTIONS_TEXT);
  });

  it('round-trips the text exactly, even when it is not valid', () => {
    saveQuestionsText('{"half": ');
    expect(loadQuestionsText()).toBe('{"half": ');
  });
});
