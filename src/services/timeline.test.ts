import { describe, expect, it } from 'vitest';
import type { Task } from '../db/tasks.ts';
import { buildTimeline, readDay, type TimelineBlock } from './timeline.ts';

/*
 * The timeline of one day as the service builds it from task rows: which day a query
 * names, the hour labels of an axis off the hour, and how blocks that share time are
 * laid out side by side. Expected values are written out or worked from the Dubai clock
 * by `dubai()`, this file's own arithmetic.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = new Date('2026-10-12T09:36:00.000Z');
/** 12 Oct 2026 as a Dubai day: `Date.UTC(2026, 9, 12) / 86400000`. */
const DAY = 20738;
const HOURS = { start: '09:00', end: '22:00' };

/** A Dubai clock time, `HH:MM`, of 12 Oct 2026 or of a day after it, as a stored timestamp. */
function dubai(time: string, daysAhead = 0): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12 + daysAhead, hours - 4, minutes)).toISOString();
}

/** A pending medium task row scheduled from `from` to `to`, Dubai clock times of 12 Oct. */
function row(id: number, from: string, to: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    image_path: null,
    category: null,
    estimated_minutes: null,
    actual_minutes: null,
    priority: 'medium',
    time_slot: null,
    scheduled_start: dubai(from),
    scheduled_end: dubai(to),
    status: 'pending',
    started_at: null,
    completed_at: null,
    reminder_at: null,
    recurrence_rule: null,
    parent_task_id: null,
    source_id: null,
    confidence: null,
    created_at: '2026-10-12T08:00:00.000Z',
    updated_at: '2026-10-12T08:00:00.000Z',
    ...extra,
  };
}

/** A block's inline style as numbers. */
function styleOf(block: TimelineBlock): { top: number; height: number; left: number; width: number } {
  const read = (property: string): number => {
    const match = new RegExp(`(?:^|;)\\s*${property}:\\s*(-?[\\d.]+)%`).exec(block.style);
    if (match === null) throw new Error(`No ${property} in "${block.style}"`);
    return Number(match[1]);
  };
  return { top: read('top'), height: read('height'), left: read('left'), width: read('width') };
}

function blockOf(blocks: TimelineBlock[], id: number): TimelineBlock {
  const found = blocks.find((block) => block.id === id);
  if (found === undefined) throw new Error(`No block ${id}`);
  return found;
}

describe('readDay', () => {
  it('reads a date given once', () => {
    expect(readDay({ date: '2026-10-14' }, DAY)).toBe(DAY + 2);
  });

  it('accepts a leap day', () => {
    expect(readDay({ date: '2028-02-29' }, DAY)).toBe(Date.UTC(2028, 1, 29) / 86_400_000);
  });

  it.each([
    ['no query', undefined],
    ['no date', {}],
    ['a repeated date', { date: ['2026-10-14', '2026-10-14'] }],
    ['a number', { date: 5 }],
    ['a day past the month end', { date: '2026-02-29' }],
  ])('falls back to today for %s', (_name, query) => {
    expect(readDay(query, DAY)).toBe(DAY);
  });
});

describe('buildTimeline', () => {
  it('labels only the whole hours of an axis that is off the hour', () => {
    const timeline = buildTimeline([], { start: '09:30', end: '17:45' }, DAY, NOW);

    expect(timeline.hours.map((hour) => hour.label)).toEqual([
      '10 AM',
      '11 AM',
      '12 PM',
      '1 PM',
      '2 PM',
      '3 PM',
      '4 PM',
      '5 PM',
    ]);
    expect(Number.parseFloat(timeline.hours[0].top)).toBeCloseTo((30 / 495) * 100, 2);
  });

  it('lays seven blocks that all overlap side by side without their ranges intersecting', () => {
    const tasks = [1, 2, 3, 4, 5, 6, 7].map((id) => row(id, '10:00', '11:00'));
    const styles = buildTimeline(tasks, HOURS, DAY, NOW)
      .blocks.map(styleOf)
      .sort((a, b) => a.left - b.left);

    expect(new Set(styles.map((style) => style.left)).size).toBe(7);
    for (let index = 0; index + 1 < styles.length; index += 1) {
      expect(styles[index].left + styles[index].width).toBeLessThanOrEqual(styles[index + 1].left + 1e-9);
    }
    expect(styles[0].left).toBe(0);
    const last = styles[styles.length - 1];
    expect(Math.abs(last.left + last.width - 100)).toBeLessThan(1e-9);
  });

  it('reuses a column that is free again', () => {
    const blocks = buildTimeline(
      [row(1, '09:00', '11:00'), row(2, '09:30', '10:00'), row(3, '10:00', '10:30')],
      HOURS,
      DAY,
      NOW,
    ).blocks;
    const a = styleOf(blockOf(blocks, 1));
    const b = styleOf(blockOf(blocks, 2));
    const c = styleOf(blockOf(blocks, 3));

    expect([a.left, a.width]).toEqual([0, 50]);
    expect([b.left, b.width]).toEqual([50, 50]);
    expect([c.left, c.width]).toEqual([50, 50]);
    for (const other of [b, c]) {
      expect(other.left >= a.left + a.width || other.left + other.width <= a.left).toBe(true);
    }
  });
});
