-- Migration MANUAL — tabela [Charge] (cobrança de agendamento).
--
-- O app NÃO roda migration sozinho (sem .migrate()/EnsureCreated no boot,
-- sem prisma migrate — ver docs/backend.md §5/§13). Este arquivo precisa ser
-- aplicado À MÃO no Azure SQL de produção ANTES de fazer deploy do código
-- desta feature (Task 5 do plano), com aval do Pietro na hora. Contra
-- hml/dev não roda automático em lugar nenhum — banco de prod é o mesmo
-- usado por todo ambiente (ver memória: hml/prod são bancos idênticos).
--
-- Dialeto SQL Server (Azure SQL). Idempotente: pode rodar mais de uma vez
-- sem erro (BEGIN/END só executa se a tabela ainda não existir).
--
-- Como rodar (dentro do container que já tem @prisma/client gerado +
-- DATABASE_URL, mesma convenção do scripts/seed-demo.mjs):
--   docker exec megus_app npx prisma db execute --schema prisma/schema.prisma --file scripts/migrations/2026-07-12-charge.sql
--
-- Alternativa (sqlcmd direto, ex.: Azure Cloud Shell ou máquina com o CLI):
--   sqlcmd -S <servidor>.database.windows.net -d <database> -U <usuario> -P <senha> -i scripts/migrations/2026-07-12-charge.sql

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Charge]') AND type = N'U')
BEGIN
    CREATE TABLE [dbo].[Charge] (
        [id]              NVARCHAR(1000)  NOT NULL,
        [integrationId]   NVARCHAR(1000)  NOT NULL,
        [contactId]       NVARCHAR(1000)  NOT NULL,
        [serviceId]       NVARCHAR(1000)  NULL,
        [description]     NVARCHAR(1000)  NOT NULL,
        [amount]          FLOAT           NOT NULL,
        [status]          NVARCHAR(1000)  NOT NULL,
        [calendarEventId] NVARCHAR(1000)  NULL,
        [chargedAt]       DATETIME2       NULL,
        [paidAt]          DATETIME2       NULL,
        [createdAt]       DATETIME2       NOT NULL CONSTRAINT [Charge_createdAt_df] DEFAULT GETDATE(),
        [updatedAt]       DATETIME2       NOT NULL,
        CONSTRAINT [Charge_pkey] PRIMARY KEY CLUSTERED ([id])
    );

    -- FKs sem ON DELETE/ON UPDATE explícito = default do SQL Server é NO ACTION
    -- nos dois. Decisão deliberada (não só omissão): CASCADE em ambas criaria
    -- dois caminhos de cascade até [Charge] (via Integration direto E via
    -- Integration→Contact), que o próprio `prisma generate` recusou por
    -- ambiguidade (ver prisma/schema.prisma, comentário no model Charge) —
    -- e mesmo sem esse conflito, cobrança é registro financeiro: apagar uma
    -- Integration/Contact NÃO deve arrastar Charges em silêncio.
    ALTER TABLE [dbo].[Charge] ADD CONSTRAINT [Charge_integrationId_fkey]
        FOREIGN KEY ([integrationId]) REFERENCES [dbo].[Integration]([id]);

    ALTER TABLE [dbo].[Charge] ADD CONSTRAINT [Charge_contactId_fkey]
        FOREIGN KEY ([contactId]) REFERENCES [dbo].[Contact]([id]);

    CREATE NONCLUSTERED INDEX [Charge_integrationId_status_idx]
        ON [dbo].[Charge] ([integrationId], [status]);
END
