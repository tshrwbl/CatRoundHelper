"""Compare representative SQL Server data and queries with data.sqlite.

Run this after the exporter and before removing the Flask reference backend.
It verifies the raw table counts and a small deterministic set of CET/JEE query
shapes used by the dashboard without changing either database.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
from decimal import Decimal
from pathlib import Path
from typing import Any

import pyodbc

from export_sqlserver_to_sqlite import DEFAULT_CONNECTION_STRING, DEFAULT_OUTPUT, TABLES


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--connection-string",
        default=os.getenv("SQL_CONNECTION_STRING", DEFAULT_CONNECTION_STRING),
    )
    parser.add_argument("--database", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def normalized(value: Any) -> Any:
    """Make Decimal and float values comparable across the two drivers."""
    if isinstance(value, (Decimal, float)):
        return round(float(value), 7)
    return value


def rows(cursor: Any) -> list[tuple[Any, ...]]:
    return [tuple(normalized(value) for value in row) for row in cursor.fetchall()]


FIXTURES = {
    "college metadata": (
        "SELECT TOP 20 College_Code, College_Name FROM dbo.college_info ORDER BY College_Code",
        "SELECT College_Code, College_Name FROM college_info ORDER BY College_Code LIMIT 20",
    ),
    "2024 CET explorer base rows": (
        """
        SELECT TOP 20 cc.College_Code, cc.Branch_Code, cc.Category, cc.CAP_Round,
            cc.Percentile, cc.Merit_Rank
        FROM dbo.cap_cutoffs cc
        WHERE cc.Year = 2024
        ORDER BY cc.College_Code, cc.Branch_Code, cc.Category, cc.CAP_Round
        """,
        """
        SELECT College_Code, Branch_Code, Category, CAP_Round, Percentile, Merit_Rank
        FROM cap_cutoffs
        WHERE Year = 2024
        ORDER BY College_Code, Branch_Code, Category, CAP_Round
        LIMIT 20
        """,
    ),
    "2024 JEE aggregate rows": (
        """
        SELECT TOP 20 Choice_Code, CAP_Round, MAX(Percentile), MIN(Merit_Rank)
        FROM dbo.all_india_cutoffs
        WHERE Year = 2024
        GROUP BY Choice_Code, CAP_Round
        ORDER BY Choice_Code, CAP_Round
        """,
        """
        SELECT Choice_Code, CAP_Round, MAX(Percentile), MIN(Merit_Rank)
        FROM all_india_cutoffs
        WHERE Year = 2024
        GROUP BY Choice_Code, CAP_Round
        ORDER BY Choice_Code, CAP_Round
        LIMIT 20
        """,
    ),
}


def main() -> None:
    args = parse_args()
    if not args.database.is_file():
        raise SystemExit(f"SQLite snapshot not found: {args.database}")

    with pyodbc.connect(args.connection_string, timeout=10) as source, sqlite3.connect(args.database) as destination:
        integrity = [row[0] for row in destination.execute("PRAGMA integrity_check")]
        if integrity != ["ok"]:
            raise SystemExit(f"SQLite integrity check failed: {integrity}")

        for table in TABLES:
            source_cursor = source.cursor()
            source_cursor.execute(f"SELECT COUNT_BIG(*) FROM dbo.[{table}]")
            source_count = int(source_cursor.fetchone()[0])
            destination_count = int(destination.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])
            if source_count != destination_count:
                raise SystemExit(f"{table}: SQL Server has {source_count}, SQLite has {destination_count}")

        for name, (source_sql, destination_sql) in FIXTURES.items():
            source_cursor = source.cursor()
            source_cursor.execute(source_sql)
            source_rows = rows(source_cursor)
            destination_rows = rows(destination.execute(destination_sql))
            if source_rows != destination_rows:
                raise SystemExit(f"Fixture mismatch: {name}")
            print(f"Passed: {name} ({len(source_rows)} rows)")

    print("Snapshot parity checks passed.")


if __name__ == "__main__":
    main()
