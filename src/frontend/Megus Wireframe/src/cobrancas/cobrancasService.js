/* global */
// Camada de dados de Cobranças — agora REAL, via window.MegusApi.
// O front sempre chama o backend; quem decide mock/real é o backend (USE_MOCK_DATA).
//
// Rotas (Express, protegidas por token):
//   GET  /api/cobrancas          → clientes (agendamento → pagamento → nota → cobrança)
//   GET  /api/cobrancas/metricas → resumo (pagos, pendentes, a cobrar, valor pendente)
//   POST /api/cobrancas/:id/cobrar → dispara a cobrança via WhatsApp (Kaua)

window.API_ROUTES = window.API_ROUTES || {};
window.API_ROUTES.cobrancas = {
  list: '/api/cobrancas',
  metricas: '/api/cobrancas/metricas',
  cobrar: (id) => `/api/cobrancas/${encodeURIComponent(id)}/cobrar`,
};

window.MegusCobrancas = {
  async listClientes() {
    return window.MegusApi.get(window.API_ROUTES.cobrancas.list);
  },
  async getMetricas() {
    return window.MegusApi.get(window.API_ROUTES.cobrancas.metricas);
  },
  async cobrar(id) {
    return window.MegusApi.post(window.API_ROUTES.cobrancas.cobrar(id), {});
  },
};