import express, { Router, type Response } from 'express';
import type { AppDeps } from '../app.ts';
import type { Database } from '../db/database.ts';
import { getSource, listSourceTasks, type Source } from '../db/sources.ts';
import type { Task } from '../db/tasks.ts';
import { dayTimeLabel } from '../dubai.ts';
import { renderPage } from '../render.ts';
import {
  LOW_CONFIDENCE,
  analyzeSource,
  confirmDrafts,
  discardDrafts,
  draftField,
  hasProblems,
  listDrafts,
  postedValue,
  readDraftEdits,
  removeDraft,
  type DraftFieldName,
  type DraftProblems,
} from '../services/drafts.ts';
import { placeTasks } from '../services/scheduler.ts';
import { priorities, slots, type Priority, type Slot } from '../ui.ts';
import { answerAnalysis, reviewPath } from './add.ts';

const NO_TITLE = 'Give every task a title.';
const BAD_MINUTES = 'Set every duration to a whole number of minutes from 1 to 1440.';
const BAD_CHOICE = 'Choose every priority and every slot from the ones offered.';

/** What a card shows for a draft the scheduler cannot place. */
const NOT_SCHEDULED = 'Not scheduled';

/** An id as the app writes it into an address: digits, no sign, no leading zero, a safe integer. */
const ID_SHAPE = /^[1-9]\d{0,14}$/;

/** The id a path segment holds, or `undefined` when it is not written as an id. */
function readId(raw: unknown): number | undefined {
  return typeof raw === 'string' && ID_SHAPE.test(raw) ? Number(raw) : undefined;
}

/** The source a path segment names, or `undefined` when it names none. */
function findSource(db: Database, raw: unknown): Source | undefined {
  const id = readId(raw);
  return id === undefined ? undefined : getSource(db, id);
}

/** One draft as `pages/review.ejs` shows it: the values of its controls and the names they post under. */
interface DraftCard {
  id: number;
  title: string;
  /** As text, so a refused value is shown as it was posted. */
  minutes: string;
  /** `null` when the draft has none: no radio is checked then. */
  priority: Priority | null;
  /** The empty string is `No slot`. */
  slot: Slot | '';
  lowConfidence: boolean;
  /** Where the stored draft would land if it were confirmed now: `Today 8:00 PM`, or `Not scheduled`. */
  land: string;
  fields: Record<DraftFieldName, string>;
  removeAction: string;
}

/**
 * The card of a draft. A value that was posted is shown in place of the stored one: a
 * title or minutes exactly as posted, a priority or a slot only when the page has a
 * control for it. `body` is the posted form, or `undefined` on a plain request. `land` is
 * the text of its landing preview.
 */
function cardOf(sourceId: number, draft: Task, body: unknown, land: string): DraftCard {
  const fields = {
    title: draftField('title', draft.id),
    minutes: draftField('minutes', draft.id),
    priority: draftField('priority', draft.id),
    slot: draftField('slot', draft.id),
  };
  const postedPriority = postedValue(body, fields.priority);
  const postedSlot = postedValue(body, fields.slot);
  const storedSlot = draft.time_slot ?? '';

  return {
    id: draft.id,
    title: postedValue(body, fields.title) ?? draft.title,
    minutes:
      postedValue(body, fields.minutes) ?? (draft.estimated_minutes === null ? '' : String(draft.estimated_minutes)),
    priority: priorities.find((item) => item.id === postedPriority)?.id ?? draft.priority,
    slot: postedSlot === '' ? '' : (slots.find((item) => item.id === postedSlot)?.id ?? storedSlot),
    lowConfidence: draft.confidence !== null && draft.confidence < LOW_CONFIDENCE,
    land,
    fields,
    removeAction: `${reviewPath(sourceId)}/remove/${draft.id}`,
  };
}

/** The messages of a refused confirm, in the order they are shown. */
function messagesOf(problems: DraftProblems): string[] {
  const messages: string[] = [];
  if (problems.title) messages.push(NO_TITLE);
  if (problems.minutes) messages.push(BAD_MINUTES);
  if (problems.choice) messages.push(BAD_CHOICE);
  return messages;
}

