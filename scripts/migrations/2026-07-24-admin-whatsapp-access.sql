-- Migration MANUAL — autorização de comandos administrativos por WhatsApp.
-- Aplicar antes do deploy que habilita /admin. O app não executa migrations no boot.

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AdminWhatsappAccess]') AND type = N'U')
BEGIN
    CREATE TABLE [dbo].[AdminWhatsappAccess] (
        [id]             NVARCHAR(1000) NOT NULL,
        [companyId]      NVARCHAR(1000) NOT NULL,
        [whatsappNumber] NVARCHAR(1000) NOT NULL,
        [active]         BIT            NOT NULL CONSTRAINT [AdminWhatsappAccess_active_df] DEFAULT 1,
        [createdAt]      DATETIME2      NOT NULL CONSTRAINT [AdminWhatsappAccess_createdAt_df] DEFAULT GETDATE(),
        [updatedAt]      DATETIME2      NOT NULL,
        CONSTRAINT [AdminWhatsappAccess_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [AdminWhatsappAccess_companyId_fkey]
            FOREIGN KEY ([companyId]) REFERENCES [dbo].[Company]([id]) ON DELETE CASCADE,
        CONSTRAINT [AdminWhatsappAccess_companyId_whatsappNumber_key]
            UNIQUE ([companyId], [whatsappNumber])
    );

    CREATE NONCLUSTERED INDEX [AdminWhatsappAccess_companyId_active_idx]
        ON [dbo].[AdminWhatsappAccess] ([companyId], [active]);
END
