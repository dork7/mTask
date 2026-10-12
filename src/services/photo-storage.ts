import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs';
import type { RequestHandler } from 'express';
import multer from 'multer';

/*
 * The rules of a stored photo: the form field it arrives in, how large it may be,
 * which types it may declare, what its file is called and where it goes.
 *
 * The type is the one the upload declares. The bytes are never inspected.
 */

/** The name of the form field a photo is posted in. */
export const PHOTO_FIELD = 'photo';

/** The largest photo that is stored, in bytes: 10 MB. A file of exactly this size is accepted. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** The URL path stored photos are served under. `image_path` of a source starts with it. */
export const UPLOADS_URL_PATH = '/uploads';

/**
 * The declared types a photo may have, each with the extension its file gets. A `Map`,
 * because a plain object would also answer for `constructor` and `toString`.
 */
const PHOTO_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

/** An upload declared a type that is not one of the four photo types. */
export class PhotoTypeError extends Error {
  constructor(mimetype: string) {
    super(`"${mimetype}" is not a photo type`);
    this.name = 'PhotoTypeError';
  }
}

/** The extension of a stored photo of this declared type, or `undefined` when it is no photo type. */
export function photoExtension(mimetype: string): string | undefined {
  return PHOTO_EXTENSIONS.get(mimetype);
}

/** The URL path a stored photo is served at. */
export function photoUrl(filename: string): string {
  return `${UPLOADS_URL_PATH}/${filename}`;
}

/**
 * The middleware that stores the one photo of a request in `uploadsDir` and sets
 * `req.file`. It refuses a type that is no photo type with a `PhotoTypeError` before
 * anything is written, and a file over `MAX_PHOTO_BYTES` with multer's
 * `LIMIT_FILE_SIZE`, leaving no partial file.
 *
 * The folder is created when a photo is stored, so it also comes back when someone
 * removed it while the server runs. The file name is made here; nothing of the client's
 * file name is used.
 */
export function createPhotoUpload(uploadsDir: string): RequestHandler {
  const storage = multer.diskStorage({
    destination(_req, _file, callback) {
      mkdir(uploadsDir, { recursive: true }, (error) => callback(error, uploadsDir));
    },
    filename(_req, file, callback) {
      const extension = photoExtension(file.mimetype);
      // The filter below has already refused such a type. This keeps a file from ever
      // being stored without one of the four extensions.
      if (extension === undefined) {
        callback(new PhotoTypeError(file.mimetype), '');
        return;
      }
      callback(null, randomUUID() + extension);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_PHOTO_BYTES },
    fileFilter(_req, file, callback) {
      if (photoExtension(file.mimetype) === undefined) {
        callback(new PhotoTypeError(file.mimetype));
        return;
      }
      callback(null, true);
    },
  }).single(PHOTO_FIELD);
}

/** Removes a stored photo, then calls `done`, whether or not the file could be removed. */
export function removePhoto(file: string, done: () => void): void {
  rm(file, { force: true }, () => done());
}
