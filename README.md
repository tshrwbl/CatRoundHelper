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

## Explorer controls

- The table is paginated by the API. Use the footer to move between pages and
  choose 10, 25, 50, or 100 rows per page.
- Add advanced rules for category, university, status, branch, or college.
  Rules also support college and branch codes. Each rule explicitly includes
  or excludes matches, with `Contains`, `Is`, or `In list` matching. Lists can
  be picked from a multi-select dropdown or pasted as comma-separated text.
  Each rule after the first can be joined with `AND` or `OR`; filter templates
  are saved in the browser for later reuse.
- A trend chart displays both CET and JEE percentile histories for the selected
  college/branch/category.
- Click a sortable explorer column heading to reorder all matching records.
  Open **College** on any result for a category-wise branch overview, your
  percentile fit, the college's cutoff movement, and competitiveness charts.
