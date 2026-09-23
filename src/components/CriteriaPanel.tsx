export interface CriteriaPanelProps {
  criteria: string[];
  onChange: (next: string[]) => void;
}

export function CriteriaPanel({ criteria, onChange }: CriteriaPanelProps) {
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
    <section aria-label="Priority criteria">
      <h2>Priority criteria</h2>
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
    </section>
  );
}
