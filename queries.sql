-- Query to find 2024 cutoffs below 90 percentile with 2023 and 2022 percentiles and ranks
SELECT
    ci.College_Code,
    ci.College_Name,
    bi.Branch_Code,
    bi.Branch_Name,
    bi.Status,
    bi.Home_University,
    cc24.Category,
    cc24.CAP_Round,
    -- 2024 Details
    cc24.Percentile AS Percentile_2024,
    cc24.Merit_Rank AS Rank_2024,
    -- 2023 Details
    cc23.Percentile AS Percentile_2023,
    cc23.Merit_Rank AS Rank_2023,
    -- 2022 Details
    cc22.Percentile AS Percentile_2022,
    cc22.Merit_Rank AS Rank_2022
FROM cap_cutoffs cc24
    INNER JOIN college_info ci ON cc24.College_Code = ci.College_Code
    INNER JOIN branch_info bi ON cc24.Branch_Code = bi.Branch_Code
    LEFT JOIN cap_cutoffs cc23 ON 
    cc24.College_Code = cc23.College_Code
        AND cc24.Branch_Code = cc23.Branch_Code
        AND cc24.Category = cc23.Category
        AND cc24.CAP_Round = cc23.CAP_Round
        AND cc23.Year = 2023
    LEFT JOIN cap_cutoffs cc22 ON 
    cc24.College_Code = cc22.College_Code
        AND cc24.Branch_Code = cc22.Branch_Code
        AND cc24.Category = cc22.Category
        AND cc24.CAP_Round = cc22.CAP_Round
        AND cc22.Year = 2022
WHERE cc24.Year = 2024
    AND cc24.Percentile < 91
ORDER BY cc24.Percentile DESC;