import type { Request, Response, NextFunction, RequestHandler } from 'express';

type Bucket = { count: number; resetAt: number };

export function createRateLimiter(options: { windowMs: number; max: number }): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    const remaining = Math.max(0, options.max - bucket.count - 1);
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count >= options.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });
      return;
    }

    bucket.count += 1;
    if (buckets.size > 5000) {
      for (const [address, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(address);
      }
      while (buckets.size > 5000) {
        const oldestAddress = buckets.keys().next().value;
        if (oldestAddress === undefined) break;
        buckets.delete(oldestAddress);
      }
    }
    next();
  };
}
