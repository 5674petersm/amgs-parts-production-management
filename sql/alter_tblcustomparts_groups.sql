-- Approved grouping metadata for duplicate custom parts.
IF COL_LENGTH(N'dbo.tblcustomparts', N'CustomPartGroupID') IS NULL
  EXEC(N'ALTER TABLE dbo.tblcustomparts ADD CustomPartGroupID UNIQUEIDENTIFIER NULL');

IF COL_LENGTH(N'dbo.tblcustomparts', N'CustomPartGroupedBy') IS NULL
  EXEC(N'ALTER TABLE dbo.tblcustomparts ADD CustomPartGroupedBy NVARCHAR(256) NULL');

IF COL_LENGTH(N'dbo.tblcustomparts', N'CustomPartGroupedAt') IS NULL
  EXEC(N'ALTER TABLE dbo.tblcustomparts ADD CustomPartGroupedAt DATETIME2(0) NULL');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_tblcustomparts_GroupID' AND object_id = OBJECT_ID(N'dbo.tblcustomparts'))
  EXEC(N'CREATE NONCLUSTERED INDEX IX_tblcustomparts_GroupID ON dbo.tblcustomparts (CustomPartGroupID) WHERE CustomPartGroupID IS NOT NULL');
