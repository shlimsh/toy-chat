import { sendApiError } from "./app-errors.mjs";

export function createFixedWindowRateLimiter({
  windowMs,
  max,
  now = () => Date.now(),
}) {
  const buckets = new Map();

  function consume(key) {
    const timestamp = now();
    const normalizedKey = String(key || "anonymous");
    const current = buckets.get(normalizedKey);
    const bucket =
      !current || current.resetAt <= timestamp
        ? { count: 0, resetAt: timestamp + windowMs }
        : current;

    bucket.count += 1;
    buckets.set(normalizedKey, bucket);

    if (buckets.size > 1_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= timestamp) buckets.delete(bucketKey);
      }
    }

    return {
      allowed: bucket.count <= max,
      limit: max,
      remaining: Math.max(0, max - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSec: Math.max(
        1,
        Math.ceil((bucket.resetAt - timestamp) / 1_000)
      ),
    };
  }

  return {
    consume,
    reset() {
      buckets.clear();
    },
  };
}

export function createUserRateLimitMiddleware({
  limiter,
  errorCode = "sms_rate_limited",
}) {
  return function userRateLimit(req, res, next) {
    const result = limiter.consume(req.user?.userId);

    res.setHeader("RateLimit-Limit", String(result.limit));
    res.setHeader("RateLimit-Remaining", String(result.remaining));
    res.setHeader(
      "RateLimit-Reset",
      String(Math.ceil(result.resetAt / 1_000))
    );

    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retryAfterSec));
      return sendApiError(req, res, errorCode);
    }

    return next();
  };
}
