import { Context, Next } from "hono";
import { RateLimiterMemory } from "rate-limiter-flexible";

// Create rate limiters for different use cases
const globalLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60, // 100 requests per minute
});

const authLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60, // 10 login attempts per minute
});

const apiLimiter = new RateLimiterMemory({
  points: 50,
  duration: 60, // 50 API requests per minute
});

const uploadLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60, // 10 uploads per minute
});

// Get client IP
function getClientIP(c: Context): string {
  const forwarded = c.req.header("X-Forwarded-For");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = c.req.header("X-Real-IP");
  if (realIP) {
    return realIP;
  }
  return "unknown";
}

// Generic rate limit middleware
function createRateLimitMiddleware(
  limiter: RateLimiterMemory,
  message?: string
) {
  return async (c: Context, next: Next) => {
    const ip = getClientIP(c);

    try {
      const rateLimiterRes = await limiter.consume(ip);
      c.header("X-RateLimit-Limit", String(limiter.points));
      c.header("X-RateLimit-Remaining", String(rateLimiterRes.remainingPoints));
      c.header("X-RateLimit-Reset", String(Math.ceil(rateLimiterRes.msBeforeNext / 1000)));
      await next();
    } catch (rateLimiterRes: any) {
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(limiter.points));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(retryAfter));

      return c.json(
        {
          error: "Rate limit exceeded",
          message: message || "Too many requests. Please try again later.",
          retryAfter,
        },
        429
      );
    }
  };
}

// Exported middleware instances
export const globalRateLimit = createRateLimitMiddleware(globalLimiter, "Too many requests");
export const authRateLimit = createRateLimitMiddleware(authLimiter, "Too many login attempts");
export const apiRateLimit = createRateLimitMiddleware(apiLimiter, "API rate limit exceeded");
export const uploadRateLimit = createRateLimitMiddleware(uploadLimiter, "Too many uploads");

// Per-user rate limiter (for authenticated endpoints)
const userLimiters = new Map<string, RateLimiterMemory>();

export function userRateLimit(points: number = 100, duration: number = 60) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    const key = user?.id || getClientIP(c);

    let limiter = userLimiters.get(key);
    if (!limiter) {
      limiter = new RateLimiterMemory({ points, duration });
      userLimiters.set(key, limiter);

      // Clean up old limiters periodically
      if (userLimiters.size > 1000) {
        const firstKey = userLimiters.keys().next().value;
        if (firstKey) userLimiters.delete(firstKey);
      }
    }

    try {
      const res = await limiter.consume(key);
      c.header("X-RateLimit-Limit", String(points));
      c.header("X-RateLimit-Remaining", String(res.remainingPoints));
      await next();
    } catch (res: any) {
      const retryAfter = Math.ceil(res.msBeforeNext / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        {
          error: "Rate limit exceeded",
          message: "You have exceeded the rate limit. Please try again later.",
          retryAfter,
        },
        429
      );
    }
  };
}
