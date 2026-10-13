import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, oneTaskAnalysis, type TestApp } from './testing/app.ts';
import { all, isShown, one, parseHtml, textOf, type DomDocument } from './testing/dom.ts';

const NOT_A_PHOTO = 'That file is not a photo. Choose a JPEG, PNG, WebP or GIF image.';
const TOO_LARGE = 'That photo is larger than 10 MB. Choose a smaller one.';
const NO_PHOTO = 'Choose a photo first.';

/** The limit of AC8, written out: 10 x 1024 x 1024 bytes. */
const TEN_MB = 10485760;

/** A name the server made: a UUID and one of the four extensions, and nothing else. */
const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

/** A well-formed name that no upload was ever stored under. */
const NEVER_STORED = '/uploads/00000000-0000-4000-8000-000000000000.png';

/** The first eight bytes of every PNG file. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const PHOTO_TYPES = [
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
] as const;

interface Upload {
  bytes?: Buffer;
  filename?: string;
  type?: string;
  field?: string;
}

interface SourceRow {
  id: unknown;
  kind: unknown;
  image_path: unknown;
  transcript: unknown;
}

/** One part of a multipart body written by hand. With `filename` it is a file part. */
interface Part {
  name: string;
  filename?: string;
  type?: string;
  bytes?: Buffer;
}

let testApp: TestApp;
/** The analyzer of the app: a stub that finds one task, so a stored photo ends in a redirect. */
let analyze: ReturnType<typeof vi.fn<Analyze>>;

beforeEach(() => {
  analyze = vi.fn<Analyze>(() => Promise.resolve(oneTaskAnalysis()));
  testApp = createTestApp({ analyze });
});

afterEach(() => {
  testApp.close();
});

/** Posts one file to the upload route, the way the form does. */
function upload({ bytes, filename, type, field }: Upload = {}, app: Express = testApp.app): request.Test {
  return request(app)
    .post('/add/photo')
    .attach(field ?? 'photo', bytes ?? Buffer.from('12345678'), {
      filename: filename ?? 'list.png',
      contentType: type ?? 'image/png',
    });
}

/**
 * Posts a multipart body written out byte for byte. supertest's `attach` reduces a file
 * name to its last segment before it sends it, so a client name that has to arrive
 * unchanged, or a part with an empty file name, is sent through here.
 */
