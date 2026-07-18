# Implementation Plan: Engineering Cutoff Visualization & Predictor

Create a React-based web application with a Python Flask backend to visualize, analyze, and query Maharashtra engineering admission cutoffs (MHT-CET & JEE) across 2022, 2023, and 2024.

---

## User Review Required

> [!IMPORTANT]
> The app requires a local MS SQL Server instance named `CollegeData` running on `localhost` (Windows Trusted Connection). The backend uses `pyodbc` with Windows authentication, which is already functional on your machine.

---

## Proposed Changes

We will organize the codebase into two main directories:
1. `backend/` - A Python Flask API server that connects to SQL Server and serves cutoff data.
2. `visualization/` - A Vite React frontend with custom styled Vanilla CSS.

---

### Backend Service

We will create a Flask API that handles CORS, queries SQL Server using `pyodbc`, and exposes clean endpoints.

#### [NEW] [server.py](file:///c:/Data/Repos_Sep2020/Local_git_repo/CatRoundHelper/backend/server.py)
This script will expose the following REST endpoints:
- `GET /api/metadata`: Returns options for filter dropdowns (Categories, Home Universities, Branches, College Statuses).
- `POST /api/query`: Returns filtered cutoff data using custom filters sent from the frontend.
- `GET /api/trends`: Returns historical CET/JEE percentile trends for a specific college and branch.
- `POST /api/predict`: Runs a predictive query recommending college branches based on user CET/JEE percentile inputs.

---

### Frontend Service

We will initialize a Vite React application in `visualization/` styled with modern, premium Vanilla CSS, utilizing `recharts` for visualization and `lucide-react` for icons.

#### [NEW] [visualization/src/App.jsx](file:///c:/Data/Repos_Sep2020/Local_git_repo/CatRoundHelper/visualization/src/App.jsx)
The main layout of the application containing:
- Sidebar with filters (CET/JEE percentile range slider, category select, branch search, university select, etc.).
- Main panels switched via tab navigation:
  - **Explorer Tab**: A interactive table showing cutoff lists, rank comparisons, and change statistics.
  - **Trends Tab**: Graphical line charts showing the change in cutoffs (2022 -> 2023 -> 2024) for selected college branches.
  - **Predictor Tab**: User profile builder ("What-if" calculator) displaying matched colleges grouped by likelihood: "Safe" (Percentile < user's by > 2%), "Target" (Within ±2%), and "Reach" (Percentile > user's by up to 1.5%).

#### [NEW] [visualization/src/App.css](file:///c:/Data/Repos_Sep2020/Local_git_repo/CatRoundHelper/visualization/src/App.css)
Custom CSS styling containing:
- Color palette based on slate, indigo, violet, and deep navy with translucent glassmorphic components.
- Smooth scale-up and fade-in animations on hover and mount.
- A fully responsive layout adjusting between flex and column grids.

---

## Verification Plan

### Automated/Local Tests
- Start Flask backend on port `5000` and verify API outputs via `curl` or browser.
- Start Vite frontend on port `5173` and check console for error-free integration.

### Manual Verification
- Test all filters (Categories, branches, percentiles) and confirm query updates.
- Test visual animations, responsive resizing, and Chart transitions.
- Validate prediction engine lists against manual SQL queries for typical CET percentiles (e.g. 90%).
