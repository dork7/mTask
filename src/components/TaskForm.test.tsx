import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskForm } from './TaskForm';

describe('TaskForm', () => {
  it('calls onAdd with the trimmed title and description, then clears the form', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<TaskForm onAdd={onAdd} />);

    await user.type(screen.getByLabelText('Title'), '  Buy milk  ');
    await user.type(screen.getByLabelText('Description'), ' 2% please ');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(onAdd).toHaveBeenCalledWith('Buy milk', '2% please');
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it('does not call onAdd when the title is empty or whitespace-only', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<TaskForm onAdd={onAdd} />);

    await user.type(screen.getByLabelText('Title'), '   ');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(onAdd).not.toHaveBeenCalled();
  });
});
