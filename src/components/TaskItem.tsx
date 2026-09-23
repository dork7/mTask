import type { Task } from '../storage/types';

export interface TaskItemProps {
  task: Task;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
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
      {task.priority?.status === 'done' &&
        (task.priority.mode === 'yesno' ? (
          <span>
            Answer: {task.priority.label} ({Math.round(task.priority.confidence * 100)}% likely)
          </span>
        ) : (
          <span>
            Priority: {task.priority.label} ({Math.round(task.priority.confidence * 100)}% confidence)
          </span>
        ))}
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
