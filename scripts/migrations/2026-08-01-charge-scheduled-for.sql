/*
  Envio agendado da cobrança — a clínica escolhe QUANDO o Kaua manda o Pix.

  `scheduledFor` é a hora marcada para o disparo; um laço no app envia o que já
  venceu e a cobrança segue o caminho normal (status "cobrada" + chargedAt).
  NULL = sem agendamento (comportamento de sempre: sai na hora do clique).

  Índice filtrado porque a varredura roda a cada minuto e só interessam as
  agendadas: sem ele o laço lê a tabela inteira para achar nada na maior parte
  do tempo.

  Migration MANUAL — o app não executa migrations no boot.
*/
IF COL_LENGTH('dbo.Charge', 'scheduledFor') IS NULL
BEGIN
  ALTER TABLE [dbo].[Charge] ADD [scheduledFor] DATETIME2 NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Charge_scheduledFor' AND object_id = OBJECT_ID('dbo.Charge'))
BEGIN
  CREATE INDEX [IX_Charge_scheduledFor] ON [dbo].[Charge] ([scheduledFor])
    INCLUDE ([status]) WHERE [scheduledFor] IS NOT NULL;
END
