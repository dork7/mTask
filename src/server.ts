import { createApp } from './app.ts';
import {
  getAnthropicApiKey,
  getAnthropicModel,
  getDatabasePath,
  getPort,
  getUploadsDir,
  loadEnv,
} from './config.ts';
import { openDatabase } from './db/database.ts';
import { createAnalyze } from './services/analyzer.ts';
import { startReminderJob } from './services/reminders.ts';

loadEnv();
const port = getPort();

// The database is opened once, here, and handed down. When it cannot be opened the
// process stops before it listens. The process ending closes it.
const db = openDatabase(getDatabasePath());
// Without a key the server still starts: the analyzer then refuses every photo.
const analyze = createAnalyze(getAnthropicApiKey(), getAnthropicModel());
const app = createApp({ db, uploadsDir: getUploadsDir(), analyze });
// The job watches `reminder_at` while the server runs, marking the urgent tasks that are due.
startReminderJob(db);

// Express 5 also calls this callback, with the error, when the server fails to
// listen (a port already in use, for example). Rethrowing stops the process with
// the real reason instead of announcing a server that is not there.
app.listen(port, (error?: Error) => {
  if (error) throw error;
  console.log(`Task Image AI is running at http://localhost:${port}`);
});
