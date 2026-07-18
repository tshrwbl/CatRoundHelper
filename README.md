# CAP Compass

A local explorer for Maharashtra engineering CAP cutoffs from 2022–2024. It
combines a Flask/SQL Server API with a Vite React interface for filtering,
historical trends, and percentile-based recommendations.

## Run locally

1. Ensure the local SQL Server database is named `CollegeData` and has the
   tables in `schema.sql` (plus `migration.sql` when applicable).
2. Install and run the API:

   ```powershell
   cd backend
   python -m pip install -r requirements.txt
   python server.py
   ```

3. In a second terminal, start the interface:

   ```powershell
   cd visualization
   npm install
   npm run dev
   ```

Open `http://localhost:5173`. Vite forwards `/api` requests to Flask on port
5000. To use a different SQL connection, set `SQL_CONNECTION_STRING` before
starting `backend/server.py`.
