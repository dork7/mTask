import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSetting, setSetting } from './db/settings.ts';
import { SETTINGS_PATH, WORKING_HOURS_PATH } from './services/settings.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { one, parseHtml, type DomDocument, type DomInput } from './testing/dom.ts';

/*
 * The working-hours form of the settings page (AC2): it shows the stored hours, stores a
 * valid pair and answers 303, and answers 400 to anything else without a write.
 */

let testApp: TestApp;

beforeEach(() => {
  testApp = createTestApp();
});

afterEach(() => {
  testApp.close();
});

async function settingsDocument(): Promise<DomDocument> {
  const response = await request(testApp.app).get(SETTINGS_PATH);
  expect(response.status).toBe(200);
  return parseHtml(response.text);
}

/** The values of the form's two time inputs. */
function shownHours(document: DomDocument): { start: string; end: string } {
  const form = one(document, `form[action="${WORKING_HOURS_PATH}"][method="post"]`);
  return {
    start: (one(form, 'input[type="time"][name="start"]') as DomInput).value,
    end: (one(form, 'input[type="time"][name="end"]') as DomInput).value,
  };
}

function post(body: string): request.Test {
  return request(testApp.app).post(WORKING_HOURS_PATH).type('form').send(body);
}

describe('the working-hours form (AC2)', () => {
  it('shows the stored hours of a new database', async () => {
    expect(shownHours(await settingsDocument())).toEqual({ start: '09:00', end: '22:00' });
  });

  it('stores valid hours, answers 303 and shows them next time', async () => {
    const response = await post('start=10:30&end=18:00');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/settings');
    expect(getSetting(testApp.db, 'working_hours')).toEqual({ start: '10:30', end: '18:00' });
    expect(shownHours(await settingsDocument())).toEqual({ start: '10:30', end: '18:00' });
  });

  it('accepts the edges of the day', async () => {
    const response = await post('start=00:00&end=23:59');

    expect(response.status).toBe(303);
    expect(getSetting(testApp.db, 'working_hours')).toEqual({ start: '00:00', end: '23:59' });
  });

  it.each([
    ['no start', 'end=22:00'],
    ['no end', 'start=09:00'],
    ['a repeated start', 'start=10:00&start=11:00&end=22:00'],
    ['a repeated end', 'start=09:00&end=22:00&end=23:00'],
    ['a start without its leading zero', 'start=9:00&end=22:00'],
    ['an end of 24:00', 'start=09:00&end=24:00'],
    ['letters', 'start=ab:cd&end=22:00'],
    ['seconds', 'start=09:00:00&end=22:00'],
    ['equal times', 'start=12:00&end=12:00'],
    ['a start later than the end', 'start=18:00&end=09:00'],
    ['an empty body', ''],
  ])('answers 400 to %s and leaves the hours unchanged', async (_name, body) => {
    setSetting(testApp.db, 'working_hours', { start: '08:00', end: '20:00' });

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(getSetting(testApp.db, 'working_hours')).toEqual({ start: '08:00', end: '20:00' });
  });
});
