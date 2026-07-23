-- Ensure AdditionalBarcodes table and its columns exist.
-- Some older DBs (migrated from the JS backend before this feature was added)
-- already have the AdditionalBarcodes table but without the
-- additional_barcode_1..5 columns, which broke barcode-scan lookups.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AdditionalBarcodes')
BEGIN
  CREATE TABLE [dbo].[AdditionalBarcodes] (
    [id]                    INT           IDENTITY(1,1) NOT NULL,
    [main_barcode]          VARCHAR(256)  NOT NULL,
    [additional_barcode_1]  VARCHAR(256)  NULL,
    [additional_barcode_2]  VARCHAR(256)  NULL,
    [additional_barcode_3]  VARCHAR(256)  NULL,
    [additional_barcode_4]  VARCHAR(256)  NULL,
    [additional_barcode_5]  VARCHAR(256)  NULL,
    CONSTRAINT [PK__Addition__3213E83F4DCF795F] PRIMARY KEY ([id]),
    CONSTRAINT [AdditionalBarcodes_UNIQUE] UNIQUE ([main_barcode]),
    CONSTRAINT [AdditionalBarcodes_Products_FK] FOREIGN KEY ([main_barcode]) REFERENCES [dbo].[Products] ([barcode])
  );
  PRINT 'Table AdditionalBarcodes created.';
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AdditionalBarcodes' AND COLUMN_NAME = 'additional_barcode_1')
  ALTER TABLE [dbo].[AdditionalBarcodes] ADD [additional_barcode_1] VARCHAR(256) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AdditionalBarcodes' AND COLUMN_NAME = 'additional_barcode_2')
  ALTER TABLE [dbo].[AdditionalBarcodes] ADD [additional_barcode_2] VARCHAR(256) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AdditionalBarcodes' AND COLUMN_NAME = 'additional_barcode_3')
  ALTER TABLE [dbo].[AdditionalBarcodes] ADD [additional_barcode_3] VARCHAR(256) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AdditionalBarcodes' AND COLUMN_NAME = 'additional_barcode_4')
  ALTER TABLE [dbo].[AdditionalBarcodes] ADD [additional_barcode_4] VARCHAR(256) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AdditionalBarcodes' AND COLUMN_NAME = 'additional_barcode_5')
  ALTER TABLE [dbo].[AdditionalBarcodes] ADD [additional_barcode_5] VARCHAR(256) NULL;

-- Ensure Products has the FK column back to AdditionalBarcodes.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Products' AND COLUMN_NAME = 'additional_barcodes')
BEGIN
  ALTER TABLE [dbo].[Products] ADD [additional_barcodes] INT NULL;
  PRINT 'Column additional_barcodes added to Products.';
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'Products_AdditionalBarcodes_FK')
  ALTER TABLE [dbo].[Products] ADD CONSTRAINT [Products_AdditionalBarcodes_FK]
    FOREIGN KEY ([additional_barcodes]) REFERENCES [dbo].[AdditionalBarcodes] ([id]);
