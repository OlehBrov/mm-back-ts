-- Add SMTP mail transport config to Store table.
-- alert_email / support_email already exist (014) and double as the "to" addresses
-- for MAIL_TO / MAIL_SUPPORT_TO — seeded from docker-compose env at kiosk startup
-- (see seedMailConfig() in main.ts) if not already set.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'mail_host'
)
  ALTER TABLE [dbo].[Store] ADD [mail_host] VARCHAR(255) NULL;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'mail_port'
)
  ALTER TABLE [dbo].[Store] ADD [mail_port] INT NULL;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'mail_secure'
)
  ALTER TABLE [dbo].[Store] ADD [mail_secure] BIT NULL;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'mail_user'
)
  ALTER TABLE [dbo].[Store] ADD [mail_user] VARCHAR(255) NULL;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'mail_pass'
)
  ALTER TABLE [dbo].[Store] ADD [mail_pass] VARCHAR(255) NULL;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'mail_from'
)
  ALTER TABLE [dbo].[Store] ADD [mail_from] NVARCHAR(255) NULL;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'mail_support_user'
)
  ALTER TABLE [dbo].[Store] ADD [mail_support_user] VARCHAR(255) NULL;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'mail_support_pass'
)
  ALTER TABLE [dbo].[Store] ADD [mail_support_pass] VARCHAR(255) NULL;
