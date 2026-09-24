import type { Task } from '../storage/types';
import { TaskItem } from './TaskItem';

export interface TaskListProps {
  tasks: Task[];
  priorityOptions?: string[];
  answerOptions?: Record<string, string[]>;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  onSetPriority?: (id: string, label: string) => void;
  onSetAnswer?: (id: string, question: string, answer: string) => void;
}

export function TaskList({
  tasks,
  priorityOptions,
  answerOptions,
  onToggleDone,
  onDelete,
  onRetry,
  onSetPriority,
  onSetAnswer,
}: TaskListProps) {
  if (tasks.length === 0) {
    return <p className="card empty">No tasks yet.</p>;
  }
  // Newest first; ISO timestamps sort correctly as strings.
  const sorted = [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <ul className="card task-list">
      {sorted.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          priorityOptions={priorityOptions}
          answerOptions={answerOptions}
          onToggleDone={onToggleDone}
          onDelete={onDelete}
          onRetry={onRetry}
          onSetPriority={onSetPriority}
          onSetAnswer={onSetAnswer}
        />
      ))}
    </ul>
  );
}
