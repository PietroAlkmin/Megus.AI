/**
 * Roteiros da simulação do Kaua.
 *
 * São dois de propósito, e a ordem importa:
 *   ok       — o ciclo fechando sozinho: mostra o VALOR
 *   bloqueio — o CPF que não bate: mostra o LIMITE
 *
 * O segundo é o que de fato constrói confiança. Ver o agente parar e devolver o
 * caso a um humano prova a regra dura do produto: a IA propõe, o código decide.
 * Quem só assiste ao caminho feliz continua se perguntando "e quando der errado?".
 */

/** Uma bolha de conversa. */
export interface PassoFala {
  tipo: "fala";
  lado: "cliente" | "agente";
  texto?: string;
  anexo?: { tipo: "imagem" | "pdf"; nome: string };
}

/** Uma linha no painel "o que o Kaua entendeu". */
export interface PassoRaciocinio {
  tipo: "raciocinio";
  chave: string;
  valor: string;
  ok: boolean;
}

/** Pausa didática: a simulação para e explica a decisão de arquitetura. */
export interface PassoPausa {
  tipo: "pausa";
  titulo: string;
  texto: string;
  botao: string;
}

/** Desfecho: amarra o que aconteceu com a tela onde o usuário verá isso de novo. */
export interface PassoFim {
  tipo: "fim";
  tom: "ok" | "alerta";
  titulo: string;
  texto: string;
}

export type PassoSimulacao = PassoFala | PassoRaciocinio | PassoPausa | PassoFim;

export interface RoteiroSimulacao {
  id: string;
  nome: string;
  descricao: string;
  paciente: { nome: string; telefone: string };
  passos: PassoSimulacao[];
}

export const ROTEIROS: RoteiroSimulacao[] = [
  {
    id: "ok",
    nome: "Tudo certo",
    descricao: "Do pedido à nota emitida.",
    paciente: { nome: "Marina Lopes", telefone: "+55 11 96622-1180" },
    passos: [
      { tipo: "fala", lado: "cliente", texto: "Oi! Fiz uma limpeza hoje de manhã. Consegue me mandar a nota?" },
      { tipo: "raciocinio", chave: "Intenção", valor: "Pedir nota fiscal", ok: true },
      { tipo: "fala", lado: "agente", texto: "Oi, Marina! Claro 😊 Só preciso confirmar seu nome completo e o CPF." },
      { tipo: "fala", lado: "cliente", texto: "Marina Lopes de Souza — 546.252.558-30" },
      { tipo: "raciocinio", chave: "CPF ↔ nome", valor: "Confere", ok: true },
      {
        tipo: "fala",
        lado: "agente",
        texto: "Perfeito! A limpeza ficou R$ 250,00. É só pagar no Pix clinica@sorriso.com.br e me mandar o comprovante 🙂",
      },
      { tipo: "raciocinio", chave: "Serviço", valor: "Limpeza · R$ 250,00", ok: true },
      { tipo: "fala", lado: "cliente", anexo: { tipo: "imagem", nome: "comprovante-pix.jpg" } },
      { tipo: "raciocinio", chave: "Comprovante", valor: "Recebedor e valor conferem", ok: true },
      {
        tipo: "pausa",
        titulo: "Aqui é onde a IA para",
        texto:
          "O Kaua interpretou tudo e propôs a emissão. Mas quem valida o CPF, confere o comprovante e dispara a nota é o código — de forma determinística, sempre igual. A IA nunca comete o ato fiscal sozinha.",
        botao: "Deixar o código emitir",
      },
      {
        tipo: "fala",
        lado: "agente",
        texto: "Prontinho, Marina! Sua nota já está emitida ✅",
        anexo: { tipo: "pdf", nome: "NFS-e-2026-00482.pdf" },
      },
      { tipo: "raciocinio", chave: "Emissão", valor: "NFS-e 2026-00482 emitida", ok: true },
      {
        tipo: "fim",
        tom: "ok",
        titulo: "Ciclo completo, sem você.",
        texto:
          "Cobrou, conferiu o pagamento e emitiu a nota. Este atendimento não apareceria na sua fila — só no registro do que o Kaua fez.",
      },
    ],
  },
  {
    id: "bloqueio",
    nome: "Quando não bate",
    descricao: "O que ele faz ao encontrar um problema.",
    paciente: { nome: "Helena Prado", telefone: "+55 11 97001-3322" },
    passos: [
      { tipo: "fala", lado: "cliente", texto: "quero a nota da consulta de ontem" },
      { tipo: "raciocinio", chave: "Intenção", valor: "Pedir nota fiscal", ok: true },
      { tipo: "fala", lado: "agente", texto: "Claro! Me confirma seu nome completo e o CPF, por favor?" },
      { tipo: "fala", lado: "cliente", texto: "Helena Prado, 111.222.333-44" },
      { tipo: "raciocinio", chave: "CPF ↔ nome", valor: "Não confere com a Receita", ok: false },
      { tipo: "fala", lado: "agente", texto: "O nome não bateu com o CPF informado. Pode conferir e mandar de novo?" },
      { tipo: "fala", lado: "cliente", texto: "é esse mesmo, confere aí" },
      { tipo: "raciocinio", chave: "Emissão", valor: "Bloqueada — dado divergente", ok: false },
      {
        tipo: "pausa",
        titulo: "O Kaua não insiste, nem inventa",
        texto:
          "Ele poderia tentar adivinhar o nome certo. Não tenta. Emitir nota com dado divergente é problema fiscal seu, não dele — então ele para e devolve o caso para um humano.",
        botao: "Ver o que acontece",
      },
      {
        tipo: "fala",
        lado: "agente",
        texto: "Vou pedir para alguém da recepção te ajudar com isso, tá? Já já respondem 🙂",
      },
      {
        tipo: "fim",
        tom: "alerta",
        titulo: "Foi parar na sua fila.",
        texto:
          'Este caso aparece agora em "Precisa de você", na tela Hoje — com o histórico completo e o motivo do bloqueio. Você decide o que fazer.',
      },
    ],
  },
];
