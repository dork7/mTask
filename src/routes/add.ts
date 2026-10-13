import express, { Router, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import type { AppDeps } from '../app.ts';
import { createSource, type Source, type SourceKind } from '../db/sources.ts';
import { renderPage } from '../render.ts';
import { analyzeSource, postedValue, type AnalysisOutcome } from '../services/drafts.ts';
import { PhotoTypeError, createPhotoUpload, photoUrl, removePhoto } from '../services/photo-storage.ts';

const NOT_A_PHOTO = 'That file is not a photo. Choose a JPEG, PNG, WebP or GIF image.';
const TOO_LARGE = 'That photo is larger than 10 MB. Choose a smaller one.';
const NO_PHOTO = 'Choose a photo first.';
const NO_TASKS = 'No tasks were found in that photo.';
const NOT_ANALYZED = 'The photo could not be analyzed.';

/** The most characters a posted text may have, and the `maxlength` of the two text boxes. */
const MAX_TEXT_LENGTH = 5000;

const NO_TEXT = 'Describe what you need to do first.';
const TEXT_TOO_LONG = `That text is longer than ${MAX_TEXT_LENGTH} characters. Shorten it.`;
const NO_TASKS_IN_TEXT = 'No tasks were found in that text.';
const TEXT_NOT_ANALYZED = 'The text could not be analyzed.';

/** A tab of the Add page. Each is named after the kind of source it makes. */
type AddTab = SourceKind;

const TABS: readonly { id: AddTab; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'voice', label: 'Voice' },
  { id: 'text', label: 'Type' },
];

/** The tab an address names: one of the three ids, written exactly so. Anything else is Photo. */
function readTab(raw: unknown): AddTab {
  return TABS.find((tab) => tab.id === raw)?.id ?? 'photo';
}

/**
 * The text a posted form carries: the one field `text` with its line breaks as `\n` and
 * its ends trimmed. `undefined` when the field is missing, posted more than once, or blank.
 */
function readText(body: unknown): string | undefined {
  const posted = postedValue(body, 'text');
  if (typeof posted !== 'string') return undefined;

  const text = posted.replace(/\r\n/g, '\n').trim();
  return text === '' ? undefined : text;
}

/** What `pages/add.ejs` reads. Every field is always present. */
interface AddPage {
  /** The selected tab. Its panel is the one that is not hidden. */
  tab: AddTab;
  /** The three tabs in order, each with its address and whether it is the selected one. */
  tabs: { id: AddTab; label: string; href: string; selected: boolean }[];
  /** Why the last post was refused or failed, or `null`. */
  error: string | null;
  /** What the last post found when that is not an error, or `null`. */
  notice: string | null;
  /** Where the `Try again` form posts to analyze a stored source again, or `null`. */
  retryAction: string | null;
  /** What the textarea of the selected tab holds. The other textarea is empty. */
  text: string;
  /** The `maxlength` of both textareas. */
  maxTextLength: number;
}

/** What an answer adds to the page. Anything left out is not shown. */
interface AddAnswer {
  error?: string;
  notice?: string;
  retryAction?: string;
  text?: string;
}

/**
 * Renders the Add page with this status and this tab selected. Every answer of this
 * router goes through here.
 */
function renderAdd(res: Response, status: number, tab: AddTab, answer: AddAnswer = {}): void {
  const addPage: AddPage = {
    tab,
    tabs: TABS.map(({ id, label }) => ({ id, label, href: `/add?tab=${id}`, selected: id === tab })),
    error: answer.error ?? null,
    notice: answer.notice ?? null,
    retryAction: answer.retryAction ?? null,
    text: answer.text ?? '',
    maxTextLength: MAX_TEXT_LENGTH,
  };

  res.status(status);
  renderPage(res, 'add', { title: 'Add task', nav: 'add', addPage });
}

/** The address of the review page of a source. */
export function reviewPath(sourceId: number): string {
  return `/review/${sourceId}`;
}

/**
 * Answers a request whose source has been analyzed: with the review page of its drafts,
 * or with the Add page saying that nothing was found, or that the analysis failed and
 * can be tried again. The tab, the words and the text of the text box are those of the
 * kind of the source. The upload, the two text posts and the retry all answer through
 * here.
 */
export function answerAnalysis(res: Response, source: Source, outcome: AnalysisOutcome): void {
  if (outcome === 'drafts') {
    res.redirect(303, reviewPath(source.id));
    return;
  }

  const isPhoto = source.kind === 'photo';
  const text = source.transcript ?? '';
  if (outcome === 'none') {
    renderAdd(res, 200, source.kind, { notice: isPhoto ? NO_TASKS : NO_TASKS_IN_TEXT, text });
    return;
  }
  renderAdd(res, 502, source.kind, {
    error: isPhoto ? NOT_ANALYZED : TEXT_NOT_ANALYZED,
    retryAction: `${reviewPath(source.id)}/analyze`,
    text,
  });
}

/**
 * The Add screen with its three tabs, Photo, Voice and Type, the upload of the Photo tab
 * and the text posts of the other two. Each is analyzed before it is answered.
 */
export function createAddRouter(deps: AppDeps): Router {
  const router = Router();
  const upload = createPhotoUpload(deps.uploadsDir);
  // The two text forms post one flat field, so the simple parser is enough.
  const form = express.urlencoded({ extended: false });

  /**
   * Stores the posted text as a source of this kind and answers with its analysis.
   * Express hands a rejection to its error handler.
   */
  function postText(kind: 'voice' | 'text'): RequestHandler {
    return async (req, res) => {
      const text = readText(req.body);
      if (text === undefined) {
        renderAdd(res, 400, kind, { error: NO_TEXT });
        return;
      }
      if (text.length > MAX_TEXT_LENGTH) {
        renderAdd(res, 413, kind, { error: TEXT_TOO_LONG, text });
        return;
      }

      const source = createSource(deps.db, { kind, transcript: text });
      answerAnalysis(res, source, await analyzeSource(deps, source));
    };
  }

  router.get('/add', (req, res) => {
    renderAdd(res, 200, readTab(req.query.tab));
  });

  // The upload middleware is called here, not mounted, so that every outcome it
  // reports is answered with the Add page.
  router.post('/add/photo', (req, res, next) => {
    upload(req, res, (error: unknown) => {
      if (error instanceof PhotoTypeError) {
        renderAdd(res, 415, 'photo', { error: NOT_A_PHOTO });
        return;
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        renderAdd(res, 413, 'photo', { error: TOO_LARGE });
        return;
      }
      // A file under another field name, or a second file: there is no one photo.
      if (error instanceof multer.MulterError && error.code === 'LIMIT_UNEXPECTED_FILE') {
        renderAdd(res, 400, 'photo', { error: NO_PHOTO });
        return;
      }
      if (error) {
        next(error);
        return;
      }

      const file = req.file;
      if (file === undefined) {
        renderAdd(res, 400, 'photo', { error: NO_PHOTO });
        return;
      }

      let source: Source;
      try {
        source = createSource(deps.db, { kind: 'photo', image_path: photoUrl(file.filename) });
      } catch (failure) {
        // A stored file with no source would never be found again.
        removePhoto(file.path, () => next(failure));
        return;
      }
      // The request is answered when the analysis is done. `catch` also takes an error
      // thrown while answering.
      analyzeSource(deps, source)
        .then((outcome) => answerAnalysis(res, source, outcome))
        .catch(next);
    });
  });

  router.post('/add/voice', form, postText('voice'));
  router.post('/add/text', form, postText('text'));

  return router;
}
