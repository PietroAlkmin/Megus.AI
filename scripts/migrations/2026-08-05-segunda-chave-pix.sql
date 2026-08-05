/*
  Segunda chave Pix — a conta muda conforme o paciente pede nota fiscal.

  A clínica recebe em contas diferentes: quem precisa de NFS-e paga numa chave
  (a que fica na contabilidade), quem não precisa paga em outra. Hoje só existe
  uma, e a Nina mandava a mesma para todo mundo — dinheiro entrando na conta
  errada, que é problema de contador, não de software.

  `pixDescricao` existe porque a chave sozinha não diz nada ao agente: "28756…"
  é só um número. A descrição é o que permite ele explicar ao paciente para
  onde está mandando ("conta da clínica", "conta PJ").

  Sem a segunda chave preenchida, tudo segue na primeira — a clínica que tem uma
  conta só não muda de comportamento.

  Migration MANUAL — o app não executa migrations no boot.
*/
IF COL_LENGTH('dbo.Company', 'pixDescricao') IS NULL
BEGIN
  ALTER TABLE [dbo].[Company] ADD [pixDescricao] NVARCHAR(200) NULL;
END
GO

IF COL_LENGTH('dbo.Company', 'pixTypeNota') IS NULL
BEGIN
  ALTER TABLE [dbo].[Company] ADD [pixTypeNota] NVARCHAR(20) NULL;
END
GO

IF COL_LENGTH('dbo.Company', 'pixKeyNota') IS NULL
BEGIN
  ALTER TABLE [dbo].[Company] ADD [pixKeyNota] NVARCHAR(200) NULL;
END
GO

IF COL_LENGTH('dbo.Company', 'pixDescricaoNota') IS NULL
BEGIN
  ALTER TABLE [dbo].[Company] ADD [pixDescricaoNota] NVARCHAR(200) NULL;
END
