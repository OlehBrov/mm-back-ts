IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CategoryTaskQueue')
BEGIN
  CREATE TABLE [dbo].[CategoryTaskQueue] (
    [id]                   INT           IDENTITY(1,1) NOT NULL,
    [action]               VARCHAR(30)   NOT NULL,
    [status]               VARCHAR(20)   NOT NULL CONSTRAINT [DF__CatTaskQ__status] DEFAULT ('pending'),
    [cat_1C_id]            INT           NOT NULL,
    [category_name]        NVARCHAR(25)  NULL,
    [category_discount]    DECIMAL(10,2) NULL,
    [category_image]       VARCHAR(100)  NULL,
    [category_priority]    INT           NULL,
    [subcat_1C_id]         INT           NULL,
    [subcategory_name]     NVARCHAR(100) NULL,
    [subcategory_discount] DECIMAL(10,2) NULL,
    [new_subcat_1C_id]     INT           NULL,
    [new_cat_1C_id]        INT           NULL,
    [created_at]           DATETIME      NOT NULL CONSTRAINT [DF__CatTaskQ__create] DEFAULT (GETDATE()),
    [processed_at]         DATETIME      NULL,
    CONSTRAINT [CategoryTaskQueue_PK] PRIMARY KEY ([id])
  );
END