function postParts(parts: Part[]): request.Test {
  const boundary = 'mtask-test-boundary';
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const filename = part.filename === undefined ? '' : `; filename="${part.filename}"`;
    const type = part.type === undefined ? '' : `Content-Type: ${part.type}\r\n`;
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${filename}\r\n${type}\r\n`),
      part.bytes ?? Buffer.alloc(0),
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return request(testApp.app)
    .post('/add/photo')
    .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
    .send(Buffer.concat(chunks));
}

/** The names in the uploads folder, or none when the folder does not exist. */
function storedFiles(dir: string = testApp.uploadsDir): string[] {
  return existsSync(dir) ? readdirSync(dir) : [];
}

/** The one file in the uploads folder. Throws when there is none or several. */
function storedFile(dir: string = testApp.uploadsDir): string {
  const names = storedFiles(dir);
  if (names.length !== 1) throw new Error(`Expected one stored file, found ${names.length}`);
  return names[0];
}

function sources(): SourceRow[] {
  return testApp.db
    .prepare('SELECT id, kind, image_path, transcript FROM sources ORDER BY id')
    .all()
    .map((row) => ({ id: row.id, kind: row.kind, image_path: row.image_path, transcript: row.transcript }));
}

/** Asserts the marks of the Add page in the layout. */
function expectAddPage(document: DomDocument): void {
  expect(all(one(document, 'nav'), 'a')).toHaveLength(5);
  expect(one(document, '[aria-current="page"]').getAttribute('href')).toBe('/add');
  expect(textOf(one(document, 'main h1'))).toBe('Add task');
}

/** Asserts everything AC10 says of a rejection, and that the analyzer was not asked (006 AC2). */
function expectRejected(response: request.Response, status: number, message: string): void {
  expect(response.status).toBe(status);

  const document = parseHtml(response.text);
  expectAddPage(document);
  expect(all(document, '[role="alert"]')).toHaveLength(1);
  expect(textOf(one(document, 'main [role="alert"]'))).toBe(message);
  expect(all(document, '[role="status"]').filter(isShown)).toEqual([]);

  const form = one(document, 'main form');
  expect(form.getAttribute('action')).toBe('/add/photo');
  expect(all(form, 'input[type="file"][name="photo"]')).toHaveLength(1);

  expect(storedFiles()).toEqual([]);
  expect(sources()).toEqual([]);
  expect(analyze).not.toHaveBeenCalled();
}

/**
 * Requests a path exactly as written. supertest resolves `%2e%2e` segments away before
 * it sends the request; this does not.
 */
function getRaw(app: Express, rawPath: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      http
        .get({ host: '127.0.0.1', port, path: rawPath, agent: false }, (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            server.close();
            resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') });
          });
        })
        .on('error', (error) => {
          server.close();
          reject(error);
        });
    });
  });
}

describe('POST /add/photo with a photo (AC4)', () => {
  it.each(PHOTO_TYPES)('stores a file declared as %s and records it as a photo source', async (type, extension) => {
    const bytes = Buffer.from(`the bytes of a ${type} file`);

    const response = await upload({ bytes, type, filename: 'list' });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/review/1');

    const name = storedFile();
    expect(name).toMatch(STORED_NAME);
    expect(path.extname(name)).toBe(extension);
    expect(readFileSync(path.join(testApp.uploadsDir, name)).equals(bytes)).toBe(true);
    expect(sources()).toEqual([{ id: 1, kind: 'photo', image_path: `/uploads/${name}`, transcript: null }]);
  });

  it.each(['IMAGE/PNG', 'image/png; charset=binary'])('reads a declared type of "%s" as image/png', async (type) => {
    const response = await upload({ type, filename: 'list' });

    expect(response.status).toBe(303);
    expect(storedFile()).toMatch(/\.png$/);
  });

  it('answers 500 and keeps no file when the source cannot be written', async () => {
    testApp.db.close();

    const response = await upload();

    expect(response.status).toBe(500);
    expect(existsSync(testApp.uploadsDir)).toBe(true);
    expect(storedFiles()).toEqual([]);
    expect(analyze).not.toHaveBeenCalled();
  });
});

describe('GET on a stored photo (AC5)', () => {
  it.each(PHOTO_TYPES)('serves a stored %s file with its bytes and its type', async (type) => {
    const bytes = Buffer.concat([PNG_SIGNATURE, Buffer.from(`served as ${type}`)]);
    await upload({ bytes, type });
    const imagePath = String(sources()[0].image_path);

    const response = await request(testApp.app).get(imagePath);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe(type);
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(bytes.equals(response.body)).toBe(true);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('answers 404 with the not-found page for a name that was never stored', async () => {
    await upload();

    const response = await request(testApp.app).get(NEVER_STORED);

    expect(response.status).toBe(404);
    expect(textOf(one(parseHtml(response.text), 'main h1'))).toBe('Page not found');
  });

  it('answers 404 and creates no folder in an app that never stored anything', async () => {
    const response = await request(testApp.app).get(NEVER_STORED);

    expect(response.status).toBe(404);
    expect(textOf(one(parseHtml(response.text), 'main h1'))).toBe('Page not found');
    expect(existsSync(testApp.uploadsDir)).toBe(false);
  });

  it.each(['/uploads', '/uploads/'])('does not list the folder at %s', async (address) => {
    await upload();

    const response = await request(testApp.app).get(address);

    expect(response.status).toBe(404);
    expect(textOf(one(parseHtml(response.text), 'main h1'))).toBe('Page not found');
    expect(response.text).not.toContain(storedFile());
  });

  it.each(['/uploads/%2e%2e/secret.txt', '/uploads/..%2fsecret.txt', '/uploads/%2e%2e%2fsecret.txt'])(
    'does not serve the file beside the folder at %s',
    async (address) => {
      const secret = 'the text of the file beside the uploads folder';
      await upload();
      writeFileSync(path.join(testApp.dir, 'secret.txt'), secret);

      // The same way of asking does reach a stored photo.
      const stored = await getRaw(testApp.app, `/uploads/${storedFile()}`);
      expect(stored.status).toBe(200);

      const response = await getRaw(testApp.app, address);

      expect(response.status).toBe(404);
      expect(response.text).not.toContain(secret);
    },
  );
});

describe('the name of a stored photo (AC6)', () => {
  it('stores an upload named ../../evil.png inside the uploads folder, under a name of its own', async () => {
    const outside = path.join(testApp.uploadsDir, '../../evil.png');
    expect(existsSync(outside)).toBe(false);

    // That path is outside the test app's folder. A server that followed the client's
    // name would leave a file there for the next run to find, so it is removed here.
    try {
      const response = await postParts([
        { name: 'photo', filename: '../../evil.png', type: 'image/png', bytes: PNG_SIGNATURE },
      ]);

      expect(response.status).toBe(303);
      expect(existsSync(outside)).toBe(false);
      expect(readdirSync(testApp.dir)).toEqual(['uploads']);
      expect(storedFile()).toMatch(STORED_NAME);
      expect(storedFile()).not.toContain('evil');
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it.each(['notes.gif', 'notes', 'notes.html', '.png', 'a/b\\c.jpeg'])(
    'takes nothing from the client name "%s"',
    async (filename) => {
      const response = await postParts([{ name: 'photo', filename, type: 'image/webp', bytes: PNG_SIGNATURE }]);

      expect(response.status).toBe(303);
      expect(readdirSync(testApp.dir)).toEqual(['uploads']);
      expect(storedFile()).toMatch(STORED_NAME);
      expect(storedFile()).toMatch(/\.webp$/);
    },
  );

  it('stores two uploads with the same client name and the same bytes as two files', async () => {
    const first = await upload({ filename: 'same.png' });
    const second = await upload({ filename: 'same.png' });

    expect([first.status, second.status]).toEqual([303, 303]);

    const names = storedFiles();
    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
    expect(
      sources()
        .map((source) => source.image_path)
        .sort(),
    ).toEqual(names.map((name) => `/uploads/${name}`).sort());
  });
});

describe('a file that is not a photo (AC7, AC10)', () => {
  it.each([
    'application/pdf',
    'text/plain',
    'text/html',
    'image/svg+xml',
    'image/heic',
    'image/bmp',
    'application/octet-stream',
    'constructor',
  ])('rejects a declared type of %s with 415, before anything touches the disk', async (type) => {
    const response = await upload({ type });

    expectRejected(response, 415, NOT_A_PHOTO);
    expect(existsSync(testApp.uploadsDir)).toBe(false);
  });

  it('judges by the declared type, not by the name or the bytes', async () => {
    const response = await upload({ bytes: PNG_SIGNATURE, filename: 'real.png', type: 'application/pdf' });

    expectRejected(response, 415, NOT_A_PHOTO);
    expect(existsSync(testApp.uploadsDir)).toBe(false);
  });

  it('stores plain text that is declared as image/png: the bytes are not inspected', async () => {
    const bytes = Buffer.from('milk, eggs, bread');

    const response = await upload({ bytes, filename: 'notes.txt', type: 'image/png' });

    expect(response.status).toBe(303);
    expect(storedFile()).toMatch(/\.png$/);
    expect(readFileSync(path.join(testApp.uploadsDir, storedFile())).equals(bytes)).toBe(true);
  });

  it('answers a file of a wrong type that is also too large with 415, not 413', async () => {
    const response = await upload({ bytes: Buffer.alloc(TEN_MB + 1, 1), type: 'application/pdf' });

    expectRejected(response, 415, NOT_A_PHOTO);
  });
});

describe('a photo that is too large (AC8, AC10)', () => {
  it('stores a photo of exactly 10 MB', async () => {
    const bytes = Buffer.alloc(TEN_MB, 7);

    const response = await upload({ bytes, type: 'image/jpeg' });

    expect(response.status).toBe(303);
    expect(readFileSync(path.join(testApp.uploadsDir, storedFile())).equals(bytes)).toBe(true);
    expect(sources()).toHaveLength(1);
  });

  it('rejects a photo of 10 MB and one byte with 413', async () => {
    const response = await upload({ bytes: Buffer.alloc(TEN_MB + 1, 7), type: 'image/jpeg' });

    expectRejected(response, 413, TOO_LARGE);
  });

  it('rejects a photo of 25 MB with 413 and leaves nothing behind', async () => {
    const response = await upload({ bytes: Buffer.alloc(25 * 1024 * 1024, 7), type: 'image/jpeg' });

    expectRejected(response, 413, TOO_LARGE);
  });
});

describe('a post with no file in photo (AC9, AC10)', () => {
  it('rejects a post with no body', async () => {
    const response = await request(testApp.app).post('/add/photo');

    expectRejected(response, 400, NO_PHOTO);
  });

  it('rejects what a browser sends for the form with nothing chosen', async () => {
    const response = await postParts([{ name: 'photo', filename: '', type: 'application/octet-stream' }]);

    expectRejected(response, 400, NO_PHOTO);
  });

  it('rejects a multipart post whose photo is a text field', async () => {
    const response = await request(testApp.app).post('/add/photo').field('photo', 'list.png');

    expectRejected(response, 400, NO_PHOTO);
  });

  it('rejects a urlencoded post', async () => {
    const response = await request(testApp.app).post('/add/photo').type('form').send({ photo: 'list.png' });

    expectRejected(response, 400, NO_PHOTO);
  });

  it('rejects a photo posted under another field name', async () => {
    const response = await upload({ field: 'picture' });

    expectRejected(response, 400, NO_PHOTO);
  });

  it('rejects a photo that is followed by a file under another field name, and does not keep the photo', async () => {
    const response = await upload().attach('picture', PNG_SIGNATURE, {
      filename: 'second.png',
      contentType: 'image/png',
    });

    expectRejected(response, 400, NO_PHOTO);
  });
});

describe('the uploads folder (AC11)', () => {
  it('is created with its parents when the first photo is stored, not before', async () => {
    const uploadsDir = path.join(testApp.dir, 'not', 'there', 'uploads');
    const app = createApp({ db: testApp.db, uploadsDir, analyze: testApp.analyze });

    const page = await request(app).get('/add');

    expect(page.status).toBe(200);
    expect(existsSync(path.join(testApp.dir, 'not'))).toBe(false);

    const response = await upload({}, app);

    expect(response.status).toBe(303);
    expect(storedFiles(uploadsDir)).toHaveLength(1);
  });

  it('is created again when it was removed while the app runs', async () => {
    await upload();
    rmSync(testApp.uploadsDir, { recursive: true });
    expect(existsSync(testApp.uploadsDir)).toBe(false);

    const response = await upload();

    expect(response.status).toBe(303);
    expect(storedFiles()).toHaveLength(1);
  });
});
