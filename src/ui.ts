/*
 * The fixed lists the views are built from: the navigation items, the priorities and
 * the day slots. The views reach them as `ui` (set on `app.locals`).
 *
 * A glyph is decoration and is rendered with `aria-hidden="true"`. The label is the
 * name a user reads, so it is always rendered as text beside the glyph.
 */

/** The navigation links, in the order they are shown. Add sits in the middle. */
export const navItems = [
  { id: 'today', href: '/', label: 'Today', glyph: '◉' },
  { id: 'timeline', href: '/timeline', label: 'Timeline', glyph: '▤' },
  { id: 'add', href: '/add', label: 'Add', glyph: '+' },
  { id: 'tasks', href: '/tasks', label: 'Tasks', glyph: '☰' },
  { id: 'more', href: '/settings', label: 'More', glyph: '⋯' },
] as const;

/** The priorities, most pressing first. The id is also the name of the color token. */
export const priorities = [
  { id: 'urgent', label: 'Urgent', glyph: '▲' },
  { id: 'high', label: 'High', glyph: '●' },
  { id: 'medium', label: 'Medium', glyph: '■' },
  { id: 'low', label: 'Low', glyph: '▼' },
] as const;

/** The day slots, in day order. The color token of a slot is `--slot-<id>`. */
export const slots = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'night', label: 'Night' },
] as const;

export type NavId = (typeof navItems)[number]['id'];
export type Priority = (typeof priorities)[number]['id'];
export type Slot = (typeof slots)[number]['id'];

/** The priority with this id. Throws on an unknown id, so nothing renders without a label. */
export function priority(id: string): (typeof priorities)[number] {
  const found = priorities.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown priority "${id}"`);
  return found;
}

/** The slot with this id. Throws on an unknown id, so nothing renders without a label. */
export function slot(id: string): (typeof slots)[number] {
  const found = slots.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown slot "${id}"`);
  return found;
}

/** Everything above, as the one object the views read. */
export const ui = { navItems, priorities, slots, priority, slot };
