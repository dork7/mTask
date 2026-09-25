import { useState } from 'react';
import type { RecurrenceRule, Task } from '../storage/types';

export interface TaskItemProps {
  task: Task;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  /** Levels offered in the priority dropdown. */
  priorityOptions?: string[];
  onSetPriority?: (id: string, label: string) => void;
  /** Possible answers per question id, for the answer badges' dropdowns. */
  answerOptions?: Record<string, string[]>;
  onSetAnswer?: (id: string, question: string, answer: string) => void;
  onEdit?: (id: string, title: string, description: string) => void;
}

/** Each question gets its own badge colour, in question order. */
const ANSWER_COLORS = ['blue', 'purple', 'teal', 'pink', 'indigo', 'mint'];

function answerClass(index: number, answer: string): string {
  if (answer === 'yes') return 'badge badge-green';
  if (answer === 'no') return 'badge badge-gray';
  return `badge badge-${ANSWER_COLORS[index % ANSWER_COLORS.length]}`;
}

/** Tag colour for the levels the user asked to have colour-coded; other labels stay untagged. */
const TAG_COLORS: Record<string, string> = {
  critical: 'red',
  urgent: 'red',
  high: 'brown',
  medium: 'orange',
  'not urgent': 'yellow',
  'immediate action required': 'darkred',
  low: 'green',
  'no action required': 'yellow',
};

function tagClass(label: string): string | undefined {
  const color = TAG_COLORS[label.trim().toLowerCase()];
  return color ? `tag tag-${color}` : undefined;
}

function recurrenceText(rule: RecurrenceRule): string {
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', none: '' }[rule.type];
  const n = rule.interval ?? 1;
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
}

export function TaskItem({
  task,
  onToggleDone,
  onDelete,
  onRetry,
  priorityOptions = [],
  onSetPriority,
  answerOptions = {},
  onSetAnswer,
  onEdit,
}: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftDescription, setDraftDescription] = useState(task.description);

  if (editing) {
    const save = () => {
      onEdit?.(task.id, draftTitle.trim(), draftDescription.trim());
      setEditing(false);
    };
    return (
      <li className="task task-editing">
        <form
          className="task-edit"
          onSubmit={(e) => {
            e.preventDefault();
            if (draftTitle.trim()) save();
          }}
        >
          <input aria-label="Edit title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} autoFocus />
          <textarea
            aria-label="Edit description"
            rows={2}
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
          />
          <div className="task-edit-actions">
            <button type="submit" className="pill pill-small" disabled={!draftTitle.trim()}>
              Save
            </button>
            <button type="button" className="link" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  const startEditing = () => {
    setDraftTitle(task.title);
    setDraftDescription(task.description);
    setEditing(true);
  };

  const { priority } = task;
  const current = priority?.status === 'done' ? priority.label : '';
  // Keep the current label selectable even if the questions no longer list it.
  const options = current && !priorityOptions.includes(current) ? [current, ...priorityOptions] : priorityOptions;
  return (
    <li className={`task${task.done ? ' task-done' : ''}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={task.done}
        onChange={() => onToggleDone(task.id)}
        aria-label={`Mark ${task.title} done`}
      />
      <div className="task-body">
        <span className="task-title">{task.title}</span>
        {task.description && <p className="task-desc">{task.description}</p>}
        <div className="task-meta">
          {task.recurrence && task.recurrence.type !== 'none' && (
            <span className="chip">{recurrenceText(task.recurrence)}</span>
          )}
          {priority?.status === 'pending' && (
            <span role="status" className="task-status">
              Classifying…
            </span>
          )}
          {onSetPriority && options.length > 0 && (
            <select
              className={`priority-select ${tagClass(current) ?? 'chip'}`}
              aria-label={`Priority for ${task.title}`}
              value={current}
              onChange={(e) => e.target.value && onSetPriority(task.id, e.target.value)}
            >
              {!current && <option value="">Set priority</option>}
              {options.map((label) => (
                <option key={label} value={label}>
                  Priority: {label}
                </option>
              ))}
            </select>
          )}
          {!(onSetPriority && options.length > 0) && priority?.status === 'done' && priority.label && (
            <span className={tagClass(priority.label) ?? 'chip'}>Priority: {priority.label}</span>
          )}
          {priority?.status === 'done' && priority.label && (
            <span className="task-status-note">
              {priority.manual ? 'edited by you' : `${Math.round(priority.confidence * 100)}% confidence`}
            </span>
          )}
          {priority?.status === 'error' && (
            <span className="task-error">
              Couldn&apos;t classify.
              <button type="button" className="link" onClick={() => onRetry(task.id)}>
                Retry
              </button>
            </span>
          )}
        </div>
        {priority?.status === 'done' && !!priority.answers?.length && (
          <div className="answers">
            {priority.answers.map((a, i) => {
              const choices = answerOptions[a.question] ?? [];
              const text = `${a.question}: ${a.answer}`;
              if (!onSetAnswer || choices.length === 0) {
                return (
                  <span key={a.question} className={answerClass(i, a.answer)}>
                    {text}
                  </span>
                );
              }
              const values = choices.includes(a.answer) ? choices : [a.answer, ...choices];
              return (
                <select
                  key={a.question}
                  className={`badge-select ${answerClass(i, a.answer)}`}
                  aria-label={`${a.question} for ${task.title}`}
                  value={a.answer}
                  onChange={(e) => onSetAnswer(task.id, a.question, e.target.value)}
                >
                  {values.map((v) => (
                    <option key={v} value={v}>
                      {a.question}: {v}
                    </option>
                  ))}
                </select>
              );
            })}
          </div>
        )}
      </div>
      <div className="task-actions">
        {onEdit && (
          <button type="button" className="link" onClick={startEditing}>
            Edit
          </button>
        )}
        <button type="button" className="link link-danger" onClick={() => onDelete(task.id)}>
          Delete
        </button>
      </div>
    </li>
  );
}
