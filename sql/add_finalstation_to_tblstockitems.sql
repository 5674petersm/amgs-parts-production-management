-- Run against database: minimrp2025
-- FinalStation: when set, inventory updates only when production is recorded at this station.
-- NULL or empty = inventory updates on every submit (single-station parts).

IF COL_LENGTH(N'dbo.tblstockitems', N'FinalStation') IS NULL
BEGIN
    ALTER TABLE dbo.tblstockitems
    ADD FinalStation NVARCHAR(50) NULL;
END;
