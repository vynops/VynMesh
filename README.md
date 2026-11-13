<div align="center">

<img src="public/vynmesh-mark.svg" alt="VynMesh" width="72" />

# VynMesh

### Self-Hosted Data Intelligence Platform

**Connected Data · Evidence-Based Answers · Workspace Access Control**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Part of VynOps](https://img.shields.io/badge/Part_of-VynOps_Suite-6366f1)](https://vynops.com)

*Connect data. Understand operations. Act with control.*

[**Quick Start**](#quick-start) · [**Production Setup**](#production-setup) · [**Documentation**](#documentation) · [**VynOps Suite**](https://vynops.com)

</div>

---

## Overview

VynMesh brings **structured, semi-structured, and unstructured data** into one searchable workspace. Connect databases, storage, APIs, and documents; ingest records into a local catalog; then investigate questions with source evidence.

Source systems remain authoritative. VynMesh is the intelligence layer above them, not a replacement for your databases or document platforms.

The current implementation is a **single-node application** built with Next.js, embedded SQLite, and a local raw/curated data lake. It supports browser-based source management, grounded retrieval, optional model-generated answers, team administration, and audit records.

> **Deployment boundary:** Self-hosting controls where the application and its stored data run. Configuring an external AI provider sends retrieved evidence to that provider. Choose endpoints and access policies appropriate for your data.

---

## Contents

- [Features](#features)
- [Supported Sources](#supported-sources)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [First Login and Permissions](#first-login-and-permissions)
- [Production Setup](#production-setup)
- [Configuration](#configuration)
- [Using VynMesh](#using-vynmesh)
- [Storage and Backups](#storage-and-backups)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Current Limitations and Roadmap](#current-limitations-and-roadmap)
- [Documentation](#documentation)
- [Part of the VynOps Suite](#part-of-the-vynops-suite)
- [License](#license)

---

## Features

| Area | Available capabilities |
|---|---|
| **Dashboard** | Source and catalog counts, investigation history, and recent activity |
| **File ingestion** | Upload CSV, JSON, TXT, and Markdown files individually, in folders, or inside ZIP archives |
| **External sources** | Configure connector details, test connections, ingest data, and manage sources |
| **Searchable catalog** | SQLite full-text search over normalized records with source lineage |
| **Ask AI** | Retrieve relevant evidence, inspect citations, and optionally generate answers through an OpenAI-compatible endpoint |
| **Data handling** | Local raw/curated storage and PII masking for searchable content and answer evidence |
| **Team management** | Owner, admin, analyst, and viewer roles; block/unblock non-admin workspace memberships |
| **Account bootstrap** | Initial local accounts with mandatory password change before application access |
| **Workspace settings** | Configure AI endpoint, model, and API key through the browser |
| **Operational controls** | Audit events, ingestion retries and dead-letter records, request rate limiting, and security headers |

## Supported Sources

| Source | Input / configuration | Notes |
|---|---|---|
| **Uploaded files** | CSV, JSON, TXT, Markdown | No external service credentials required |
| **PostgreSQL** | Connection string and SQL query | Use a read-only database account |
| **S3-compatible storage** | Bucket, region, optional prefix/endpoint and credentials | Text, CSV, and JSON ingestion |
| **REST API** | URL, optional headers/method and JSON items path | Endpoint must return JSON |
| **SharePoint / OneDrive** | Microsoft Graph access token or app credentials, plus source identifiers | Requires appropriate provider permissions |
| **Snowflake** | Account, username, password, query, and optional warehouse/database/schema | Requires network access and query privileges |
| **Local SQLite / JSON / documents** | Local source locators | Foundational connector kinds; browser uploads are the simpler file workflow |

Adapters are implemented, but listing a connector is not a guarantee of compatibility with every provider configuration. Validate credentials, supported content, pagination behavior, data volume, and failure handling against your service before production use. PDF, Office document parsing, and recursive cloud crawling are not advertised capabilities.

## Architecture

```text
Files / Databases / Storage / APIs / Documents
                       |
                       v
              Connector + ingestion
                       |
              +--------+---------+
              |                  |
              v                  v
       Local data lake     Normalized catalog
       raw / curated       SQLite + full-text index
                                 |
                                 v
                       Workspace-scoped retrieval
                                 |
                       +---------+----------+
                       |                    |
                       v                    v
                Evidence results    Optional AI endpoint
                       |                    |
                       +---------+----------+
                                 v
                      Investigations + citations
```

The Next.js application serves the dashboard and API. SQLite stores users, memberships, sources, settings, catalog records, investigations, and audit events. Ingestion currently runs inside application requests rather than a separate worker service.

## Requirements

- **Node.js 22 or newer**, with npm.
- **Git** to clone the repository.
- A writable application directory and local disk for the database and ingested files.
- Network access to install dependencies and reach any configured connectors or AI endpoint.
- If native dependency installation cannot use a prebuilt binary, the platform's native build tools may be needed for `better-sqlite3`.

No separate database server, Docker installation, or AI subscription is required for the basic local workflow.

## Quick Start

```bash
git clone https://github.com/vynops/VynMesh.git
cd VynMesh
npm run setup
```

Open **http://localhost:3090**.

### What setup does

1. Checks that Node.js is version 22 or newer.
2. Creates `.env.local` and generates a connector-encryption key, or preserves an existing nonempty key.
3. Installs the locked dependencies with `npm ci`.
4. Starts the development server on `127.0.0.1:3090`.
5. On the first database-backed request, initializes the SQLite schema, workspace, and initial accounts.

**No manual `.env` editing is required for basic installation.** Setup runs in the foreground; stop it with `Ctrl+C`. External integrations still need their own credentials.

## First Login and Permissions

| Account | Email | Initial password | Role |
|---|---|---|---|
| **Mesh Owner** | `owner@vynmesh.local` | `changeme` | Owner |
| **Admin** | `admin@vynmesh.local` | `changeme` | Admin |

Each initial account must set a password of **8 to 128 characters** before receiving normal application access. Rotate **both** accounts before exposing an installation to other users. Later database initialization preserves changed passwords.

Existing installations with the legacy seeded Demo Analyst owner are migrated to Mesh Owner using the same account ID and workspace membership, with an initial password change required.

| Role | Intended access |
|---|---|
| **Owner** | Workspace administration, source management, investigations, and ownership management |
| **Admin** | Team/settings administration and source management; cannot assign or manage ownership |
| **Analyst** | Read workspace data and create investigations; cannot upload, sync, or administer sources, teams, or settings |
| **Viewer** | Read-only access to workspace data and existing investigations |

Admins and owners can block/unblock **analyst and viewer** memberships from **Team**. Blocking denies access to that workspace, including through existing sessions. Owner/admin targets cannot be blocked; unblock a member before promoting them to an administrative role.

## Production Setup

From the cloned application directory:

```bash
npm run setup:production
```

This creates or preserves `.env.production`, installs locked dependencies, builds the application, and starts the production server on **127.0.0.1:3090**. It does **not** configure HTTPS, a domain, firewall rules, a service account, or automatic restart after reboot.

### Before public access

1. Run the application as a dedicated, unprivileged user.
2. Keep the listener private while rotating both initial account passwords.
3. Configure an HTTPS reverse proxy to `127.0.0.1:3090`.
4. Configure a process manager such as PM2 or systemd.
5. Restrict host access, use least-privilege connector credentials, and test backup restoration.

Use the production build for access-controlled hosting. The development mesh API includes demo-auth behavior; never enable `VYNMESH_DEMO_AUTH=true` on a production service.

### Keep the process running with PM2

If PM2 is already installed, stop the foreground setup server with `Ctrl+C`, then run these commands **as the application user, from the application directory**:

```bash
pm2 start npm --name vynmesh -- run start -- --hostname 127.0.0.1
pm2 save
pm2 status
```

Configure PM2 startup integration separately for your operating system so the saved process returns after reboot. Do not start a second listener while the setup server is still using port 3090.

For subsequent code updates, back up persistent data, install dependencies, and complete a successful production build **before** restarting the running process.

## Configuration

| Setting | Where to configure | Required? |
|---|---|---|
| Connector-encryption key | Generated in `.env.local` or `.env.production` by setup | Automatic |
| AI endpoint, model, and API key | **Settings** in the application | Only for model-generated answers |
| External-source credentials | **Data Sources** connection details | Only for that source |
| OIDC identity-provider integration | Server environment and identity-provider registration | Optional operator setup |
| HTTPS, process supervision, backups | Host infrastructure | Required for a managed production service |

### AI answers

Without a configured endpoint and API key, Ask AI still returns matching evidence with a retrieval summary; it does not generate an LLM answer.

For model-generated answers, open **Settings**, choose an **OpenAI-compatible chat-completions endpoint**, enter its model ID and API key, test the connection, and save. The runtime sends retrieved evidence to that endpoint with a request to cite sources.

Provider presets do not imply protocol translation. A provider with a different native API requires an OpenAI-compatible gateway. Review answers and citations before acting on them.

For operator-managed configuration, `MODEL_ENDPOINT`, `MODEL_NAME`, and `MODEL_API_KEY` provide an environment fallback when no complete workspace AI configuration is saved.

### Secrets

Keep the generated `CONNECTOR_CONFIG_KEY` stable. It protects stored connector and AI credentials; replacing or losing it can make existing credentials unreadable. Environment files and application data are excluded from Git. Back up the key securely with the data, not in source control.

## Using VynMesh

1. **Sign in and change the initial password.**
2. Open **Data Sources** and upload supported files, or connect an external source.
3. Test an external connection, save it, and ingest/sync its records.
4. Open **Dashboard** to review collected data and activity.
5. Open **Ask AI**, ask a question, and inspect the returned source evidence.
6. Use **Team** for membership and access controls, and **Settings** for AI configuration.

| Route | Screen |
|---|---|
| `/` | Dashboard |
| `/sources` | Data Sources |
| `/ask` | Ask AI |
| `/team` | Team administration |
| `/settings` | Workspace settings |
| `/login` | Sign in |
| `/change-password` | Initial password rotation |

## Storage and Backups

| Location | Contents |
|---|---|
| `data/vynmesh.db` | SQLite application database |
| `data/sources/` | Local source files and uploaded content |
| `data/lake/raw/` | Connector output from ingestion runs |
| `data/lake/curated/` | Normalized records and lineage |
| `.env.local` / `.env.production` | Local configuration, including the encryption key |

Back up the **entire `data/` directory and the applicable environment file** securely. Stop writes for a consistent filesystem backup, or use a SQLite-aware backup procedure coordinated with lake/source files. Test restoration on a separate instance.

PII masking for catalog/search evidence does not remove sensitive values from raw source files or the raw lake. Apply filesystem permissions, backup encryption, retention procedures, and access controls to those copies.

## Development

| Command | Purpose |
|---|---|
| `npm run setup` | Prepare configuration, install dependencies, and start local development |
| `npm run dev` | Start development using existing configuration/dependencies |
| `npm run setup:production` | Prepare configuration, install, build, and start a private production listener |
| `npm run build` | Create the production build |
| `npm run start` | Start an already-built application on port 3090 |
| `npm test` | Run the Node.js test suite |
| `npm run lint` | Run ESLint |

### Project structure

```text
src/app/       Dashboard, feature screens, and API routes
src/lib/       Authentication, connectors, ingestion, catalog, and AI logic
scripts/       Installation bootstrap
tests/         Focused regression tests
docs/          Architecture and operational reference
public/        Static assets and branding
data/          Runtime storage (not committed)
```

## Troubleshooting

| Symptom | Check / action |
|---|---|
| Setup rejects the Node.js version | Install Node.js 22+ and rerun setup |
| Dependency installation fails | Read the npm error; check network access and native build-tool requirements |
| Port 3090 is already in use | Stop the known conflicting listener; do not start development and production servers on the same port |
| Password-change screen appears | Complete the required 8-128 character password change for that account |
| Workspace access denied | Sign in again; confirm membership, block state, and required password rotation |
| Team list is unavailable | Check authentication and owner/admin permissions; a failed request is not an empty workspace |
| Connector test or sync fails | Check credentials, network reachability, query permissions, and source configuration |
| Ask AI returns only a retrieval summary | Configure an endpoint and API key in Settings for model-generated answers |
| AI provider rejects a request | Confirm the full chat-completions URL, model ID, key, and OpenAI-compatible protocol |
| Stored secrets cannot be decrypted | Restore the original encryption key from the secured configuration backup |

## Current Limitations and Roadmap

**Implemented:** Single-node ingestion, local storage, full-text retrieval, evidence-backed investigations, optional model calls, workspace role checks, team blocking, and initial-password rotation.

**Not a completed enterprise platform:** Distributed workers, resumable ingestion with backpressure, a shared rate-limit store, a multi-node database, vector retrieval, Iceberg/Parquet lakehouse storage, advanced policy enforcement, and independently certified compliance remain outside the current baseline.

The product roadmap follows five phases:

1. **Collect** - connect structured, semi-structured, and unstructured sources.
2. **Unify** - develop schema, entity, relationship, and lineage mapping.
3. **Store** - evolve local representations into governed, open-format storage.
4. **Understand** - expand permission-aware retrieval and explainable analysis.
5. **Answer** - provide actionable intelligence with evidence and human oversight.

Architecture goals are not claims that every phase is complete. Validate connector contracts, retrieval quality, tenant boundaries, recovery, and security requirements before approving a production workload.

## Documentation

- [Architecture and phase acceptance criteria](docs/ARCHITECTURE.md)
- [Operational background and recovery model](docs/OPERATIONS.md)
- [Production readiness and remaining infrastructure requirements](docs/PRODUCTION_READINESS.md)

The architecture document includes target-state design; operational notes describe the foundational implementation. Use the current setup commands and runtime details above for installation.

## Part of the VynOps Suite

| Product | Purpose | Repo |
|---|---|---|
| **VynOps** | Kubernetes operations platform | [vynops/VynOps](https://github.com/vynops/VynOps) |
| **VynAI** | Ollama fleet manager and AI gateway | [vynops/VynAI](https://github.com/vynops/VynAI) |
| **VynCost** | Cloud cost visibility | [vynops/VynCost](https://github.com/vynops/VynCost) |
| **VynDB** | Database operations | [vynops/VynDB](https://github.com/vynops/VynDB) |
| **VynDC** | Data center management | [vynops/VynDC](https://github.com/vynops/VynDC) |
| **VynCICD** | CI/CD pipeline management | [vynops/VynCICD](https://github.com/vynops/VynCICD) |
| **VynMesh** | Data intelligence platform | [vynops/VynMesh](https://github.com/vynops/VynMesh) |
| **VynSAP** | SAP ERP management | [vynops/VynSAP](https://github.com/vynops/VynSAP) |

---

## License

MIT - see [LICENSE](LICENSE).
