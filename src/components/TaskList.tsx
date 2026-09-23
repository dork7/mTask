import type { Task } from '../storage/types';
import { TaskItem } from './TaskItem';

export interface TaskListProps {
  tasks: Task[];
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

export function TaskList({ tasks, onToggleDone, onDelete, onRetry }: TaskListProps) {
  if (tasks.length === 0) {
    return <p>No tasks yet.</p>;
  }
  return (
    <ul>
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} onToggleDone={onToggleDone} onDelete={onDelete} onRetry={onRetry} />
      ))}
    </ul>
  );
}
