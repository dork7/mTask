import { createApp } from './app.ts';
import { getDatabasePath, getPort, getUploadsDir, loadEnv } from './config.ts';
import { openDatabase } from './db/database.ts';

loadEnv();
const port = getPort();

// The database is opened once, here, and handed down. When it cannot be opened the
// process stops before it listens. The process ending closes it.
const db = openDatabase(getDatabasePath());
const app = createApp({ db, uploadsDir: getUploadsDir() });

// Express 5 also calls this callback, with the error, when the server fails to
// listen (a port already in use, for example). Rethrowing stops the process with
// the real reason instead of announcing a server that is not there.
app.listen(port, (error?: Error) => {
  if (error) throw error;
  console.log(`Task Image AI is running at http://localhost:${port}`);
});
