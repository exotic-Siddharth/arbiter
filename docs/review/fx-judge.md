## Progress
- [x] A-48 checker ASCII-only whitespace (checker.ts, checker.test.ts)
- [x] A-23 janitor age cap = READY_TIMEOUT_MS + MAX_CONTAINER_LIFETIME_MS + 60 s (languages.ts, janitor.ts, languages.test.ts)
- [x] A-24 per-queue job retention; run jobs removed on completion (queue.ts, queue.test.ts)
- [x] A-45 admin enqueue failure ends the row FAILED + 5 s enqueue timeout (admin.ts, queue.ts, admin.test.ts)
- [x] A-05 harness is a child subreaper; orphan rusage (cpu, peak rss) added after the kill (sandbox/harness.py, sandbox.test.ts). Needs image rebuild: npm run sandbox:build
- [x] A-06 failed/stalled jobs end their rows; reconciler sweep (failure.ts, workers.ts, worker.ts, processor.ts, workers.test.ts)
- [x] A-49 worker wiring tests (workers.test.ts: attempts/backoff, failed handler, deferred stall failure, /metrics)

Cross-area: DESIGN.md decisions log (janitor cap wording; BullMQ retention) needs updating by the integrator.
