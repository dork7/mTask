import { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { listTasks } from '../db/tasks.ts';
import { renderPage } from '../render.ts';
import { DIGEST_PATH, buildDigest } from '../services/digest.ts';
import { requestTime } from './mini-bar.ts';

/**
 * The Digest page: today's count, planned minutes, the first task left and the overdue
 * items, with links to the overdue view and the timeline. It reads every task once and
 * the time of the request as the mini-bar middleware read it, and writes nothing.
 */
export function createDigestRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(DIGEST_PATH, (_req, res) => {
    renderPage(res, 'digest', {
      title: 'Digest',
      digest: buildDigest(listTasks(deps.db), requestTime(res)),
    });
  });

  return router;
}
