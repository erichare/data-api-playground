/**
 * In-memory sliding window rate limiter.
 *
 * Suitable for a single-instance deployment. If the app is horizontally
 * scaled, replace with a Redis-backed implementation.
 */

interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed within the window */
  max: number;
}

interface RateLimitResult {
  limited: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max } = options;
  const hits = new Map<string, number[]>();

  // Periodically clean up expired entries to prevent memory leaks
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    }
  }, windowMs);

  // Allow garbage collection of the interval if the module is unloaded
  if (cleanup.unref) cleanup.unref();

  function check(key: string): RateLimitResult {
    const now = Date.now();
    const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

    if (timestamps.length >= max) {
      const oldestInWindow = timestamps[0];
      const retryAfterMs = oldestInWindow + windowMs - now;
      hits.set(key, timestamps);
      return { limited: true, remaining: 0, retryAfterMs };
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    return { limited: false, remaining: max - timestamps.length, retryAfterMs: 0 };
  }

  function reset() {
    hits.clear();
  }

  return { check, reset };
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}
