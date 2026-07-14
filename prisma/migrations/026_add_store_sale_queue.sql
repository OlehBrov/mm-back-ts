IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StoreSaleQueue')
BEGIN
  CREATE TABLE [dbo].[StoreSaleQueue] (
    [id]                             INT           IDENTITY(1,1) NOT NULL,
    [store_auth_id]                  VARCHAR(50)   NOT NULL,
    [store_sale_name]                NVARCHAR(100) NOT NULL,
    [store_sale_title]               NVARCHAR(100) NOT NULL,
    [store_sale_discount]            DECIMAL(10,2) NOT NULL,
    [store_sale_product_category]    INT           NOT NULL,
    [store_sale_product_subcategory] INT           NOT NULL,
    [status]                         VARCHAR(20)   NOT NULL CONSTRAINT [DF__StoreSaleQ__status] DEFAULT ('pending'),
    [created_at]                     DATETIME      NOT NULL CONSTRAINT [DF__StoreSaleQ__create] DEFAULT (GETDATE()),
    [processed_at]                   DATETIME      NULL,
    CONSTRAINT [StoreSaleQueue_PK] PRIMARY KEY ([id])
  );
END
