/* global */
// Camada de dados do Painel de Atendimentos — mesmo padrão do authService:
// mock que resolve local, MAS já no envelope ResultResponse de produção.
// Migrar = trocar o corpo por `apiGet(API_ROUTES.agentes...)`.
//
//   ResultResponse<T> = { success, data, message, errors, correlationId, statusCode }
//
// As MÉTRICAS e COLUNAS mapeiam para entidades reais do backend Megus:
//   conversas  → Conversation (state != Done/HumanHandoff)
//   notasHoje  → EmissionIntent (status = 'emitted', hoje)
//   transfer-  → Conversation.humanHandoff
//   status     → estado da instância (IMessagingProvider / Evolution)
// Sem "uptime/slop" — só o que o backend efetivamente registra.

window.API_ROUTES = window.API_ROUTES || {};
window.API_ROUTES.agentes = {
  list: '/api/agentes',
  metricas: '/api/agentes/metricas',
};

const _okAt = (data) => ({ success: true, data, message: null, errors: null, correlationId: null, statusCode: 200 });
const _delayAt = (ms) => new Promise((r) => setTimeout(r, ms));

// Seed do piloto — Clínica Sorriso (mesma empresa do shell). Um agente "Kaua"
// por número/unidade. Somatórios das colunas batem com as métricas agregadas.
const _SEED_AGENTES = [
  { id: 'ag-alpha', nome: 'Kaua', papel: 'Recepção · Alphaville', numero: '+55 11 98123-4477',
    segmento: 'Saúde / Clínica', doc: 'NFS-e', status: 'operando',
    conversas: 7, notasHoje: 12, resp: '1m 10s', ultima: 'agora', alerta: null },
  { id: 'ag-centro', nome: 'Kaua', papel: 'Recepção · Centro', numero: '+55 11 98456-2210',
    segmento: 'Saúde / Clínica', doc: 'NFS-e', status: 'operando',
    conversas: 4, notasHoje: 6, resp: '2m 05s', ultima: '4 min', alerta: null },
  { id: 'ag-estetica', nome: 'Sofia', papel: 'Estética', numero: '+55 11 99701-8890',
    segmento: 'Beleza / Estética', doc: 'NFS-e', status: 'atencao',
    conversas: 2, notasHoje: 1, resp: '5m 40s', ultima: '12 min', alerta: 'CPF↔nome não confere — 1 conversa em espera' },
  { id: 'ag-odonto', nome: 'Kaua', papel: 'Odontologia', numero: '+55 11 98770-1145',
    segmento: 'Saúde / Clínica', doc: 'NFS-e', status: 'pausado',
    conversas: 0, notasHoje: 0, resp: '—', ultima: '1 h', alerta: null },
  { id: 'ag-teste', nome: 'Kaua', papel: 'Número de testes', numero: '+55 11 90000-0000',
    segmento: 'Saúde / Clínica', doc: 'NFS-e', status: 'desconectado',
    conversas: 0, notasHoje: 0, resp: '—', ultima: '2 d', alerta: null },
];

window.MegusAtendimentos = {
  // GET /api/agentes
  async listAgentes() {
    await _delayAt(550);
    return _okAt(_SEED_AGENTES);
  },

  // GET /api/agentes/metricas  (agregado da empresa logada)
  async getMetricas() {
    await _delayAt(550);
    const ags = _SEED_AGENTES;
    const operando = ags.filter((a) => a.status === 'operando').length;
    const soma = (k) => ags.reduce((acc, a) => acc + (a[k] || 0), 0);
    return _okAt({
      operando, total: ags.length,
      abertas: soma('conversas'),
      notasHoje: soma('notasHoje'),
      msgsHoje: 214,
      transferencias: 2,
      alertas: ags.filter((a) => a.alerta).length,
    });
  },
};
