import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./lib/priority', () => ({
  computePriority: vi.fn(),
}));

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    // jsdom has no Cache Storage; classification is only enabled when it exists.
    vi.stubGlobal('caches', {});
  });

  it('renders the app heading and an empty task list', async () => {
    const App = (await import('./App')).default;
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Task Priority Notes' })).toBeInTheDocument();
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument();
  });

  it('adding a task shows it pending, then classified once computePriority resolves', async () => {
    const { computePriority } = await import('./lib/priority');
    let resolve!: (value: Awaited<ReturnType<typeof computePriority>>) => void;
    vi.mocked(computePriority).mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    await user.type(screen.getByLabelText('Title'), 'Fix login bug');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(screen.getByText('Classifying…')).toBeInTheDocument();
    resolve({ label: 'high', score: 2.6, confidence: 0.9, answers: [] });
    expect(await screen.findByText(/Priority: high/)).toBeInTheDocument();
  });

  it('adding a task shows a retry button when computePriority rejects, and retry re-runs it', async () => {
    const { computePriority } = await import('./lib/priority');
    vi.mocked(computePriority)
      .mockRejectedValueOnce(new Error('model unavailable'))
      .mockResolvedValueOnce({ label: 'low', score: 0.2, confidence: 0.6, answers: [] });
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    await user.type(screen.getByLabelText('Title'), 'Fix login bug');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    await screen.findByRole('button', { name: 'Retry' });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(/Priority: low/)).toBeInTheDocument();
    expect(computePriority).toHaveBeenCalledTimes(2);
  });

  it('toggling done and deleting a task both work', async () => {
    const { computePriority } = await import('./lib/priority');
    vi.mocked(computePriority).mockResolvedValue({ label: 'low', score: 0, confidence: 0.5, answers: [] });
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    await user.type(screen.getByLabelText('Title'), 'Fix login bug');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await screen.findByText(/Priority: low/);

    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument();
  });

  it('disables classification with a banner when Cache Storage is unavailable, leaving tasks usable', async () => {
    vi.stubGlobal('caches', undefined);
    const { computePriority } = await import('./lib/priority');
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    expect(screen.getByRole('alert')).toHaveTextContent(/priority scoring is unavailable/i);

    await user.type(screen.getByLabelText('Title'), 'Fix login bug');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.queryByText('Classifying…')).not.toBeInTheDocument();
    expect(computePriority).not.toHaveBeenCalled();
  });

  it('resumes classifying tasks left pending by a previous page load', async () => {
    localStorage.setItem(
      'tasks',
      JSON.stringify([
        {
          id: 'old',
          title: 'Interrupted task',
          description: 'page was closed mid-download',
          createdAt: '2026-09-23T00:00:00.000Z',
          done: false,
          priority: { label: '', score: 0, confidence: 0, status: 'pending' },
        },
      ]),
    );
    const { computePriority } = await import('./lib/priority');
    vi.mocked(computePriority).mockResolvedValue({ label: 'urgent', score: 2, confidence: 0.7, answers: [] });
    const App = (await import('./App')).default;
    render(<App />);

    expect(await screen.findByText(/Priority: urgent/)).toBeInTheDocument();
    expect(computePriority).toHaveBeenCalledTimes(1);
    expect(computePriority).toHaveBeenCalledWith(
      'Interrupted task',
      'page was closed mid-download',
      expect.objectContaining({ urgency: expect.objectContaining({ type: 'score' }) }),
      expect.any(Function),
    );
  });

  it('classifies with the questions from the field and shows the other answers', async () => {
    const { computePriority } = await import('./lib/priority');
    vi.mocked(computePriority).mockResolvedValue({
      label: 'high',
      score: 2,
      confidence: 0.9,
      answers: [{ question: 'requester', answer: 'manager' }],
    });
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    fireEvent.change(screen.getByLabelText('Questions (JSON)'), {
      target: {
        value: '{"urgency":{"type":"score","instructions":"How urgent?","criteria":["low","high"]}}',
      },
    });
    await user.type(screen.getByLabelText('Title'), 'Pay rent');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(await screen.findByText(/Priority: high/)).toBeInTheDocument();
    expect(screen.getByText('requester: manager')).toBeInTheDocument();
    expect(computePriority).toHaveBeenCalledWith(
      'Pay rent',
      '',
      { urgency: { type: 'score', instructions: 'How urgent?', criteria: ['low', 'high'] } },
      expect.any(Function),
    );
  });

  it('starts with the default questions in the field', async () => {
    const App = (await import('./App')).default;
    render(<App />);
    const value = (screen.getByLabelText('Questions (JSON)') as HTMLTextAreaElement).value;
    expect(Object.keys(JSON.parse(value))).toEqual(['requester', 'deadline', 'blocksOthers', 'urgency']);
  });

  it('remembers the questions across page loads', async () => {
    localStorage.setItem('priorityQuestions', '{"a":{"type":"noul","instructions":"Due today?"}}');
    const App = (await import('./App')).default;
    render(<App />);
    expect(screen.getByLabelText('Questions (JSON)')).toHaveValue('{"a":{"type":"noul","instructions":"Due today?"}}');
  });

  it('saves edits to the field', async () => {
    const App = (await import('./App')).default;
    render(<App />);
    fireEvent.change(screen.getByLabelText('Questions (JSON)'), { target: { value: 'anything' } });
    expect(localStorage.getItem('priorityQuestions')).toBe('anything');
  });

  it('shows the problem and adds tasks unclassified while the questions are invalid', async () => {
    const { computePriority } = await import('./lib/priority');
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    fireEvent.change(screen.getByLabelText('Questions (JSON)'), { target: { value: '{"a": ' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid json/i);

    await user.type(screen.getByLabelText('Title'), 'Pay rent');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(screen.getByText('Pay rent')).toBeInTheDocument();
    expect(screen.queryByText('Classifying…')).not.toBeInTheDocument();
    expect(computePriority).not.toHaveBeenCalled();
  });

  describe('re-evaluate all', () => {
    const task = (id: string, title: string, done = false) => ({
      id,
      title,
      description: '',
      createdAt: '2026-09-23T00:00:00.000Z',
      done,
      priority: { label: 'low', score: 0, confidence: 0.5, status: 'done' },
    });

    it('is hidden when there are no tasks', async () => {
      const App = (await import('./App')).default;
      render(<App />);
      await screen.findByText('No tasks yet.');
      expect(screen.queryByRole('button', { name: /re-evaluate all/i })).not.toBeInTheDocument();
    });

    it('classifies every task again with the current questions, one at a time', async () => {
      localStorage.setItem('tasks', JSON.stringify([task('1', 'First'), task('2', 'Second', true)]));
      const { computePriority } = await import('./lib/priority');
      let running = 0;
      let maxRunning = 0;
      vi.mocked(computePriority).mockImplementation(async () => {
        maxRunning = Math.max(maxRunning, ++running);
        await Promise.resolve();
        running--;
        return { label: 'critical', score: 3, confidence: 0.9, answers: [] };
      });
      const user = userEvent.setup();
      const App = (await import('./App')).default;
      render(<App />);

      fireEvent.change(screen.getByLabelText('Questions (JSON)'), {
        target: { value: '{"u":{"type":"score","instructions":"How urgent?","criteria":["low","critical"]}}' },
      });
      await user.click(screen.getByRole('button', { name: 'Re-evaluate all' }));

      expect(await screen.findAllByText(/Priority: critical/)).toHaveLength(2);
      expect(computePriority).toHaveBeenCalledTimes(2);
      expect(computePriority).toHaveBeenCalledWith('First', '', expect.objectContaining({ u: expect.anything() }), expect.any(Function));
      expect(computePriority).toHaveBeenCalledWith('Second', '', expect.objectContaining({ u: expect.anything() }), expect.any(Function));
      expect(maxRunning).toBe(1);
      expect(screen.getByRole('button', { name: 'Re-evaluate all' })).toBeEnabled();
    });

    it('shows tasks as classifying and disables the button while it runs', async () => {
      localStorage.setItem('tasks', JSON.stringify([task('1', 'First')]));
      const { computePriority } = await import('./lib/priority');
      let resolve!: (value: Awaited<ReturnType<typeof computePriority>>) => void;
      vi.mocked(computePriority).mockReturnValue(new Promise((r) => (resolve = r)));
      const user = userEvent.setup();
      const App = (await import('./App')).default;
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Re-evaluate all' }));

      expect(screen.getByText('Classifying…')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Re-evaluating…' })).toBeDisabled();
      resolve({ label: 'high', score: 2, confidence: 0.9, answers: [] });
      expect(await screen.findByText(/Priority: high/)).toBeInTheDocument();
    });

    it('is disabled while the questions are invalid', async () => {
      localStorage.setItem('tasks', JSON.stringify([task('1', 'First')]));
      const App = (await import('./App')).default;
      render(<App />);

      fireEvent.change(screen.getByLabelText('Questions (JSON)'), { target: { value: '{' } });

      expect(screen.getByRole('button', { name: 'Re-evaluate all' })).toBeDisabled();
    });
  });
});
