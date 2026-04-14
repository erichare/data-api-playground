import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRateLimiter, getClientIp } from "./rate-limit";

describe("createRateLimiter", () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
  });

  it("allows requests within the limit", () => {
    expect(limiter.check("ip1").limited).toBe(false);
    expect(limiter.check("ip1").limited).toBe(false);
    expect(limiter.check("ip1").limited).toBe(false);
  });

  it("blocks requests exceeding the limit", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    const result = limiter.check("ip1");
    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks IPs independently", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    expect(limiter.check("ip1").limited).toBe(true);
    expect(limiter.check("ip2").limited).toBe(false);
  });

  it("reports remaining count", () => {
    expect(limiter.check("ip1").remaining).toBe(2);
    expect(limiter.check("ip1").remaining).toBe(1);
    expect(limiter.check("ip1").remaining).toBe(0);
  });

  it("allows requests after the window expires", () => {
    vi.useFakeTimers();
    try {
      limiter.check("ip1");
      limiter.check("ip1");
      limiter.check("ip1");
      expect(limiter.check("ip1").limited).toBe(true);

      vi.advanceTimersByTime(60_001);

      expect(limiter.check("ip1").limited).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reset clears all state", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    expect(limiter.check("ip1").limited).toBe(true);

    limiter.reset();
    expect(limiter.check("ip1").limited).toBe(false);
  });

  it("reports retryAfterMs from the oldest hit still in the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T12:00:00.000Z"));

    const timerAwareLimiter = createRateLimiter({ windowMs: 1_000, max: 2 });

    try {
      timerAwareLimiter.check("ip1");
      vi.advanceTimersByTime(400);
      timerAwareLimiter.check("ip1");
      vi.advanceTimersByTime(100);

      const result = timerAwareLimiter.check("ip1");
      expect(result.limited).toBe(true);
      expect(result.retryAfterMs).toBe(500);
    } finally {
      timerAwareLimiter.reset();
      vi.useRealTimers();
    }
  });
});

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const req = new Request("http://localhost/test", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("returns a fingerprint when no forwarded header", () => {
    const req = new Request("http://localhost/test");
    const ip = getClientIp(req);
    expect(ip).toMatch(/^fp-/);
  });

  it("returns distinct fingerprints for different user-agents", () => {
    const req1 = new Request("http://localhost/test", {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    const req2 = new Request("http://localhost/test", {
      headers: { "user-agent": "curl/7.68" },
    });
    expect(getClientIp(req1)).not.toBe(getClientIp(req2));
  });

  it("returns the same fingerprint for the same stable headers", () => {
    const requestInit = {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "en-US",
        "accept-encoding": "gzip",
      },
    };

    expect(
      getClientIp(new Request("http://localhost/test", requestInit))
    ).toBe(getClientIp(new Request("http://localhost/test", requestInit)));
  });
});
