-- Migration: Add threshold_amount to Sales + seed "мінімальний чек" promotion (sale_custom_id = 10)
-- threshold_amount holds a money amount (e.g. 500.00 UAH), unlike sale_discount_1/2/3
-- which are fractions (0-1) and too small (DECIMAL(2,2)) to hold a check total.
--
-- The migration runner executes this whole file as a single batch (no GO separators),
-- and SQL Server compiles a batch in full before running any statement in it. The INSERT
-- below references threshold_amount, so if it were a plain statement it would fail to
-- compile whenever the column doesn't exist yet — even though the ALTER TABLE earlier in
-- this same file would have added it moments before. Running both steps via dynamic SQL
-- (EXEC) defers their compilation to execution time, after the column already exists.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Sales' AND COLUMN_NAME = 'threshold_amount'
)
BEGIN
  EXEC('ALTER TABLE [dbo].[Sales] ADD [threshold_amount] DECIMAL(10,2) NULL');
  PRINT 'Column threshold_amount added to Sales table.';
END
ELSE
  PRINT 'Column threshold_amount already exists in Sales table, skipping.';

IF NOT EXISTS (SELECT 1 FROM [dbo].[Sales] WHERE [sale_custom_id] = 10)
BEGIN
  EXEC(N'
    INSERT INTO [dbo].[Sales] (
      [sale_name], [sale_discount_1], [sale_description], [sale_custom_id], [is_active], [threshold_amount]
    )
    VALUES (
      N''мінімальний чек'',
      0.10,
      N''Знижка на товари без власної акції при сумі чека від threshold_amount'',
      10,
      1,
      500.00
    )');

  PRINT 'Sales row sale_custom_id=10 (мінімальний чек) inserted.';
END
ELSE
  PRINT 'Sales row sale_custom_id=10 already exists, skipping.';
