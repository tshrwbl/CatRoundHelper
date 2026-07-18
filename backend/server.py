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
MAX_PREDICTION_RESULTS = 500
MAX_PAGE_SIZE = 100

# Frontend rule fields map to fixed SQL fragments.  Never accept a column name
# from the request directly: values can be parameterized, SQL identifiers cannot.
RULE_COLUMNS = {
    "category": "cc24.Category",
    "homeUniversity": "bi.Home_University",
    "status": "bi.Status",
    "branch": "bi.Branch_Name",
    "college": "ci.College_Name",
    "collegeCode": "ci.College_Code",
    "branchCode": "bi.Branch_Code",
}
# The college overview anchors ``cap_cutoffs`` with the alias ``cc`` rather
# than the explorer's ``cc24``.  Keep a separate whitelist so the same filter
# builder can be safely applied in either query without leaking an invalid SQL
# alias into the statement.
COLLEGE_RULE_COLUMNS = {
    "category": "cc.Category",
    "homeUniversity": "bi.Home_University",
    "status": "bi.Status",
    "branch": "bi.Branch_Name",
    "college": "ci.College_Name",
    "collegeCode": "ci.College_Code",
    "branchCode": "bi.Branch_Code",
}
SORT_COLUMNS = {
    "collegeName": "ci.College_Name", "branchName": "bi.Branch_Name", "category": "cc24.Category",
    "cet2024": "cc24.Percentile", "jee2024": "ai24.Percentile",
    "cetChange": "cc24.Percentile - cc22.Percentile",
}


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


def rule_values(value: Any) -> list[str]:
    """Accept a multi-select array or a comma-separated typed list."""
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def build_rule(
    rule: dict[str, Any], columns: dict[str, str] = RULE_COLUMNS
) -> tuple[str, list[Any]] | None:
    """Build one safe advanced-filter predicate from a whitelisted rule."""
    column = columns.get(str(rule.get("field", "")))
    # ``operator`` remains accepted for filters saved by the earlier UI.
    old_operator = rule.get("operator")
    matcher = rule.get("matcher") or {"equals": "is", "contains": "contains", "in": "in", "notIn": "in"}.get(old_operator)
    mode = rule.get("mode") or ("exclude" if old_operator == "notIn" else "include")
    values = list(dict.fromkeys(rule_values(rule.get("value")) + rule_values(rule.get("listValue"))))
    if not column or not values or matcher not in {"is", "contains", "in"} or mode not in {"include", "exclude"}:
        return None
    if matcher == "contains":
        comparison = "NOT LIKE" if mode == "exclude" else "LIKE"
        # The modal intentionally exposes one free-text value for Contains.
        return f"{column} {comparison} ?", [f"%{values[0]}%"]
    if matcher == "is":
        comparison = "<>" if mode == "exclude" else "="
        return f"{column} {comparison} ?", [values[0]]
    placeholders = ", ".join("?" for _ in values)
    comparison = "NOT IN" if mode == "exclude" else "IN"
    return f"{column} {comparison} ({placeholders})", values


def query_parts(filters: dict[str, Any]) -> tuple[str, list[Any], str]:
    """Build shared FROM/WHERE/ORDER fragments for explorer and predictor.

    The 2024 CAP record is the anchor.  Previous years are left joined so rows
    are still useful when a historical year was absent from the source PDFs.
    """
    conditions = ["cc24.Year = 2024"]
    params: list[Any] = []

    # Rules are combined left-to-right.  Every rule after the first can choose
    # AND or OR, enabling e.g. (category IN (...) OR branch contains AI).
    combined_rule: str | None = None
    rule_params: list[Any] = []
    for raw_rule in filters.get("rules", []):
        if not isinstance(raw_rule, dict):
            continue
        built = build_rule(raw_rule)
        if not built:
            continue
        predicate, values = built
        if combined_rule is None:
            combined_rule = predicate
        else:
            joiner = "OR" if raw_rule.get("join") == "OR" else "AND"
            combined_rule = f"({combined_rule} {joiner} {predicate})"
        rule_params.extend(values)
    if combined_rule:
        conditions.append(combined_rule)
        params.extend(rule_params)

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

    from_where = f"""
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
    """
    sort_column = SORT_COLUMNS.get(str(filters.get("sortBy")), cutoff_column)
    direction = "ASC" if str(filters.get("sortDirection", "")).upper() == "ASC" else "DESC"
    order_by = f"ORDER BY {sort_column} {direction}, ci.College_Name, bi.Branch_Name"
    return from_where, params, order_by


