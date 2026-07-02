-- Migration Script: Convert Branch_Code and Choice_Code to VARCHAR(20)
-- This aligns data types across branch_info, cap_cutoffs, and all_india_cutoffs 
-- to support leading zeros and alphanumeric branch/choice codes.

-- 1. Drop constraints
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_cutoffs_branch')
    ALTER TABLE [dbo].[cap_cutoffs] DROP CONSTRAINT [FK_cutoffs_branch];
GO

IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'PK_cap_cutoffs')
    ALTER TABLE [dbo].[cap_cutoffs] DROP CONSTRAINT [PK_cap_cutoffs];
GO

IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'PK_branch_info')
    ALTER TABLE [dbo].[branch_info] DROP CONSTRAINT [PK_branch_info];
GO

IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'PK_all_india_cutoffs')
    ALTER TABLE [dbo].[all_india_cutoffs] DROP CONSTRAINT [PK_all_india_cutoffs];
GO

-- 2. Alter column types to VARCHAR(20)
ALTER TABLE [dbo].[branch_info] ALTER COLUMN [Branch_Code] VARCHAR(20) NOT NULL;
GO

ALTER TABLE [dbo].[cap_cutoffs] ALTER COLUMN [Branch_Code] VARCHAR(20) NOT NULL;
GO

ALTER TABLE [dbo].[all_india_cutoffs] ALTER COLUMN [Choice_Code] VARCHAR(20) NOT NULL;
GO

-- 3. Standardize leading zeros for 9-digit numeric codes to restore 10-digit format
UPDATE [dbo].[branch_info] 
SET Branch_Code = '0' + Branch_Code 
WHERE LEN(Branch_Code) = 9 AND ISNUMERIC(Branch_Code) = 1;
GO

UPDATE [dbo].[cap_cutoffs] 
SET Branch_Code = '0' + Branch_Code 
WHERE LEN(Branch_Code) = 9 AND ISNUMERIC(Branch_Code) = 1;
GO

UPDATE [dbo].[all_india_cutoffs] 
SET Choice_Code = '0' + Choice_Code 
WHERE LEN(Choice_Code) = 9 AND ISNUMERIC(Choice_Code) = 1;
GO

-- 4. Re-add Primary Keys
ALTER TABLE [dbo].[branch_info] ADD CONSTRAINT [PK_branch_info] PRIMARY KEY CLUSTERED ([Branch_Code] ASC);
GO

ALTER TABLE [dbo].[cap_cutoffs] ADD CONSTRAINT [PK_cap_cutoffs] PRIMARY KEY CLUSTERED 
(
    [Year] ASC,
    [CAP_Round] ASC,
    [College_Code] ASC,
    [Branch_Code] ASC,
    [Category] ASC
);
GO

ALTER TABLE [dbo].[all_india_cutoffs] ADD CONSTRAINT [PK_all_india_cutoffs] PRIMARY KEY CLUSTERED 
(
    [Year] ASC,
    [CAP_Round] ASC,
    [Choice_Code] ASC,
    [Merit_Rank] ASC
);
GO

-- 5. Re-add Foreign Keys
ALTER TABLE [dbo].[cap_cutoffs] WITH CHECK ADD CONSTRAINT [FK_cutoffs_branch] FOREIGN KEY([Branch_Code])
REFERENCES [dbo].[branch_info] ([Branch_Code]);
GO
