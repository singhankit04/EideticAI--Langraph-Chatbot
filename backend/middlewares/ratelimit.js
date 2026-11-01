import { redis } from "../config/connections.js";

// Extracts client IP safely across proxies and direct connections
export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return firstIp;
  }
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
}

// Factory to create Redis-backed sliding window rate limiters
export function createRateLimiter({ limit, windowMs, keyPrefix, message }) {
  return async (req, res, next) => {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // 1. Remove expired timestamps and get current count in window
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zcard(key);
      pipeline.zrange(key, 0, 0, "WITHSCORES");
      const results = await pipeline.exec();

      const currentCount = results[1]?.[1] || 0;
      const oldestEntry = results[2]?.[1] || [];

      // 2. Reject request if limit exceeded
      if (currentCount >= limit) {
        const oldestTimestamp = Number(oldestEntry[1]) || windowStart;
        const retryAfterSeconds = Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));

        res.setHeader("Retry-After", retryAfterSeconds);
        res.setHeader("RateLimit-Limit", limit);
        res.setHeader("RateLimit-Remaining", 0);
        res.setHeader("RateLimit-Reset", retryAfterSeconds);

        return res.status(429).json({
          error: message || `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
          retryAfterSeconds,
        });
      }

      // 3. Record current request with a unique member
      const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
      const addPipeline = redis.pipeline();
      addPipeline.zadd(key, now, member);
      addPipeline.expire(key, Math.ceil(windowMs / 1000));
      await addPipeline.exec();

      res.setHeader("RateLimit-Limit", limit);
      res.setHeader("RateLimit-Remaining", Math.max(0, limit - (currentCount + 1)));

      return next();
    } catch (err) {
      console.warn(`[RateLimit Warning] Redis error for key "${key}": ${err.message}. Passing through.`);
      return next();
    }
  };
}

// 60 questions per 60 minutes per IP
export const chatRateLimiter = createRateLimiter({
  limit: 60,
  windowMs: 60 * 60 * 1000,
  keyPrefix: "ratelimit:chat",
  message: "Rate limit exceeded: You can ask up to 60 questions per hour.",
});

// 5 PDF uploads per 24 hours per IP
export const pdfUploadRateLimiter = createRateLimiter({
  limit: 5,
  windowMs: 24 * 60 * 60 * 1000,
  keyPrefix: "ratelimit:pdf",
  message: "Rate limit exceeded: You can upload up to 5 PDFs per 24 hours.",
});

export default {
  chatRateLimiter,
  pdfUploadRateLimiter,
  getClientIp,
  createRateLimiter,
};

