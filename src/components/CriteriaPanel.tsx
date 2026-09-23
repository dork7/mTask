import type { PriorityMode, PriorityQuestion } from '../storage/types';

export interface CriteriaPanelProps {
  criteria: string[];
  question: PriorityQuestion;
  onChange: (next: string[]) => void;
  onQuestionChange: (next: PriorityQuestion) => void;
}

export function CriteriaPanel({ criteria, question, onChange, onQuestionChange }: CriteriaPanelProps) {
  const setMode = (mode: PriorityMode) => onQuestionChange({ ...question, mode });

  const handleRename = (index: number, value: string) => {
    const next = criteria.slice();
    next[index] = value;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    if (criteria.length <= 2) return;
    onChange(criteria.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...criteria, `level ${criteria.length + 1}`]);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= criteria.length) return;
    const next = criteria.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <section aria-label="Priority question">
      <h2>Priority question</h2>
      <label htmlFor="priority-instructions">Instructions</label>
      <textarea
        id="priority-instructions"
        value={question.instructions}
        onChange={(e) => onQuestionChange({ ...question, instructions: e.target.value })}
      />
      <fieldset>
        <legend>Answer with</legend>
        <label>
          <input
            type="radio"
            name="priority-mode"
            checked={question.mode === 'levels'}
            onChange={() => setMode('levels')}
          />
          Levels
        </label>
        <label>
          <input
            type="radio"
            name="priority-mode"
            checked={question.mode === 'yesno'}
            onChange={() => setMode('yesno')}
          />
          Yes/no (instructions only)
        </label>
      </fieldset>
      {question.mode === 'yesno' ? (
        <p className="hint">Phrase the instructions as a yes/no question, e.g. “Does this need doing today?”</p>
      ) : (
        <>
          <ul>
            {criteria.map((level, index) => (
              <li key={index}>
                <label htmlFor={`criteria-${index}`}>{`Criteria level ${index + 1}`}</label>
                <input
                  id={`criteria-${index}`}
                  value={level}
                  onChange={(e) => handleRename(index, e.target.value)}
                />
                <button type="button" onClick={() => handleMove(index, -1)} disabled={index === 0}>
                  Up
                </button>
                <button type="button" onClick={() => handleMove(index, 1)} disabled={index === criteria.length - 1}>
                  Down
                </button>
                <button type="button" onClick={() => handleRemove(index)} disabled={criteria.length <= 2}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={handleAdd}>
            Add level
          </button>
        </>
      )}
    </section>
  );
}
