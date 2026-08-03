/*
  Impressão digital do COMPROVANTE que quitou a cobrança.

  A trava de reuso dependia só do ID da transação lido pela visão — e visão é
  OCR, que não é determinístico. Ao vivo (03/08) o MESMO print foi lido duas
  vezes de formas diferentes:

      E303062942026080300470000023MPK4   (32 caracteres, formato correto)
      E30306294202608030047000023MPK4    (31 — um zero a menos)

  Com chaves diferentes, o reenvio quitou uma segunda cobrança. O hash dos bytes
  da imagem não passa por leitura nenhuma: print reenviado é byte a byte igual e
  bate sempre. Os dois convivem — o hash pega o reenvio do mesmo arquivo, o ID
  pega o comprovante refotografado (quando a leitura acerta).

  Migration MANUAL — o app não executa migrations no boot.
*/
IF COL_LENGTH('dbo.Charge', 'receiptHash') IS NULL
BEGIN
  ALTER TABLE [dbo].[Charge] ADD [receiptHash] NVARCHAR(64) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Charge_receiptHash' AND object_id = OBJECT_ID('dbo.Charge'))
BEGIN
  CREATE INDEX [IX_Charge_receiptHash] ON [dbo].[Charge] ([integrationId], [receiptHash])
    WHERE [receiptHash] IS NOT NULL;
END
