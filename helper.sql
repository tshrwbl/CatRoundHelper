
SELECT DISTINCT Home_University
FROM branch_info
WHERE COALESCE(Home_University, '') NOT IN ('Sant Gadge Baba Amravati University','Punyashlok Ahilyadevi Holkar Solapur University','Gondwana University','Rashtrasant Tukadoji Maharaj Nagpur University','Dr. Babasaheb Ambedkar Marathwada University', 'Shivaji University','Kavayitri Bahinabai Chaudhari North Maharashtra University, Jalgaon','Dr. Babasaheb Ambedkar Technological University,Lonere','Swami Ramanand Teerth Marathwada University, Nanded');


Select DISTINCT [Status]
from branch_info
where COALESCE([Status], '') NOT LIKE '%Minority%'

SELECT DISTINCT Branch_Name
FROM branch_info
WHERE Branch_Name IN (
    'Robotics and Artificial Intelligence', 
    'Artificial Intelligence (AI) and Data Science', 
    'Computer Science and Business Systems', 
    'Electronics and Computer Science', 
    'Computer Science and Design', 
    'Industrial IoT', 
    'Artificial Intelligence and Data Science', 
    'Computer Science and Engineering (Artificial Intelligence)', 
    'Computer Science', 
    'Computer Science and Engineering (Internet of Things and Cyber Security Including Block Chain', 
    'Computer Science and Engineering (Cyber Security)', 
    'Computer Engineering (Software Engineering)', 
    'Computer Science and Technology', 
    'Computer Engineering', 
    'Computer Science and Engineering(Data Science)', 
    'Artificial Intelligence', 
    'Computer Engineering (Regional Language)', 
    'Internet of Things (IoT)', 
    'Artificial Intelligence and Machine Learning', 
    'Electrical and Computer Engineering', 
    'Cyber Security', 
    'Electronics and Computer Engineering', 
    'Computer Science and Engineering (Artificial Intelligence and Data Science)', 
    'Computer Science and Engineering(Artificial Intelligence and Machine Learning)', 
    'Information Technology', 
    'Computer Science and Engineering(Cyber Security)', 
    'Data Science', 
    'Computer Science and Engineering', 
    'Computer Technology', 
    'Computer Science and Information Technology', 
    'Data Engineering', 
    'Computer Science and Engineering (IoT)'
);

Select DISTINCT(ci.College_Name) , ci.College_Code , AVG(cc24.Percentile) as cetAvg, avg(ai24.Percentile) JeeAvg
FROM cap_cutoffs cc24
    INNER JOIN college_info ci ON cc24.College_Code = ci.College_Code
    INNER JOIN branch_info bi ON cc24.Branch_Code = bi.Branch_Code
    -- State Cutoffs Joins
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
    -- All India Cutoffs Joins
    LEFT JOIN all_india_cutoffs ai24 ON 
        ai24.Choice_Code = bi.Branch_Code
        AND ai24.Year = 2024
        AND ai24.CAP_Round = cc24.CAP_Round
    LEFT JOIN all_india_cutoffs ai23 ON 
        ai23.Choice_Code = bi.Branch_Code
        AND ai23.Year = 2023
        AND ai23.CAP_Round = cc24.CAP_Round
    LEFT JOIN all_india_cutoffs ai22 ON 
        ai22.Choice_Code = bi.Branch_Code
        AND ai22.Year = 2022
        AND ai22.CAP_Round = cc24.CAP_Round
WHERE cc24.Year = 2024
    AND (cc24.Percentile BETWEEN 85 AND 95 OR ai24.Percentile BETWEEN 85 AND 95)
    AND COALESCE(bi.Home_University, '') NOT IN ('Mumbai University','Sant Gadge Baba Amravati University','Punyashlok Ahilyadevi Holkar Solapur University','Gondwana University','Rashtrasant Tukadoji Maharaj Nagpur University','Dr. Babasaheb Ambedkar Marathwada University', 'Shivaji University','Kavayitri Bahinabai Chaudhari North Maharashtra University, Jalgaon','Dr. Babasaheb Ambedkar Technological University,Lonere','Swami Ramanand Teerth Marathwada University, Nanded')
    AND COALESCE(bi.Status, '') NOT LIKE '%Minority%'
    AND Branch_Name IN (
    'Robotics and Artificial Intelligence', 
    'Artificial Intelligence (AI) and Data Science', 
    'Computer Science and Business Systems', 
    'Electronics and Computer Science', 
    'Computer Science and Design', 
    'Industrial IoT', 
    'Artificial Intelligence and Data Science', 
    'Computer Science and Engineering (Artificial Intelligence)', 
    'Computer Science', 
    'Computer Science and Engineering (Internet of Things and Cyber Security Including Block Chain', 
    'Computer Science and Engineering (Cyber Security)', 
    'Computer Engineering (Software Engineering)', 
    'Computer Science and Technology', 
    'Computer Engineering', 
    'Computer Science and Engineering(Data Science)', 
    'Artificial Intelligence', 
    'Computer Engineering (Regional Language)', 
    'Internet of Things (IoT)', 
    'Artificial Intelligence and Machine Learning', 
    'Electrical and Computer Engineering', 
    'Cyber Security', 
    'Electronics and Computer Engineering', 
    'Computer Science and Engineering (Artificial Intelligence and Data Science)', 
    'Computer Science and Engineering(Artificial Intelligence and Machine Learning)', 
    'Information Technology', 
    'Computer Science and Engineering(Cyber Security)', 
    'Data Science', 
    'Computer Science and Engineering', 
    'Computer Technology', 
    'Computer Science and Information Technology', 
    'Data Engineering', 
    'Computer Science and Engineering (IoT)')
    AND ci.College_Code not in (
        '5162', '5108', '5151', '5139','5331','5121','5181', '5160', '5418', '5109', '5330','5161', --POSSIBLE 
        '6310','6185','6768','6770','6635','6284','6267','1002','4167','6796','6317','5382','5244','6277','6184','6283','6223','6319','6991','1107','6250','6220','6834', '6275','2113','6005', '6628','2008','3215','2020','6004','6815','6214','5004','6268','1105','6222','3139','6187','1114')
GROUP BY ci.College_Name,  ci.College_Code
ORDER BY cetAvg DESC


5162, 5108, 5151, 5139,5331,5121,5181, 5160, 5418, 5109, 5330,5161