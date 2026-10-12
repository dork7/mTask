import path from 'node:path';

/** The repo root, one level above `src/`. Never derived from the working folder. */
export const rootDir = path.resolve(import.meta.dirname, '..');

/** The EJS views: the layout and the page fragments. */
export const viewsDir = path.join(rootDir, 'src', 'views');

/** Static files served to the browser. */
export const publicDir = path.join(rootDir, 'public');