def select_columns() -> str:
    """The result shape shared by explorer pages and predictor matches."""
    return """
            ci.College_Code AS collegeCode, ci.College_Name AS collegeName,
            bi.Branch_Code AS branchCode, bi.Branch_Name AS branchName,
            bi.Home_University AS homeUniversity, bi.Status AS status,
            cc24.Category AS category, cc24.CAP_Round AS capRound,
            cc24.Percentile AS cet2024, cc24.Merit_Rank AS cetRank2024,
            cc23.Percentile AS cet2023, cc23.Merit_Rank AS cetRank2023,
            cc22.Percentile AS cet2022, cc22.Merit_Rank AS cetRank2022,
            ai24.Percentile AS jee2024, ai24.Merit_Rank AS jeeRank2024,
            ai23.Percentile AS jee2023, ai23.Merit_Rank AS jeeRank2023,
            ai22.Percentile AS jee2022, ai22.Merit_Rank AS jeeRank2022
    """


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
        "branchCodes": scalar_list("SELECT DISTINCT Branch_Code FROM branch_info ORDER BY Branch_Code"),
        "colleges": scalar_list("SELECT DISTINCT College_Name FROM college_info WHERE College_Name IS NOT NULL ORDER BY College_Name"),
        "collegeCodes": scalar_list("SELECT CONVERT(varchar(20), College_Code) FROM college_info ORDER BY College_Code"),
        "statuses": scalar_list("SELECT DISTINCT Status FROM branch_info WHERE Status IS NOT NULL ORDER BY Status"),
    })


@app.post("/api/query")
def query():
    """Return one numbered page plus the count of every matching cutoff row."""
    filters = request.get_json(silent=True) or {}
    try:
        page = max(1, int(filters.get("page", 1)))
        page_size = min(MAX_PAGE_SIZE, max(10, int(filters.get("pageSize", 25))))
    except (TypeError, ValueError):
        return jsonify({"error": "page and pageSize must be whole numbers."}), 400
    from_where, params, order_by = query_parts(filters)
    offset = (page - 1) * page_size
    with database_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(f"SELECT COUNT_BIG(*) AS total {from_where}", params)
        total = int(cursor.fetchone()[0])
        cursor.execute(
            f"SELECT {select_columns()} {from_where} {order_by} "
            "OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
            [*params, offset, page_size],
        )
        return jsonify({"rows": rows_as_dicts(cursor), "total": total, "page": page, "pageSize": page_size})


