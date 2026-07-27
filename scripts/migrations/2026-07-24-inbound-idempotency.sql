/*
  Idempotência de webhooks WhatsApp. A Evolution pode reenviar um mesmo upsert;
  a chave única por integração torna o claim atômico também entre processos.
*/
IF OBJECT_ID(N'[dbo].[ProcessedInboundMessage]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[ProcessedInboundMessage] (
    [id] NVARCHAR(1000) NOT NULL,
    [integrationId] NVARCHAR(1000) NOT NULL,
    [providerMessageId] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProcessedInboundMessage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ProcessedInboundMessage_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProcessedInboundMessage_integrationId_providerMessageId_key] UNIQUE ([integrationId], [providerMessageId])
  );
  CREATE NONCLUSTERED INDEX [ProcessedInboundMessage_createdAt_idx]
    ON [dbo].[ProcessedInboundMessage] ([createdAt]);
END
