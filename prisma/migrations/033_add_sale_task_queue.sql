-- Sales dictionary changes (add/edit/delete/toggle) must not land on active Products
-- mid-purchase, same reasoning as CategoryTaskQueue/StoreSaleQueue: they go through this
-- queue and IdleSyncService applies them only when the kiosk is idle.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SaleTaskQueue')
BEGIN
  CREATE TABLE [dbo].[SaleTaskQueue] (
    [id]               INT           IDENTITY(1,1) NOT NULL,
    [action]           VARCHAR(20)   NOT NULL,
    [status]           VARCHAR(20)   NOT NULL CONSTRAINT [DF__SaleTaskQ__status] DEFAULT ('pending'),
    [sale_custom_id]   INT           NOT NULL,
    [sale_name]        NVARCHAR(128) NULL,
    [sale_discount_1]  DECIMAL(2,2)  NULL,
    [sale_discount_2]  DECIMAL(2,2)  NULL,
    [sale_discount_3]  DECIMAL(2,2)  NULL,
    [sale_description] NVARCHAR(256) NULL,
    [threshold_amount] DECIMAL(10,2) NULL,
    [is_active]        BIT           NULL,
    [created_at]       DATETIME      NOT NULL CONSTRAINT [DF__SaleTaskQ__create] DEFAULT (GETDATE()),
    [processed_at]     DATETIME      NULL,
    CONSTRAINT [SaleTaskQueue_PK] PRIMARY KEY ([id])
  );
END
