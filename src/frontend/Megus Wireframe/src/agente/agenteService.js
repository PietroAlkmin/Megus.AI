/* global */
// Camada de dados da Persona do Agente (Kaua) — via window.MegusApi.
// Mantém a interface window.MegusAgente (as telas não mudam).
//
// Rota (Express, protegida por token, tenant do JWT):
//   GET /api/agente  → persona atual { name, segment, tone, emojis, lang, instructions, fewShotDialogs }
//   PUT /api/agente  → salva a persona (preserva capabilities/knowledgeFiles já existentes)
//
// O mapeamento entre os campos do backend (name/segment/tone/...) e os campos
// do modal (nome/segmento/tom/...) fica em AtendenteVirtualModal.jsx.

window.API_ROUTES = window.API_ROUTES || {};
window.API_ROUTES.agente = {
  get: '/api/agente',
  salvar: '/api/agente',
};

window.MegusAgente = {
  async carregar() {
    return window.MegusApi.get(window.API_ROUTES.agente.get);
  },
  async salvar(persona) {
    return window.MegusApi.put(window.API_ROUTES.agente.salvar, persona);
  },
};
