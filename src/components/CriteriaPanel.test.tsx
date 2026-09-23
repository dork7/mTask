import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { PriorityQuestion } from '../storage/types';
import { CriteriaPanel } from './CriteriaPanel';

const LEVELS_QUESTION: PriorityQuestion = { instructions: 'How urgent is this task?', mode: 'levels' };

// CriteriaPanel is controlled: re-render with each change the way App does.
function StatefulPanel({
  initialCriteria = ['low', 'high'],
  initialQuestion = LEVELS_QUESTION,
  onChange = vi.fn(),
  onQuestionChange = vi.fn(),
}: {
  initialCriteria?: string[];
  initialQuestion?: PriorityQuestion;
  onChange?: (next: string[]) => void;
  onQuestionChange?: (next: PriorityQuestion) => void;
}) {
  const [criteria, setCriteria] = useState(initialCriteria);
  const [question, setQuestion] = useState(initialQuestion);
  return (
    <CriteriaPanel
      criteria={criteria}
      question={question}
      onChange={(next) => {
        setCriteria(next);
        onChange(next);
      }}
      onQuestionChange={(next) => {
        setQuestion(next);
        onQuestionChange(next);
      }}
    />
  );
}

describe('CriteriaPanel levels', () => {
  it('renders one input per criteria level', () => {
    render(<StatefulPanel />);
    expect(screen.getByLabelText('Criteria level 1')).toHaveValue('low');
    expect(screen.getByLabelText('Criteria level 2')).toHaveValue('high');
  });

  it('calls onChange with a renamed level', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulPanel onChange={onChange} />);

    await user.clear(screen.getByLabelText('Criteria level 1'));
    await user.type(screen.getByLabelText('Criteria level 1'), 'minor');

    expect(onChange).toHaveBeenLastCalledWith(['minor', 'high']);
  });

  it('calls onChange with an appended level when "Add level" is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulPanel onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Add level' }));

    expect(onChange).toHaveBeenCalledWith(['low', 'high', 'level 3']);
  });

  it('disables Remove on every level when only 2 levels remain', () => {
    render(<StatefulPanel />);
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    expect(removeButtons).toHaveLength(2);
    removeButtons.forEach((button) => expect(button).toBeDisabled());
  });

  it('calls onChange without the removed level when more than 2 levels exist', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulPanel initialCriteria={['low', 'medium', 'high']} onChange={onChange} />);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]);

    expect(onChange).toHaveBeenCalledWith(['low', 'high']);
  });
});

describe('CriteriaPanel instructions and mode', () => {
  it('shows the current instructions in an editable box', () => {
    render(<StatefulPanel />);
    expect(screen.getByLabelText('Instructions')).toHaveValue('How urgent is this task?');
  });

  it('reports edited instructions, keeping the mode', async () => {
    const user = userEvent.setup();
    const onQuestionChange = vi.fn();
    render(<StatefulPanel onQuestionChange={onQuestionChange} />);

    await user.clear(screen.getByLabelText('Instructions'));
    await user.type(screen.getByLabelText('Instructions'), 'Is it due today?');

    expect(onQuestionChange).toHaveBeenLastCalledWith({ instructions: 'Is it due today?', mode: 'levels' });
  });

  it('switches to yes/no mode, hiding the levels list without changing it', async () => {
    const user = userEvent.setup();
    const onQuestionChange = vi.fn();
    const onChange = vi.fn();
    render(<StatefulPanel onQuestionChange={onQuestionChange} onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /yes\/no/i }));

    expect(onQuestionChange).toHaveBeenLastCalledWith({ instructions: 'How urgent is this task?', mode: 'yesno' });
    expect(screen.queryByLabelText('Criteria level 1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add level' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switching back to levels shows the preserved list again', async () => {
    const user = userEvent.setup();
    render(<StatefulPanel initialQuestion={{ instructions: 'Due today?', mode: 'yesno' }} />);

    expect(screen.getByRole('radio', { name: /yes\/no/i })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /levels/i }));

    expect(screen.getByLabelText('Criteria level 1')).toHaveValue('low');
  });
});
