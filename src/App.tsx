import { useEffect, useRef, useState } from 'react';
import { createTask, loadTasks, saveTasks } from './storage/taskStore';
import { loadQuestionsText, parseQuestions, saveQuestionsText, type QuestionSet } from './storage/questionsStore';
import type { RecurrenceRule, Task } from './storage/types';
import { computePriority } from './lib/priority';
import type { ProgressInfo } from './lib/laya-browser/modelBundle';
import type { Question } from './lib/laya-browser/types';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { QuestionsField } from './components/QuestionsField';
import { DownloadProgress } from './components/DownloadProgress';
import { PriorityHeatmap } from './components/PriorityHeatmap';
import { TaskToolbar } from './components/TaskToolbar';
import { applyView, DEFAULT_VIEW, type TaskView } from './lib/taskView';
import { backupFileName, makeBackup, mergeTasks, parseBackup } from './storage/backup';

function optionsFor(q: Question): string[] {
  if (q.type === 'noul') return ['yes', 'no'];
  if (q.type === 'score') return q.criteria;
  return Array.isArray(q.criteria) ? q.criteria : Object.keys(q.criteria);
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [questionsText, setQuestionsText] = useState(loadQuestionsText);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);
  const [view, setView] = useState<TaskView>(DEFAULT_VIEW);
  const [backupMessage, setBackupMessage] = useState('');
  const importInput = useRef<HTMLInputElement>(null);
  // Latest classification run per task: an older run finishing late must not overwrite a newer one.
  const runs = useRef(new Map<string, number>());
  // The ~1.7GB model can only be kept in Cache Storage (missing in old browsers / some private modes).
  const [canClassify] = useState(() => typeof caches !== 'undefined');

  // Recomputed each render: the field can be edited into an unusable state at any time.
  const parsed = parseQuestions(questionsText);

  // Levels of the headline (first 'score') question, offered in each task's priority dropdown.
  const priorityOptions = parsed.ok
    ? (Object.values(parsed.questions).find((q) => q.type === 'score')?.criteria as string[] | undefined) ?? []
    : [];

  // What each question can be answered with, for the answer badges' dropdowns.
  const answerOptions: Record<string, string[]> = parsed.ok
    ? Object.fromEntries(Object.entries(parsed.questions).map(([id, q]) => [id, optionsFor(q)]))
    : {};

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

  // A result that arrives after the user picked a priority must not replace their choice.
  const patchAutoPriority = (id: string, priority: Task['priority']) => {
    updateTasksState((prev) => prev.map((t) => (t.id === id && !t.priority?.manual ? { ...t, priority } : t)));
  };

  const runClassification = async (task: Task, questions: QuestionSet) => {
    const run = (runs.current.get(task.id) ?? 0) + 1;
    runs.current.set(task.id, run);
    const isLatest = () => runs.current.get(task.id) === run;
    try {
      const result = await computePriority(task.title, task.description, questions, setProgress);
      if (isLatest()) patchAutoPriority(task.id, { ...result, status: 'done' });
    } catch {
      if (isLatest()) patchAutoPriority(task.id, { label: '', score: 0, confidence: 0, status: 'error' });
    } finally {
      setProgress(null);
    }
  };

  const handleAdd = (title: string, description: string, recurrence?: RecurrenceRule) => {
    const task = createTask(title, description, recurrence);
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
    updateTasksState((t) => t.filter((task) => task.id !== id));
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
    // Priorities the user set by hand are kept.
    const targets = tasks.filter((t) => !t.priority?.manual);
    const ids = new Set(targets.map((t) => t.id));
    setReevaluating(true);
    updateTasksState((prev) =>
      prev.map((t) => (ids.has(t.id) ? { ...t, priority: { label: '', score: 0, confidence: 0, status: 'pending' } } : t)),
    );
    // One at a time: the model session is shared and downloading it is the slow part.
    for (const task of targets) {
      await runClassification(task, questions);
    }
    setReevaluating(false);
  };

  const handleSetPriority = (id: string, label: string) => {
    updateTasksState((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              priority: {
                label,
                score: Math.max(0, priorityOptions.indexOf(label)),
                confidence: 1,
                status: 'done',
                answers: t.priority?.answers,
                manual: true,
              },
            }
          : t,
      ),
    );
  };

  const handleSetAnswer = (id: string, question: string, answer: string) => {
    updateTasksState((prev) =>
      prev.map((t) =>
        t.id === id && t.priority
          ? {
              ...t,
              priority: {
                ...t.priority,
                answers: t.priority.answers?.map((a) => (a.question === question ? { ...a, answer } : a)),
                manual: true,
              },
            }
          : t,
      ),
    );
  };

  const handleEdit = (id: string, title: string, description: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || !title) return;
    const changed = title !== task.title || description !== task.description;
    // New text means a new priority, unless the user picked it by hand.
    const rescore = changed && !task.priority?.manual && canClassify && parsed.ok;
    const pending: Task['priority'] = { label: '', score: 0, confidence: 0, status: 'pending' };
    updateTasksState((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title, description, ...(rescore ? { priority: pending } : {}) } : t)),
    );
    if (rescore) void runClassification({ ...task, title, description }, parsed.questions);
  };

  const handleQuestionsChange = (next: string) => {
    setQuestionsText(next);
    saveQuestionsText(next);
  };

  const handleExport = () => {
    const blob = new Blob([makeBackup(tasks, questionsText)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName();
    link.click();
    URL.revokeObjectURL(url);
    setBackupMessage(`Exported ${tasks.length} task${tasks.length === 1 ? '' : 's'}.`);
  };

  const handleImport = async (file: File) => {
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setBackupMessage(`Couldn't import: ${result.error}.`);
      return;
    }
    let questions = parsed.ok ? parsed.questions : undefined;
    if (result.questions !== undefined) {
      handleQuestionsChange(result.questions);
      const imported = parseQuestions(result.questions);
      questions = imported.ok ? imported.questions : undefined;
    }
    // Tasks exported mid-classification: finish them here, or drop the stuck status.
    const canRun = canClassify && questions !== undefined;
    const pending = result.tasks.filter((t) => t.priority?.status === 'pending');
    const incoming = canRun
      ? result.tasks
      : result.tasks.map((t) => (t.priority?.status === 'pending' ? { ...t, priority: undefined } : t));
    updateTasksState((prev) => mergeTasks(prev, incoming));
    if (canRun) pending.forEach((t) => void runClassification(t, questions!));
    const count = `${result.tasks.length} task${result.tasks.length === 1 ? '' : 's'}`;
    setBackupMessage(`Imported ${count}${result.questions !== undefined ? ' and your questions' : ''}.`);
  };

  const visibleTasks = applyView(tasks, view, priorityOptions);

  if (!loaded) return null;

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <h1 className="nav-brand">Task Priority Notes</h1>
          <div className="nav-links">
            <a href="#add">Add</a>
            <a href="#tasks">Tasks</a>
            <a href="#questions">Questions</a>
            <a href="#backup">Backup</a>
          </div>
        </div>
      </nav>

      <main>
        {!canClassify && (
          <p className="banner" role="alert">
            Priority scoring is unavailable: this browser does not provide Cache Storage (needed to store the
            model). Use a current Chrome, Edge or Firefox over HTTPS or localhost, outside private browsing.
            Tasks still work.
          </p>
        )}
        <DownloadProgress progress={progress} />

        <section className="band" id="add" aria-label="Add a task">
          <h2 className="band-title">Add a task.</h2>
          <TaskForm onAdd={handleAdd} />
        </section>

        <section className="band" id="tasks" aria-label="Tasks">
          <div className="band-head">
            <h2 className="band-title">Your tasks.</h2>
            {tasks.length > 0 && (
              <button
                type="button"
                className="pill pill-quiet"
                onClick={() => void handleReevaluateAll()}
                disabled={!canClassify || !parsed.ok || reevaluating}
              >
                {reevaluating ? 'Re-evaluating…' : 'Re-evaluate all'}
              </button>
            )}
          </div>
          <PriorityHeatmap tasks={tasks} />
          {tasks.length > 0 && <TaskToolbar view={view} onChange={setView} priorityOptions={priorityOptions} />}
          <TaskList
            tasks={visibleTasks}
            emptyText={tasks.length === 0 ? 'No tasks yet.' : 'No tasks match these filters.'}
            priorityOptions={priorityOptions}
            answerOptions={answerOptions}
            onToggleDone={handleToggleDone}
            onDelete={handleDelete}
            onRetry={handleRetry}
            onSetPriority={handleSetPriority}
            onSetAnswer={handleSetAnswer}
            onEdit={handleEdit}
          />
        </section>

        <section className="band" id="questions" aria-label="Questions settings">
          <h2 className="band-title">Questions.</h2>
          <p className="band-sub">Tell the model what to ask about every task.</p>
          <QuestionsField value={questionsText} onChange={handleQuestionsChange} error={parsed.ok ? undefined : parsed.error} />
        </section>

        <section className="band" id="backup" aria-label="Backup">
          <h2 className="band-title">Backup.</h2>
          <p className="band-sub">Save your tasks and questions to a file, or load them on another device.</p>
          <div className="card backup">
            <div className="backup-actions">
              <button type="button" className="pill" onClick={handleExport} disabled={tasks.length === 0}>
                Export
              </button>
              <button type="button" className="pill pill-quiet" onClick={() => importInput.current?.click()}>
                Import
              </button>
              <input
                ref={importInput}
                type="file"
                accept="application/json,.json"
                aria-label="Import backup file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleImport(file);
                }}
              />
            </div>
            <p className="backup-note">Importing adds the file's tasks (replacing any with the same id) and its questions.</p>
            {backupMessage && (
              <p role="status" className="backup-message">
                {backupMessage}
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="footer">Your tasks and their priorities stay in this browser.</footer>
    </>
  );
}

export default App;
