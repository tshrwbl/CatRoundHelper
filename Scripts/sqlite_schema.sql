-- SQLite schema for the public, read-only CAP Compass snapshot.
--
-- SQLite uses type affinities rather than SQL Server's exact types. Percentile
-- values are stored as REAL, codes which may contain leading zeroes remain TEXT,
-- and the primary keys retain the source database's natural uniqueness rules.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = DELETE;

CREATE TABLE college_info (
    College_Code INTEGER PRIMARY KEY,
    College_Name TEXT
);

CREATE TABLE branch_info (
    Branch_Code TEXT PRIMARY KEY,
    Branch_Name TEXT,
    Home_University TEXT,
    Status TEXT
);

CREATE TABLE cap_cutoffs (
    Year INTEGER NOT NULL,
    CAP_Round INTEGER NOT NULL,
    College_Code INTEGER NOT NULL,
    Branch_Code TEXT NOT NULL,
    Category TEXT NOT NULL,
    Merit_Rank INTEGER,
    Percentile REAL,
    PRIMARY KEY (Year, CAP_Round, College_Code, Branch_Code, Category),
    FOREIGN KEY (College_Code) REFERENCES college_info (College_Code),
    FOREIGN KEY (Branch_Code) REFERENCES branch_info (Branch_Code)
);

CREATE TABLE all_india_cutoffs (
    Year INTEGER NOT NULL,
    CAP_Round INTEGER NOT NULL,
    Choice_Code TEXT NOT NULL,
    Merit_Rank INTEGER NOT NULL,
    Percentile REAL,
    Merit_Exam TEXT,
    Type TEXT,
    Seat_Type TEXT,
    PRIMARY KEY (Year, CAP_Round, Choice_Code, Merit_Rank)
);

-- The primary keys support direct lookups. These indexes support the explorer's
-- 2024 filters, the history charts, and the scalar All India cutoff lookups.
CREATE INDEX idx_cap_cutoffs_explorer
    ON cap_cutoffs (Year, Category, CAP_Round, College_Code, Branch_Code);
CREATE INDEX idx_cap_cutoffs_branch_history
    ON cap_cutoffs (College_Code, Branch_Code, Category, CAP_Round, Year);
CREATE INDEX idx_all_india_choice_history
    ON all_india_cutoffs (Choice_Code, CAP_Round, Year, Percentile DESC, Merit_Rank);
