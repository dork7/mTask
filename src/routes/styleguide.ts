import { Router } from 'express';
import { renderPage } from '../render.ts';

export const styleguideRouter = Router();

/** The design tokens and every component partial on one page, for the people building screens. */
styleguideRouter.get('/_styleguide', (_req, res) => {
  renderPage(res, 'styleguide', { title: 'Style guide' });
});
