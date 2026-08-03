/*
  Ficha do paciente — os dados que a clínica RECADASTRA no sistema dela.

  A clínica no ar usa Amplimed como prontuário e digita o paciente novo lá na
  mão. As instruções dela já mandam o agente pedir nome, endereço, CPF, data de
  nascimento e e-mail no primeiro contato — mas nada disso era guardado: ficava
  só no histórico da conversa, e ela relia mensagem por mensagem para preencher.

  Coluna JSON (e não uma coluna por campo) porque a lista de campos é decisão da
  clínica, não do schema: acrescentar "convênio" amanhã não pode exigir migration.
  O que o agente NÃO perguntou fica AUSENTE do objeto — diferente de vazio, e é
  essa diferença que a tela mostra.

  Migration MANUAL — o app não executa migrations no boot.
*/
IF COL_LENGTH('dbo.Contact', 'fichaJson') IS NULL
BEGIN
  ALTER TABLE [dbo].[Contact] ADD [fichaJson] NVARCHAR(MAX) NULL;
END
