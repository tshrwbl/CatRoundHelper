# Static SQLite PWA Implementation Plan

## Goal

Publish CAP Compass as a public, read-only dashboard on GitHub Pages. The
browser downloads a verified SQLite snapshot and runs all dashboard queries
locally. The SQLite file is intentionally public and downloadable.

## Architecture

- **UI:** React and Vite.
- **Query engine:** `@sqlite.org/sqlite-wasm`, using an in-memory database.
- **Data file:** `visualization/public/data.sqlite`, generated from the local
  SQL Server database.
- **Offline support:** `vite-plugin-pwa` and Workbox precaching.
- **Hosting:** GitHub Pages at `/CatRoundHelper/`.

The browser fetches `data.sqlite` through the normal URL generated from
`import.meta.env.BASE_URL`. The service worker serves that request from its
precache after the first successful install. `db.js` then deserializes the
downloaded bytes into SQLite in memory and exposes the same five operations
that the old API provided: metadata, explorer query, college overview, trends,
and predictions.

Offline use begins only after the app and database have been downloaded once.
The browser may evict cached data under storage pressure, so the app must show
a clear loading/error state instead of promising permanent offline access.

## Scope Decisions

- The SQLite file is approved for public distribution and is a tracked release
  asset so that GitHub Actions can build the site.
- A one-time **SQL Server -> SQLite exporter** is the source of the initial
  snapshot and of future refreshes.
- Updating `pdfScrapper.py` or `pdfAllIndiaScrapper.py` to write SQLite is
  explicitly out of scope. They remain the existing data-ingestion tools.
- The Flask backend is kept during parity work and removed only after the
  static app has passed its verification checks.

## Implementation Steps

### 1. Create and validate the SQLite snapshot

1. Add `Scripts/sqlite_schema.sql` with SQLite-native types, foreign keys, and
   indexes for the dashboard query paths.
2. Add `Scripts/export_sqlserver_to_sqlite.py`. It reads the four known SQL
   Server tables in batches, creates a temporary SQLite file, converts Decimal
   values safely, checks source/destination row counts, runs
   `PRAGMA integrity_check`, then atomically replaces `data.sqlite`.
3. Run the exporter locally against `CollegeData` to create
   `visualization/public/data.sqlite`.
4. Record the source row counts and test representative CET and JEE results
   against the old Flask API before removing it.

### 2. Migrate the frontend query service

1. Install and pin `@sqlite.org/sqlite-wasm`.
2. Add `visualization/src/db.js` with a single asynchronous initialization
   promise, normal URL fetch, SQLite deserialization, and a read-only pragma.
3. Retain the old API response shapes so React components need only replace
   `requestJson('/api/...')` calls with named `db.js` functions.
4. Rewrite SQL Server syntax for SQLite; this is not a literal copy:
   - `OUTER APPLY TOP 1` becomes correlated scalar subqueries.
   - `TOP n` becomes `LIMIT n`.
   - `OFFSET ... FETCH` becomes `LIMIT ? OFFSET ?`.
   - `COUNT_BIG` becomes `COUNT(*)`.
   - `CONVERT(varchar, ...)` becomes `CAST(... AS TEXT)`.
5. Continue binding values as parameters and use fixed maps for sortable and
   filterable identifiers.

### 3. Add PWA support

1. Install and pin `vite-plugin-pwa`; `workbox-window` is unnecessary unless a
   custom update prompt is later added.
2. Configure Vite with `base: '/CatRoundHelper/'`, remove the Flask proxy, and
   exclude SQLite WASM from dependency prebundling.
3. Configure Workbox to precache JavaScript, CSS, HTML, WASM, icons, and
   `data.sqlite`. A database content change updates the Workbox revision even
   though the URL stays stable.
4. Use an update/reload notification. Existing tabs keep their current
   in-memory database until reload.

### 4. Deploy to GitHub Pages

1. Add a GitHub Actions workflow that runs from `visualization/`, uses
   `npm ci`, builds the production bundle, and deploys `visualization/dist`.
2. Configure the repository Pages source as **GitHub Actions**.
3. Confirm the deployed asset paths work below `/CatRoundHelper/`.

### 5. Verification and cleanup

1. Run exporter validation, `npm run build`, and a production preview.
2. Check that the production output contains the SQLite file, the WASM asset,
   and a service-worker precache entry for the database.
3. In a browser, test Explorer filters, pagination, sorting, College details,
   trends, predictions, first-load error handling, reload while offline, and a
   new-data update.
4. Remove `backend/` only after the SQLite query outputs match the old API for
   representative CET and JEE fixtures.

## Data Refresh Procedure

1. Update the local SQL Server data using the existing scraper workflow.
2. Run `python Scripts/export_sqlserver_to_sqlite.py`.
3. Review the exporter counts and integrity result.
4. Commit the regenerated `visualization/public/data.sqlite` with the source
   changes, then push. GitHub Actions deploys the revised static site.
