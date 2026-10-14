import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dateTimeValue, instantOfDateTime } from './dubai.ts';

/*
 * A reminder's date and time on the Dubai clock, as a `datetime-local` field holds it.
 * Every case runs twice: in the process's own time zone and in `Pacific/Kiritimati`
 * (UTC+14), so a local-time method gives another answer in one of the two.
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
    ['2026-10-12T16:00:00.000Z', '2026-10-12T20:00'],
    ['2026-10-12T21:30:45.000Z', '2026-10-13T01:30'],
  ])('dateTimeValue of %s is %s', (at, value) => {
    expect(dateTimeValue(new Date(at))).toBe(value);
  });

  it.each([
    ['2026-10-12T20:00', '2026-10-12T16:00:00.000Z'],
    ['2026-10-13T01:30', '2026-10-12T21:30:00.000Z'],
    ['2026-10-12T00:00', '2026-10-11T20:00:00.000Z'],
    ['2026-10-12T23:59', '2026-10-12T19:59:00.000Z'],
  ])('instantOfDateTime of %s is %s', (text, at) => {
    expect(instantOfDateTime(text)?.toISOString()).toBe(at);
  });

  it.each([
    '2026-02-30T10:00',
    '2026-13-01T10:00',
    '2026-10-12T24:00',
    '2026-10-12T20:60',
    '2026-10-12 20:00',
    '2026-10-12T20:00:00',
    '2026-10-12T8:00',
    '',
    'tomorrow',
  ])('instantOfDateTime refuses "%s"', (text) => {
    expect(instantOfDateTime(text)).toBeUndefined();
  });
});
