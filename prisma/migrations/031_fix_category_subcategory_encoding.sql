-- Categories.category_name and Subcategories.subcategory_name were left as
-- VARCHAR, so node-mssql/tedious binds Prisma string params for them as
-- Latin1, silently mangling Cyrillic into '?' on write — same root cause
-- already fixed for Products/ProductUpdateQueue in migrations 029/030.
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Categories' AND COLUMN_NAME = 'category_name' AND DATA_TYPE = 'varchar')
BEGIN
  ALTER TABLE [dbo].[Categories] ALTER COLUMN [category_name] NVARCHAR(25) NOT NULL;
END

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Subcategories' AND COLUMN_NAME = 'subcategory_name' AND DATA_TYPE = 'varchar')
BEGIN
  ALTER TABLE [dbo].[Subcategories] ALTER COLUMN [subcategory_name] NVARCHAR(100);
END
