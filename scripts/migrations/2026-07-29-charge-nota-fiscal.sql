/*
  Nota fiscal por atendimento — RECADO PARA A CLÍNICA, não gatilho de sistema.
  Depois do pagamento confirmado o agente pergunta se o cliente quer nota; a
  resposta fica aqui para a clínica emitir no sistema fiscal dela e riscar da
  lista. Ambas as colunas são NULLable: cobrança antiga fica "sem resposta".

  Migration MANUAL — o app não executa migrations no boot.
*/
IF COL_LENGTH('dbo.Charge', 'notaSolicitada') IS NULL
BEGIN
  ALTER TABLE [dbo].[Charge] ADD [notaSolicitada] BIT NULL;
END

IF COL_LENGTH('dbo.Charge', 'notaEmitidaEm') IS NULL
BEGIN
  ALTER TABLE [dbo].[Charge] ADD [notaEmitidaEm] DATETIME2 NULL;
END
