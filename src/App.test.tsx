import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    let resolve!: (value: { label: string; score: number; confidence: number }) => void;
    vi.mocked(computePriority).mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    await user.type(screen.getByLabelText('Title'), 'Fix login bug');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(screen.getByText('Classifying…')).toBeInTheDocument();
    resolve({ label: 'high', score: 2.6, confidence: 0.9 });
    expect(await screen.findByText(/Priority: high/)).toBeInTheDocument();
  });

  it('adding a task shows a retry button when computePriority rejects, and retry re-runs it', async () => {
    const { computePriority } = await import('./lib/priority');
    vi.mocked(computePriority)
      .mockRejectedValueOnce(new Error('model unavailable'))
      .mockResolvedValueOnce({ label: 'low', score: 0.2, confidence: 0.6 });
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
    vi.mocked(computePriority).mockResolvedValue({ label: 'low', score: 0, confidence: 0.5 });
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

  it('editing criteria does not change an already-classified task\'s displayed label', async () => {
    const { computePriority } = await import('./lib/priority');
    vi.mocked(computePriority).mockResolvedValue({ label: 'high', score: 2, confidence: 0.9 });
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);

    await user.type(screen.getByLabelText('Title'), 'Fix login bug');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await screen.findByText(/Priority: high/);

    await user.clear(screen.getByLabelText('Criteria level 3'));
    await user.type(screen.getByLabelText('Criteria level 3'), 'urgent');

    expect(screen.getByText(/Priority: high/)).toBeInTheDocument();
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
    vi.mocked(computePriority).mockResolvedValue({ label: 'urgent', score: 2, confidence: 0.7 });
    const App = (await import('./App')).default;
    render(<App />);

    expect(await screen.findByText(/Priority: urgent/)).toBeInTheDocument();
    expect(computePriority).toHaveBeenCalledTimes(1);
    expect(computePriority).toHaveBeenCalledWith(
      'Interrupted task',
      'page was closed mid-download',
      expect.any(Array),
      expect.any(Function),
    );
  });
});
