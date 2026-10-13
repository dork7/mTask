import type { Database } from '../db/database.ts';
import { listSourceTasks, type Source } from '../db/sources.ts';
import { createTask, deleteTask, listTasks, updateTask, type Task } from '../db/tasks.ts';
import { inTransaction } from '../db/transaction.ts';
import { priorities, slots, type Priority, type Slot } from '../ui.ts';
import type { Analysis, Analyze, AnalyzerInput } from './analyzer.ts';
import { photoFile } from './photo-storage.ts';
import { applyRules, readSlotRules } from './rules.ts';
import { placeTasks, storeSchedule } from './scheduler.ts';

/*
 * Drafts: the tasks the analyzer read from a source, kept apart until the user has
 * looked at them. A draft is a task with the status `draft`. Here they are made from an
 * analysis, read back from the review form, and confirmed, removed or discarded.
 *
 * Every write of several rows is one transaction, so no part of a list is ever stored.
 */

/** A draft whose confidence is below this is marked on the review page. */
export const LOW_CONFIDENCE = 0.5;

/** The shortest and the longest duration the review form accepts, in minutes. */
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 1440;

/** How an analysis ended: drafts were stored, nothing was found, or it failed. */
export type AnalysisOutcome = 'drafts' | 'none' | 'failed';

/** What the service needs of the app. `AppDeps` fits it as it is. */
export interface DraftDeps {
  db: Database;
  uploadsDir: string;
  analyze: Analyze;
}

/** What the analyzer is handed for a source, or `undefined` when the source has nothing to hand. */
function inputOf(uploadsDir: string, source: Source): AnalyzerInput | undefined {
  if (source.kind === 'photo') {
    return source.image_path === null
      ? undefined
      : { kind: 'image', path: photoFile(uploadsDir, source.image_path) };
  }
  return source.transcript === null ? undefined : { kind: 'text', text: source.transcript };
}

/**
 * Runs the analyzer on a source, on the stored photo of a photo source and on the
 * transcript of a voice or text source, and stores each task it returns as a draft under
 * that source, in the analyzer's order. Each draft gets its priority and its slot from the
 * rules of `rules.ts`, with the `slot_rules` setting as it is when the drafts are stored.
 * Nothing is stored when the analyzer rejects or returns its fallback (`'failed'`), or
 * finds no task (`'none'`). The source and its file are left as they are in every case.
 *
 * A source that already has a task gets no second set: the outcome is still `'drafts'`.
 * A database error is thrown, and no part of the list is stored then.
 */
export async function analyzeSource(deps: DraftDeps, source: Source): Promise<AnalysisOutcome> {
  const input = inputOf(deps.uploadsDir, source);
  if (input === undefined) return 'failed';

  let analysis: Analysis;
  try {
    analysis = await deps.analyze(input);
  } catch (error) {
    // The page says only that it could not be analyzed; the reason goes here.
    console.error(`The analysis of source ${source.id} failed:`, error);
    return 'failed';
  }

  // The fallback task stands for a failed analysis and is never saved.
  if (analysis.fallback) return 'failed';
  if (analysis.tasks.length === 0) return 'none';

  inTransaction(deps.db, () => {
    // Another request analyzed this source while this one waited for the analyzer.
    if (listSourceTasks(deps.db, source.id).length > 0) return;

    // Read once, so every draft of one analysis goes by the same rules.
    const rules = readSlotRules(deps.db);
    for (const task of analysis.tasks) {
      const ruled = applyRules(rules, task.category, task.urgency);
      createTask(deps.db, {
        title: task.title,
        description: task.description,
        category: task.category,
        estimated_minutes: task.estimated_minutes,
        confidence: task.confidence,
        priority: ruled.priority,
        time_slot: ruled.time_slot,
        status: 'draft',
        source_id: source.id,
      });
    }
  });
  return 'drafts';
}

/** The drafts of a source, in `id` order. */
export function listDrafts(db: Database, sourceId: number): Task[] {
  return listTasks(db, { status: 'draft', source_id: sourceId });
}

/** The fields of a draft the review form can change. */
export type DraftFieldName = 'title' | 'minutes' | 'priority' | 'slot';

/** The name of a form field of the review page. The page and the reader both get it here. */
export function draftField(name: DraftFieldName, taskId: number): string {
  return `${name}-${taskId}`;
}

/**
 * The value a posted form has for a field: a string, `undefined` when the field was not
 * posted, `null` when it was posted more than once. `body` is whatever the request
 * carried, which is nothing at all for a post without a form.
 */
