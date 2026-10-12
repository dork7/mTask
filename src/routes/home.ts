import { Router } from 'express';
import { renderPage } from '../render.ts';

export const homeRouter = Router();

homeRouter.get('/', (_req, res) => {
  renderPage(res, 'home', { title: 'Today', nav: 'today' });
});
