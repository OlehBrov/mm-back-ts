-- ProductUpdateQueue.measure was left as VARCHAR by migration 029, so it
-- still gets bound as Latin1 by node-mssql/tedious and Cyrillic values
-- (e.g. "шт") get mangled into "??" at enqueue time, before ever reaching
-- Products.measure (which is already NVARCHAR).
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ProductUpdateQueue' AND COLUMN_NAME = 'measure' AND DATA_TYPE = 'varchar')
BEGIN
  ALTER TABLE [dbo].[ProductUpdateQueue] ALTER COLUMN [measure] NVARCHAR(64);
END
