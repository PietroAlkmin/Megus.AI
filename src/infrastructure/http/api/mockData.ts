/**
 * Dados de exemplo (mock) — usados pelas rotas de painel quando USE_MOCK_DATA=true.
 *
 * Centralizados aqui para:
 *  - manter as rotas limpas (a rota só decide "mock ou real", não carrega dados);
 *  - facilitar a virada para dados reais (apague o uso, não cace mock espalhado);
 *  - servir todas as telas no mesmo padrão (atendimentos, conversas, cobranças...).
 *
 * Cada função recebe o companyId para, no futuro, o mock poder variar por empresa
 * se necessário (hoje devolve o mesmo conjunto).
 */

export const mockData = {
  // --- Tela: Atendimentos (agentes + métricas) ---
  agentes(_companyId: string) {
    return [
      { id: "ag-alpha", nome: "Kaua", papel: "Recepção · Alphaville", numero: "+55 11 98123-4477",
        segmento: "Saúde / Clínica", doc: "NFS-e", status: "operando",
        conversas: 7, notasHoje: 12, resp: "1m 10s", ultima: "agora", alerta: null },
      { id: "ag-centro", nome: "Kaua", papel: "Recepção · Centro", numero: "+55 11 98456-2210",
        segmento: "Saúde / Clínica", doc: "NFS-e", status: "operando",
        conversas: 4, notasHoje: 6, resp: "2m 05s", ultima: "4 min", alerta: null },
      { id: "ag-estetica", nome: "Sofia", papel: "Estética", numero: "+55 11 99701-8890",
        segmento: "Beleza / Estética", doc: "NFS-e", status: "atencao",
        conversas: 2, notasHoje: 1, resp: "5m 40s", ultima: "12 min",
        alerta: "CPF↔nome não confere — 1 conversa em espera" },
      { id: "ag-odonto", nome: "Kaua", papel: "Odontologia", numero: "+55 11 98770-1145",
        segmento: "Saúde / Clínica", doc: "NFS-e", status: "pausado",
        conversas: 0, notasHoje: 0, resp: "—", ultima: "1 h", alerta: null },
      { id: "ag-teste", nome: "Kaua", papel: "Número de testes", numero: "+55 11 90000-0000",
        segmento: "Saúde / Clínica", doc: "NFS-e", status: "desconectado",
        conversas: 0, notasHoje: 0, resp: "—", ultima: "2 d", alerta: null },
    ];
  },

  agentesMetricas(companyId: string) {
    const ags = this.agentes(companyId);
    const soma = (k: "conversas" | "notasHoje") => ags.reduce((acc, a) => acc + (a[k] || 0), 0);
    return {
      operando: ags.filter((a) => a.status === "operando").length,
      total: ags.length,
      abertas: soma("conversas"),
      notasHoje: soma("notasHoje"),
      msgsHoje: 214,
      transferencias: 2,
      alertas: ags.filter((a) => a.alerta).length,
    };
  },

  // --- Tela: Conversas de um agente ---
  conversas(_companyId: string, agentId: string) {
    const porAgente: Record<string, unknown[]> = {
      "ag-alpha": [
        { id: "c1", nome: "Marina Lopes", telefone: "+55 11 96622-1180", ultima: "Prontinho! Sua nota está emitida ✅", hora: "14:32", status: "BOT", naoLidas: 0 },
        { id: "c2", nome: "Carlos Aguiar", telefone: "+55 11 98890-4471", ultima: "Já fiz o pagamento, e a nota?", hora: "14:28", status: "BOT", naoLidas: 2 },
        { id: "c3", nome: "Helena Prado", telefone: "+55 11 97001-3322", ultima: "O nome não bateu com o CPF…", hora: "14:11", status: "AGUARDANDO", naoLidas: 1 },
        { id: "c4", nome: "Rafael Dias", telefone: "+55 11 99654-8120", ultima: "Bom dia! Queria remarcar minha consulta.", hora: "13:40", status: "HUMANO", naoLidas: 0 },
      ],
      };
      return porAgente[agentId] ?? porAgente["ag-alpha"];
    },

  mensagens(_companyId: string, convId: string) {
    const porConversa: Record<string, unknown[]> = {
      c1: [
        { id: "m1", autor: "cliente", texto: "Oi! Fiz uma consulta hoje e já paguei. Consigo a nota fiscal?", hora: "14:21" },
        { id: "m2", autor: "bot", texto: "Oi, Marina! 😊 Claro, eu emito sua NFS-e. Antes, me confirma seu nome completo e CPF, por favor?", hora: "14:21" },
        { id: "m3", autor: "cliente", texto: "Marina Lopes de Souza — 546.252.558-30", hora: "14:23" },
        { id: "m4", autor: "bot", texto: "Perfeito, conferi seus dados ✅ Agora me envia o comprovante de pagamento (foto ou PDF) que eu emito a nota.", hora: "14:23" },
        { id: "m5", autor: "cliente", texto: "", hora: "14:29", attach: { type: "image", name: "comprovante-pix.jpg" } },
        { id: "m6", autor: "bot", texto: "Recebi! Confirmei o pagamento de R$ 250,00 para a Clínica Sorriso. Emitindo sua nota fiscal…", hora: "14:30" },
        { id: "m7", autor: "bot", texto: "Prontinho! Sua NFS-e está emitida ✅ Segue o PDF. Qualquer coisa, é só chamar 😉", hora: "14:32", attach: { type: "file", name: "NFS-e-2026-00481.pdf" } },
      ],
      c2: [
        { id: "n1", autor: "cliente", texto: "Boa tarde", hora: "14:26" },
        { id: "n2", autor: "cliente", texto: "Já fiz o pagamento, e a nota?", hora: "14:28" },
        { id: "n3", autor: "bot", texto: "Boa tarde! Claro, posso emitir 😊 Me confirma seu nome completo e CPF, por favor?", hora: "14:28" },
      ],
      c3: [
        { id: "o1", autor: "cliente", texto: "quero a nporra na minha cara", hora: "14:05" },
        { id: "o2", autor: "bot", texto: "Claro! Me confirma seu nome completo e CPF, por favor?", hora: "14:05" },
        { id: "o3", autor: "cliente", texto: "Helena Prado, 111.222.333-44", hora: "14:09" },
        { id: "o4", autor: "bot", texto: "O nome não bateu com o CPF informado. Pode conferir e mandar de novo?", hora: "14:10" },
        { id: "o5", autor: "cliente", texto: "é esse mesmo, confere aí", hora: "14:11" },
        { id: "o6", autor: "bot", texto: "Vou te transferir para um atendente humano para finalizar, tá? Já já alguém te responde.", hora: "14:11" },
      ],
      c4: [
        { id: "p1", autor: "cliente", texto: "Bom dia! Queria remarcar minha consulta.", hora: "13:38" },
        { id: "p2", autor: "bot", texto: "Bom dia! Posso te ajudar com a nota fiscal. Para remarcar, vou chamar a recepção, um instante 🙂", hora: "13:39" },
        { id: "p3", autor: "humano", texto: "Oi Rafael, aqui é a Paula da recepção. Tenho quinta às 15h ou sexta às 10h, qual prefere?", hora: "13:40" },
      ],
    };
    return porConversa[convId] ?? [];
  },

  // --- Tela: Cobranças (agendamento → pagamento → nota → cobrança) ---
  cobrancasClientes(_companyId: string) {
    return [
      { id: "p1", nome: "Marina Lopes", telefone: "+55 11 96622-1180", servico: "Consulta clínica", valor: 250, agendamento: "Hoje · 09:30", pago: true, pagoEm: "há 2 h", notaEmitida: true, notaNum: "2026-00481", cobrado: false, cobradoEm: null },
      { id: "p2", nome: "Carlos Aguiar", telefone: "+55 11 98890-4471", servico: "Retorno / reavaliação", valor: 120, agendamento: "Hoje · 11:00", pago: false, pagoEm: null, notaEmitida: false, notaNum: null, cobrado: false, cobradoEm: null },
      { id: "p3", nome: "Helena Prado", telefone: "+55 11 97001-3322", servico: "Avaliação inicial", valor: 180, agendamento: "Ontem · 16:00", pago: false, pagoEm: null, notaEmitida: false, notaNum: null, cobrado: true, cobradoEm: "ontem" },
      { id: "p4", nome: "Rafael Dias", telefone: "+55 11 99654-8120", servico: "Consulta clínica", valor: 250, agendamento: "Ontem · 10:30", pago: true, pagoEm: "ontem", notaEmitida: true, notaNum: "2026-00479", cobrado: false, cobradoEm: null },
      { id: "p5", nome: "Bianca Nunes", telefone: "+55 11 99012-7741", servico: "Procedimento estético", valor: 400, agendamento: "Seg · 14:00", pago: false, pagoEm: null, notaEmitida: false, notaNum: null, cobrado: false, cobradoEm: null },
      { id: "p6", nome: "João Pereira", telefone: "+55 11 98123-9980", servico: "Consulta clínica", valor: 250, agendamento: "Seg · 09:00", pago: true, pagoEm: "seg", notaEmitida: true, notaNum: "2026-00475", cobrado: false, cobradoEm: null },
      { id: "p7", nome: "Larissa Gomes", telefone: "+55 11 99704-1122", servico: "Retorno / reavaliação", valor: 120, agendamento: "Hoje · 08:15", pago: false, pagoEm: null, notaEmitida: false, notaNum: null, cobrado: true, cobradoEm: "há 3 h" },
      { id: "p8", nome: "Téo Martins", telefone: "+55 11 98880-2031", servico: "Avaliação inicial", valor: 180, agendamento: "Ter · 15:30", pago: true, pagoEm: "ter", notaEmitida: true, notaNum: "2026-00482", cobrado: false, cobradoEm: null },
    ];
  },


};