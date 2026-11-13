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

## Install and run

```bash
git clone https://github.com/vynops/VynMesh.git
cd VynMesh
npm run setup
```

Setup requires Git and Node.js 22 or newer. It installs dependencies, creates a private local configuration file, and starts the app at `http://localhost:3090`. No `.env` editing is required.

Sign in as `admin@vynmesh.local` with the initial password `changeme`. VynMesh requires you to choose a new password of at least 12 characters before continuing.

For a production build, run `npm run setup:production`. It installs dependencies, builds the app, and starts it bound to `127.0.0.1:3090`. Keep it private until the initial password is changed. Public production access still requires an operator-configured HTTPS reverse proxy and process manager.

The main product routes are:

- `/` - Dashboard
- `/sources` - Data Sources
- `/ask` - Ask AI

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the implementation boundary and phase acceptance criteria.
