import { useEffect, useState } from 'react';
import { createTask, loadTasks, saveTasks } from './storage/taskStore';
import { loadCriteria, saveCriteria } from './storage/criteriaStore';
import type { Task } from './storage/types';
import { computePriority } from './lib/priority';
import type { ProgressInfo } from './lib/laya-browser/modelBundle';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { CriteriaPanel } from './components/CriteriaPanel';
import { DownloadProgress } from './components/DownloadProgress';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [criteria, setCriteria] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  // The ~1.7GB model can only be kept in Cache Storage (missing in old browsers / some private modes).
  const [canClassify] = useState(() => typeof caches !== 'undefined');

  useEffect(() => {
    setTasks(loadTasks());
    setCriteria(loadCriteria());
    setLoaded(true);
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

  const runClassification = async (task: Task, levels: string[]) => {
    try {
      const result = await computePriority(task.title, task.description, levels, setProgress);
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
    void runClassification(task, criteria);
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
    void runClassification(task, criteria);
  };

  const handleCriteriaChange = (next: string[]) => {
    setCriteria(next);
    saveCriteria(next);
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
      <CriteriaPanel criteria={criteria} onChange={handleCriteriaChange} />
    </main>
  );
}

export default App;
