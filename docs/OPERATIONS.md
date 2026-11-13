# VynMesh operations

## Storage

VynMesh persists its catalog, workspaces, memberships, investigations, citations, and audit events in an embedded SQLite database at `data/vynmesh.db`, using Node's built-in `node:sqlite` module. No external database server is required to run the application. The schema and seed rows are created automatically on first start; see `src/lib/db.ts`.

This is appropriate for a single-node demo or pilot. Before a multi-instance production deployment, replace `src/lib/db.ts` with a networked database (for example PostgreSQL) behind the same function signatures, since SQLite does not support concurrent writers across processes or hosts.

## Data lake

Ingested data is written to a real two-zone lake on local disk under `data/lake/`:

- `data/lake/raw/<sourceId>/<timestamp>.json`: the untouched connector output for that ingestion run.
- `data/lake/curated/<sourceId>/<recordId>.json`: the normalized record plus its lineage.

The SQLite `catalog_records` table and its `catalog_fts` full-text index are the searchable metadata layer over these files, not a replacement for them. Before production scale, replace the local `data/lake` directory with S3-compatible object storage and partitioned Parquet/Iceberg tables.

## Connector boundary

`src/lib/connectors.ts` contains three connectors, one per data shape in the product promise:

- SQLite source connector (`readSqliteSource`): runs a real SQL query against a local `.db` file, representing the structured/database connector.
- JSON source connector (`readJsonSource`): reads a real JSON array file, representing semi-structured events.
- Document connector (`readDocumentSource`): reads real `.txt`/`.md` files from a directory, representing unstructured content.

All locators are resolved and validated to stay within `data/sources/`, preventing path traversal outside the sanctioned local sources root.

Connectors currently run inline inside the API request (`src/lib/ingestion.ts`). Before production scale, move ingestion to a worker queue with checkpoints, retries, schema-change detection, and dead-letter handling.

## Recovery

Back up `data/vynmesh.db` and `data/lake/` together; the catalog and the lake files it references must stay consistent. Because every catalog record stores `raw_locator`, `curated_locator`, and `lineage`, the curated zone and search index can be rebuilt by re-running ingestion against the raw zone. Never treat the catalog as the authoritative source; source systems and the raw lake zone remain authoritative.
