IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'fiscal_token')
BEGIN
  ALTER TABLE [dbo].[Store] ADD [fiscal_token] NVARCHAR(255) NULL;
  PRINT 'Column fiscal_token added to Store.';
END
ELSE
  PRINT 'Column fiscal_token already exists in Store, skipping.';

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'fiscal_token_vat')
BEGIN
  ALTER TABLE [dbo].[Store] ADD [fiscal_token_vat] NVARCHAR(255) NULL;
  PRINT 'Column fiscal_token_vat added to Store.';
END
ELSE
  PRINT 'Column fiscal_token_vat already exists in Store, skipping.';
