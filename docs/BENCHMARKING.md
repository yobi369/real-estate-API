# HTTP benchmarking

The repository includes a dependency-free benchmark runner using Node's built-in Fetch API. It measures an already-running deployment; it does not start a server, create data, or claim production capacity.

## Run

Start the API in another terminal, then run:

```bash
npm run benchmark
```

Configure the target and workload with environment variables:

| Variable | Default | Purpose |
|---|---:|---|
| `API_BASE_URL` | `http://127.0.0.1:3000` | API origin |
| `BENCHMARK_PATH` | `/health/live` | GET path to measure |
| `BENCHMARK_REQUESTS` | `500` | Total requests |
| `BENCHMARK_CONCURRENCY` | `25` | Concurrent workers |
| `BENCHMARK_MAX_ERROR_RATE` | `0.01` | Maximum tolerated error fraction |
| `BENCHMARK_MAX_P95_MS` | unset | Optional p95 latency failure threshold |

Example:

```bash
API_BASE_URL=https://staging.example.com BENCHMARK_PATH=/health/ready BENCHMARK_REQUESTS=1000 BENCHMARK_CONCURRENCY=40 npm run benchmark
```

The JSON result reports throughput, error rate, and p50/p95/p99/max request latency. A non-zero exit code means the configured error-rate or p95 threshold was exceeded.

## Evidence requirements

Run against a named staging environment with a documented region, instance size, database configuration, date, workload, and warm-up procedure. Repeat at increasing concurrency, retain raw JSON output, and monitor database connections, CPU, memory, and error logs. Do not use the liveness endpoint as a substitute for a representative property-search or authenticated write workload. Do not publish a capacity claim from a single run.
