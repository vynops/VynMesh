# VynMesh architecture baseline

## Product boundary

VynMesh is an independent product in the Vyn family. It is a governed data center for structured, semi-structured, and unstructured information, with an AI intelligence layer over the connected context. Source systems remain authoritative; VynMesh stores metadata, policy, indexed/archive representations, lineage, evidence, and derived intelligence according to an explicit retention policy.

## Control plane

The control plane owns tenant/workspace boundaries, identity, connectors, schedules, policy, catalog metadata, audit evidence, approval workflows, model routing, and product configuration. It should be stateless where possible and backed by PostgreSQL with Redis or an equivalent event bus.

## Data plane

The data plane owns ingestion workers, schema discovery, archive jobs, Iceberg/Parquet representations, object storage, source cursors, quality checks, and restore workflows. Connectors must be isolated from the control plane and support pause, retry, backpressure, and resumable jobs.

## Intelligence plane

The intelligence plane handles SQL generation, document retrieval, embeddings, RAG, investigation graphs, evidence selection, confidence, and explanation. Models must be replaceable. Sensitive workloads should support local VynAI/Ollama execution and must log prompts, sources, decisions, and redactions according to policy.

## Data and intelligence plane

This plane normalizes structured records, semi-structured events, and unstructured documents into a searchable catalog and governed lakehouse representation. It handles embeddings, retrieval, SQL generation, document context, entity relationships, citations, confidence, and explanations. Operations signals from VynOps or OpenTelemetry are optional data sources, not the center of the product.

## Five-phase acceptance criteria

### Phase 1: Collect

- PostgreSQL, S3-compatible storage, and one document/event connector.
- Structured, semi-structured, and unstructured ingestion contracts.
- Resumable ingestion with source cursors, retries, and backpressure.
- Source inventory, connection status, and data volume visibility.

### Phase 2: Unify

- Schema, entity, relationship, and lineage mapping across source types.
- Canonical metadata model with searchable catalog and quality signals.
- Duplicate and identity resolution with explainable match decisions.
- Source-aware access policies carried into every downstream representation.

### Phase 3: Store

- Governed lakehouse representation using open formats such as Iceberg and Parquet.
- Full-text and vector indexes for unstructured and semi-structured content.
- Retention, partitioning, catalog, backup, restore, and lifecycle policies.
- Queryable lineage from every stored record back to its source.

### Phase 4: Understand

- Natural-language-to-SQL and RAG with source citations and permission filtering.
- Local model route through VynAI/Ollama and replaceable model providers.
- PII discovery, masking, answer redaction, confidence, and explanation.
- Optional operations sources from VynOps, OpenTelemetry, metrics, logs, and traces.

### Phase 5: Answer

- Relevant answers, summaries, comparisons, and relationship views grounded in evidence.
- OIDC/Entra ID, MFA/WebAuthn, RBAC/ABAC, retention, legal hold, DSAR, and SIEM.
- KMS/Vault integration first; HSM and air-gap packaging only after threat-model tests.
- Every answer exposes sources, confidence, lineage, and the boundary of what it can infer.

## Non-negotiable engineering standards

- Never claim a certification before independent evidence exists.
- Every connector must have contract tests and failure-mode tests.
- Every AI answer must expose sources, confidence, and the action boundary.
- Every privileged operation must be reversible where technically possible.
- Encrypt secrets, rotate keys, minimize data copied, and make retention visible.
- Measure p95 query latency, ingestion throughput, recovery time, and false-positive rate.
