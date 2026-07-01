SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- The College and Branch tables remain mostly the same, but 
-- consider using VARCHAR for Codes if they ever include leading zeros (e.g., '0100')
CREATE TABLE [dbo].[college_info](
    [College_Code] [int] NOT NULL,
    [College_Name] [nvarchar](500) NULL,
    [Home_University] [nvarchar](100) NULL,
    [Status] [nvarchar](100) NULL,
    CONSTRAINT [PK_college_info] PRIMARY KEY CLUSTERED ([College_Code] ASC)
)
GO

CREATE TABLE [dbo].[branch_info](
    [Branch_Code] [bigint] NOT NULL, -- Note: Branch codes are often 9-10 digits, BIGINT is safer
    [Branch_Name] [nvarchar](500) NULL,
    CONSTRAINT [PK_branch_info] PRIMARY KEY CLUSTERED ([Branch_Code] ASC)
)
GO

-- The new Normalized Data Table
CREATE TABLE [dbo].[cap_cutoffs](
    [Year] [int] NOT NULL,
    [CAP_Round] [int] NOT NULL,
    [College_Code] [int] NOT NULL,
    [Branch_Code] [bigint] NOT NULL,
    [Category] [varchar](20) NOT NULL, -- e.g., 'GOPENS', 'GOBCS', 'TFWS'
    [Merit_Rank] [int] NULL,
    [Percentile] [decimal](10, 7) NULL, -- Renamed from Percentage to Percentile for accuracy
    CONSTRAINT [PK_cap_cutoffs] PRIMARY KEY CLUSTERED 
    (
        [Year] ASC,
        [CAP_Round] ASC,
        [College_Code] ASC,
        [Branch_Code] ASC,
        [Category] ASC
    )
)
GO

-- Add Foreign Keys
ALTER TABLE [dbo].[cap_cutoffs] WITH CHECK ADD CONSTRAINT [FK_cutoffs_college] FOREIGN KEY([College_Code])
REFERENCES [dbo].[college_info] ([College_Code])
GO
ALTER TABLE [dbo].[cap_cutoffs] WITH CHECK ADD CONSTRAINT [FK_cutoffs_branch] FOREIGN KEY([Branch_Code])
REFERENCES [dbo].[branch_info] ([Branch_Code])
GO