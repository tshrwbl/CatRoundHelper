import pyodbc

SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

conn = pyodbc.connect(SQL_CONN_STR)
cursor = conn.cursor()
cursor.execute("SELECT DISTINCT Choice_Code FROM all_india_cutoffs WHERE TRY_CAST(Choice_Code AS BIGINT) IS NULL")
bad_codes = cursor.fetchall()
print("Non-numeric Choice_Code values:", bad_codes)
cursor.close()
conn.close()
