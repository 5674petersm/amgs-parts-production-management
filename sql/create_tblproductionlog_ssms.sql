-- Same as create_tblproductionlog.sql, with GO batch separators for SSMS / sqlcmd.

IF OBJECT_ID(N'dbo.tblproductionlog', N'U') IS NOT NULL
    DROP TABLE dbo.tblproductionlog;
GO

CREATE TABLE dbo.tblproductionlog (
    ProductionLogID INT IDENTITY(1, 1) NOT NULL,
    ItemID          INT NULL,
    CustomPartID    INT NULL,
    MasterPNo       NVARCHAR(50) NOT NULL,
    OpStation       NVARCHAR(50) NOT NULL,
    Qty             INT NOT NULL,
    LocationType    NVARCHAR(10) NOT NULL,
    LocationNo      INT NOT NULL,
    [User]          NVARCHAR(256) NOT NULL,
    TimeStamp       DATETIME2(0) NOT NULL,
    Source          NVARCHAR(10) NOT NULL,

    CONSTRAINT PK_tblproductionlog PRIMARY KEY CLUSTERED (ProductionLogID),
    CONSTRAINT FK_tblproductionlog_CustomPart
        FOREIGN KEY (CustomPartID) REFERENCES dbo.tblcustomparts (CustomPartID),
    CONSTRAINT CK_tblproductionlog_Qty_Positive CHECK (Qty > 0),
    CONSTRAINT CK_tblproductionlog_LocationType CHECK (LocationType IN (N'Cart', N'Bin')),
    CONSTRAINT CK_tblproductionlog_LocationNo_Range CHECK (LocationNo >= 1 AND LocationNo <= 50),
    CONSTRAINT CK_tblproductionlog_Source CHECK (Source IN (N'QR', N'Manual')),
    CONSTRAINT CK_tblproductionlog_PartReference CHECK (
        (ItemID IS NOT NULL AND CustomPartID IS NULL)
        OR (ItemID IS NULL AND CustomPartID IS NOT NULL)
    )
);
GO

CREATE NONCLUSTERED INDEX IX_tblproductionlog_ItemID_TimeStamp
    ON dbo.tblproductionlog (ItemID, TimeStamp DESC)
    WHERE ItemID IS NOT NULL;
GO

CREATE NONCLUSTERED INDEX IX_tblproductionlog_CustomPartID_TimeStamp
    ON dbo.tblproductionlog (CustomPartID, TimeStamp DESC)
    WHERE CustomPartID IS NOT NULL;
GO

CREATE NONCLUSTERED INDEX IX_tblproductionlog_TimeStamp
    ON dbo.tblproductionlog (TimeStamp DESC);
GO

CREATE NONCLUSTERED INDEX IX_tblproductionlog_OpStation
    ON dbo.tblproductionlog (OpStation);
GO
