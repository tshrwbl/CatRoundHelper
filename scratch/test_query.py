import pyodbc

SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

test_sql = """
SELECT TOP 5
    ci.College_Name,
    bi.Branch_Code,
    bi.Branch_Name,
    cc24.Percentile AS State_Percentile_2024,
    ai24.Percentile AS AI_Percentile_2024,
    ai24.Merit_Rank AS AI_Rank_2024,
    ai23.Percentile AS AI_Percentile_2023,
    ai23.Merit_Rank AS AI_Rank_2023,
    ai22.Percentile AS AI_Percentile_2022,
    ai22.Merit_Rank AS AI_Rank_2022
FROM cap_cutoffs cc24
    INNER JOIN college_info ci ON cc24.College_Code = ci.College_Code
    INNER JOIN branch_info bi ON cc24.Branch_Code = bi.Branch_Code
    LEFT JOIN all_india_cutoffs ai24 ON TRY_CAST(ai24.Choice_Code AS BIGINT) = bi.Branch_Code AND ai24.Year = 2024 AND ai24.CAP_Round = cc24.CAP_Round
    LEFT JOIN all_india_cutoffs ai23 ON TRY_CAST(ai23.Choice_Code AS BIGINT) = bi.Branch_Code AND ai23.Year = 2023 AND ai23.CAP_Round = cc24.CAP_Round
    LEFT JOIN all_india_cutoffs ai22 ON TRY_CAST(ai22.Choice_Code AS BIGINT) = bi.Branch_Code AND ai22.Year = 2022 AND ai22.CAP_Round = cc24.CAP_Round
WHERE cc24.Year = 2024 AND cc24.Category = 'GOPENS' AND cc24.Percentile < 91
ORDER BY cc24.Percentile DESC;
"""

try:
    conn = pyodbc.connect(SQL_CONN_STR)
    cursor = conn.cursor()
    cursor.execute(test_sql)
    rows = cursor.fetchall()
    print(f"Found {len(rows)} test rows:")
    for r in rows:
        print(r)
    cursor.close()
    conn.close()
except Exception as e:
    print("Error executing test query:", e)
