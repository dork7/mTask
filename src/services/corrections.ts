import type { Database } from '../db/database.ts';
import { listTasks, type Task } from '../db/tasks.ts';
import { taskCategories, type Correction } from './analyzer.ts';

/*
 * The corrections the analyzer is shown: past tasks whose estimate was far off.
 *
 * A task counts when it is done, has a completion time, an estimate and an actual time,
 * has one of the analyzer's categories exactly as stored, and its actual time differs
 * from its estimate by at least half the estimate, over or under. Of those, at most the
 * `CORRECTIONS_PER_CATEGORY` latest completed per category are returned, by category in
 * the analyzer's order and latest first within one. Nothing here asks a model or reads
 * the clock, so the same tasks always give the same list.
 */

/** How many corrections one category gives at most. */
export const CORRECTIONS_PER_CATEGORY = 3;

/** A task that counts, with what it is ordered by. */
interface Candidate {
  id: number;
  completedAt: string;
  correction: Correction;
}

/** The corrections of this database, as the analyzer is handed them. `[]` when no task counts. */
export function readCorrections(db: Database): Correction[] {
  const candidates: Candidate[] = [];
  for (const task of listTasks(db, { status: 'done' })) {
    const candidate = candidateOf(task);
    if (candidate !== undefined) candidates.push(candidate);
  }

  // Latest first. `completed_at` is a fixed-format UTC string, so string order is time order.
  candidates.sort((a, b) =>
    a.completedAt === b.completedAt ? b.id - a.id : a.completedAt < b.completedAt ? 1 : -1,
  );

  return taskCategories.flatMap((category) =>
    candidates
      .filter((candidate) => candidate.correction.category === category)
      .slice(0, CORRECTIONS_PER_CATEGORY)
      .map((candidate) => candidate.correction),
  );
}

/** The candidate a done task gives, or `undefined` when it does not count. */
function candidateOf(task: Task): Candidate | undefined {
  const category = taskCategories.find((id) => id === task.category);
  if (category === undefined) return undefined;

  const { completed_at, estimated_minutes, actual_minutes } = task;
  if (completed_at === null || estimated_minutes === null || actual_minutes === null) return undefined;
  if (!isLargeGap(estimated_minutes, actual_minutes)) return undefined;

  return {
    id: task.id,
    completedAt: completed_at,
    correction: { category, title: task.title, estimated_minutes, actual_minutes },
  };
}

/** Whether the actual time differs from the estimate by at least half the estimate. */
function isLargeGap(estimated: number, actual: number): boolean {
  return Math.abs(actual - estimated) * 2 >= estimated;
}
