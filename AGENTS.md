# Repository Guidelines

## Project Structure

- `backend/server.py` contains the Flask API, SQL query construction, and CollegeData integration; dependencies are in `backend/requirements.txt`.
- `visualization/src/` contains the React UI (`App.jsx`, `App.css`, and `main.jsx`). Vite configuration and frontend scripts are in `visualization/`.
- `schema.sql`, `queries.sql`, and `helper.sql` document database structure and useful SQL. `Artifact/` stores source PDFs and CSV data used by the scrapers.
- `pdfScrapper.py` and `pdfAllIndiaScrapper.py` parse cutoff source files.

## Build, Test, and Development Commands

From `backend/`, install dependencies and start the API:

```powershell
python -m pip install -r requirements.txt
python server.py
```

From `visualization/`, install packages and start the Vite development server:

```powershell
npm install
npm run dev
```

Use `npm run build` to create a production bundle and `npm run preview` to serve it locally. The frontend proxies `/api` to Flask on port 5000. Set `SQL_CONNECTION_STRING` when the default local SQL Server connection is unsuitable.

## Coding Style & Naming

Use four spaces in Python and two spaces in JavaScript/CSS. Keep React components and Python functions focused; use `PascalCase` for React components, `camelCase` for JavaScript variables/functions, and `snake_case` for Python names. Preserve the existing straightforward JSX and CSS style, and keep SQL identifiers explicit and parameterized. Do not accept request-provided SQL column names without a whitelist.

## Testing Guidelines

No automated test framework is currently configured. At minimum, run `npm run build`, compile-check Python changes, and manually exercise Explorer filters, sorting, College data, trends, and API error paths against a working `CollegeData` database.

## Commit & Pull Request Guidelines

Existing history uses short, informal summaries such as `Added college page` and `Added FE & BE`. New commits should improve clarity with concise imperative messages, for example `Add CET and JEE cutoff sorting`. Pull requests should describe behavior changes, database/configuration assumptions, validation commands, and include screenshots for UI changes. Keep unrelated refactors out of the same change.

## Configuration & Data Safety

Do not commit credentials, local connection strings, generated `dist/` output, or scraped database files. Treat PDFs and SQL data as source inputs; validate parser changes against representative files from `Artifact/`.
