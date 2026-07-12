-- Add screensaver_mode and screensaver_interval to Store
-- screensaver_mode: 'static' | 'carousel' | 'video' | NULL (NULL = default CSS screensaver)
-- screensaver_interval: carousel slide interval in seconds (default 30)

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'screensaver_mode'
)
  ALTER TABLE [dbo].[Store] ADD [screensaver_mode] VARCHAR(20) NULL;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'screensaver_interval'
)
  ALTER TABLE [dbo].[Store] ADD [screensaver_interval] INT NULL;
