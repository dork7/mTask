import { Router, type Response } from 'express';
import multer from 'multer';
import type { AppDeps } from '../app.ts';
import { createSource, type Source } from '../db/sources.ts';
import { renderPage } from '../render.ts';
import { PhotoTypeError, createPhotoUpload, photoUrl, removePhoto } from '../services/photo-storage.ts';

const NOT_A_PHOTO = 'That file is not a photo. Choose a JPEG, PNG, WebP or GIF image.';
const TOO_LARGE = 'That photo is larger than 10 MB. Choose a smaller one.';
const NO_PHOTO = 'Choose a photo first.';

/** What `pages/add.ejs` reads. Both fields are always present. */
interface AddPage {
  /** Why the last post was refused, or `null`. */
  error: string | null;
  /** The `image_path` of the photo the last post stored, or `null`. */
  savedPhoto: string | null;
}

/** Renders the Add page with this status. Every answer of this router goes through here. */
function renderAdd(res: Response, status: number, addPage: Partial<AddPage> = {}): void {
  res.status(status);
  renderPage(res, 'add', {
    title: 'Add task',
    nav: 'add',
    addPage: { error: addPage.error ?? null, savedPhoto: addPage.savedPhoto ?? null },
  });
}

/** The Add screen and the upload of its Photo tab. */
export function createAddRouter(deps: AppDeps): Router {
  const router = Router();
  const upload = createPhotoUpload(deps.uploadsDir);

  router.get('/add', (_req, res) => {
    renderAdd(res, 200);
  });

  // The upload middleware is called here, not mounted, so that every outcome it
  // reports is answered with the Add page.
  router.post('/add/photo', (req, res, next) => {
    upload(req, res, (error: unknown) => {
      if (error instanceof PhotoTypeError) {
        renderAdd(res, 415, { error: NOT_A_PHOTO });
        return;
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        renderAdd(res, 413, { error: TOO_LARGE });
        return;
      }
      // A file under another field name, or a second file: there is no one photo.
      if (error instanceof multer.MulterError && error.code === 'LIMIT_UNEXPECTED_FILE') {
        renderAdd(res, 400, { error: NO_PHOTO });
        return;
      }
      if (error) {
        next(error);
        return;
      }

      const file = req.file;
      if (file === undefined) {
        renderAdd(res, 400, { error: NO_PHOTO });
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
      renderAdd(res, 201, { savedPhoto: source.image_path });
    });
  });

  return router;
}
