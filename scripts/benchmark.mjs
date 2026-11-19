const baseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const path = process.env.BENCHMARK_PATH ?? '/health/live';
const total = Number(process.env.BENCHMARK_REQUESTS ?? 500);
const concurrency = Number(process.env.BENCHMARK_CONCURRENCY ?? 25);
const maxErrorRate = Number(process.env.BENCHMARK_MAX_ERROR_RATE ?? 0.01);
const maxP95Ms = process.env.BENCHMARK_MAX_P95_MS === undefined ? null : Number(process.env.BENCHMARK_MAX_P95_MS);

if (!Number.isInteger(total) || total < 1 || total > 100000) throw new Error('BENCHMARK_REQUESTS must be an integer from 1 to 100000');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 1000) throw new Error('BENCHMARK_CONCURRENCY must be an integer from 1 to 1000');
if (!Number.isFinite(maxErrorRate) || maxErrorRate < 0 || maxErrorRate > 1) throw new Error('BENCHMARK_MAX_ERROR_RATE must be between 0 and 1');
if (maxP95Ms !== null && (!Number.isFinite(maxP95Ms) || maxP95Ms <= 0)) throw new Error('BENCHMARK_MAX_P95_MS must be positive');
new URL(path, baseUrl);

const latencies = [];
let completed = 0;
let failures = 0;
const startedAt = performance.now();

async function worker() {
  while (true) {
    const index = completed++;
    if (index >= total) return;
    const start = performance.now();
    try {
      const response = await fetch(new URL(path, baseUrl), { signal: AbortSignal.timeout(15000) });
      await response.arrayBuffer();
      if (!response.ok) failures += 1;
    } catch {
      failures += 1;
    } finally {
      latencies.push(performance.now() - start);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
const elapsedMs = performance.now() - startedAt;
latencies.sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.ceil(p * latencies.length) - 1)] ?? 0;
const errorRate = failures / total;
const result = {
  target: new URL(path, baseUrl).toString(),
  requests: total,
  concurrency: Math.min(concurrency, total),
  durationMs: Number(elapsedMs.toFixed(2)),
  requestsPerSecond: Number((total / (elapsedMs / 1000)).toFixed(2)),
  errors: failures,
  errorRate: Number(errorRate.toFixed(4)),
  latencyMs: {
    p50: Number(percentile(0.50).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    p99: Number(percentile(0.99).toFixed(2)),
    max: Number((latencies.at(-1) ?? 0).toFixed(2))
  }
};
console.log(JSON.stringify(result, null, 2));
if (errorRate > maxErrorRate || (maxP95Ms !== null && percentile(0.95) > maxP95Ms)) process.exitCode = 1;
