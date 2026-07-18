# Repository Guidelines

## Project Structure

- `backend/server.py` is a temporary Flask/SQL Server parity reference; dependencies are in `backend/requirements.txt`.
- `visualization/src/` contains the React UI, browser SQLite service (`db.js`), and PWA registration. Vite configuration and frontend scripts are in `visualization/`.
- `Scripts/sqlite_schema.sql` and `Scripts/export_sqlserver_to_sqlite.py` create the public dashboard snapshot. `schema.sql`, `queries.sql`, and `helper.sql` document the source database. `Artifact/` stores source PDFs and CSV data used by the scrapers.
- `pdfScrapper.py` and `pdfAllIndiaScrapper.py` parse cutoff source files.

## Build, Test, and Development Commands

Export the local SQL Server data before running or building the frontend:

```powershell
python -m pip install -r backend/requirements.txt
python Scripts/export_sqlserver_to_sqlite.py
```

From `visualization/`, install packages and start the Vite development server:

```powershell
npm ci
npm run dev
```

Use `npm run build` to create a production bundle and `npm run preview` to serve it locally. The frontend queries its in-memory SQLite snapshot and does not proxy `/api`. Set `SQL_CONNECTION_STRING` when the default local SQL Server connection is unsuitable.

## Coding Style & Naming

Use four spaces in Python and two spaces in JavaScript/CSS. Keep React components and Python functions focused; use `PascalCase` for React components, `camelCase` for JavaScript variables/functions, and `snake_case` for Python names. Preserve the existing straightforward JSX and CSS style, and keep SQL identifiers explicit and parameterized. Do not accept request-provided SQL column names without a whitelist.

## Testing Guidelines

No automated test framework is currently configured. At minimum, run the SQLite exporter, `npm run build`, compile-check Python changes, and manually exercise Explorer filters, sorting, College data, trends, predictions, update handling, and offline reloads.

## Commit & Pull Request Guidelines

Existing history uses short, informal summaries such as `Added college page` and `Added FE & BE`. New commits should improve clarity with concise imperative messages, for example `Add CET and JEE cutoff sorting`. Pull requests should describe behavior changes, database/configuration assumptions, validation commands, and include screenshots for UI changes. Keep unrelated refactors out of the same change.

## Configuration & Data Safety

Do not commit credentials, local connection strings, or generated `dist/` output. `visualization/public/data.sqlite` is the intentional public GitHub Pages release asset; validate its exporter row counts and integrity check before committing it. Treat PDFs and SQL data as source inputs; validate parser changes against representative files from `Artifact/`.
