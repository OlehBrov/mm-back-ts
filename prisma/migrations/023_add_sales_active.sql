-- Migration: Add is_active flag to Sales table
-- Allows enabling/disabling a promotion type (акція) without deleting it.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Sales' AND COLUMN_NAME = 'is_active'
)
BEGIN
  ALTER TABLE [dbo].[Sales]
    ADD [is_active] BIT NOT NULL CONSTRAINT [DF__Sales__is_active] DEFAULT (1);

  PRINT 'Column is_active added to Sales table.';
END
ELSE
  PRINT 'Column is_active already exists in Sales table, skipping.';
