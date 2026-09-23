import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '../storage/types';
import { TaskItem } from './TaskItem';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    title: 'Buy milk',
    description: '2%',
    createdAt: '2026-09-23T00:00:00.000Z',
    done: false,
    priority: { label: '', score: 0, confidence: 0, status: 'pending' },
    ...overrides,
  };
}

describe('TaskItem', () => {
  it('shows a classifying indicator while priority.status is pending', () => {
    render(<TaskItem task={makeTask()} onToggleDone={vi.fn()} onDelete={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText('Classifying…')).toBeInTheDocument();
  });

  it('shows the label and confidence once classified', () => {
    render(
      <TaskItem
        task={makeTask({ priority: { label: 'high', score: 2.4, confidence: 0.81, status: 'done' } })}
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/Priority: high/)).toBeInTheDocument();
    expect(screen.getByText(/81%/)).toBeInTheDocument();
  });

  it('shows a retry button on error and calls onRetry with the task id', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <TaskItem
        task={makeTask({ priority: { label: '', score: 0, confidence: 0, status: 'error' } })}
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledWith('1');
  });

  it('calls onToggleDone when the checkbox is clicked', async () => {
    const user = userEvent.setup();
    const onToggleDone = vi.fn();
    render(<TaskItem task={makeTask()} onToggleDone={onToggleDone} onDelete={vi.fn()} onRetry={vi.fn()} />);

    await user.click(screen.getByRole('checkbox'));

    expect(onToggleDone).toHaveBeenCalledWith('1');
  });

  it('calls onDelete when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<TaskItem task={makeTask()} onToggleDone={vi.fn()} onDelete={onDelete} onRetry={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('shows a yes/no answer with how likely it is', () => {
    render(
      <TaskItem
        task={makeTask({ priority: { label: 'yes', score: 0.78, confidence: 0.78, status: 'done', mode: 'yesno' } })}
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText('Answer: yes (78% likely)')).toBeInTheDocument();
    expect(screen.queryByText(/Priority:/)).not.toBeInTheDocument();
  });
});
