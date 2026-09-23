import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { CriteriaPanel } from './CriteriaPanel';

// CriteriaPanel is controlled: re-render with each change the way App does.
function StatefulPanel({ initial, onChange }: { initial: string[]; onChange: (next: string[]) => void }) {
  const [criteria, setCriteria] = useState(initial);
  return (
    <CriteriaPanel
      criteria={criteria}
      onChange={(next) => {
        setCriteria(next);
        onChange(next);
      }}
    />
  );
}

describe('CriteriaPanel', () => {
  it('renders one input per criteria level', () => {
    render(<CriteriaPanel criteria={['low', 'high']} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Criteria level 1')).toHaveValue('low');
    expect(screen.getByLabelText('Criteria level 2')).toHaveValue('high');
  });

  it('calls onChange with a renamed level', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulPanel initial={['low', 'high']} onChange={onChange} />);

    await user.clear(screen.getByLabelText('Criteria level 1'));
    await user.type(screen.getByLabelText('Criteria level 1'), 'minor');

    expect(onChange).toHaveBeenLastCalledWith(['minor', 'high']);
  });

  it('calls onChange with an appended level when "Add level" is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CriteriaPanel criteria={['low', 'high']} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Add level' }));

    expect(onChange).toHaveBeenCalledWith(['low', 'high', 'level 3']);
  });

  it('disables Remove on every level when only 2 levels remain', () => {
    render(<CriteriaPanel criteria={['low', 'high']} onChange={vi.fn()} />);
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    expect(removeButtons).toHaveLength(2);
    removeButtons.forEach((button) => expect(button).toBeDisabled());
  });

  it('calls onChange without the removed level when more than 2 levels exist', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CriteriaPanel criteria={['low', 'medium', 'high']} onChange={onChange} />);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]);

    expect(onChange).toHaveBeenCalledWith(['low', 'high']);
  });
});
