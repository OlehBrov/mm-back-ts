IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'FiscalQueue' AND COLUMN_NAME = 'bank')
BEGIN
  ALTER TABLE [dbo].[FiscalQueue] ADD [bank] VARCHAR(20) NOT NULL CONSTRAINT [DF__FiscalQue__bank] DEFAULT '';
  PRINT 'Column bank added to FiscalQueue.';
END
ELSE
  PRINT 'Column bank already exists in FiscalQueue, skipping.';

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'FiscalQueue' AND COLUMN_NAME = 'merchant_id')
BEGIN
  ALTER TABLE [dbo].[FiscalQueue] ADD [merchant_id] VARCHAR(100) NOT NULL CONSTRAINT [DF__FiscalQue__merch] DEFAULT '';
  PRINT 'Column merchant_id added to FiscalQueue.';
END
ELSE
  PRINT 'Column merchant_id already exists in FiscalQueue, skipping.';
