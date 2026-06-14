-- Migration: Add FiscalQueue table
-- Ensures chronological fiscal receipt processing for vchasno.kasa compliance.
-- Run ONCE on production DB before deploying mm-back-nest.

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FiscalQueue' AND xtype='U')
BEGIN
  CREATE TABLE [dbo].[FiscalQueue] (
    [id]                 INT IDENTITY(1,1) NOT NULL,
    [payload]            NVARCHAR(MAX)     NOT NULL,
    [with_vat]           BIT               NOT NULL CONSTRAINT [DF__FiscalQue__with___VAT]    DEFAULT (0),
    [status]             VARCHAR(20)       NOT NULL CONSTRAINT [DF__FiscalQue__status]        DEFAULT ('pending'),
    [attempts]           INT               NOT NULL CONSTRAINT [DF__FiscalQue__attemp]        DEFAULT (0),
    [max_attempts]       INT               NOT NULL CONSTRAINT [DF__FiscalQue__max_at]        DEFAULT (10),
    [last_error]         NVARCHAR(500)         NULL,
    [fiscal_response]    NVARCHAR(MAX)         NULL,
    [remove_product_ids] NVARCHAR(500)         NULL,
    [created_at]         DATETIME          NOT NULL CONSTRAINT [DF__FiscalQue__create]        DEFAULT (GETDATE()),
    [next_retry_at]      DATETIME          NOT NULL CONSTRAINT [DF__FiscalQue__next_r]        DEFAULT (GETDATE()),
    [processed_at]       DATETIME              NULL,
    CONSTRAINT [FiscalQueue_PK] PRIMARY KEY CLUSTERED ([id] ASC)
  );

  -- Index for the processor query: status + next_retry_at + created_at
  CREATE INDEX [IX_FiscalQueue_processing_order]
    ON [dbo].[FiscalQueue] ([status], [next_retry_at], [created_at]);

  PRINT 'FiscalQueue table created successfully.';
END
ELSE
  PRINT 'FiscalQueue table already exists, skipping.';
