-- Run against database: minimrp2025
-- Extends tblproductionlog for custom part production (log-only; no inventory).

IF COL_LENGTH(N'dbo.tblproductionlog', N'CustomPartID') IS NULL
BEGIN
    ALTER TABLE dbo.tblproductionlog
        ADD CustomPartID INT NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = N'FK_tblproductionlog_CustomPart'
)
BEGIN
    ALTER TABLE dbo.tblproductionlog
        ADD CONSTRAINT FK_tblproductionlog_CustomPart
            FOREIGN KEY (CustomPartID) REFERENCES dbo.tblcustomparts (CustomPartID);
END;

-- ItemID is stock-only; custom rows use CustomPartID instead.
IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.tblproductionlog')
      AND name = N'ItemID'
      AND is_nullable = 0
)
BEGIN
    ALTER TABLE dbo.tblproductionlog
        ALTER COLUMN ItemID INT NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_tblproductionlog_PartReference'
)
BEGIN
    ALTER TABLE dbo.tblproductionlog
        ADD CONSTRAINT CK_tblproductionlog_PartReference CHECK (
            (ItemID IS NOT NULL AND CustomPartID IS NULL)
            OR (ItemID IS NULL AND CustomPartID IS NOT NULL)
        );
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_tblproductionlog_CustomPartID_TimeStamp'
      AND object_id = OBJECT_ID(N'dbo.tblproductionlog')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblproductionlog_CustomPartID_TimeStamp
        ON dbo.tblproductionlog (CustomPartID, TimeStamp DESC);
END;
