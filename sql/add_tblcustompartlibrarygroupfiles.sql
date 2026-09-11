-- Run against database: minimrp2025.
-- Adds Drive-backed PDF drawings directly to Parts Library groups.
-- Safe to run more than once.

IF COL_LENGTH(N'dbo.tblcustompartlibrarygroups', N'GoogleDriveFolderId') IS NULL
    ALTER TABLE dbo.tblcustompartlibrarygroups ADD GoogleDriveFolderId NVARCHAR(100) NULL;

IF COL_LENGTH(N'dbo.tblcustompartlibrarygroups', N'GoogleDriveFolderUrl') IS NULL
    ALTER TABLE dbo.tblcustompartlibrarygroups ADD GoogleDriveFolderUrl NVARCHAR(500) NULL;
