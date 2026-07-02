import pyodbc

SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

migration_sql = """
-- 1. Drop Primary Key constraint
ALTER TABLE [dbo].[all_india_cutoffs] DROP CONSTRAINT [PK_all_india_cutoffs];

-- 2. Alter Choice_Code column to BIGINT
ALTER TABLE [dbo].[all_india_cutoffs] ALTER COLUMN [Choice_Code] BIGINT NOT NULL;

-- 3. Re-create Primary Key constraint
ALTER TABLE [dbo].[all_india_cutoffs] ADD CONSTRAINT [PK_all_india_cutoffs] PRIMARY KEY CLUSTERED 
(
    [Year] ASC,
    [CAP_Round] ASC,
    [Choice_Code] ASC,
    [Merit_Rank] ASC
);
"""

try:
    conn = pyodbc.connect(SQL_CONN_STR)
    cursor = conn.cursor()
    cursor.execute(migration_sql)
    conn.commit()
    print("Migration executed successfully!")
    
    # Check data type in sys.columns
    cursor.execute("""
        SELECT c.name, t.name AS data_type 
        FROM sys.columns c 
        JOIN sys.types t ON c.user_type_id = t.user_type_id 
        WHERE c.object_id = OBJECT_ID('all_india_cutoffs') AND c.name = 'Choice_Code'
    """)
    res = cursor.fetchone()
    print(f"Choice_Code data type is now: {res}")
    
    cursor.close()
    conn.close()
except Exception as e:
    print("Migration failed:", e)