export function postedValue(body: unknown, name: string): string | null | undefined {
  if (typeof body !== 'object' || body === null || !Object.hasOwn(body, name)) return undefined;

  const value: unknown = (body as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : null;
}

/** What a posted form changes on one draft. A field that is left out keeps its stored value. */
export interface DraftEdit {
  title?: string;
  estimated_minutes?: number;
  priority?: Priority;
  /** `null` is the form's `No slot`. */
  time_slot?: Slot | null;
}

/** What was wrong in a posted form, by kind: each is true when one field or more had it. */
export interface DraftProblems {
  /** A blank title. */
  title: boolean;
  /** Minutes that are not a whole number from `MIN_MINUTES` to `MAX_MINUTES`. */
  minutes: boolean;
  /** A priority or a slot that is not one of `src/ui.ts`. */
  choice: boolean;
}

export interface DraftEdits {
  /** The valid posted fields of every draft that was handed in; empty when it has none. */
  byTask: Map<number, DraftEdit>;
  problems: DraftProblems;
}

/**
 * Reads the posted fields of these drafts, field by field. A field that was not posted
 * is no edit. A posted field that breaks its rule, or was posted more than once, is a
 * problem and no edit. Only the drafts handed in are looked up, so a field named after
 * any other task is never read.
 */
export function readDraftEdits(body: unknown, drafts: readonly Task[]): DraftEdits {
  const byTask = new Map<number, DraftEdit>();
  const problems: DraftProblems = { title: false, minutes: false, choice: false };

  for (const draft of drafts) {
    const edit: DraftEdit = {};

    const title = postedValue(body, draftField('title', draft.id));
    if (title !== undefined) {
      if (title !== null && title.trim() !== '') edit.title = title.trim();
      else problems.title = true;
    }

    const minutes = postedValue(body, draftField('minutes', draft.id));
    if (minutes !== undefined) {
      const read = minutes === null ? undefined : readMinutes(minutes);
      if (read !== undefined) edit.estimated_minutes = read;
      else problems.minutes = true;
    }

    const priority = postedValue(body, draftField('priority', draft.id));
    if (priority !== undefined) {
      const found = priorities.find((item) => item.id === priority);
      if (found !== undefined) edit.priority = found.id;
      else problems.choice = true;
    }

    const slot = postedValue(body, draftField('slot', draft.id));
    if (slot !== undefined) {
      const found = slots.find((item) => item.id === slot);
      if (slot === '') edit.time_slot = null;
      else if (found !== undefined) edit.time_slot = found.id;
      else problems.choice = true;
    }

    byTask.set(draft.id, edit);
  }

  return { byTask, problems };
}

/** Whether a posted form had anything wrong in it. */
export function hasProblems(problems: DraftProblems): boolean {
  return problems.title || problems.minutes || problems.choice;
}

/**
 * Stores the edits of these drafts, makes each of them a `pending` task and gives it a
 * time, all or none. A draft without an edit is confirmed as stored. The times are those
 * the scheduler finds at `now` for the values that are stored; a task it pushes later
 * for an urgent one gets its new time in the same write. A draft the scheduler cannot
 * place is confirmed with no time.
 */
export function confirmDrafts(db: Database, drafts: readonly Task[], edits: DraftEdits, now: Date): void {
  inTransaction(db, () => {
    const confirmed: Task[] = [];
    for (const draft of drafts) {
      const task = updateTask(db, draft.id, { ...edits.byTask.get(draft.id), status: 'pending' });
      if (task !== undefined) confirmed.push(task);
    }
    storeSchedule(db, placeTasks(db, confirmed, now));
  });
}

/**
 * Deletes one draft and stores the edits of the others, which stay drafts, all or none.
 * A draft among the others with no edit is not written at all.
 */
export function removeDraft(db: Database, removed: Task, others: readonly Task[], edits: DraftEdits): void {
  inTransaction(db, () => {
    deleteTask(db, removed.id);
    for (const other of others) {
      const edit = edits.byTask.get(other.id);
      if (edit !== undefined && Object.keys(edit).length > 0) updateTask(db, other.id, edit);
    }
  });
}

/** Deletes every draft of a source, all or none. Its tasks of any other status stay. */
export function discardDrafts(db: Database, sourceId: number): void {
  inTransaction(db, () => {
    for (const draft of listDrafts(db, sourceId)) deleteTask(db, draft.id);
  });
}

/** The minutes a form field holds: one to four digits, from 1 to 1440. `undefined` for anything else. */
export function readMinutes(value: string): number | undefined {
  const text = value.trim();
  if (!/^\d{1,4}$/.test(text)) return undefined;

  const minutes = Number(text);
  return minutes >= MIN_MINUTES && minutes <= MAX_MINUTES ? minutes : undefined;
}
