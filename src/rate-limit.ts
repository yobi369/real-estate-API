import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { pool } from './db.js';

type Bucket = { count: number; resetAt: number };
type RateLimitOptions = { namespace: string; windowMs: number; max: number };

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  if (!/^[a-z0-9-]{2,48}$/.test(options.namespace)) {
    throw new Error('RATE_LIMIT_NAMESPACE_INVALID');
  }
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 1000 ||
      !Number.isSafeInteger(options.max) || options.max < 1) {
    throw new Error('RATE_LIMIT_OPTIONS_INVALID');
  }

  // Local fallback is for isolated development/test runs only. Production uses
  // the PostgreSQL atomic upsert below, so every application replica shares one
  // counter and one fixed-window reset time.
  const localBuckets = new Map<string, Bucket>();
  let operations = 0;

  return (req: Request, res: Response, next: NextFunction): void => {
    const address = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.namespace}:${address}`;

    const applyLimit = (count: number, resetAt: number): void => {
      const remaining = Math.max(0, options.max - count);
      res.setHeader('RateLimit-Limit', String(options.max));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
      if (count > options.max) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
        res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });
        return;
      }
      next();
    };

    const databasePool = pool;
    if (databasePool) {
      void databasePool.query<{ request_count: number; reset_at: Date }>(
        `INSERT INTO api_rate_limit_buckets(bucket_key,request_count,reset_at)
         VALUES($1,1,now()+($2::double precision * interval '1 millisecond'))
         ON CONFLICT(bucket_key) DO UPDATE SET
           request_count=CASE WHEN api_rate_limit_buckets.reset_at<=now()
             THEN 1 ELSE api_rate_limit_buckets.request_count+1 END,
           reset_at=CASE WHEN api_rate_limit_buckets.reset_at<=now()
             THEN now()+($2::double precision * interval '1 millisecond')
             ELSE api_rate_limit_buckets.reset_at END
         RETURNING request_count,reset_at`,
        [key, options.windowMs]
      ).then(result => {
        const row = result.rows[0];
        if (!row) throw new Error('RATE_LIMIT_RESULT_MISSING');
        applyLimit(Number(row.request_count), new Date(row.reset_at).getTime());
        operations += 1;
        if (operations % 1000 === 0) {
          void databasePool.query(
            "DELETE FROM api_rate_limit_buckets WHERE bucket_key IN (SELECT bucket_key FROM api_rate_limit_buckets WHERE reset_at < now()-interval '1 hour' ORDER BY reset_at LIMIT 250)"
          ).catch(() => undefined);
        }
      }).catch(() => {
        // Fail closed if the shared limiter store is unavailable. Falling back
        // to per-process counters in production would silently weaken controls.
        res.status(503).json({ error: { code: 'RATE_LIMIT_STORE_UNAVAILABLE', message: 'Request protection is temporarily unavailable. Please retry shortly.' } });
      });
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: { code: 'RATE_LIMIT_STORE_UNAVAILABLE', message: 'Shared request protection is not configured.' } });
      return;
    }

    const now = Date.now();
    let bucket = localBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      localBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (localBuckets.size > 5000) {
      for (const [bucketKey, entry] of localBuckets) {
        if (entry.resetAt <= now) localBuckets.delete(bucketKey);
      }
    }
    applyLimit(bucket.count, bucket.resetAt);
  };
}
