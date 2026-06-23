-- Add support_email, feedback_email, last_feedback_report_date to Store
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'support_email'
)
  ALTER TABLE [dbo].[Store] ADD [support_email] NVARCHAR(255) NULL;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'feedback_email'
)
  ALTER TABLE [dbo].[Store] ADD [feedback_email] NVARCHAR(255) NULL;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Store' AND COLUMN_NAME = 'last_feedback_report_date'
)
  ALTER TABLE [dbo].[Store] ADD [last_feedback_report_date] DATE NULL;

-- Create Feedbacks table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Feedbacks')
BEGIN
  CREATE TABLE [dbo].[Feedbacks] (
    [id]         INT IDENTITY(1,1) NOT NULL,
    [rating]     TINYINT NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_Feedbacks_created_at] DEFAULT GETDATE(),
    CONSTRAINT [Feedbacks_PK] PRIMARY KEY ([id])
  );
END
