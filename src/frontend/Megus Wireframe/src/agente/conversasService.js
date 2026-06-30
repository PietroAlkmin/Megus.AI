/* global */
// Camada de dados das Conversas — agora REAL, via window.MegusApi.
// O front sempre chama o backend; quem decide mock/real é o backend (USE_MOCK_DATA).
//
// Rotas (Express, protegidas por token):
//   GET  /api/agentes/:agentId/conversas   → lista de conversas do agente
//   GET  /api/conversas/:convId/mensagens  → mensagens da conversa
//   POST /api/conversas/:convId/assumir    → passa de bot para humano

window.API_ROUTES = window.API_ROUTES || {};
window.API_ROUTES.conversas = {
  list: (agentId) => `/api/agentes/${encodeURIComponent(agentId)}/conversas`,
  mensagens: (convId) => `/api/conversas/${encodeURIComponent(convId)}/mensagens`,
  assumir: (convId) => `/api/conversas/${encodeURIComponent(convId)}/assumir`,
};

window.MegusConversas = {
  async listConversas(agentId) {
    return window.MegusApi.get(window.API_ROUTES.conversas.list(agentId));
  },
  async getMensagens(convId) {
    return window.MegusApi.get(window.API_ROUTES.conversas.mensagens(convId));
  },
  async assumir(convId) {
    return window.MegusApi.post(window.API_ROUTES.conversas.assumir(convId), {});
  },
};