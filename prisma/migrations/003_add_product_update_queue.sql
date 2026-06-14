-- Migration: Add ProductUpdateQueue table
-- Stores partial product field updates written by admin; applied to Products table
-- by IdleSyncService when the kiosk reports an idle screen (no active customer session).
-- Run ONCE on production DB before deploying mm-back-nest with StoreModule.

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ProductUpdateQueue' AND xtype='U')
BEGIN
  CREATE TABLE [dbo].[ProductUpdateQueue] (
    [id]                  INT            IDENTITY(1,1) NOT NULL,
    [barcode]             VARCHAR(256)                 NOT NULL,
    [cat_subcat_id]       INT                          NOT NULL,
    [product_name]        NVARCHAR(256)                    NULL,
    [product_code]        VARCHAR(256)                     NULL,
    [measure]             VARCHAR(64)                      NULL,
    [product_name_ru]     NVARCHAR(256)                    NULL,
    [product_name_ua]     NVARCHAR(256)                    NULL,
    [product_description] NVARCHAR(256)                    NULL,
    [product_image]       VARCHAR(255)                     NULL,
    [product_price]       DECIMAL(10, 2)                   NULL,
    [product_discount]    DECIMAL(10, 2)                   NULL,
    [exposition_term]     INT                              NULL,
    [discount_price_1]    DECIMAL(10, 2)                   NULL,
    [discount_price_2]    DECIMAL(10, 2)                   NULL,
    [discount_price_3]    DECIMAL(10, 2)                   NULL,
    [is_VAT_Excise]       BIT                              NULL,
    [excise_product]      BIT                              NULL,
    [product_left]        DECIMAL(10, 2)                   NULL,
    [is_new_product]      BIT                              NULL,
    [product_category]    INT                              NULL,
    [product_subcategory] INT                              NULL,
    [product_division]    INT                              NULL,
    [sale_id]             INT                              NULL,
    [status]              VARCHAR(20)                  NOT NULL CONSTRAINT [DF__ProdUpdQu__status] DEFAULT ('pending'),
    [created_at]          DATETIME                     NOT NULL CONSTRAINT [DF__ProdUpdQu__create] DEFAULT (GETDATE()),
    [processed_at]        DATETIME                         NULL,
    CONSTRAINT [ProductUpdateQueue_PK] PRIMARY KEY CLUSTERED ([id] ASC)
  );

  -- Index for IdleSyncService query: status + created_at (processes pending in order)
  CREATE INDEX [IX_ProductUpdateQueue_processing_order]
    ON [dbo].[ProductUpdateQueue] ([status], [created_at]);

  PRINT 'ProductUpdateQueue table created successfully.';
END
ELSE
  PRINT 'ProductUpdateQueue table already exists, skipping.';
