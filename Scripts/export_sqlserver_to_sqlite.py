"""Create the public SQLite snapshot from the local CollegeData SQL Server DB.

The dashboard is read-only, so this script is the only migration path needed
for the initial static release and future data refreshes. It does not alter
SQL Server. A temporary SQLite file is checked before it replaces the current
public snapshot, preventing a partial export from being deployed.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable

import pyodbc


DEFAULT_CONNECTION_STRING = (
    "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;"
    "DATABASE=CollegeData;Trusted_Connection=yes;"
)
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "visualization" / "public" / "data.sqlite"
SCHEMA_PATH = Path(__file__).with_name("sqlite_schema.sql")
BATCH_SIZE = 2_000

# The order respects the two SQLite foreign keys. Keeping explicit table and
# column lists makes the export auditable and avoids copying incidental tables.
TABLES: dict[str, tuple[str, ...]] = {
    "college_info": ("College_Code", "College_Name"),
    "branch_info": ("Branch_Code", "Branch_Name", "Home_University", "Status"),
    "cap_cutoffs": (
        "Year",
        "CAP_Round",
        "College_Code",
        "Branch_Code",
        "Category",
        "Merit_Rank",
        "Percentile",
    ),
    "all_india_cutoffs": (
        "Year",
        "CAP_Round",
        "Choice_Code",
        "Merit_Rank",
        "Percentile",
        "Merit_Exam",
        "Type",
        "Seat_Type",
    ),
}


def parse_args() -> argparse.Namespace:
    """Read explicit, safe command-line options for a repeatable export."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--connection-string",
        default=os.getenv("SQL_CONNECTION_STRING", DEFAULT_CONNECTION_STRING),
        help="SQL Server connection string (defaults to SQL_CONNECTION_STRING or CollegeData).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="SQLite destination (default: visualization/public/data.sqlite).",
    )
    return parser.parse_args()


def normalize_value(value: Any) -> Any:
    """Convert pyodbc-only values into values accepted by sqlite3 bindings."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, memoryview):
        return bytes(value)
    return value


def quoted_columns(columns: Iterable[str], quote: str) -> str:
    """Quote fixed identifiers for the source or destination SQL dialect."""
    return ", ".join(f"{quote}{column}{quote}" for column in columns)


def source_count(connection: pyodbc.Connection, table: str) -> int:
    """Return a SQL Server row count for one known source table."""
    cursor = connection.cursor()
    cursor.execute(f"SELECT COUNT_BIG(*) FROM dbo.[{table}]")
    return int(cursor.fetchone()[0])


def copy_table(
    source: pyodbc.Connection,
    destination: sqlite3.Connection,
    table: str,
    columns: tuple[str, ...],
) -> int:
    """Copy one known table in batches and return its inserted row count."""
    # SQL Server uses bracketed identifiers. The fixed list in TABLES prevents
    # an external value from ever reaching this part of the query.
    source_cursor = source.cursor()
    source_columns = ", ".join(f"[{column}]" for column in columns)
    source_cursor.execute(f"SELECT {source_columns} FROM dbo.[{table}]")

    destination_columns = quoted_columns(columns, '"')
    placeholders = ", ".join("?" for _ in columns)
    insert_sql = f'INSERT INTO "{table}" ({destination_columns}) VALUES ({placeholders})'
    inserted = 0
    while rows := source_cursor.fetchmany(BATCH_SIZE):
        destination.executemany(
            insert_sql,
            [tuple(normalize_value(value) for value in row) for row in rows],
        )
        inserted += len(rows)
    return inserted


def sqlite_count(connection: sqlite3.Connection, table: str) -> int:
    """Return a SQLite row count for a fixed table name."""
    return int(connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])


def export_database(connection_string: str, output: Path) -> dict[str, int]:
    """Export, validate, and atomically publish the SQLite snapshot."""
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(f"{output.suffix}.tmp")
    if temporary.exists():
        temporary.unlink()

    source_counts: dict[str, int] = {}
    destination_counts: dict[str, int] = {}
    try:
        with pyodbc.connect(connection_string, timeout=10) as source:
            source_counts = {table: source_count(source, table) for table in TABLES}
            with sqlite3.connect(temporary) as destination:
                destination.execute("PRAGMA foreign_keys = ON")
                destination.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
                for table, columns in TABLES.items():
                    copied = copy_table(source, destination, table, columns)
                    destination_counts[table] = sqlite_count(destination, table)
                    if copied != source_counts[table] or destination_counts[table] != source_counts[table]:
                        raise RuntimeError(
                            f"{table}: copied {copied}, destination has {destination_counts[table]}, "
                            f"but SQL Server has {source_counts[table]}."
                        )

                integrity = [row[0] for row in destination.execute("PRAGMA integrity_check")]
                if integrity != ["ok"]:
                    raise RuntimeError(f"SQLite integrity check failed: {integrity}")
                destination.commit()
                # A single-file DELETE journal database is required because the
                # browser loads only this file and cannot read a companion WAL.
                destination.execute("PRAGMA journal_mode = DELETE")
                destination.execute("VACUUM")
            # sqlite3's context manager commits or rolls back, but it does not
            # close the Windows file handle. Close it before the atomic rename.
            destination.close()

        os.replace(temporary, output)
        return destination_counts
    except Exception:
        if temporary.exists():
            try:
                temporary.unlink()
            except OSError:
                # Preserve the original export error if an antivirus scanner or
                # another process has a short-lived handle on the temp file.
                pass
        raise


def main() -> None:
    """Run the export and print the validation evidence needed for review."""
    args = parse_args()
    counts = export_database(args.connection_string, args.output)
    print(f"Created {args.output.resolve()}")
    for table, count in counts.items():
        print(f"{table}: {count:,} rows")
    print("SQLite integrity check: ok")


if __name__ == "__main__":
    main()
