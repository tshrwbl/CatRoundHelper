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
    print(f"Query execution succeeded! Returned {len(rows)} rows.")
    print("Sample row output:")
    for r in rows[:3]:
        print(r)
    cursor.close()
    conn.close()
except Exception as e:
    print("Query execution error:", e)
