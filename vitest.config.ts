import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The configured database is always in memory under the test runner, so no test
    // can reach data/app.db through getDatabasePath(). The configured uploads folder is
    // outside the repo for the same reason: no test can reach data/uploads through
    // getUploadsDir(). Both win over the shell's values.
    env: { DATABASE_PATH: ':memory:', UPLOADS_DIR: path.join(tmpdir(), 'mtask-vitest-uploads') },
  },
});
