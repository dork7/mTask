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

  it('shows the answers to the other questions under the priority', () => {
    render(
      <TaskItem
        task={makeTask({
          priority: {
            label: 'high',
            score: 2,
            confidence: 0.8,
            status: 'done',
            answers: [
              { question: 'requester', answer: 'manager' },
              { question: 'deadline', answer: 'hours' },
            ],
          },
        })}
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText('requester: manager · deadline: hours')).toBeInTheDocument();
  });

  it('shows only the answers when there is no headline priority', () => {
    render(
      <TaskItem
        task={makeTask({
          priority: {
            label: '',
            score: 0,
            confidence: 0,
            status: 'done',
            answers: [{ question: 'blocksOthers', answer: 'yes' }],
          },
        })}
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText('blocksOthers: yes')).toBeInTheDocument();
    expect(screen.queryByText(/Priority:/)).not.toBeInTheDocument();
  });

  it.each([
    ['urgent', 'tag-red'],
    ['critical', 'tag-red'],
    ['medium', 'tag-orange'],
    ['not urgent', 'tag-yellow'],
    ['immediate action required', 'tag-darkred'],
    ['High', 'tag-brown'],
    ['low', 'tag-green'],
    ['no action required', 'tag-yellow'],
  ])('tags a "%s" priority with %s', (label, cls) => {
    render(
      <TaskItem
        task={makeTask({ priority: { label, score: 1, confidence: 0.8, status: 'done' } })}
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/^Priority:/)).toHaveClass('tag', cls);
  });

  it('leaves other labels untagged', () => {
    render(
      <TaskItem
        task={makeTask({ priority: { label: 'somewhat urgent', score: 1, confidence: 0.8, status: 'done' } })}
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/^Priority:/)).not.toHaveClass('tag');
  });
});
