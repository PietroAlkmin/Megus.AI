/* global */
// Camada de dados da Conexão WhatsApp (QR + status) — via window.MegusApi.
// Mantém a interface window.MegusWhatsApp (o modal não muda).
//
// Rotas (Express, protegidas por token, tenant do JWT):
//   POST /api/agente/whatsapp/connect → cria/reusa a instância Evolution da
//     empresa e devolve { qr, instance } (qr em base64, com ou sem prefixo data-url)
//   GET  /api/agente/whatsapp/status  → { connected, number }

window.API_ROUTES = window.API_ROUTES || {};
window.API_ROUTES.whatsapp = {
  connect: '/api/agente/whatsapp/connect',
  status: '/api/agente/whatsapp/status',
};

window.MegusWhatsApp = {
  async conectar() {
    return window.MegusApi.post(window.API_ROUTES.whatsapp.connect);
  },
  async status() {
    return window.MegusApi.get(window.API_ROUTES.whatsapp.status);
  },
};
