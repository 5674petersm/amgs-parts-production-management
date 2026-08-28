-- Run against database: minimrp2025.
-- Safe to run more than once. This preserves existing custom-part data.

IF OBJECT_ID(N'dbo.tblcustompartlibrary', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.tblcustompartlibrary (
        LibraryPartID             INT IDENTITY(1, 1) NOT NULL,
        PartName                  NVARCHAR(200) NOT NULL,
        Description               NVARCHAR(MAX) NOT NULL,
        Material                  NVARCHAR(50) NOT NULL,
        HasCustomColor            BIT NOT NULL CONSTRAINT DF_tblcustompartlibrary_HasCustomColor DEFAULT (0),
        CustomColor               NVARCHAR(100) NULL,
        GoogleDrivePartFolderId   NVARCHAR(100) NOT NULL,
        GoogleDriveFolderUrl      NVARCHAR(500) NOT NULL,
        CreatedBy                 NVARCHAR(256) NOT NULL,
        CreatedAt                 DATETIME2(0) NOT NULL,
        CONSTRAINT PK_tblcustompartlibrary PRIMARY KEY CLUSTERED (LibraryPartID)
    );

    CREATE NONCLUSTERED INDEX IX_tblcustompartlibrary_PartName
        ON dbo.tblcustompartlibrary (PartName);
END;

IF COL_LENGTH(N'dbo.tblcustomparts', N'SourceLibraryPartID') IS NULL
BEGIN
    EXEC(N'ALTER TABLE dbo.tblcustomparts ADD SourceLibraryPartID INT NULL;');
END;

IF OBJECT_ID(N'dbo.FK_tblcustomparts_SourceLibraryPartID', N'F') IS NULL
BEGIN
    EXEC(N'ALTER TABLE dbo.tblcustomparts ADD CONSTRAINT FK_tblcustomparts_SourceLibraryPartID
        FOREIGN KEY (SourceLibraryPartID) REFERENCES dbo.tblcustompartlibrary (LibraryPartID);');
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.tblcustomparts')
      AND name = N'IX_tblcustomparts_SourceLibraryPartID'
)
BEGIN
    EXEC(N'CREATE NONCLUSTERED INDEX IX_tblcustomparts_SourceLibraryPartID
        ON dbo.tblcustomparts (SourceLibraryPartID) WHERE SourceLibraryPartID IS NOT NULL;');
END;

IF USER_ID(N'portaluser') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON dbo.tblcustompartlibrary TO [portaluser];
END;
