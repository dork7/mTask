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
  onEdit?: (id: string, title: string, description: string) => void;
  /** Shown when `tasks` is empty. */
  emptyText?: string;
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
  onEdit,
  emptyText = 'No tasks yet.',
}: TaskListProps) {
  if (tasks.length === 0) {
    return <p className="card empty">{emptyText}</p>;
  }
  // Rendered in the order given; the caller sorts.
  return (
    <ul className="card task-list">
      {tasks.map((task) => (
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
          onEdit={onEdit}
        />
      ))}
    </ul>
  );
}
