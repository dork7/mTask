import { createApp } from './app.ts';
import { getPort, loadEnv } from './config.ts';

loadEnv();
const port = getPort();

// Express 5 also calls this callback, with the error, when the server fails to
// listen (a port already in use, for example). Rethrowing stops the process with
// the real reason instead of announcing a server that is not there.
createApp().listen(port, (error?: Error) => {
  if (error) throw error;
  console.log(`Task Image AI is running at http://localhost:${port}`);
});
