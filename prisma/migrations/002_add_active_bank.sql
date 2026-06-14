-- Migration: Add active_bank column to Store table
-- Determines which payment terminal provider is active for this store.
-- Values: 'privatbank' (default) | 'monobank'
-- Run ONCE on production DB before deploying the multi-terminal version.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'active_bank'
)
BEGIN
  ALTER TABLE [dbo].[Store]
    ADD [active_bank] VARCHAR(20) NULL CONSTRAINT [DF__Store__active_bank] DEFAULT ('privatbank');

  PRINT 'Column active_bank added to Store table.';
END
ELSE
  PRINT 'Column active_bank already exists in Store table, skipping.';
