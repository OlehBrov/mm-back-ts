-- Migration: Add TerminalOperations table
-- Stores terminal payment operation records for audit and reporting.
-- Run ONCE on production DB before deploying mm-back-nest with CartModule.

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TerminalOperations' AND xtype='U')
BEGIN
  CREATE TABLE [dbo].[TerminalOperations] (
    [id]                  INT            IDENTITY(1,1) NOT NULL,
    [operation_type]      VARCHAR(100)                     NULL,
    [operation_date_time] DATETIME                         NULL,
    [amount]              INT                              NULL,
    [merchant]            VARCHAR(100)                     NULL,
    [taxgrp]              INT                              NULL,
    [transaction_id]      VARCHAR(100)                     NULL,
    [rrn]                 VARCHAR(50)                      NULL,
    [response_code]       VARCHAR(100)                     NULL,
    [error_message]       VARCHAR(255)                     NULL,
    [currency]            VARCHAR(20)                      NULL,
    [card_pan]            VARCHAR(25)                      NULL,
    [additional_data]     NVARCHAR(MAX)                    NULL,
    [created_at]          DATETIME                         NULL,
    [updated_at]          DATETIME                         NULL,
    CONSTRAINT [TerminalOperations_PK] PRIMARY KEY CLUSTERED ([id] ASC)
  );

  PRINT 'TerminalOperations table created successfully.';
END
ELSE
  PRINT 'TerminalOperations table already exists, skipping.';
