-- Run against database: minimrp2025.
-- Adds configurable fabrication processes and per-process completion dates.
-- Safe to run more than once.

IF COL_LENGTH(N'dbo.tblcustomparts', N'RequiredProcesses') IS NULL
    ALTER TABLE dbo.tblcustomparts ADD RequiredProcesses NVARCHAR(100) NULL;

IF COL_LENGTH(N'dbo.tblcustomparts', N'CutCompletedAt') IS NULL
    ALTER TABLE dbo.tblcustomparts ADD CutCompletedAt DATETIME2(0) NULL;

IF COL_LENGTH(N'dbo.tblcustomparts', N'WeldCompletedAt') IS NULL
    ALTER TABLE dbo.tblcustomparts ADD WeldCompletedAt DATETIME2(0) NULL;

IF COL_LENGTH(N'dbo.tblcustomparts', N'MeshCompletedAt') IS NULL
    ALTER TABLE dbo.tblcustomparts ADD MeshCompletedAt DATETIME2(0) NULL;

IF COL_LENGTH(N'dbo.tblcustomparts', N'CncCompletedAt') IS NULL
    ALTER TABLE dbo.tblcustomparts ADD CncCompletedAt DATETIME2(0) NULL;

IF COL_LENGTH(N'dbo.tblcustomparts', N'BendCompletedAt') IS NULL
    ALTER TABLE dbo.tblcustomparts ADD BendCompletedAt DATETIME2(0) NULL;

IF COL_LENGTH(N'dbo.tblcustompartlibrary', N'RequiredProcesses') IS NULL
    ALTER TABLE dbo.tblcustompartlibrary ADD RequiredProcesses NVARCHAR(100) NULL;
