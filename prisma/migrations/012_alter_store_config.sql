-- Add alert_email to Store
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'alert_email')
BEGIN
  ALTER TABLE [dbo].[Store] ADD [alert_email] NVARCHAR(255) NULL;
END

-- Remove fiscal tokens from Store (now in FiscalConfig)
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'fiscal_token')
BEGIN
  ALTER TABLE [dbo].[Store] DROP COLUMN [fiscal_token];
END

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'fiscal_token_vat')
BEGIN
  ALTER TABLE [dbo].[Store] DROP COLUMN [fiscal_token_vat];
END
