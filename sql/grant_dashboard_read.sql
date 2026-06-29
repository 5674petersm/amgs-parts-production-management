-- Run against database: minimrp2025
-- Grants read access for the admin dashboard (station production reports).
--
-- Replace [your_app_user] with the SQL login in DB_USER (e.g. production_app).
-- Run as a user with permission to grant (dbo or security admin).

USE minimrp2025;
GO

GRANT SELECT ON dbo.tblproductionlog TO [your_app_user];
GO

-- Dashboard joins these tables; grant if not already readable by the app user.
GRANT SELECT ON dbo.tblstockitems TO [your_app_user];
GO

GRANT SELECT ON dbo.tblcustomparts TO [your_app_user];
GO

GRANT SELECT ON dbo.tblitemlocation TO [your_app_user];
GO
