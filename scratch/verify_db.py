import pyodbc

SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

try:
    conn = pyodbc.connect(SQL_CONN_STR)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM all_india_cutoffs")
    count = cursor.fetchone()[0]
    print(f"Total rows in all_india_cutoffs: {count}")
    
    cursor.execute("SELECT TOP 5 Year, CAP_Round, Choice_Code, Merit_Rank, Percentile, Merit_Exam, Type, Seat_Type FROM all_india_cutoffs")
    rows = cursor.fetchall()
    print("\nSample top 5 rows:")
    for r in rows:
        print(r)
    cursor.close()
    conn.close()
except Exception as e:
    print("Verification error:", e)
