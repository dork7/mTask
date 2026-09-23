import { useState, type FormEvent } from 'react';

export interface TaskFormProps {
  onAdd: (title: string, description: string) => void;
}

export function TaskForm({ onAdd }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onAdd(trimmedTitle, description.trim());
    setTitle('');
    setDescription('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="task-title">Title</label>
      <input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="task-description">Description</label>
      <textarea id="task-description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <button type="submit">Add task</button>
    </form>
  );
}
