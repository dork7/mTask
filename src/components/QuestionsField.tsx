export interface QuestionsFieldProps {
  value: string;
  onChange: (next: string) => void;
  /** Why the current value can't be used, if it can't. */
  error?: string;
}

export function QuestionsField({ value, onChange, error }: QuestionsFieldProps) {
  return (
    <section aria-label="Questions">
      <label htmlFor="priority-questions">Questions (JSON)</label>
      <textarea
        id="priority-questions"
        className="questions"
        value={value}
        rows={16}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p role="alert" className="field-error">
          {error}. New tasks won&apos;t be classified until this is fixed.
        </p>
      )}
    </section>
  );
}
