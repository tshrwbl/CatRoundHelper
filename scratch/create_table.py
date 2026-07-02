import pyodbc

SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

create_table_sql = """
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'all_india_cutoffs')
BEGIN
    CREATE TABLE [dbo].[all_india_cutoffs](
        [Year] [int] NOT NULL,
        [CAP_Round] [int] NOT NULL,
        [Choice_Code] [varchar](20) NOT NULL,
        [Merit_Rank] [int] NOT NULL,
        [Percentile] [decimal](10, 7) NULL,
        [Merit_Exam] [varchar](100) NULL,
        [Type] [varchar](100) NULL,
        [Seat_Type] [varchar](100) NULL,
        CONSTRAINT [PK_all_india_cutoffs] PRIMARY KEY CLUSTERED 
        (
            [Year] ASC,
            [CAP_Round] ASC,
            [Choice_Code] ASC,
            [Merit_Rank] ASC
        )
    )
    PRINT 'Table created successfully'
END
ELSE
BEGIN
    PRINT 'Table already exists'
END
"""

try:
    conn = pyodbc.connect(SQL_CONN_STR)
    cursor = conn.cursor()
    cursor.execute(create_table_sql)
    conn.commit()
    print("Database table check/creation completed.")
    cursor.close()
    conn.close()
except Exception as e:
    print("Database error:", e)
