import express, { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { deleteSubscription, saveSubscription } from '../db/push.ts';
import { postedValue } from '../services/drafts.ts';

/*
 * The two form posts a page subscribes and unsubscribes through. A field is read with
 * `postedValue`, so one that is missing or repeated is refused, and it must be non-blank.
 * There is no authentication: the app has one user and no accounts (the backlog's
 * decision 4).
 */

/** Reads a posted field that must be a non-blank string, or `undefined`. */
function readField(body: unknown, name: string): string | undefined {
  const value = postedValue(body, name);
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Subscribes and unsubscribes an endpoint. Both answer 303 to `/` or 400. */
export function createPushRouter(deps: AppDeps): Router {
  const router = Router();
  // The forms post flat fields, so the simple parser is enough.
  const form = express.urlencoded({ extended: false });

  router.post('/push/subscribe', form, (req, res) => {
    const endpoint = readField(req.body, 'endpoint');
    const p256dh = readField(req.body, 'p256dh');
    const auth = readField(req.body, 'auth');
    if (endpoint === undefined || p256dh === undefined || auth === undefined) {
      res.sendStatus(400);
      return;
    }
    saveSubscription(deps.db, { endpoint, p256dh, auth });
    res.redirect(303, '/');
  });

  router.post('/push/unsubscribe', form, (req, res) => {
    const endpoint = readField(req.body, 'endpoint');
    if (endpoint === undefined) {
      res.sendStatus(400);
      return;
    }
    deleteSubscription(deps.db, endpoint);
    res.redirect(303, '/');
  });

  return router;
}
