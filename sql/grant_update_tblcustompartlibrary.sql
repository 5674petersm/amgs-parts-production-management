-- Run against database: minimrp2025.
-- Allows the production-site application account to edit saved Parts Library records.

IF USER_ID(N'portaluser') IS NULL
BEGIN
    THROW 50000, 'Database user portaluser does not exist.', 1;
END;

GRANT UPDATE ON dbo.tblcustompartlibrary TO [portaluser];
