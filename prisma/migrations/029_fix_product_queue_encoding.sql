-- ProductUpdateQueue/SubcategoryMoveQueue text columns were VARCHAR (single-byte),
-- while node-mssql/tedious binds Prisma string params for VARCHAR columns as
-- Latin1, silently mangling Cyrillic into '?' on write — regardless of the
-- destination column's actual collation. Products.product_name (NVARCHAR)
-- already avoided this. Switching the queue columns to NVARCHAR makes Prisma
-- bind them as Unicode, so names survive the enqueue → apply round trip.
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ProductUpdateQueue' AND COLUMN_NAME = 'product_name' AND DATA_TYPE = 'varchar')
BEGIN
  ALTER TABLE [dbo].[ProductUpdateQueue] ALTER COLUMN [product_name] NVARCHAR(256);
END

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ProductUpdateQueue' AND COLUMN_NAME = 'product_name_ru' AND DATA_TYPE = 'varchar')
BEGIN
  ALTER TABLE [dbo].[ProductUpdateQueue] ALTER COLUMN [product_name_ru] NVARCHAR(256);
END

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ProductUpdateQueue' AND COLUMN_NAME = 'product_name_ua' AND DATA_TYPE = 'varchar')
BEGIN
  ALTER TABLE [dbo].[ProductUpdateQueue] ALTER COLUMN [product_name_ua] NVARCHAR(256);
END

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ProductUpdateQueue' AND COLUMN_NAME = 'product_description' AND DATA_TYPE = 'varchar')
BEGIN
  ALTER TABLE [dbo].[ProductUpdateQueue] ALTER COLUMN [product_description] NVARCHAR(256);
END

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SubcategoryMoveQueue' AND COLUMN_NAME = 'subcat_name' AND DATA_TYPE = 'varchar')
BEGIN
  ALTER TABLE [dbo].[SubcategoryMoveQueue] ALTER COLUMN [subcat_name] NVARCHAR(100);
END
