"""Flask API for exploring Maharashtra engineering CAP cutoff data.

Run locally with ``python server.py`` after installing requirements.  The
connection string can be overridden with SQL_CONNECTION_STRING; by default it
uses the existing local CollegeData SQL Server database.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from decimal import Decimal
from typing import Any, Iterator

import pyodbc
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

SQL_CONNECTION_STRING = os.getenv(
    "SQL_CONNECTION_STRING",
    "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;"
    "DATABASE=CollegeData;Trusted_Connection=yes;",
)
MAX_RESULTS = 500


@contextmanager
def database_connection() -> Iterator[pyodbc.Connection]:
    """Open one short-lived database connection per request."""
    connection = pyodbc.connect(SQL_CONNECTION_STRING, timeout=5)
    try:
        yield connection
    finally:
        connection.close()


def rows_as_dicts(cursor: pyodbc.Cursor) -> list[dict[str, Any]]:
    """Convert SQL rows to JSON-safe dictionaries using returned column names."""
    columns = [column[0] for column in cursor.description]
    records: list[dict[str, Any]] = []
    for row in cursor.fetchall():
        record = dict(zip(columns, row))
        for key, value in record.items():
            if isinstance(value, Decimal):
                record[key] = float(value)
        records.append(record)
    return records


def scalar_list(sql: str) -> list[str]:
    with database_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(sql)
        return [str(row[0]) for row in cursor.fetchall() if row[0] is not None]


def query_base(filters: dict[str, Any], limit: int = MAX_RESULTS) -> tuple[str, list[Any]]:
    """Build the shared, parameterized 2024 cutoff query used by query/predict.

    The 2024 CAP record is the anchor.  Previous years are left joined so rows
    are still useful when a historical year was absent from the source PDFs.
    """
    conditions = ["cc24.Year = 2024"]
    params: list[Any] = []

    category = filters.get("category")
    if category:
        conditions.append("cc24.Category = ?")
        params.append(category)
    home_university = filters.get("homeUniversity")
    if home_university:
        conditions.append("bi.Home_University = ?")
        params.append(home_university)
    status = filters.get("status")
    if status:
        conditions.append("bi.Status = ?")
        params.append(status)
    branch_search = str(filters.get("branchSearch", "")).strip()
    if branch_search:
        conditions.append("bi.Branch_Name LIKE ?")
        params.append(f"%{branch_search}%")
    college_search = str(filters.get("collegeSearch", "")).strip()
    if college_search:
        conditions.append("ci.College_Name LIKE ?")
        params.append(f"%{college_search}%")

    exam = filters.get("exam", "CET")
    cutoff_column = "ai24.Percentile" if exam == "JEE" else "cc24.Percentile"
    minimum = filters.get("minPercentile")
    maximum = filters.get("maxPercentile")
    if minimum is not None:
        conditions.append(f"{cutoff_column} >= ?")
        params.append(float(minimum))
    if maximum is not None:
        conditions.append(f"{cutoff_column} <= ?")
        params.append(float(maximum))

    sql = f"""
        SELECT TOP {limit}
            ci.College_Code AS collegeCode, ci.College_Name AS collegeName,
            bi.Branch_Code AS branchCode, bi.Branch_Name AS branchName,
            bi.Home_University AS homeUniversity, bi.Status AS status,
            cc24.Category AS category,
            cc24.Percentile AS cet2024, cc24.Merit_Rank AS cetRank2024,
            cc23.Percentile AS cet2023, cc23.Merit_Rank AS cetRank2023,
            cc22.Percentile AS cet2022, cc22.Merit_Rank AS cetRank2022,
            ai24.Percentile AS jee2024, ai24.Merit_Rank AS jeeRank2024,
            ai23.Percentile AS jee2023, ai23.Merit_Rank AS jeeRank2023,
            ai22.Percentile AS jee2022, ai22.Merit_Rank AS jeeRank2022
        FROM cap_cutoffs cc24
        INNER JOIN college_info ci ON ci.College_Code = cc24.College_Code
        INNER JOIN branch_info bi ON bi.Branch_Code = cc24.Branch_Code
        LEFT JOIN cap_cutoffs cc23 ON cc23.College_Code = cc24.College_Code
            AND cc23.Branch_Code = cc24.Branch_Code AND cc23.Category = cc24.Category
            AND cc23.CAP_Round = cc24.CAP_Round AND cc23.Year = 2023
        LEFT JOIN cap_cutoffs cc22 ON cc22.College_Code = cc24.College_Code
            AND cc22.Branch_Code = cc24.Branch_Code AND cc22.Category = cc24.Category
            AND cc22.CAP_Round = cc24.CAP_Round AND cc22.Year = 2022
        -- A choice can have several All India seat rows. Selecting one closing
        -- cutoff prevents those rows from duplicating a college/branch result.
        OUTER APPLY (SELECT TOP 1 Percentile, Merit_Rank FROM all_india_cutoffs
            WHERE Choice_Code = bi.Branch_Code AND CAP_Round = cc24.CAP_Round AND Year = 2024
            ORDER BY Percentile DESC, Merit_Rank) ai24
        OUTER APPLY (SELECT TOP 1 Percentile, Merit_Rank FROM all_india_cutoffs
            WHERE Choice_Code = bi.Branch_Code AND CAP_Round = cc24.CAP_Round AND Year = 2023
            ORDER BY Percentile DESC, Merit_Rank) ai23
        OUTER APPLY (SELECT TOP 1 Percentile, Merit_Rank FROM all_india_cutoffs
            WHERE Choice_Code = bi.Branch_Code AND CAP_Round = cc24.CAP_Round AND Year = 2022
            ORDER BY Percentile DESC, Merit_Rank) ai22
        WHERE {' AND '.join(conditions)}
        ORDER BY {cutoff_column} DESC, ci.College_Name, bi.Branch_Name
    """
    return sql, params


@app.errorhandler(pyodbc.Error)
def handle_database_error(error: pyodbc.Error):
    app.logger.exception("Database request failed")
    return jsonify({"error": "Could not query CollegeData.", "detail": str(error)}), 503


@app.get("/api/metadata")
def metadata():
    """Return values needed to populate frontend filters."""
    return jsonify({
        "categories": scalar_list("SELECT DISTINCT Category FROM cap_cutoffs ORDER BY Category"),
        "homeUniversities": scalar_list("SELECT DISTINCT Home_University FROM branch_info WHERE Home_University IS NOT NULL ORDER BY Home_University"),
        "branches": scalar_list("SELECT DISTINCT Branch_Name FROM branch_info WHERE Branch_Name IS NOT NULL ORDER BY Branch_Name"),
        "statuses": scalar_list("SELECT DISTINCT Status FROM branch_info WHERE Status IS NOT NULL ORDER BY Status"),
    })


@app.post("/api/query")
def query():
    """Return cutoff rows that match the supplied explorer filters."""
    filters = request.get_json(silent=True) or {}
    sql, params = query_base(filters)
    with database_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(sql, params)
        return jsonify({"rows": rows_as_dicts(cursor), "limit": MAX_RESULTS})


@app.get("/api/trends")
def trends():
    """Return three historical values for a selected college/branch/category."""
    college_code = request.args.get("collegeCode", type=int)
    branch_code = request.args.get("branchCode", type=str)
    category = request.args.get("category", default="GOPENS", type=str)
    exam = request.args.get("exam", default="CET", type=str).upper()
    if not college_code or not branch_code or exam not in {"CET", "JEE"}:
        return jsonify({"error": "collegeCode, branchCode and exam (CET or JEE) are required."}), 400

    if exam == "CET":
        sql = """
            SELECT Year AS year, Percentile AS percentile, Merit_Rank AS meritRank
            FROM cap_cutoffs WHERE College_Code = ? AND Branch_Code = ? AND Category = ?
            ORDER BY Year
        """
        params = [college_code, branch_code, category]
    else:
        sql = """
            SELECT Year AS year, MAX(Percentile) AS percentile, MIN(Merit_Rank) AS meritRank
            FROM all_india_cutoffs WHERE Choice_Code = ? GROUP BY Year ORDER BY Year
        """
        params = [branch_code]
    with database_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(sql, params)
        return jsonify({"exam": exam, "points": rows_as_dicts(cursor)})


@app.post("/api/predict")
def predict():
    """Recommend options from the 2024 cutoff based on one exam percentile."""
    profile = request.get_json(silent=True) or {}
    exam = str(profile.get("exam", "CET")).upper()
    percentile = profile.get("percentile")
    if exam not in {"CET", "JEE"} or percentile is None:
        return jsonify({"error": "A CET/JEE exam and percentile are required."}), 400
    try:
        percentile = float(percentile)
    except (TypeError, ValueError):
        return jsonify({"error": "Percentile must be a number."}), 400
    if not 0 <= percentile <= 100:
        return jsonify({"error": "Percentile must be between 0 and 100."}), 400

    filters = {**profile, "exam": exam, "minPercentile": percentile - 10, "maxPercentile": percentile + 5}
    sql, params = query_base(filters)
    with database_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(sql, params)
        rows = rows_as_dicts(cursor)

    cutoff_key = "jee2024" if exam == "JEE" else "cet2024"
    groups = {"safe": [], "target": [], "reach": []}
    for row in rows:
        cutoff = row.get(cutoff_key)
        if cutoff is None:
            continue
        difference = percentile - cutoff
        row["difference"] = round(difference, 2)
        if difference > 2:
            groups["safe"].append(row)
        elif -1.5 <= difference < 0:
            # A cutoff just above the user's score is a reach option.  This is
            # checked before target so each recommendation appears once.
            groups["reach"].append(row)
        elif difference >= -2:
            groups["target"].append(row)
    return jsonify({"exam": exam, "percentile": percentile, "groups": groups})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
