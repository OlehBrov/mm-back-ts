-- Migration: Add screensaver column to Store table

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'screensaver'
)
BEGIN
  ALTER TABLE [dbo].[Store]
    ADD [screensaver] VARCHAR(255) NULL;
  PRINT 'Column screensaver added to Store table.';
END
ELSE
  PRINT 'Column screensaver already exists in Store table, skipping.';
