import { UNSCORED, type SortOrder, type StatusFilter, type TaskView } from '../lib/taskView';

export interface TaskToolbarProps {
  view: TaskView;
  onChange: (view: TaskView) => void;
  priorityOptions: string[];
}

export function TaskToolbar({ view, onChange, priorityOptions }: TaskToolbarProps) {
  const set = (patch: Partial<TaskView>) => onChange({ ...view, ...patch });
  // Offer the current filter even if the questions no longer list it.
  const levels = view.priority && view.priority !== UNSCORED && !priorityOptions.includes(view.priority)
    ? [view.priority, ...priorityOptions]
    : priorityOptions;
  return (
    <div className="toolbar" role="search">
      <input
        type="search"
        className="toolbar-search"
        aria-label="Search tasks"
        placeholder="Search"
        value={view.search}
        onChange={(e) => set({ search: e.target.value })}
      />
      <select aria-label="Filter by priority" value={view.priority} onChange={(e) => set({ priority: e.target.value })}>
        <option value="">Any priority</option>
        {[...levels].reverse().map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
        <option value={UNSCORED}>No priority</option>
      </select>
      <select aria-label="Filter by status" value={view.status} onChange={(e) => set({ status: e.target.value as StatusFilter })}>
        <option value="all">All tasks</option>
        <option value="open">Open</option>
        <option value="done">Done</option>
      </select>
      <select aria-label="Sort by" value={view.sort} onChange={(e) => set({ sort: e.target.value as SortOrder })}>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="priority">Highest priority</option>
      </select>
    </div>
  );
}
