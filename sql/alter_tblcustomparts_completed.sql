-- Run against database: minimrp2025
-- Part complete = entire custom part order line finished.

IF COL_LENGTH(N'dbo.tblcustomparts', N'CompletedAt') IS NULL
BEGIN
    ALTER TABLE dbo.tblcustomparts
        ADD CompletedAt DATETIME2(0) NULL,
            CompletedBy NVARCHAR(256) NULL;
END;