@app.post("/api/college/<int:college_code>")
def college_details(college_code: int):
    """Return a college's category-wise branch cutoffs and percentile fit data."""
    payload = request.get_json(silent=True) or {}
    apply_active_filters = bool(payload.get("applyActiveFilters", True))
    percentile = payload.get("percentile")
    try:
        percentile = float(percentile) if percentile is not None else None
    except (TypeError, ValueError):
        return jsonify({"error": "Percentile must be a number."}), 400
    exam = "JEE" if str(payload.get("exam", "CET")).upper() == "JEE" else "CET"

    # Only category, branch name, and branch code remain meaningful once a
    # college is selected. Other active explorer filters must not hide it.
    allowed = {"category", "branch", "branchCode"}
    combined: str | None = None
    rule_params: list[Any] = []
    if apply_active_filters:
        for raw_rule in payload.get("rules", []):
            if not isinstance(raw_rule, dict) or raw_rule.get("field") not in allowed:
                continue
            built = build_rule(raw_rule, COLLEGE_RULE_COLUMNS)
            if not built:
                continue
            predicate, values = built
            if combined is None:
                combined = predicate
            else:
                joiner = "OR" if raw_rule.get("join") == "OR" else "AND"
                combined = f"({combined} {joiner} {predicate})"
            rule_params.extend(values)

    conditions = ["cc.College_Code = ?", "cc.Year BETWEEN 2022 AND 2024"]
    params: list[Any] = [college_code]
    if combined:
        conditions.append(combined)
        params.extend(rule_params)
    sql = f"""
        SELECT ci.College_Code AS collegeCode, ci.College_Name AS collegeName,
            cc.Year AS year, cc.CAP_Round AS capRound, bi.Branch_Code AS branchCode,
            bi.Branch_Name AS branchName, bi.Status AS branchStatus,
            bi.Home_University AS homeUniversity, cc.Category AS category,
            cc.Percentile AS cetPercentile, cc.Merit_Rank AS cetRank,
            ai.Percentile AS jeePercentile, ai.Merit_Rank AS jeeRank
        FROM cap_cutoffs cc
        INNER JOIN college_info ci ON ci.College_Code = cc.College_Code
        INNER JOIN branch_info bi ON bi.Branch_Code = cc.Branch_Code
        OUTER APPLY (SELECT TOP 1 Percentile, Merit_Rank FROM all_india_cutoffs
            WHERE Choice_Code = cc.Branch_Code AND CAP_Round = cc.CAP_Round AND Year = cc.Year
            ORDER BY Percentile DESC, Merit_Rank) ai
        WHERE {' AND '.join(conditions)}
        ORDER BY bi.Branch_Name, cc.Category, cc.Year DESC
    """
    with database_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(sql, params)
        rows = rows_as_dicts(cursor)
    if not rows:
        return jsonify({"error": "No cutoff data found for this college and active filters."}), 404
    cutoff_key = "jeePercentile" if exam == "JEE" else "cetPercentile"
    for row in rows:
        cutoff = row.get(cutoff_key)
        row["fitDifference"] = round(percentile - cutoff, 2) if percentile is not None and cutoff is not None else None
    return jsonify({"college": {"code": rows[0]["collegeCode"], "name": rows[0]["collegeName"]}, "exam": exam, "percentile": percentile, "rows": rows})


@app.get("/api/trends")
def trends():
    """Return both CET and JEE cutoff histories for one college branch."""
    college_code = request.args.get("collegeCode", type=int)
    branch_code = request.args.get("branchCode", type=str)
    category = request.args.get("category", default="GOPENS", type=str)
    cap_round = request.args.get("capRound", type=int)
    if not college_code or not branch_code or not cap_round:
        return jsonify({"error": "collegeCode, branchCode and capRound are required."}), 400

    cet_sql = """
        SELECT Year AS year, Percentile AS percentile, Merit_Rank AS meritRank
        FROM cap_cutoffs WHERE College_Code = ? AND Branch_Code = ? AND Category = ? AND CAP_Round = ?
        ORDER BY Year
    """
    jee_sql = """
        SELECT Year AS year, MAX(Percentile) AS percentile, MIN(Merit_Rank) AS meritRank
        FROM all_india_cutoffs WHERE Choice_Code = ? AND CAP_Round = ? GROUP BY Year ORDER BY Year
    """
    with database_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(cet_sql, [college_code, branch_code, category, cap_round])
        cet = rows_as_dicts(cursor)
        cursor.execute(jee_sql, [branch_code, cap_round])
        return jsonify({"cet": cet, "jee": rows_as_dicts(cursor)})


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
    from_where, params, order_by = query_parts(filters)
    with database_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(f"SELECT TOP {MAX_PREDICTION_RESULTS} {select_columns()} {from_where} {order_by}", params)
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
