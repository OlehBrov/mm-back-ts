-- Migration: Add SubcategoryMoveQueue table
-- Stores subcategory-to-category reassignment requests written by admin; applied to
-- Subcategories table by IdleSyncService when the kiosk reports an idle screen.
-- Run ONCE on production DB before deploying mm-back-nest with ConfigStoreModule.

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SubcategoryMoveQueue' AND xtype='U')
BEGIN
  CREATE TABLE [dbo].[SubcategoryMoveQueue] (
    [id]            INT           IDENTITY(1,1) NOT NULL,
    [cat_1C_id]     INT                         NOT NULL,
    [subcat_1C_id]  INT                         NOT NULL,
    [new_cat_1C_id] INT                         NOT NULL,
    [subcat_name]   NVARCHAR(100)                   NULL,
    [status]        VARCHAR(20)                 NOT NULL CONSTRAINT [DF__SubcatMvQ__status] DEFAULT ('pending'),
    [created_at]    DATETIME                    NOT NULL CONSTRAINT [DF__SubcatMvQ__create] DEFAULT (GETDATE()),
    [processed_at]  DATETIME                        NULL,
    CONSTRAINT [SubcatMoveQueue_PK] PRIMARY KEY CLUSTERED ([id] ASC)
  );

  -- Index for IdleSyncService query: status + created_at (processes pending in order)
  CREATE INDEX [IX_SubcategoryMoveQueue_processing_order]
    ON [dbo].[SubcategoryMoveQueue] ([status], [created_at]);

  PRINT 'SubcategoryMoveQueue table created successfully.';
END
ELSE
  PRINT 'SubcategoryMoveQueue table already exists, skipping.';
