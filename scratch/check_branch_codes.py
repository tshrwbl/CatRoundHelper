import pyodbc

SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

conn = pyodbc.connect(SQL_CONN_STR)
cursor = conn.cursor()
cursor.execute("SELECT TOP 10 Branch_Code FROM branch_info")
print("branch_info sample Branch_Code:", cursor.fetchall())

cursor.execute("SELECT TOP 10 Choice_Code FROM all_india_cutoffs WHERE TRY_CAST(Choice_Code AS BIGINT) IS NOT NULL")
print("all_india_cutoffs sample Choice_Code:", cursor.fetchall())
cursor.close()
conn.close()
