import { describe, expect, it } from 'vitest';
import { withTestApp } from './testing/app.ts';
import { navItems, priorities, priority, slot, slots, ui } from './ui.ts';

describe('priorities and slots (AC5, AC6)', () => {
  it('lists the four priorities, each with a label to show as text', () => {
    expect(priorities.map((item) => item.id)).toEqual(['urgent', 'high', 'medium', 'low']);
    expect(priorities.map((item) => item.label)).toEqual(['Urgent', 'High', 'Medium', 'Low']);
  });

  it('lists the four slots, each with a label to show as text', () => {
    expect(slots.map((item) => item.id)).toEqual(['morning', 'afternoon', 'evening', 'night']);
    expect(slots.map((item) => item.label)).toEqual(['Morning', 'Afternoon', 'Evening', 'Night']);
  });

  it('looks a priority and a slot up by id', () => {
    expect(priority('high')).toBe(priorities[1]);
    expect(slot('night')).toBe(slots[3]);
  });

  it('throws on an unknown id, so nothing is shown without its name', () => {
    expect(() => priority('nope')).toThrow('Unknown priority "nope"');
    expect(() => slot('nope')).toThrow('Unknown slot "nope"');
    expect(() => priority('')).toThrow();
    expect(() => slot('urgent')).toThrow();
  });
});

describe('navigation items (AC3)', () => {
  it('lists Today, Timeline, Add, Tasks and More with their addresses, in that order', () => {
    expect(navItems.map((item) => [item.id, item.href, item.label])).toEqual([
      ['today', '/', 'Today'],
      ['timeline', '/timeline', 'Timeline'],
      ['add', '/add', 'Add'],
      ['tasks', '/tasks', 'Tasks'],
      ['more', '/more', 'More'],
    ]);
  });

  it('has Add in the middle', () => {
    expect(navItems).toHaveLength(5);
    expect(navItems[2].id).toBe('add');
  });
});

describe('ui', () => {
  it('holds the three lists and the two lookups', () => {
    expect(ui).toEqual({ navItems, priorities, slots, priority, slot });
  });

  it('is what the views get as `ui`', async () => {
    await withTestApp(({ app }) => {
      expect(app.locals.ui).toBe(ui);
    });
  });
});
