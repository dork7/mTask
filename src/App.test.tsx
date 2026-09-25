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

  it('a priority picked by the user is kept when the model result arrives later', async () => {
    const { computePriority } = await import('./lib/priority');
    let resolve!: (value: Awaited<ReturnType<typeof computePriority>>) => void;
    vi.mocked(computePriority).mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);
    fireEvent.change(screen.getByLabelText('Questions (JSON)'), {
      target: { value: '{"u":{"type":"score","instructions":"How urgent?","criteria":["low","high"]}}' },
    });

    await user.type(screen.getByLabelText('Title'), 'Pay rent');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Priority for Pay rent' }), 'high');
    resolve({ label: 'low', score: 0, confidence: 0.9, answers: [] });

    await screen.findByText('edited by you');
    expect(screen.getByRole('combobox', { name: 'Priority for Pay rent' })).toHaveValue('high');
    expect(JSON.parse(localStorage.getItem('tasks')!)[0].priority).toMatchObject({ label: 'high', manual: true });
  });

  it('changing an answer badge updates and saves the answer', async () => {
    const { computePriority } = await import('./lib/priority');
    vi.mocked(computePriority).mockResolvedValue({
      label: 'high',
      score: 1,
      confidence: 0.8,
      answers: [{ question: 'blocks', answer: 'no' }],
    });
    const user = userEvent.setup();
    const App = (await import('./App')).default;
    render(<App />);
    fireEvent.change(screen.getByLabelText('Questions (JSON)'), {
      target: {
        value:
          '{"u":{"type":"score","instructions":"How urgent?","criteria":["low","high"]},"blocks":{"type":"noul","instructions":"Blocking?"}}',
      },
    });

    await user.type(screen.getByLabelText('Title'), 'Pay rent');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'blocks for Pay rent' }), 'yes');

    expect(screen.getByRole('combobox', { name: 'blocks for Pay rent' })).toHaveValue('yes');
    expect(JSON.parse(localStorage.getItem('tasks')!)[0].priority.answers).toEqual([{ question: 'blocks', answer: 'yes' }]);
  });

  describe('editing a task', () => {
    const stored = (priority: object) => [
      { id: '1', title: 'Pay rent', description: '', createdAt: '2026-09-01T00:00:00Z', done: false, priority },
    ];

    it('saves the new text and classifies it again', async () => {
      localStorage.setItem('tasks', JSON.stringify(stored({ label: 'low', score: 0, confidence: 0.6, status: 'done' })));
      const { computePriority } = await import('./lib/priority');
      vi.mocked(computePriority).mockResolvedValue({ label: 'high', score: 2, confidence: 0.9, answers: [] });
      const user = userEvent.setup();
      const App = (await import('./App')).default;
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.type(screen.getByLabelText('Edit title'), ' today');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.getByText('Pay rent today')).toBeInTheDocument();
      expect(await screen.findByText(/Priority: high/)).toBeInTheDocument();
      expect(computePriority).toHaveBeenCalledWith('Pay rent today', '', expect.anything(), expect.any(Function));
      expect(JSON.parse(localStorage.getItem('tasks')!)[0].title).toBe('Pay rent today');
    });

    it('keeps a priority the user set by hand', async () => {
      localStorage.setItem(
        'tasks',
        JSON.stringify(stored({ label: 'low', score: 0, confidence: 1, status: 'done', manual: true })),
      );
      const { computePriority } = await import('./lib/priority');
      const user = userEvent.setup();
      const App = (await import('./App')).default;
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.type(screen.getByLabelText('Edit title'), ' today');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.getByText('Pay rent today')).toBeInTheDocument();
      expect(screen.getByText('edited by you')).toBeInTheDocument();
      expect(computePriority).not.toHaveBeenCalled();
    });

    it('ignores a result from before the edit that arrives after it', async () => {
      localStorage.setItem('tasks', JSON.stringify(stored({ label: 'low', score: 0, confidence: 0.6, status: 'done' })));
      const { computePriority } = await import('./lib/priority');
      const resolvers: ((v: Awaited<ReturnType<typeof computePriority>>) => void)[] = [];
      vi.mocked(computePriority).mockImplementation(() => new Promise((r) => resolvers.push(r)));
      const user = userEvent.setup();
      const App = (await import('./App')).default;
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.type(screen.getByLabelText('Edit title'), ' today');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.type(screen.getByLabelText('Edit title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      resolvers[1]({ label: 'critical', score: 3, confidence: 0.9, answers: [] });
      expect(await screen.findByText(/Priority: critical/)).toBeInTheDocument();
      resolvers[0]({ label: 'low', score: 0, confidence: 0.9, answers: [] });
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.getByRole('combobox', { name: 'Priority for Pay rent today!' })).toHaveValue('critical');
    });
  });

  describe('filter and sort', () => {
    const tasks = [
      { id: '1', title: 'Buy milk', description: '', createdAt: '2026-09-01T00:00:00Z', done: false, priority: { label: 'critical', score: 3, confidence: 0.9, status: 'done' } },
      { id: '2', title: 'Fix login bug', description: '', createdAt: '2026-09-02T00:00:00Z', done: true, priority: { label: 'low', score: 0, confidence: 0.9, status: 'done' } },
    ];
    const titles = () => screen.getAllByRole('listitem').map((li) => li.querySelector('.task-title')?.textContent);

    it('searches, filters and sorts the list', async () => {
      localStorage.setItem('tasks', JSON.stringify(tasks));
      const user = userEvent.setup();
      const App = (await import('./App')).default;
      render(<App />);

      expect(titles()).toEqual(['Fix login bug', 'Buy milk']);
      await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'priority');
      expect(titles()).toEqual(['Buy milk', 'Fix login bug']);

      await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'done');
      expect(titles()).toEqual(['Fix login bug']);

      await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'all');
      await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'nothing like this');
      expect(screen.getByText('No tasks match these filters.')).toBeInTheDocument();
    });
  });

  describe('backup', () => {
    it('exports tasks and questions as a JSON file', async () => {
      localStorage.setItem(
        'tasks',
        JSON.stringify([{ id: '1', title: 'Buy milk', description: '', createdAt: '2026-09-01T00:00:00Z', done: false }]),
      );
      const blobs: Blob[] = [];
      vi.stubGlobal('URL', { ...URL, createObjectURL: (b: Blob) => (blobs.push(b), 'blob:x'), revokeObjectURL: vi.fn() });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const user = userEvent.setup();
      const App = (await import('./App')).default;
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Export' }));

      expect(click).toHaveBeenCalled();
      const backup = JSON.parse(await blobs[0].text());
      expect(backup.tasks.map((t: { title: string }) => t.title)).toEqual(['Buy milk']);
      expect(typeof backup.questions).toBe('string');
      expect(screen.getByText('Exported 1 task.')).toBeInTheDocument();
      click.mockRestore();
    });

    it('imports tasks and questions from a file', async () => {
      const user = userEvent.setup();
      const App = (await import('./App')).default;
      render(<App />);
      const questions = '{"u":{"type":"score","instructions":"How urgent?","criteria":["low","high"]}}';
      const file = new File(
        [
          JSON.stringify({
            tasks: [
              { id: '9', title: 'Imported task', description: '', createdAt: '2026-09-01T00:00:00Z', done: false, priority: { label: 'high', score: 1, confidence: 0.8, status: 'done' } },
            ],
            questions,
          }),
        ],
        'backup.json',
        { type: 'application/json' },
      );

      await user.upload(screen.getByLabelText('Import backup file'), file);

      expect(await screen.findByText('Imported 1 task and your questions.')).toBeInTheDocument();
      expect(screen.getByText('Imported task')).toBeInTheDocument();
      expect(screen.getByLabelText('Questions (JSON)')).toHaveValue(questions);
    });

    it('reports a file it cannot read', async () => {
      const user = userEvent.setup();
      const App = (await import('./App')).default;
      render(<App />);

      await user.upload(screen.getByLabelText('Import backup file'), new File(['nope'], 'x.json', { type: 'application/json' }));

      expect(await screen.findByText("Couldn't import: the file is not valid JSON.")).toBeInTheDocument();
      expect(screen.getByText('No tasks yet.')).toBeInTheDocument();
    });
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

    it('keeps priorities the user set by hand', async () => {
      localStorage.setItem(
        'tasks',
        JSON.stringify([
          task('1', 'First'),
          { ...task('2', 'Second'), priority: { label: 'high', score: 1, confidence: 1, status: 'done', manual: true } },
        ]),
      );
      const { computePriority } = await import('./lib/priority');
      vi.mocked(computePriority).mockResolvedValue({ label: 'low', score: 0, confidence: 0.9, answers: [] });
      const user = userEvent.setup();
      const App = (await import('./App')).default;
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Re-evaluate all' }));

      await screen.findByRole('button', { name: 'Re-evaluate all' });
      expect(computePriority).toHaveBeenCalledTimes(1);
      expect(computePriority).toHaveBeenCalledWith('First', '', expect.anything(), expect.any(Function));
      expect(screen.getByText('edited by you')).toBeInTheDocument();
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
