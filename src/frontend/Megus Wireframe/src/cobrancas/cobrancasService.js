/* global */
// Camada de dados de Cobranças — visão por cliente cruzando agendamento →
// pagamento → nota fiscal → cobrança. Mock no envelope ResultResponse.
// Migrar = trocar o corpo por `apiGet(/api/cobrancas)` etc.
//
//   cliente = {
//     id, nome, telefone, servico, valor,
//     agendamento,                 // quando foi/será atendido
//     pago: bool, pagoEm,          // status de pagamento
//     notaEmitida: bool, notaNum,  // NFS-e (só sai depois do pagamento)
//     cobrado: bool, cobradoEm,    // se o Kaua já mandou a cobrança (p/ os não pagos)
//   }
//
// Regra: pago ⟹ nota emitida (o Megus emite após confirmar o pagamento).
//        não pago ⟹ sem nota; pode estar "cobrado" ou "a cobrar".

window.API_ROUTES = window.API_ROUTES || {};
window.API_ROUTES.cobrancas = {
  list: '/api/cobrancas',
  metricas: '/api/cobrancas/metricas',
  cobrar: (id) => `/api/cobrancas/${id}/cobrar`,
};

const _okCb = (data) => ({ success: true, data, message: null, errors: null, correlationId: null, statusCode: 200 });
const _delayCb = (ms) => new Promise((r) => setTimeout(r, ms));

const _CLIENTES = [
  { id: 'p1', nome: 'Marina Lopes',  telefone: '+55 11 96622-1180', servico: 'Consulta clínica',     valor: 250, agendamento: 'Hoje · 09:30',     pago: true,  pagoEm: 'há 2 h',  notaEmitida: true,  notaNum: '2026-00481', cobrado: false, cobradoEm: null },
  { id: 'p2', nome: 'Carlos Aguiar', telefone: '+55 11 98890-4471', servico: 'Retorno / reavaliação', valor: 120, agendamento: 'Hoje · 11:00',     pago: false, pagoEm: null,      notaEmitida: false, notaNum: null,        cobrado: false, cobradoEm: null },
  { id: 'p3', nome: 'Helena Prado',  telefone: '+55 11 97001-3322', servico: 'Avaliação inicial',     valor: 180, agendamento: 'Ontem · 16:00',    pago: false, pagoEm: null,      notaEmitida: false, notaNum: null,        cobrado: true,  cobradoEm: 'ontem' },
  { id: 'p4', nome: 'Rafael Dias',   telefone: '+55 11 99654-8120', servico: 'Consulta clínica',     valor: 250, agendamento: 'Ontem · 10:30',    pago: true,  pagoEm: 'ontem',   notaEmitida: true,  notaNum: '2026-00479', cobrado: false, cobradoEm: null },
  { id: 'p5', nome: 'Bianca Nunes',  telefone: '+55 11 99012-7741', servico: 'Procedimento estético', valor: 400, agendamento: 'Seg · 14:00',      pago: false, pagoEm: null,      notaEmitida: false, notaNum: null,        cobrado: false, cobradoEm: null },
  { id: 'p6', nome: 'João Pereira',  telefone: '+55 11 98123-9980', servico: 'Consulta clínica',     valor: 250, agendamento: 'Seg · 09:00',      pago: true,  pagoEm: 'seg',     notaEmitida: true,  notaNum: '2026-00475', cobrado: false, cobradoEm: null },
  { id: 'p7', nome: 'Larissa Gomes', telefone: '+55 11 99704-1122', servico: 'Retorno / reavaliação', valor: 120, agendamento: 'Hoje · 08:15',     pago: false, pagoEm: null,      notaEmitida: false, notaNum: null,        cobrado: true,  cobradoEm: 'há 3 h' },
  { id: 'p8', nome: 'Téo Martins',   telefone: '+55 11 98880-2031', servico: 'Avaliação inicial',     valor: 180, agendamento: 'Ter · 15:30',      pago: true,  pagoEm: 'ter',     notaEmitida: true,  notaNum: '2026-00482', cobrado: false, cobradoEm: null },
];

const _metricas = (cs) => {
  const pagos = cs.filter((c) => c.pago).length;
  const pendentes = cs.filter((c) => !c.pago);
  return {
    agendados: cs.length,
    pagos,
    pendentes: pendentes.length,
    notasEmitidas: cs.filter((c) => c.notaEmitida).length,
    aCobrar: pendentes.filter((c) => !c.cobrado).length,
    valorPendente: pendentes.reduce((s, c) => s + c.valor, 0),
  };
};

window.MegusCobrancas = {
  async listClientes() {
    await _delayCb(480);
    return _okCb(_CLIENTES);
  },
  async getMetricas() {
    await _delayCb(480);
    return _okCb(_metricas(_CLIENTES));
  },
  // Dispara a cobrança amigável via Kaua (WhatsApp). Mock: marca como cobrado.
  async cobrar(id) {
    await _delayCb(300);
    return _okCb({ id, cobrado: true, cobradoEm: 'agora' });
  },
};
