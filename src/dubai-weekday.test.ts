import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { weekdayDateLabel } from './dubai.ts';

/*
 * The Today page's date line: the Dubai date of an instant with its full weekday. Every
 * case runs twice: in the process's own time zone and in `Pacific/Kiritimati` (UTC+14),
 * so a local-time method gives another answer in one of the two.
 */

let savedTz: string | undefined;

beforeEach(() => {
  savedTz = process.env.TZ;
});

afterEach(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

describe.each([
  ['the process time zone', undefined],
  ['Pacific/Kiritimati', 'Pacific/Kiritimati'],
])('in %s', (_name, tz) => {
  beforeEach(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  it.each([
    ['2026-10-12T09:36:00.000Z', 'Monday, 12 Oct'],
    ['2026-10-11T20:00:00.000Z', 'Monday, 12 Oct'],
    ['2026-10-11T19:59:00.000Z', 'Sunday, 11 Oct'],
    ['2026-10-12T20:30:00.000Z', 'Tuesday, 13 Oct'],
    ['2026-03-01T00:00:00.000Z', 'Sunday, 1 Mar'],
  ])('weekdayDateLabel of %s is %s', (at, label) => {
    expect(weekdayDateLabel(new Date(at))).toBe(label);
  });
});
