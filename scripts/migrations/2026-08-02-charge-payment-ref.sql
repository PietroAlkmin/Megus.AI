/*
  Identidade do pagamento que quitou a cobrança.

  `paymentRef` = ID único da transação lido do comprovante (E2E do Pix /
  "ID da transação" / "Autenticação"). É o que impede o MESMO comprovante
  confirmar duas cobranças de igual valor: valor, recebedor e chave Pix são
  idênticos nesse caso — só o ID distingue um pagamento do outro.

  `paidBy` = nome de quem pagou, como está no comprovante. Já era extraído e
  descartado; guardar dá à clínica o "quem pagou" (terceiro pagando pelo
  paciente é rotina) sem custo nenhum.

  Índice filtrado porque a checagem de duplicidade roda a cada comprovante e só
  interessam as cobranças que já têm um pagamento registrado.

  Migration MANUAL — o app não executa migrations no boot.
*/
IF COL_LENGTH('dbo.Charge', 'paymentRef') IS NULL
BEGIN
  ALTER TABLE [dbo].[Charge] ADD [paymentRef] NVARCHAR(120) NULL;
END
GO

IF COL_LENGTH('dbo.Charge', 'paidBy') IS NULL
BEGIN
  ALTER TABLE [dbo].[Charge] ADD [paidBy] NVARCHAR(200) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Charge_paymentRef' AND object_id = OBJECT_ID('dbo.Charge'))
BEGIN
  CREATE INDEX [IX_Charge_paymentRef] ON [dbo].[Charge] ([integrationId], [paymentRef])
    WHERE [paymentRef] IS NOT NULL;
END
