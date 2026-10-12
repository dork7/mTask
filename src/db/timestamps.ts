/*
 * Every timestamp in the database has one format: what `Date.prototype.toISOString()`
 * returns, `2026-01-31T09:00:00.000Z`. Always UTC, always milliseconds, always 24
 * characters, so the stored values sort as text in time order.
 */

const TIMESTAMP_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** The current time as a stored timestamp. */
export function nowTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Whether `value` is a stored timestamp: a string in exactly the format above that
 * names a real instant. `2026-02-30T08:00:00.000Z` has the shape and is not one.
 */
export function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !TIMESTAMP_SHAPE.test(value)) return false;

  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString() === value;
}
