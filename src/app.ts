import express, { type Express } from 'express';
import { publicDir, viewsDir } from './paths.ts';
import { renderPage } from './render.ts';
import { homeRouter } from './routes/home.ts';
import { styleguideRouter } from './routes/styleguide.ts';
import { ui } from './ui.ts';

/**
 * Builds the Express app. It never listens and never reads the environment:
 * `server.ts` does both, and tests drive the app returned here directly.
 */
export function createApp(): Express {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', viewsDir);
  app.locals.appName = 'Task Image AI';
  app.locals.ui = ui;

  app.use(express.static(publicDir));
  app.use(homeRouter);
  app.use(styleguideRouter);

  app.use((_req, res) => {
    res.status(404);
    renderPage(res, 'not-found', { title: 'Page not found' });
  });

  return app;
}
