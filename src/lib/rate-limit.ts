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

/**
 * Extract a client identifier for rate-limiting.
 *
 * When deployed behind a trusted reverse proxy that overwrites
 * X-Forwarded-For, the first entry is the real client IP.  In other
 * environments the header is spoofable — callers should be aware that
 * this is best-effort, not a security boundary.
 *
 * Falls back to a per-request fingerprint derived from available
 * headers so that direct-connect clients without X-Forwarded-For do
 * not all share a single bucket.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  // Build a rough fingerprint from stable request headers so each
  // distinct client gets its own rate-limit bucket rather than all
  // sharing a single "unknown" key.
  const parts = [
    req.headers.get("user-agent") ?? "",
    req.headers.get("accept-language") ?? "",
    req.headers.get("accept-encoding") ?? "",
  ];
  return `fp-${simpleHash(parts.join("|"))}`;
}

/** DJB2-style string hash — NOT cryptographic, just bucket distribution. */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
