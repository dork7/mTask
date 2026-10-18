import express, { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { getSetting, setSetting } from '../db/settings.ts';
import { dateOfDay, dubaiDay } from '../dubai.ts';
import { renderPage } from '../render.ts';
import { UPCOMING_ICS_PATH, dayIcsPath, ensureFeedToken } from '../services/calendar.ts';
import {
  SETTINGS_PATH,
  WORKING_HOURS_PATH,
  feedUrl,
  readWorkingHours,
  slotRuleRows,
  type SettingsPage,
} from '../services/settings.ts';
import { requestTime } from './mini-bar.ts';

/**
 * The settings page and the post of its working-hours form. The page makes the feed
 * token when none is stored, so the URL it shows always answers. Nothing here writes the
 * slot rules. There is no authentication: the app has one user and no accounts (the
 * backlog's decision 4).
 */
export function createSettingsRouter(deps: AppDeps): Router {
  const router = Router();
  // The form posts flat fields, so the simple parser is enough.
  const form = express.urlencoded({ extended: false });

  router.get(SETTINGS_PATH, (req, res) => {
    const now = requestTime(res);
    const settingsPage: SettingsPage = {
      workingHours: getSetting(deps.db, 'working_hours') ?? { start: '', end: '' },
      workingHoursAction: WORKING_HOURS_PATH,
      slotRules: slotRuleRows(getSetting(deps.db, 'slot_rules') ?? []),
      feedUrl: feedUrl(req.protocol, req.get('host') ?? 'localhost', ensureFeedToken(deps.db)),
      upcomingIcsHref: UPCOMING_ICS_PATH,
      todayIcsHref: dayIcsPath(dateOfDay(dubaiDay(now.getTime()))),
    };
    renderPage(res, 'settings', { title: 'Settings', nav: 'more', settingsPage });
  });

  router.post(WORKING_HOURS_PATH, form, (req, res) => {
    const hours = readWorkingHours(req.body);
    if (hours === undefined) {
      res.sendStatus(400);
      return;
    }
    setSetting(deps.db, 'working_hours', hours);
    res.redirect(303, SETTINGS_PATH);
  });

  return router;
}
