-- Run against database: minimrp2025.
-- Tracks which custom parts were created together by a Parts Library group assignment.
-- Safe to run more than once. Existing multi-part group assignments are backfilled by order.

IF COL_LENGTH(N'dbo.tblcustomparts', N'SourceLibraryGroupID') IS NULL
    ALTER TABLE dbo.tblcustomparts ADD SourceLibraryGroupID INT NULL;

IF COL_LENGTH(N'dbo.tblcustomparts', N'LibraryGroupAssignmentID') IS NULL
    ALTER TABLE dbo.tblcustomparts ADD LibraryGroupAssignmentID UNIQUEIDENTIFIER NULL;

IF COL_LENGTH(N'dbo.tblcustomparts', N'LibraryGroupSetQuantity') IS NULL
    ALTER TABLE dbo.tblcustomparts ADD LibraryGroupSetQuantity INT NULL;

-- Start a new batch so SQL Server compiles the statements below only after the
-- newly added columns are visible in the table metadata.
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.tblcustomparts')
      AND name = N'UX_tblcustomparts_LibraryGroupAssignment_Source'
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UX_tblcustomparts_LibraryGroupAssignment_Source
        ON dbo.tblcustomparts (LibraryGroupAssignmentID, SourceLibraryPartID)
        WHERE LibraryGroupAssignmentID IS NOT NULL AND SourceLibraryPartID IS NOT NULL;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.tblcustomparts')
      AND name = N'IX_tblcustomparts_SourceLibraryGroupID'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblcustomparts_SourceLibraryGroupID
        ON dbo.tblcustomparts (SourceLibraryGroupID, CompletedAt)
        WHERE SourceLibraryGroupID IS NOT NULL;
END;

-- Infer existing assignments only for groups with at least two members. A one-member
-- group cannot be distinguished safely from an individually assigned library part.
IF OBJECT_ID(N'dbo.tblcustompartlibrarygroups', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.tblcustompartlibrarygroupmembers', N'U') IS NOT NULL
BEGIN
    IF OBJECT_ID(N'tempdb..#GroupAssignmentCandidates') IS NOT NULL
        DROP TABLE #GroupAssignmentCandidates;

    IF OBJECT_ID(N'tempdb..#GroupAssignmentBackfill') IS NOT NULL
        DROP TABLE #GroupAssignmentBackfill;

    SELECT
        members.LibraryGroupID,
        members.LibraryPartID,
        parts.CustomPartID,
        parts.AMGSOrderNumber,
        parts.QtyNeeded / members.QtyPerSet AS SetQuantity,
        ROW_NUMBER() OVER (
            PARTITION BY members.LibraryGroupID, parts.AMGSOrderNumber, members.LibraryPartID
            ORDER BY parts.CustomPartID
        ) AS CandidateNumber
    INTO #GroupAssignmentCandidates
    FROM dbo.tblcustompartlibrarygroupmembers AS members
    INNER JOIN dbo.tblcustomparts AS parts
        ON parts.SourceLibraryPartID = members.LibraryPartID
    WHERE parts.CompletedAt IS NULL
      AND parts.LibraryGroupAssignmentID IS NULL
      AND parts.QtyNeeded > 0
      AND parts.QtyNeeded % members.QtyPerSet = 0;

    SELECT
        candidates.LibraryGroupID,
        candidates.AMGSOrderNumber,
        NEWID() AS AssignmentID,
        MIN(candidates.SetQuantity) AS SetQuantity
    INTO #GroupAssignmentBackfill
    FROM #GroupAssignmentCandidates AS candidates
    WHERE candidates.CandidateNumber = 1
      AND (SELECT COUNT(*) FROM dbo.tblcustompartlibrarygroupmembers AS member_count
           WHERE member_count.LibraryGroupID = candidates.LibraryGroupID) >= 2
    GROUP BY candidates.LibraryGroupID, candidates.AMGSOrderNumber
    HAVING COUNT(DISTINCT candidates.LibraryPartID) =
             (SELECT COUNT(*) FROM dbo.tblcustompartlibrarygroupmembers AS member_count
              WHERE member_count.LibraryGroupID = candidates.LibraryGroupID)
       AND MIN(candidates.SetQuantity) = MAX(candidates.SetQuantity);

    UPDATE parts
    SET SourceLibraryGroupID = backfill.LibraryGroupID,
        LibraryGroupAssignmentID = backfill.AssignmentID,
        LibraryGroupSetQuantity = backfill.SetQuantity
    FROM dbo.tblcustomparts AS parts
    INNER JOIN #GroupAssignmentCandidates AS candidates
        ON candidates.CustomPartID = parts.CustomPartID
       AND candidates.CandidateNumber = 1
    INNER JOIN #GroupAssignmentBackfill AS backfill
        ON backfill.LibraryGroupID = candidates.LibraryGroupID
       AND backfill.AMGSOrderNumber = parts.AMGSOrderNumber
    WHERE parts.LibraryGroupAssignmentID IS NULL;

    DROP TABLE #GroupAssignmentCandidates;
    DROP TABLE #GroupAssignmentBackfill;
END;
