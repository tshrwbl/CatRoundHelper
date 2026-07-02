import pyodbc

SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

migration_steps = [
    # Drop constraints
    "ALTER TABLE [dbo].[cap_cutoffs] DROP CONSTRAINT [FK_cutoffs_branch];",
    "ALTER TABLE [dbo].[cap_cutoffs] DROP CONSTRAINT [PK_cap_cutoffs];",
    "ALTER TABLE [dbo].[branch_info] DROP CONSTRAINT [PK_branch_info];",
    "ALTER TABLE [dbo].[all_india_cutoffs] DROP CONSTRAINT [PK_all_india_cutoffs];",
    
    # Add temporary varchar columns or alter
    "ALTER TABLE [dbo].[branch_info] ALTER COLUMN [Branch_Code] VARCHAR(20) NOT NULL;",
    "ALTER TABLE [dbo].[cap_cutoffs] ALTER COLUMN [Branch_Code] VARCHAR(20) NOT NULL;",
    "ALTER TABLE [dbo].[all_india_cutoffs] ALTER COLUMN [Choice_Code] VARCHAR(20) NOT NULL;",
    
    # Pad 9-digit codes with leading 0 to make them 10-digit codes matchingChoice_Code
    "UPDATE [dbo].[branch_info] SET Branch_Code = '0' + Branch_Code WHERE LEN(Branch_Code) = 9 AND ISNUMERIC(Branch_Code) = 1;",
    "UPDATE [dbo].[cap_cutoffs] SET Branch_Code = '0' + Branch_Code WHERE LEN(Branch_Code) = 9 AND ISNUMERIC(Branch_Code) = 1;",
    "UPDATE [dbo].[all_india_cutoffs] SET Choice_Code = '0' + Choice_Code WHERE LEN(Choice_Code) = 9 AND ISNUMERIC(Choice_Code) = 1;",

    # Re-add constraints
    "ALTER TABLE [dbo].[branch_info] ADD CONSTRAINT [PK_branch_info] PRIMARY KEY CLUSTERED ([Branch_Code] ASC);",
    """ALTER TABLE [dbo].[cap_cutoffs] ADD CONSTRAINT [PK_cap_cutoffs] PRIMARY KEY CLUSTERED 
    (
        [Year] ASC,
        [CAP_Round] ASC,
        [College_Code] ASC,
        [Branch_Code] ASC,
        [Category] ASC
    );""",
    """ALTER TABLE [dbo].[all_india_cutoffs] ADD CONSTRAINT [PK_all_india_cutoffs] PRIMARY KEY CLUSTERED 
    (
        [Year] ASC,
        [CAP_Round] ASC,
        [Choice_Code] ASC,
        [Merit_Rank] ASC
    );""",
    "ALTER TABLE [dbo].[cap_cutoffs] WITH CHECK ADD CONSTRAINT [FK_cutoffs_branch] FOREIGN KEY([Branch_Code]) REFERENCES [dbo].[branch_info] ([Branch_Code]);"
]

try:
    conn = pyodbc.connect(SQL_CONN_STR)
    cursor = conn.cursor()
    for step in migration_steps:
        print(f"Executing: {step[:60]}...")
        cursor.execute(step)
        conn.commit()
    print("\nDatabase migration completed successfully!")
    cursor.close()
    conn.close()
except Exception as e:
    print("Migration error:", e)
