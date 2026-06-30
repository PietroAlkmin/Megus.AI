/* global */
// Camada de dados do Painel de Atendimentos — agora REAL, via window.MegusApi.
// O FRONT não decide mock/real: ele sempre chama o backend. Quem devolve dados
// de exemplo ou reais é o backend, conforme USE_MOCK_DATA no .env.
//
// Rotas (Express, protegidas por token):
//   GET /api/agentes          → lista de agentes
//   GET /api/agentes/metricas → métricas agregadas da empresa

window.API_ROUTES = window.API_ROUTES || {};
window.API_ROUTES.agentes = {
  list: '/api/agentes',
  metricas: '/api/agentes/metricas',
};

window.MegusAtendimentos = {
  async listAgentes() {
    return window.MegusApi.get(window.API_ROUTES.agentes.list);
  },
  async getMetricas() {
    return window.MegusApi.get(window.API_ROUTES.agentes.metricas);
  },
};