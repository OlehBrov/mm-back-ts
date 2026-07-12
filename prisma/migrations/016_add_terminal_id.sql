-- Add terminal_id field to TerminalConfig
-- Stores the physical terminal device identifier assigned by the bank (TID).

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'TerminalConfig' AND COLUMN_NAME = 'terminal_id'
)
  ALTER TABLE [dbo].[TerminalConfig] ADD [terminal_id] VARCHAR(50) NULL;
