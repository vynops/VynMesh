# VynMesh handoff

Last updated: 2026-09-08

## Product identity

VynMesh is a standalone product in the Vyn family, alongside VynOps, VynAI, VynDB, VynCost, VynCICD, and VynDC.

Positioning:

> Sovereign enterprise data intelligence and AIOps for organizations that need to connect, govern, understand, and act on data without losing control of it.

Tagline:

> Connect data. Understand operations. Act with control.

VynMesh is intended to sit above existing databases, documents, object storage, Kubernetes, observability, security, and AI systems. It should integrate with existing systems rather than claim to replace every market leader.

## Current repository

Project path: `D:\grid\vynmesh`

Framework: Next.js App Router, TypeScript, Tailwind CSS v4, Lucide React.

Local URL: `http://localhost:3090`

Primary routes: `/` (Dashboard), `/sources` (Data Sources), and `/ask` (Ask AI).

Start locally from PowerShell:

```powershell
cd D:\grid\vynmesh
npm run dev
```

Validate:

```powershell
cd D:\grid\vynmesh
npm run lint
npm run build
```

Do not confuse this project with `D:\grid\website`, which is the VynOps marketing website.

## What is implemented

- Responsive VynMesh command-center console at `/`.
- Sidebar workspace navigation for Overview, Data center, AI intelligence, Data flows, and Data governance.
- Each non-command-center navigation item renders a focused workspace view rather than duplicating the command center.
- Five-phase delivery roadmap visible in the product UI.
- Seeded operational metrics for governed data, connected sources, investigations, and policy posture.
- File-backed local control plane at `/api/mesh` for dashboard state, source registration, and investigations.
- Connect Source modal writes registered sources to `data/mesh-state.json`.
- Investigation submissions write activity and investigation records to the same store.
- The seeded catalog contains structured, semi-structured, and unstructured records.
- Local grounded search ranks catalog evidence and persists an answer plus source trail on each investigation.
- Local demo logout/login state and loading/error states.
- AI investigation input with an interactive queued-response state.
- Recent activity feed and mesh-signal banner.
- Responsive mobile navigation.
- Browser-audited desktop and mobile navigation, source registration, investigation creation, logout/re-entry, and focused feature views.
- Product README at `README.md`.
- Architecture baseline and phase acceptance criteria at `docs/ARCHITECTURE.md`.

The current UI is a locally functional data-intelligence slice with seeded catalog records, file-backed state, grounded retrieval, and evidence display. It does not yet claim to have production database connectors, external model calls, certifications, HSM integrations, or autonomous remediation.

## Five delivery phases

1. Collect: structured, semi-structured, and unstructured source ingestion.
2. Unify: schema, entity, relationship, and lineage mapping.
3. Store: governed lakehouse, catalog, indexes, retention, and restore.
4. Understand: permission-aware AI retrieval, SQL, RAG, citations, and explanations.
5. Answer: relevant, grounded intelligence with evidence and confidence.

## Architecture direction

- Control plane: identity, tenants, connectors, schedules, catalog metadata, policy, audit, approvals, model routing.
- Data plane: ingestion workers, schema discovery, resumable archives, Iceberg/Parquet, object storage, restore.
- Intelligence plane: SQL generation, document retrieval, embeddings, RAG, investigation graphs, citations, confidence.
- Operations plane: metrics, logs, traces, Kubernetes events, changes, cost, security findings, correlation, RCA, runbooks.

Full baseline: `docs/ARCHITECTURE.md`.

## Important engineering rules

- Do not claim FIPS, air-gap certification, post-quantum readiness, or other certifications before evidence exists.
- AI answers must expose sources, confidence, and action boundaries.
- Privileged or destructive actions require explicit policy and human approval by default.
- Connectors need contract tests, retry/backpressure behavior, and failure-mode tests.
- Keep source systems authoritative; VynMesh owns governed metadata, derived intelligence, and explicitly configured archives.
- No deployment or production changes are implied by local VynMesh work.

## Next recommended work

1. Add a typed domain model for workspaces, sources, investigations, policies, and actions.
2. Add an API route layer with mock adapters behind interfaces.
3. Add PostgreSQL and S3-compatible source contracts before implementing live connectors.
4. Add authentication and workspace-level authorization.
5. Add persistent activity and investigation state.
6. Add component-level tests for the command center and query interaction.
7. Define benchmark datasets and measurable p95 ingestion/query targets.

## Current state after reboot

The local dev server is not guaranteed to be running after reboot. Start it with `npm run dev` from `D:\grid\vynmesh`. Check `http://localhost:3090` before making changes. Read this file, `README.md`, and `docs/ARCHITECTURE.md` before continuing product work.
