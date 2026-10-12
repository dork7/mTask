import { describe, expect, it } from 'vitest';
import {
  MAX_PHOTO_BYTES,
  PHOTO_FIELD,
  PhotoTypeError,
  UPLOADS_URL_PATH,
  photoExtension,
  photoUrl,
} from './photo-storage.ts';

describe('photoExtension (AC6, AC7)', () => {
  it.each([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif'],
  ])('gives %s the extension %s', (mimetype, extension) => {
    expect(photoExtension(mimetype)).toBe(extension);
  });

  it.each(['image/svg+xml', 'image/heic', 'application/pdf', 'IMAGE/PNG', '', 'constructor', 'toString'])(
    'gives "%s" no extension',
    (mimetype) => {
      expect(photoExtension(mimetype)).toBeUndefined();
    },
  );
});

describe('the constants of a stored photo (AC2, AC6, AC8)', () => {
  it('names the form field photo', () => {
    expect(PHOTO_FIELD).toBe('photo');
  });

  it('limits a photo to 10 MB', () => {
    expect(MAX_PHOTO_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_PHOTO_BYTES).toBe(10485760);
  });

  it('builds the URL path of a stored photo under /uploads', () => {
    expect(UPLOADS_URL_PATH).toBe('/uploads');
    expect(photoUrl('a.png')).toBe('/uploads/a.png');
  });
});

describe('PhotoTypeError', () => {
  it('is an Error named PhotoTypeError that tells the declared type', () => {
    const error = new PhotoTypeError('text/html');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PhotoTypeError');
    expect(error.message).toContain('text/html');
  });
});
