import webpush from 'web-push';
import { createApp } from './app.ts';
import {
  getAnthropicApiKey,
  getAnthropicModel,
  getDatabasePath,
  getPort,
  getUploadsDir,
  getVapidKeys,
  loadEnv,
  type VapidKeys,
} from './config.ts';
import { openDatabase } from './db/database.ts';
import { createAnalyze } from './services/analyzer.ts';
import { startPushJob, type PushSender } from './services/push.ts';
import { startReminderJob } from './services/reminders.ts';
import { startRecurrence } from './services/recurrence.ts';

loadEnv();
const port = getPort();

// The database is opened once, here, and handed down. When it cannot be opened the
// process stops before it listens. The process ending closes it.
const db = openDatabase(getDatabasePath());
// The recurring job: once now and every 15 minutes. The process ending stops it.
startRecurrence(db);
// Without a key the server still starts: the analyzer then refuses every photo.
const analyze = createAnalyze(getAnthropicApiKey(), getAnthropicModel());
const vapid = getVapidKeys();
const app = createApp({ db, uploadsDir: getUploadsDir(), analyze, vapidPublicKey: vapid?.publicKey });

/**
 * The real sender: `web-push` signs with the VAPID keys and encrypts the payload. Built
 * only here, so the suite never loads the library into a test and never sends a push. A
 * failing push is logged, not thrown, so one dead endpoint does not stop the job.
 */
function createPushSender(keys: VapidKeys): PushSender {
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  return (subscription, payload) => {
    webpush
      .sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
      )
      .catch((error: unknown) => {
        console.error(`The push to subscription ${subscription.id} failed:`, error);
      });
  };
}

// Exactly one job watches `reminder_at` while the server runs: the push job when the
// VAPID keys are there, the in-page alarm's marker when they are not.
if (vapid === undefined) {
  startReminderJob(db);
} else {
  startPushJob(db, createPushSender(vapid));
}

// Express 5 also calls this callback, with the error, when the server fails to
// listen (a port already in use, for example). Rethrowing stops the process with
// the real reason instead of announcing a server that is not there.
app.listen(port, (error?: Error) => {
  if (error) throw error;
  console.log(`Task Image AI is running at http://localhost:${port}`);
});
