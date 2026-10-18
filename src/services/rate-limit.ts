/*
 * A sliding-window limit on requests, counted per key (the client IP). Refused requests
 * count too. The clock is read only through `now`, so a test can drive it.
 */

/** The limit the four AI endpoints share: 10 requests per client in any 60 seconds. */
export const AI_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

export interface RateLimiter {
  /** Counts one request of `key`. `undefined`: accepted. A number: refused, the whole seconds to wait. */
  hit(key: string): number | undefined;
}

export interface RateLimitOptions {
  /** The most requests accepted in any window. */
  limit: number;
  /** The length of the window, in milliseconds. */
  windowMs: number;
  /** The clock, in milliseconds. Left out, `Date.now()` read at each call. */
  now?: () => number;
}

/**
 * A limiter that keeps, per key, the times of its newest `limit` requests: enough to
 * decide every later one, and no more memory than that. A request is accepted again at
 * exactly the oldest kept time plus `windowMs`.
 */
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { limit, windowMs } = options;
  const now = options.now ?? (() => Date.now());
  const logs = new Map<string, number[]>();

  return {
    hit(key) {
      const t = now();
      const expired = t - windowMs;
      // Keys whose newest request has left the window are forgotten.
      for (const [other, times] of logs) {
        if (times[times.length - 1] <= expired) logs.delete(other);
      }

      const log = (logs.get(key) ?? []).filter((time) => time > expired);
      const accepted = log.length < limit;
      log.push(t);
      while (log.length > limit) log.shift();
      logs.set(key, log);

      if (accepted) return undefined;
      return Math.min(Math.ceil(windowMs / 1000), Math.max(1, Math.ceil((log[0] + windowMs - t) / 1000)));
    },
  };
}
