import { useState, type FormEvent } from 'react';
import type { RecurrenceRule } from '../storage/types';

type RepeatType = RecurrenceRule['type'];

export interface TaskFormProps {
  onAdd: (title: string, description: string, recurrence?: RecurrenceRule) => void;
}

export function TaskForm({ onAdd }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<RepeatType>('none');
  const [interval, setIntervalValue] = useState<number>(1);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const recurrence: RecurrenceRule | undefined =
      recurrenceType === 'none' ? undefined : { type: recurrenceType, interval };

    onAdd(trimmedTitle, description.trim(), recurrence);
    setTitle('');
    setDescription('');
    setRecurrenceType('none');
    setIntervalValue(1);
  };

  return (
    <form onSubmit={handleSubmit} className="card form">
      <div className="field">
        <label htmlFor="task-title">Title</label>
        <input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
      </div>
      <div className="field">
        <label htmlFor="task-description">Description</label>
        <textarea
          id="task-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional details"
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="recurrence-type">Repeat</label>
          <select id="recurrence-type" value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value as RepeatType)}>
            <option value="none">None</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        {recurrenceType !== 'none' && (
          <div className="field">
            <label htmlFor="recurrence-interval">Every (days/weeks/months)</label>
            <input
              id="recurrence-interval"
              type="number"
              min="1"
              value={interval}
              onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
            />
          </div>
        )}
      </div>
      <button type="submit" className="pill">
        Add task
      </button>
    </form>
  );
}
