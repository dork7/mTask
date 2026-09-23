import { useEffect, useRef, useState } from 'react';
import { createTask, loadTasks, saveTasks } from './storage/taskStore';
import { loadQuestionsText, parseQuestions, saveQuestionsText, type QuestionSet } from './storage/questionsStore';
import type { Task } from './storage/types';
import { computePriority } from './lib/priority';
import type { ProgressInfo } from './lib/laya-browser/modelBundle';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { QuestionsField } from './components/QuestionsField';
import { DownloadProgress } from './components/DownloadProgress';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [questionsText, setQuestionsText] = useState(loadQuestionsText);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);
  // The ~1.7GB model can only be kept in Cache Storage (missing in old browsers / some private modes).
  const [canClassify] = useState(() => typeof caches !== 'undefined');

  // Recomputed each render: the field can be edited into an unusable state at any time.
  const parsed = parseQuestions(questionsText);

  const resumed = useRef(false);

  useEffect(() => {
    const stored = loadTasks();
    setTasks(stored);
    setLoaded(true);
    // A task still 'pending' was interrupted (page closed or reloaded mid-classification);
    // restart it. The ref keeps StrictMode's double effect run from classifying twice.
    if (canClassify && parsed.ok && !resumed.current) {
      resumed.current = true;
      stored.filter((t) => t.priority?.status === 'pending').forEach((t) => void runClassification(t, parsed.questions));
    }
  }, []);

  const updateTasksState = (updater: (prev: Task[]) => Task[]) => {
    setTasks((prev) => {
      const next = updater(prev);
      saveTasks(next);
      return next;
    });
  };

  const patchPriority = (id: string, priority: Task['priority']) => {
    updateTasksState((prev) => prev.map((t) => (t.id === id ? { ...t, priority } : t)));
  };

  const runClassification = async (task: Task, questions: QuestionSet) => {
    try {
      const result = await computePriority(task.title, task.description, questions, setProgress);
      patchPriority(task.id, { ...result, status: 'done' });
    } catch {
      patchPriority(task.id, { label: '', score: 0, confidence: 0, status: 'error' });
    } finally {
      setProgress(null);
    }
  };

  const handleAdd = (title: string, description: string) => {
    const task = createTask(title, description);
    if (!canClassify || !parsed.ok) {
      updateTasksState((prev) => [...prev, { ...task, priority: undefined }]);
      return;
    }
    updateTasksState((prev) => [...prev, task]);
    void runClassification(task, parsed.questions);
  };

  const handleToggleDone = (id: string) => {
    updateTasksState((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const handleDelete = (id: string) => {
    updateTasksState((prev) => prev.filter((t) => t.id !== id));
  };

  const handleRetry = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || !parsed.ok) return;
    patchPriority(id, { label: '', score: 0, confidence: 0, status: 'pending' });
    void runClassification(task, parsed.questions);
  };

  const handleReevaluateAll = async () => {
    if (!parsed.ok || reevaluating) return;
    const questions = parsed.questions;
    const targets = tasks;
    setReevaluating(true);
    updateTasksState((prev) => prev.map((t) => ({ ...t, priority: { label: '', score: 0, confidence: 0, status: 'pending' } })));
    // One at a time: the model session is shared and downloading it is the slow part.
    for (const task of targets) {
      await runClassification(task, questions);
    }
    setReevaluating(false);
  };

  const handleQuestionsChange = (next: string) => {
    setQuestionsText(next);
    saveQuestionsText(next);
  };

  if (!loaded) return null;

  return (
    <main>
      <h1>Task Priority Notes</h1>
      {!canClassify && (
        <p className="banner" role="alert">
          Priority scoring is unavailable: this browser does not provide Cache Storage (needed to store the
          model). Use a current Chrome, Edge or Firefox over HTTPS or localhost, outside private browsing.
          Tasks still work.
        </p>
      )}
      <DownloadProgress progress={progress} />
      <TaskForm onAdd={handleAdd} />
      {tasks.length > 0 && (
        <button
          type="button"
          className="reevaluate"
          onClick={() => void handleReevaluateAll()}
          disabled={!canClassify || !parsed.ok || reevaluating}
        >
          {reevaluating ? 'Re-evaluating…' : 'Re-evaluate all'}
        </button>
      )}
      <TaskList tasks={tasks} onToggleDone={handleToggleDone} onDelete={handleDelete} onRetry={handleRetry} />
      <QuestionsField value={questionsText} onChange={handleQuestionsChange} error={parsed.ok ? undefined : parsed.error} />
    </main>
  );
}

export default App;
