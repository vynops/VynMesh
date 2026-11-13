# VynMesh

VynMesh is a sovereign enterprise data intelligence product. It collects structured, semi-structured, and unstructured data into one governed data center, then places an explainable AI layer over that connected context.

## Product promise

**Connect data. Understand operations. Act with control.**

VynMesh is designed to sit above databases, object storage, documents, events, logs, and knowledge systems. It is not a replacement for every source system; it is the governed center that makes those sources searchable, related, and useful.

## Five delivery phases

1. **Collect** - connect structured, semi-structured, and unstructured sources.
2. **Unify** - map schemas, entities, relationships, and source lineage.
3. **Store** - place governed representations in a lakehouse/catalog layer.
4. **Understand** - ground AI retrieval and analysis in permission-aware context.
5. **Answer** - return relevant, explainable intelligence with evidence.

## Product principles

- Sovereign by deployment, not only by marketing.
- Open formats and replaceable components.
- AI recommendations are explainable, traceable, and approval-aware.
- Existing systems remain valuable; VynMesh makes them work together.
- Every sensitive action produces evidence.

## Current workspace

This repository contains the VynMesh console and its local ingestion foundation: file uploads, database and external-source connector adapters, a raw/curated data lake, searchable catalog, grounded AI investigations, workspace checks, and audit records. External connectors still require their provider credentials and live contract testing before production use.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3090`.

The main product routes are:

- `/` - Dashboard
- `/sources` - Data Sources
- `/ask` - Ask AI

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the implementation boundary and phase acceptance criteria.
