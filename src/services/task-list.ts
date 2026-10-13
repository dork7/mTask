import type { Task } from '../db/tasks.ts';
import { priorities, slots, type Priority, type Slot } from '../ui.ts';

/*
 * The task list: which tasks it shows, in which order, and the query string that says
 * so. The query is read from a request and written back into every link and form of the
 * page, always in one order, so that one list has one address.
 */

/** The orders the list can be sorted in, the default first, with the label the sort control shows. */
export const sortOptions = [
  { id: 'start', label: 'Time' },
  { id: 'priority', label: 'Priority' },
  { id: 'newest', label: 'Newest' },
] as const;

export type SortKey = (typeof sortOptions)[number]['id'];

/** What the query of the list asks for. The lists hold ids of `src/ui.ts`, each once. */
export interface ListQuery {
  priorities: Priority[];
  slots: Slot[];
  sort: SortKey;
}

/** The path of the list. */
export const LIST_PATH = '/tasks';

/** Whether a task is one the list shows and its routes act on: any but a draft. */
export function isListed(task: Task): boolean {
  return task.status !== 'draft';
}

/** The string values a query has for a name: none, one, or each of a repeated name. */
function valuesOf(query: unknown, name: string): string[] {
  if (typeof query !== 'object' || query === null || !Object.hasOwn(query, name)) return [];
  const value: unknown = (query as Record<string, unknown>)[name];
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Reads the query of a request. A value that is not an id is dropped, and so is a
 * repeated one. `sort` is `start` unless it is given once with another key.
 */
export function readListQuery(query: unknown): ListQuery {
  const givenPriorities = valuesOf(query, 'priority');
  const givenSlots = valuesOf(query, 'slot');
  const givenSort = valuesOf(query, 'sort');
  const sort = givenSort.length === 1 ? sortOptions.find((option) => option.id === givenSort[0]) : undefined;
  return {
    priorities: priorities.filter((item) => givenPriorities.includes(item.id)).map((item) => item.id),
    slots: slots.filter((item) => givenSlots.includes(item.id)).map((item) => item.id),
    sort: sort?.id ?? 'start',
  };
}

/**
 * The query as the app writes it, as name and value pairs: the priorities in the order
 * of `src/ui.ts`, then the slots in that order, then `sort` unless it is `start`.
 */
export function queryPairs(list: ListQuery): [name: string, value: string][] {
  const pairs: [string, string][] = [];
  for (const item of priorities) if (list.priorities.includes(item.id)) pairs.push(['priority', item.id]);
  for (const item of slots) if (list.slots.includes(item.id)) pairs.push(['slot', item.id]);
  if (list.sort !== 'start') pairs.push(['sort', list.sort]);
  return pairs;
}

/** The query of `queryPairs` as a query string, without the `?`. The empty string for none. */
export function queryString(list: ListQuery): string {
  return new URLSearchParams(queryPairs(list)).toString();
}

/** A path with the query of the list after it, or the path alone when the query is empty. */
export function withQuery(path: string, list: ListQuery): string {
  const query = queryString(list);
  return query === '' ? path : `${path}?${query}`;
}

/** The query with this priority turned on when it is off, and off when it is on. */
export function togglePriority(list: ListQuery, id: Priority): ListQuery {
  const on = list.priorities.includes(id);
  return { ...list, priorities: on ? list.priorities.filter((item) => item !== id) : [...list.priorities, id] };
}

/** The query with this slot turned on when it is off, and off when it is on. */
export function toggleSlot(list: ListQuery, id: Slot): ListQuery {
  const on = list.slots.includes(id);
  return { ...list, slots: on ? list.slots.filter((item) => item !== id) : [...list.slots, id] };
}

/** Where a priority comes in the `priority` sort: its place in `src/ui.ts`, and none last. */
function priorityRank(task: Task): number {
  const index = priorities.findIndex((item) => item.id === task.priority);
  return index === -1 ? priorities.length : index;
}

/** The `start` order: by `scheduled_start`, the tasks without one last, then by `id`. */
function byStart(a: Task, b: Task): number {
  if (a.scheduled_start !== b.scheduled_start) {
    if (a.scheduled_start === null) return 1;
    if (b.scheduled_start === null) return -1;
    // Stored timestamps sort as text in time order (`src/db/timestamps.ts`).
    return a.scheduled_start < b.scheduled_start ? -1 : 1;
  }
  return a.id - b.id;
}

const ORDERS: Record<SortKey, (a: Task, b: Task) => number> = {
  start: byStart,
  priority: (a, b) => priorityRank(a) - priorityRank(b) || byStart(a, b),
  newest: (a, b) => (a.created_at === b.created_at ? b.id - a.id : a.created_at < b.created_at ? 1 : -1),
};

/**
 * The tasks the query asks for, in its order. The values of one parameter are OR'd and
 * the two parameters AND'd; a task with no priority or no slot matches no filter on it.
 * The list handed in is not changed.
 */
export function shownTasks(tasks: readonly Task[], list: ListQuery): Task[] {
  return tasks
    .filter(
      (task) =>
        (list.priorities.length === 0 || (task.priority !== null && list.priorities.includes(task.priority))) &&
        (list.slots.length === 0 || (task.time_slot !== null && list.slots.includes(task.time_slot))),
    )
    .sort(ORDERS[list.sort]);
}
