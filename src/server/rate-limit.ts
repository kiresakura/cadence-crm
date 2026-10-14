/**
 * Fixed-window, in-memory rate limiter. Good enough for a single instance; a multi-instance
 * deployment would back this with Redis or the database.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records an attempt and reports whether it is allowed. */
  consume(key: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
      return { allowed: true, retryAfterMs: 0 };
    }
    entry.count += 1;
    return entry.count > this.limit
      ? { allowed: false, retryAfterMs: entry.resetAt - now }
      : { allowed: true, retryAfterMs: 0 };
  }

  /** Reports whether another attempt is allowed, without counting one. */
  check(key: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now || entry.count < this.limit) {
      return { allowed: true, retryAfterMs: 0 };
    }
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  /** Counts one attempt (for example a failed sign-in). */
  hit(key: string, now = Date.now()): void {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
    } else {
      entry.count += 1;
    }
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(now: number): void {
    if (this.hits.size < 10_000) return;
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}
