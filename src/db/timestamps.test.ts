import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTimestamp, nowTimestamp } from './timestamps.ts';

const T = '2026-03-04T05:06:07.089Z';

afterEach(() => {
  vi.useRealTimers();
});

describe('nowTimestamp (AC7)', () => {
  it('is the clock as a UTC ISO 8601 string with milliseconds', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(T));

    expect(nowTimestamp()).toBe(T);
  });
});

describe('isTimestamp (AC7)', () => {
  it.each([T, '2026-12-31T23:59:59.999Z'])('is true for %s', (value) => {
    expect(isTimestamp(value)).toBe(true);
  });

  it.each([
    ['a space in place of the T, no zone', '2026-10-12 08:00:00'],
    ['no milliseconds', '2026-10-12T08:00:00Z'],
    ['an offset in place of Z', '2026-10-12T12:00:00.000+04:00'],
    ['no zone', '2026-10-12T08:00:00.000'],
    ['a day that does not exist', '2026-02-30T08:00:00.000Z'],
    ['the empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['a number', 1_780_000_000_000],
    ['a Date', new Date(T)],
  ])('is false for %s', (_name, value) => {
    expect(isTimestamp(value)).toBe(false);
  });
});