/**
 * Renders the review page of a source with this status: its drafts as cards, or how many
 * of its tasks are saved, or that there is nothing to review. `now` is the time of the
 * request: each card says where its stored draft would land if the drafts were confirmed
 * at it. `body` is a posted form whose values the cards show; `errors` are the messages of
 * a refused confirm.
 */
function renderReview(
  res: Response,
  db: Database,
  source: Source,
  now: Date,
  status = 200,
  body: unknown = undefined,
  errors: string[] = [],
): void {
  const drafts = listDrafts(db, source.id);
  // The preview is of the drafts as they are stored, all placed in one call. Nothing is written.
  const starts = new Map(placeTasks(db, drafts, now).placed.map((placed) => [placed.id, placed.scheduled_start]));
  const cards = drafts.map((draft) => {
    const start = starts.get(draft.id);
    return cardOf(source.id, draft, body, start === undefined ? NOT_SCHEDULED : dayTimeLabel(new Date(start), now));
  });

  res.status(status);
  renderPage(res, 'review', {
    title: 'Review tasks',
    nav: 'add',
    review: {
      source,
      cards,
      savedCount: cards.length > 0 ? 0 : listSourceTasks(db, source.id).length,
      errors,
      confirmAction: `${reviewPath(source.id)}/confirm`,
      discardAction: `${reviewPath(source.id)}/discard`,
    },
  });
}

/**
 * The review of the drafts of one source: the page, and the posts that analyze the source
 * again, confirm the drafts, remove one and discard them all. A `sourceId` that names no
 * source falls through to the app's not-found page.
 */
export function createReviewRouter(deps: AppDeps): Router {
  const router = Router();
  // The review form posts flat fields, so the simple parser is enough.
  const form = express.urlencoded({ extended: false });

  router.get('/review/:sourceId', (req, res, next) => {
    const source = findSource(deps.db, req.params.sourceId);
    if (source === undefined) {
      next();
      return;
    }
    renderReview(res, deps.db, source, new Date());
  });

  // Only a source that has no task yet is analyzed. Express hands a rejection to its
  // error handler.
  router.post('/review/:sourceId/analyze', async (req, res, next) => {
    const source = findSource(deps.db, req.params.sourceId);
    if (source === undefined) {
      next();
      return;
    }
    if (listSourceTasks(deps.db, source.id).length > 0) {
      res.redirect(303, reviewPath(source.id));
      return;
    }
    answerAnalysis(res, source, await analyzeSource(deps, source));
  });

  router.post('/review/:sourceId/confirm', form, (req, res, next) => {
    const source = findSource(deps.db, req.params.sourceId);
    if (source === undefined) {
      next();
      return;
    }
    // Read once: the preview of a refused confirm and the times of an accepted one are of this instant.
    const now = new Date();

    const drafts = listDrafts(deps.db, source.id);
    const edits = readDraftEdits(req.body, drafts);
    if (hasProblems(edits.problems)) {
      renderReview(res, deps.db, source, now, 400, req.body, messagesOf(edits.problems));
      return;
    }
    confirmDrafts(deps.db, drafts, edits, now);
    res.redirect(303, reviewPath(source.id));
  });

  // The Remove button of a card posts the whole form, so the edits of the other cards
  // are stored with it. The removed card's own fields are never read.
  router.post('/review/:sourceId/remove/:taskId', form, (req, res, next) => {
    const source = findSource(deps.db, req.params.sourceId);
    if (source === undefined) {
      next();
      return;
    }

    const drafts = listDrafts(deps.db, source.id);
    const taskId = readId(req.params.taskId);
    const removed = drafts.find((draft) => draft.id === taskId);
    if (removed === undefined) {
      next();
      return;
    }

    const others = drafts.filter((draft) => draft !== removed);
    removeDraft(deps.db, removed, others, readDraftEdits(req.body, others));
    res.redirect(303, reviewPath(source.id));
  });

  router.post('/review/:sourceId/discard', (req, res, next) => {
    const source = findSource(deps.db, req.params.sourceId);
    if (source === undefined) {
      next();
      return;
    }
    discardDrafts(deps.db, source.id);
    res.redirect(303, '/add');
  });

  return router;
}
