-- Run against database: minimrp2025
-- Google Cloud SQL editor: run this entire script as one batch (no GO lines).

IF OBJECT_ID(N'dbo.tblcustomparts', N'U') IS NOT NULL
    DROP TABLE dbo.tblcustomparts;

CREATE TABLE dbo.tblcustomparts (
    CustomPartID          INT IDENTITY(1, 1) NOT NULL,
    AMGSOrderNumber       NVARCHAR(50) NOT NULL,
    CustomerName          NVARCHAR(200) NOT NULL,
    PartNumber            NVARCHAR(50) NOT NULL,
    PartSequence          INT NOT NULL,
    Description           NVARCHAR(MAX) NOT NULL,
    QtyNeeded             INT NOT NULL,
    Material              NVARCHAR(50) NOT NULL,
    HasCustomColor        BIT NOT NULL CONSTRAINT DF_tblcustomparts_HasCustomColor DEFAULT (0),
    CustomColor           NVARCHAR(100) NULL,
    GoogleDriveOrderFolderId NVARCHAR(100) NULL,
    GoogleDrivePartFolderId  NVARCHAR(100) NULL,
    GoogleDriveFolderUrl     NVARCHAR(500) NULL,
    SubmittedBy           NVARCHAR(256) NOT NULL,
    SubmittedAt           DATETIME2(0) NOT NULL,
    CompletedAt           DATETIME2(0) NULL,
    CompletedBy           NVARCHAR(256) NULL,

    CONSTRAINT PK_tblcustomparts PRIMARY KEY CLUSTERED (CustomPartID),
    CONSTRAINT UQ_tblcustomparts_PartNumber UNIQUE (PartNumber),
    CONSTRAINT UQ_tblcustomparts_OrderSequence UNIQUE (AMGSOrderNumber, PartSequence),
    CONSTRAINT CK_tblcustomparts_QtyNeeded CHECK (QtyNeeded > 0)
);

CREATE NONCLUSTERED INDEX IX_tblcustomparts_AMGSOrderNumber
    ON dbo.tblcustomparts (AMGSOrderNumber, PartSequence DESC);

CREATE NONCLUSTERED INDEX IX_tblcustomparts_SubmittedAt
    ON dbo.tblcustomparts (SubmittedAt DESC);

-- Grant your app SQL user:
--   SELECT, INSERT, UPDATE, DELETE on dbo.tblcustomparts
