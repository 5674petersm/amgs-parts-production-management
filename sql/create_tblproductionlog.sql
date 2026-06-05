-- Run against database: minimrp2025
-- Google Cloud SQL editor: run this entire script as one batch (no GO lines).

IF OBJECT_ID(N'dbo.tblproductionlog', N'U') IS NOT NULL
    DROP TABLE dbo.tblproductionlog;

CREATE TABLE dbo.tblproductionlog (
    ProductionLogID INT IDENTITY(1, 1) NOT NULL,
    ItemID          INT NOT NULL,
    MasterPNo       NVARCHAR(50) NOT NULL,
    OpStation       NVARCHAR(50) NOT NULL,
    Qty             INT NOT NULL,
    LocationType    NVARCHAR(10) NOT NULL,
    LocationNo      INT NOT NULL,
    [User]          NVARCHAR(256) NOT NULL,
    TimeStamp       DATETIME2(0) NOT NULL,
    Source          NVARCHAR(10) NOT NULL,

    CONSTRAINT PK_tblproductionlog PRIMARY KEY CLUSTERED (ProductionLogID),
    CONSTRAINT CK_tblproductionlog_Qty_Positive CHECK (Qty > 0),
    CONSTRAINT CK_tblproductionlog_LocationType CHECK (LocationType IN (N'Cart', N'Bin')),
    CONSTRAINT CK_tblproductionlog_LocationNo_Range CHECK (LocationNo >= 1 AND LocationNo <= 50),
    CONSTRAINT CK_tblproductionlog_Source CHECK (Source IN (N'QR', N'Manual'))
);

CREATE NONCLUSTERED INDEX IX_tblproductionlog_ItemID_TimeStamp
    ON dbo.tblproductionlog (ItemID, TimeStamp DESC);

CREATE NONCLUSTERED INDEX IX_tblproductionlog_TimeStamp
    ON dbo.tblproductionlog (TimeStamp DESC);

CREATE NONCLUSTERED INDEX IX_tblproductionlog_OpStation
    ON dbo.tblproductionlog (OpStation);
