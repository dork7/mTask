import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuestionsField } from './QuestionsField';

describe('QuestionsField', () => {
  it('shows the value in an editable box and reports edits', () => {
    const onChange = vi.fn();
    render(<QuestionsField value="{}" onChange={onChange} />);
    expect(screen.getByLabelText('Questions (JSON)')).toHaveValue('{}');

    fireEvent.change(screen.getByLabelText('Questions (JSON)'), { target: { value: '{"a":1}' } });

    expect(onChange).toHaveBeenCalledWith('{"a":1}');
  });

  it('shows no error when the value is usable', () => {
    render(<QuestionsField value="{}" onChange={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error and flags the box as invalid', () => {
    render(<QuestionsField value="{" onChange={vi.fn()} error="Invalid JSON" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON');
    expect(screen.getByLabelText('Questions (JSON)')).toBeInvalid();
  });
});
