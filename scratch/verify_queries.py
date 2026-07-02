import pyodbc

SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

with open(r"c:\Data\Repos_Sep2020\Local_git_repo\CatRoundHelper\queries.sql", "r") as f:
    sql = f.read()

try:
    conn = pyodbc.connect(SQL_CONN_STR)
    cursor = conn.cursor()
    cursor.execute(sql)
    rows = cursor.fetchall()
    print(f"Successfully executed query in queries.sql! Returned {len(rows)} rows.")
    print("Sample row output:")
    for col_desc in cursor.description:
        print(f"- {col_desc[0]}")
    print("\nTop row sample values:", rows[0])
    cursor.close()
    conn.close()
except Exception as e:
    print("Query execution failed:", e)
