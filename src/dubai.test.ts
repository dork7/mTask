import { afterEach, describe, expect, it } from 'vitest';
import { clockMinutes, dayTimeLabel, dubaiDay, dubaiDayStart } from './dubai.ts';

/*
 * The Dubai clock. Every expected value is written out here as a UTC timestamp or as the
 * text a person reads; none is built with the functions under test. The machine these
 * tests were written on is itself on the Dubai clock, so the tests that could pass for a
 * clock read from the process set `TZ` themselves.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

/** An instant, the instant it is read at, and what a person reads then. */
const LABELS: [at: string, now: string, label: string][] = [
  ['2026-10-12T16:00:00.000Z', NOW, 'Today 8:00 PM'],
  ['2026-10-12T09:40:00.000Z', NOW, 'Today 1:40 PM'],
  ['2026-10-12T09:05:00.000Z', NOW, 'Today 1:05 PM'],
  ['2026-10-12T05:00:00.000Z', NOW, 'Today 9:00 AM'],
  ['2026-10-12T08:00:00.000Z', NOW, 'Today 12:00 PM'],
  ['2026-10-12T07:59:00.000Z', NOW, 'Today 11:59 AM'],
  ['2026-10-11T20:00:00.000Z', NOW, 'Today 12:00 AM'],
  ['2026-10-12T19:59:00.000Z', NOW, 'Today 11:59 PM'],
  ['2026-10-12T20:00:00.000Z', NOW, 'Tomorrow 12:00 AM'],
  ['2026-10-13T05:00:00.000Z', NOW, 'Tomorrow 9:00 AM'],
  ['2026-10-13T19:59:00.000Z', NOW, 'Tomorrow 11:59 PM'],
  ['2026-10-13T20:00:00.000Z', NOW, '14 Oct 12:00 AM'],
  ['2026-10-14T05:00:00.000Z', NOW, '14 Oct 9:00 AM'],
  ['2026-10-11T16:00:00.000Z', NOW, '11 Oct 8:00 PM'],
  // 2:00 AM on 13 Oct in Dubai: the UTC day is still the 12th.
  ['2026-10-13T05:00:00.000Z', '2026-10-12T22:00:00.000Z', 'Today 9:00 AM'],
  ['2026-10-14T05:00:00.000Z', '2026-10-12T22:00:00.000Z', 'Tomorrow 9:00 AM'],
  ['2027-01-01T05:00:00.000Z', '2026-12-30T10:00:00.000Z', '1 Jan 9:00 AM'],
  ['2026-12-31T20:30:00.000Z', '2026-12-31T10:00:00.000Z', 'Tomorrow 12:30 AM'],
  ['2026-03-05T06:10:00.000Z', '2026-02-27T06:10:00.000Z', '5 Mar 10:10 AM'],
];

function labelOf(at: string, now: string): string {
  return dayTimeLabel(new Date(at), new Date(now));
}

const zone = process.env.TZ;

afterEach(() => {
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

describe('clockMinutes (AC1)', () => {
  it.each([
    ['00:00', 0],
    ['09:00', 540],
    ['11:00', 660],
    ['20:05', 1205],
    ['22:00', 1320],
    ['23:59', 1439],
  ])('reads %s as %i minutes after midnight', (time, minutes) => {
    expect(clockMinutes(time)).toBe(minutes);
  });
});

describe('the Dubai day (AC1)', () => {
  it('changes at 20:00 UTC', () => {
    const before = dubaiDay(Date.parse('2026-10-12T19:59:59.999Z'));

    expect(dubaiDay(Date.parse('2026-10-12T20:00:00.000Z'))).toBe(before + 1);
    expect(dubaiDay(Date.parse('2026-10-11T20:00:00.000Z'))).toBe(before);
  });

  it('starts at 00:00 on the Dubai clock', () => {
    const today = dubaiDay(Date.parse(NOW));

    expect(new Date(dubaiDayStart(today)).toISOString()).toBe('2026-10-11T20:00:00.000Z');
    expect(new Date(dubaiDayStart(today + 1)).toISOString()).toBe('2026-10-12T20:00:00.000Z');
  });
});

describe('dayTimeLabel (AC11)', () => {
  it.each(LABELS)('shows %s, read at %s, as %s', (at, now, label) => {
    expect(labelOf(at, now)).toBe(label);
  });

  it.each(['America/New_York', 'Pacific/Kiritimati', 'UTC'])('gives the same labels with TZ=%s', (name) => {
    process.env.TZ = name;

    expect(LABELS.map(([at, now]) => labelOf(at, now))).toEqual(LABELS.map(([, , label]) => label));
  });

  it('names every month', () => {
    const labels = Array.from({ length: 12 }, (_, month) =>
      labelOf(new Date(Date.UTC(2027, month, 15, 5)).toISOString(), NOW),
    );

    expect(labels).toEqual([
      '15 Jan 9:00 AM',
      '15 Feb 9:00 AM',
      '15 Mar 9:00 AM',
      '15 Apr 9:00 AM',
      '15 May 9:00 AM',
      '15 Jun 9:00 AM',
      '15 Jul 9:00 AM',
      '15 Aug 9:00 AM',
      '15 Sep 9:00 AM',
      '15 Oct 9:00 AM',
      '15 Nov 9:00 AM',
      '15 Dec 9:00 AM',
    ]);
  });

  it('writes plain spaces', () => {
    for (const [at, now] of LABELS) expect(labelOf(at, now)).toMatch(/^[A-Za-z0-9: ]+$/);
  });
});
