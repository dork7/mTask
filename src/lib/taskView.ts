import type { Task } from '../storage/types';

export type StatusFilter = 'all' | 'open' | 'done';
export type SortOrder = 'newest' | 'oldest' | 'priority';

/** Value of the priority filter that matches tasks without a priority yet. */
export const UNSCORED = '__unscored';

export interface TaskView {
  search: string;
  /** '' for any priority, UNSCORED, or a priority label. */
  priority: string;
  status: StatusFilter;
  sort: SortOrder;
}

export const DEFAULT_VIEW: TaskView = { search: '', priority: '', status: 'all', sort: 'newest' };

function labelOf(task: Task): string {
  return task.priority?.status === 'done' ? task.priority.label : '';
}

/**
 * The tasks to show, filtered and in display order. `priorityOptions` is the headline question's
 * criteria, least to most urgent; labels it doesn't list rank below it, unscored tasks last.
 */
export function applyView(tasks: Task[], view: TaskView, priorityOptions: string[]): Task[] {
  const needle = view.search.trim().toLowerCase();
  const rank = (task: Task) => {
    const label = labelOf(task);
    return label ? priorityOptions.indexOf(label) : -2;
  };
  const newestFirst = (a: Task, b: Task) => b.createdAt.localeCompare(a.createdAt);

  return tasks
    .filter((t) => !needle || `${t.title}\n${t.description}`.toLowerCase().includes(needle))
    .filter((t) => view.status === 'all' || t.done === (view.status === 'done'))
    .filter((t) => !view.priority || (view.priority === UNSCORED ? !labelOf(t) : labelOf(t) === view.priority))
    .sort((a, b) => {
      if (view.sort === 'oldest') return -newestFirst(a, b);
      if (view.sort === 'priority') return rank(b) - rank(a) || newestFirst(a, b);
      return newestFirst(a, b);
    });
}
