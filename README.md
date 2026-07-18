# CAP Compass

CAP Compass is a public, offline-capable explorer for Maharashtra engineering
CAP cutoffs from 2022–2024. It is a static React application: the browser
downloads a read-only SQLite snapshot and runs filtering, trends, college
details, and predictions locally. The snapshot is intentionally public because
GitHub Pages serves it as a normal static file.

## Local setup

The one-time exporter reads the local `CollegeData` SQL Server database. It
uses the same `SQL_CONNECTION_STRING` environment variable as the former
Flask API, falling back to a local trusted connection.

```powershell
python -m pip install -r backend/requirements.txt
python Scripts/export_sqlserver_to_sqlite.py

cd visualization
npm ci
npm run dev
```

Open the Vite address printed by the terminal. The database must be exported
before `npm run build`; the build deliberately fails if `public/data.sqlite` is
missing or empty.

## Build and preview

```powershell
cd visualization
npm run build
npm run preview
```

The production build includes `data.sqlite`, SQLite WebAssembly, and a Workbox
service worker. After one successful online visit, refresh the app in offline
mode to test the cached dashboard. A first-ever visit still needs a network
connection to download the app and database.

## Refreshing public data

1. Update the local SQL Server data with the existing PDF scraper workflow.
2. Run `python Scripts/export_sqlserver_to_sqlite.py`.
3. Review the printed row counts and `SQLite integrity check: ok` result.
4. Run `cd visualization; npm run build`.
5. Commit the regenerated `visualization/public/data.sqlite` with the related
   source changes and push to `main`.

The exporter writes a temporary file, verifies every source and destination
table count, checks SQLite integrity, then atomically replaces the public
snapshot. It does not modify SQL Server.

## GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. In GitHub,
select **Settings → Pages → Build and deployment → GitHub Actions**. A push to
`main` then builds `visualization/` and deploys `visualization/dist` to:

`https://tshrwbl.github.io/CatRoundHelper/`

The Vite base path is intentionally `/CatRoundHelper/`; changing the repository
name also requires changing `visualization/vite.config.js`.

## Transitional backend

`backend/server.py` remains temporarily as a parity reference. The shipped
frontend does not call it. Remove it only after comparing representative CET
and JEE results with the SQLite dashboard.
