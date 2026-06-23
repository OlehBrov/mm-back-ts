IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FiscalConfig')
BEGIN
  CREATE TABLE [dbo].[FiscalConfig] (
    [id]            INT            IDENTITY(1,1) NOT NULL,
    [merchant_id]   VARCHAR(100)   NOT NULL,
    [merchant_name] NVARCHAR(255)  NULL,
    [merchant_code] VARCHAR(20)    NULL,
    [fiscal_token]  NVARCHAR(255)  NULL,
    CONSTRAINT [FiscalConfig_PK]     PRIMARY KEY ([id]),
    CONSTRAINT [FiscalConfig_UNIQUE] UNIQUE ([merchant_id])
  );
END
