import { useEffect, useRef, useState } from 'react';
import { createTask, loadTasks, saveTasks } from './storage/taskStore';
import { loadCriteria, saveCriteria } from './storage/criteriaStore';
import { DEFAULT_QUESTION, loadQuestion, saveQuestion } from './storage/questionStore';
import type { PriorityQuestion, Task } from './storage/types';
import { computePriority, type PriorityRequest } from './lib/priority';
import type { ProgressInfo } from './lib/laya-browser/modelBundle';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { CriteriaPanel } from './components/CriteriaPanel';
import { DownloadProgress } from './components/DownloadProgress';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [criteria, setCriteria] = useState<string[]>([]);
  const [question, setQuestion] = useState<PriorityQuestion>(DEFAULT_QUESTION);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  // The ~1.7GB model can only be kept in Cache Storage (missing in old browsers / some private modes).
  const [canClassify] = useState(() => typeof caches !== 'undefined');

  const resumed = useRef(false);

  useEffect(() => {
    const stored = loadTasks();
    const levels = loadCriteria();
    const storedQuestion = loadQuestion();
    setTasks(stored);
    setCriteria(levels);
    setQuestion(storedQuestion);
    setLoaded(true);
    // A task still 'pending' was interrupted (page closed or reloaded mid-classification);
    // restart it. The ref keeps StrictMode's double effect run from classifying twice.
    if (canClassify && !resumed.current) {
      resumed.current = true;
      stored
        .filter((t) => t.priority?.status === 'pending')
        .forEach((t) => void runClassification(t, { ...storedQuestion, criteria: levels }));
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

  const runClassification = async (task: Task, request: PriorityRequest) => {
    try {
      const result = await computePriority(task.title, task.description, request, setProgress);
      patchPriority(task.id, { ...result, status: 'done' });
    } catch {
      patchPriority(task.id, { label: '', score: 0, confidence: 0, status: 'error' });
    } finally {
      setProgress(null);
    }
  };

  const handleAdd = (title: string, description: string) => {
    const task = createTask(title, description);
    if (!canClassify) {
      updateTasksState((prev) => [...prev, { ...task, priority: undefined }]);
      return;
    }
    updateTasksState((prev) => [...prev, task]);
    void runClassification(task, { ...question, criteria });
  };

  const handleToggleDone = (id: string) => {
    updateTasksState((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const handleDelete = (id: string) => {
    updateTasksState((prev) => prev.filter((t) => t.id !== id));
  };

  const handleRetry = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    patchPriority(id, { label: '', score: 0, confidence: 0, status: 'pending' });
    void runClassification(task, { ...question, criteria });
  };

  const handleCriteriaChange = (next: string[]) => {
    setCriteria(next);
    saveCriteria(next);
  };

  const handleQuestionChange = (next: PriorityQuestion) => {
    setQuestion(next);
    saveQuestion(next);
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
      <TaskList tasks={tasks} onToggleDone={handleToggleDone} onDelete={handleDelete} onRetry={handleRetry} />
      <CriteriaPanel
        criteria={criteria}
        question={question}
        onChange={handleCriteriaChange}
        onQuestionChange={handleQuestionChange}
      />
    </main>
  );
}

export default App;
