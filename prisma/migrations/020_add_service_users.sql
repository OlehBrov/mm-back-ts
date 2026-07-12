CREATE TABLE ServiceUsers (
  id        INT           IDENTITY(1,1) PRIMARY KEY,
  createdAt DATETIME2     NOT NULL DEFAULT GETDATE(),
  password  NVARCHAR(100) NOT NULL
);
