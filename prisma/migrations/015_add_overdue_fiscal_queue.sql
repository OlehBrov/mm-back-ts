-- Migration: Add OverdueFiscalQueue table
-- Stores FiscalQueue jobs that were not completed by end of business day.
-- Archival runs daily at midnight (Kyiv time) to keep the active queue clean.

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='OverdueFiscalQueue' AND xtype='U')
BEGIN
  CREATE TABLE [dbo].[OverdueFiscalQueue] (
    [id]                 INT IDENTITY(1,1) NOT NULL,
    [original_id]        INT               NOT NULL,
    [payload]            NVARCHAR(MAX)     NOT NULL,
    [with_vat]           BIT               NOT NULL CONSTRAINT [DF__OverdueFQ__with_vat] DEFAULT (0),
    [bank]               VARCHAR(20)       NOT NULL CONSTRAINT [DF__OverdueFQ__bank]     DEFAULT (''),
    [merchant_id]        VARCHAR(100)      NOT NULL CONSTRAINT [DF__OverdueFQ__merch]    DEFAULT (''),
    [status]             VARCHAR(20)       NOT NULL CONSTRAINT [DF__OverdueFQ__status]   DEFAULT ('pending'),
    [attempts]           INT               NOT NULL CONSTRAINT [DF__OverdueFQ__attemp]   DEFAULT (0),
    [last_error]         NVARCHAR(500)         NULL,
    [remove_product_ids] NVARCHAR(500)         NULL,
    [created_at]         DATETIME          NOT NULL,
    [archived_at]        DATETIME          NOT NULL CONSTRAINT [DF__OverdueFQ__arch]     DEFAULT (GETDATE()),
    CONSTRAINT [OverdueFiscalQueue_PK] PRIMARY KEY CLUSTERED ([id] ASC)
  );

  CREATE INDEX [IX_OverdueFiscalQueue_archived_at]
    ON [dbo].[OverdueFiscalQueue] ([archived_at]);

  PRINT 'OverdueFiscalQueue table created successfully.';
END
ELSE
  PRINT 'OverdueFiscalQueue table already exists, skipping.';
