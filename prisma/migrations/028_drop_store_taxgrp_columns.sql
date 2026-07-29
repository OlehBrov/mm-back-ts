-- taxgrp is configured per-merchant in FiscalConfig.taxgrp (set via /setup screen).
-- These Store columns duplicated it but had no working UI to edit them and were
-- unused by the checkout/fiscal flow (cart.service.ts now reads FiscalConfig.taxgrp).
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'default_merchant_taxgrp')
BEGIN
  ALTER TABLE [dbo].[Store] DROP COLUMN [default_merchant_taxgrp];
END

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'VAT_merchant_taxgrp')
BEGIN
  ALTER TABLE [dbo].[Store] DROP COLUMN [VAT_merchant_taxgrp];
END

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'VAT_excise_taxgrp')
BEGIN
  ALTER TABLE [dbo].[Store] DROP COLUMN [VAT_excise_taxgrp];
END
