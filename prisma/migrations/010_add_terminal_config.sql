IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TerminalConfig')
BEGIN
  CREATE TABLE [dbo].[TerminalConfig] (
    [id]   INT            IDENTITY(1,1) NOT NULL,
    [bank] NVARCHAR(20)   NOT NULL,
    [name] NVARCHAR(100)  NULL,
    [host] VARCHAR(100)   NULL,
    [port] INT            NULL,
    CONSTRAINT [TerminalConfig_PK]     PRIMARY KEY ([id]),
    CONSTRAINT [TerminalConfig_UNIQUE] UNIQUE ([bank])
  );
END
