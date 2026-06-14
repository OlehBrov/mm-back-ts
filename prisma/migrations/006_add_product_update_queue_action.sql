-- Migration: Add action column to ProductUpdateQueue table
-- Distinguishes between 'add' and 'remove' product update operations.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'ProductUpdateQueue' AND COLUMN_NAME = 'action'
)
BEGIN
  ALTER TABLE [dbo].[ProductUpdateQueue]
    ADD [action] VARCHAR(20) NOT NULL CONSTRAINT [DF__ProdUpdQu__action] DEFAULT ('add');

  PRINT 'Column action added to ProductUpdateQueue table.';
END
ELSE
  PRINT 'Column action already exists in ProductUpdateQueue table, skipping.';
