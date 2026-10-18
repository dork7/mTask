import { describe, expect, it } from 'vitest';
import type { SlotRule } from '../db/settings.ts';
import { CLOCK_TIME, feedUrl, readWorkingHours, slotRuleRows } from './settings.ts';

describe('readWorkingHours (AC2)', () => {
  it('gives a new object equal to a valid form', () => {
    const body = { start: '09:00', end: '22:00' };
    const read = readWorkingHours(body);

    expect(read).toEqual({ start: '09:00', end: '22:00' });
    expect(read).not.toBe(body);
  });

  it('turns down a repeated field', () => {
    expect(readWorkingHours({ start: ['09:00'], end: '22:00' })).toBeUndefined();
  });

  it('turns down a value with a space around it', () => {
    expect(readWorkingHours({ start: ' 09:00', end: '22:00' })).toBeUndefined();
  });

  it('turns down a start that is not earlier than the end', () => {
    expect(readWorkingHours({ start: '12:00', end: '12:00' })).toBeUndefined();
    expect(readWorkingHours({ start: '18:00', end: '09:00' })).toBeUndefined();
  });

  it.each(['00:00', '23:59', '09:30'])('CLOCK_TIME accepts %s', (value) => {
    expect(CLOCK_TIME.test(value)).toBe(true);
  });

  it.each(['9:00', '24:00', '12:60', 'ab:cd', '09:00:00'])('CLOCK_TIME turns down %s', (value) => {
    expect(CLOCK_TIME.test(value)).toBe(false);
  });
});

describe('slotRuleRows (AC3)', () => {
  it('gives the label of the slot and keeps the stored order', () => {
    const rules: SlotRule[] = [
      { category: 'shopping', time_slot: 'night', start: '20:00', end: '22:00' },
      { category: 'coding', time_slot: 'morning', start: '09:00', end: '11:00' },
    ];

    expect(slotRuleRows(rules)).toEqual([
      { category: 'shopping', slotLabel: 'Night', start: '20:00', end: '22:00' },
      { category: 'coding', slotLabel: 'Morning', start: '09:00', end: '11:00' },
    ]);
  });

  it('shows the raw value of an unknown slot and does not throw', () => {
    const rules = [{ category: 'x', time_slot: 'dawn', start: '05:00', end: '06:00' }] as unknown as SlotRule[];

    expect(slotRuleRows(rules)[0].slotLabel).toBe('dawn');
  });
});

describe('feedUrl (AC7)', () => {
  it('builds the URL on the protocol and host', () => {
    expect(feedUrl('https', 'a.example', 'abc_-1')).toBe('https://a.example/calendar.ics?token=abc_-1');
  });
});
