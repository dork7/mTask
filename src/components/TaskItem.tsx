import type { Task } from '../storage/types';

export interface TaskItemProps {
  task: Task;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
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

export function TaskItem({ task, onToggleDone, onDelete, onRetry }: TaskItemProps) {
  return (
    <li>
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => onToggleDone(task.id)}
        aria-label={`Mark ${task.title} done`}
      />
      <span style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</span>
      {task.description && <p>{task.description}</p>}
      {task.priority?.status === 'pending' && <span role="status">Classifying…</span>}
      {task.priority?.status === 'done' && task.priority.label && (
        <span className={tagClass(task.priority.label)}>
          Priority: {task.priority.label} ({Math.round(task.priority.confidence * 100)}% confidence)
        </span>
      )}
      {task.priority?.status === 'done' && !!task.priority.answers?.length && (
        <small className="answers">
          {task.priority.answers.map((a) => `${a.question}: ${a.answer}`).join(' · ')}
        </small>
      )}
      {task.priority?.status === 'error' && (
        <span>
          Couldn&apos;t classify.
          <button type="button" onClick={() => onRetry(task.id)}>
            Retry
          </button>
        </span>
      )}
      <button type="button" onClick={() => onDelete(task.id)}>
        Delete
      </button>
    </li>
  );
}
