# VynMesh production readiness

## What is now real, not just described

- **Authentication**: Fresh installs create `admin@vynmesh.local` with the initial password `changeme` and force a password change before granting an application session. The setup command binds the production server to localhost during bootstrap. OIDC remains available when configured with `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URI`; registering a client with an identity provider is still an operator task.
- **Networked database connector**: `readPostgresSource` in `src/lib/connectors.ts` runs a real, admin-configured SQL query against any reachable PostgreSQL instance. It is available at the API/data-model level (`sources.kind = 'postgres'`, credentials in `sources.secret_config`, never returned by any API response); it is intentionally not exposed in the simplified UI to keep the UI plain-language.
- **Governance enforcement, not just a label**: `src/lib/pii.ts` scans every ingested record for emails, phone numbers, SSNs, and credit-card-like numbers, masks them, and stores the result in `catalog_records.redacted_content`. Search and AI answers only ever return `redacted_content` — verified live: a record containing a real email and phone number was ingested, and the AI answer's evidence excerpt showed `[redacted]` in place of both.
- **Ingestion reliability**: `src/lib/ingestion.ts` retries a failing connector up to 3 times with backoff; after exhausting retries it marks the source `attention` and writes a row to `dead_letters` with the error and attempt count — verified live against a deliberately broken source.
- **Abuse protection**: `src/lib/rate-limit.ts` enforces a per-IP request budget on `/api/mesh` (60/min) and `/api/auth` (10/min); verified live — request 61 in a tight loop returned `429`. This is in-memory and per-process; it does not coordinate across multiple server instances.
- **Security headers**: `next.config.ts` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Strict-Transport-Security` on every response — verified live via response headers.
- **Automated tests**: `npm test` runs real, passing tests (`tests/pii.test.ts`, `tests/rate-limit.test.ts`) covering redaction correctness/state-isolation and rate-limit threshold/reset behavior.

## What still requires infrastructure or a business process, not more code

- If single sign-on is required, a real identity-provider client registration and real end users to sign in with it.
- A real, reachable PostgreSQL (or other) production database and real credentials to connect the `postgres` source kind to.
- Real S3/SharePoint credentials for a genuine object-storage connector (the current document connector reads a local directory).
- Multi-instance/multi-tenant deployment: SQLite and the in-memory rate limiter are single-process; a networked database and shared rate-limit store are required beyond one instance.
- A third-party security review/penetration test, and formal compliance certification (SOC 2, ISO 27001, FIPS, etc.) — these require independent auditors, not code changes.
- A real user pilot to validate retrieval quality, usability, and the finance use case below against real data.

## First production use case

The initial use case is **finance customer payment-review investigation**:

- Connect a structured order/risk source (database connector; demoed against a local SQLite orders table, or a real PostgreSQL instance via `sources.kind = 'postgres'`).
- Connect a document source containing customer policy (document connector).
- Connect a semi-structured risk-event feed (JSON connector).
- Normalize records into the governed catalog with lineage back to raw source files, with PII masked before it reaches any answer.
- Resolve shared `customer_id` values and retain source lineage.
- Answer a question with citations and workspace policy checks.
- Require human review before any action is taken.

Success criteria for a pilot are: every answer cites source records, unauthorized users receive no evidence, restricted PII never appears in an answer, ingestion can resume after a failed run (now retried automatically and dead-lettered on exhaustion), and an operator can rebuild the catalog from source locators.

## Operational requirements

Before multi-instance production, replace the in-process ingestion retry loop with a worker queue that has checkpoints, idempotency keys, and backpressure, and replace the in-memory rate limiter with a shared store (e.g., Redis). Do not run untrusted or slow connector queries in a request handler.

Monitor:

- ingestion records per second and failure rate
- catalog freshness and schema changes
- query p50/p95/p99 latency
- model provider error rate and token/cost usage
- citation coverage and retrieval precision
- authorization denials and audit write failures
- SQLite database size, write latency, and lock contention (or the replacement production database's pool saturation and replication lag once migrated)

Alert on stale sources, repeated connector failures, failed backups, database exhaustion, evidence-free answers, and policy enforcement errors.

## Backup and recovery

Use managed, networked database point-in-time recovery and daily restore tests once `src/lib/db.ts` is migrated off local SQLite for multi-instance production. Back up `data/vynmesh.db` and `data/lake/` together today. Source data remains authoritative and must be re-readable; catalog records must be rebuildable from `raw_locator`, `curated_locator`, and `lineage`.

Define and test RPO/RTO targets before pilot approval. A backup that has not been restored is not a recovery plan.

## Security gate

Forced initial password rotation, optional OIDC/Entra ID sign-in, per-source PII redaction, ingestion retries with dead-letter tracking, rate limiting, and security response headers are implemented (see above). Do not expose a fresh install publicly before changing `changeme`. Still required before production access: secrets moved to a managed secret store, tenant isolation tested under real multi-tenant load, connector credentials scoped read-only at the database level, and a threat model covering prompt injection, data exfiltration, SQL abuse via configured connector queries, malicious documents, and cross-workspace access.

The current model integration is OpenAI-compatible and only uses an endpoint when `MODEL_ENDPOINT` and `MODEL_API_KEY` are present. Provider responses must remain constrained to retrieved evidence and must be logged with policy-approved redaction.
