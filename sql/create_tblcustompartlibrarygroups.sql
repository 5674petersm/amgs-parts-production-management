-- Run against database: minimrp2025.
-- Safe to run more than once. Adds reusable sets of Parts Library entries.

IF OBJECT_ID(N'dbo.tblcustompartlibrarygroups', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.tblcustompartlibrarygroups (
        LibraryGroupID INT IDENTITY(1, 1) NOT NULL,
        GroupName      NVARCHAR(200) NOT NULL,
        Description    NVARCHAR(1000) NULL,
        CreatedBy      NVARCHAR(256) NOT NULL,
        CreatedAt      DATETIME2(0) NOT NULL,
        UpdatedAt      DATETIME2(0) NOT NULL,
        CONSTRAINT PK_tblcustompartlibrarygroups PRIMARY KEY CLUSTERED (LibraryGroupID),
        CONSTRAINT UQ_tblcustompartlibrarygroups_GroupName UNIQUE (GroupName)
    );
END;

IF OBJECT_ID(N'dbo.tblcustompartlibrarygroupmembers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.tblcustompartlibrarygroupmembers (
        LibraryGroupID INT NOT NULL,
        LibraryPartID  INT NOT NULL,
        QtyPerSet      INT NOT NULL CONSTRAINT DF_tblcustompartlibrarygroupmembers_QtyPerSet DEFAULT (1),
        SortOrder      INT NOT NULL CONSTRAINT DF_tblcustompartlibrarygroupmembers_SortOrder DEFAULT (0),
        AddedBy        NVARCHAR(256) NOT NULL,
        AddedAt        DATETIME2(0) NOT NULL,
        CONSTRAINT PK_tblcustompartlibrarygroupmembers PRIMARY KEY CLUSTERED (LibraryGroupID, LibraryPartID),
        CONSTRAINT FK_librarygroupmembers_Group FOREIGN KEY (LibraryGroupID)
            REFERENCES dbo.tblcustompartlibrarygroups (LibraryGroupID) ON DELETE CASCADE,
        CONSTRAINT FK_librarygroupmembers_Part FOREIGN KEY (LibraryPartID)
            REFERENCES dbo.tblcustompartlibrary (LibraryPartID) ON DELETE CASCADE,
        CONSTRAINT CK_librarygroupmembers_QtyPerSet CHECK (QtyPerSet > 0)
    );

    CREATE NONCLUSTERED INDEX IX_librarygroupmembers_Part
        ON dbo.tblcustompartlibrarygroupmembers (LibraryPartID);
END;

-- Replace the login below if the production runtime account changes.
EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.tblcustompartlibrarygroups TO [portaluser];');
EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.tblcustompartlibrarygroupmembers TO [portaluser];');
