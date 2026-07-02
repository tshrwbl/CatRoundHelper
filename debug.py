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
    cursor.execute("ALTER TABLE college_info DROP COLUMN Home_University;")
    cursor.execute("ALTER TABLE college_info DROP COLUMN Status;")
    print("Dropped from college_info")
except Exception as e:
    print("Error dropping:", e)

try:
    cursor.execute("ALTER TABLE branch_info ADD Home_University nvarchar(100) NULL;")
    cursor.execute("ALTER TABLE branch_info ADD Status nvarchar(100) NULL;")
    print("Added to branch_info")
except Exception as e:
    print("Error adding:", e)

conn.commit()
print("Schema update complete!")
