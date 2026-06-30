/* global */
// Camada de dados de Empresa — agora REAL, via window.MegusApi.
// Mantém a interface window.MegusEmpresa (as telas não mudam).
//
// Rotas (Express, protegidas por token):
//   GET    /api/empresa            → dados cadastrais + cobrança
//   PUT    /api/empresa            → salva os dados
//   GET    /api/empresa/servicos   → catálogo de serviços
//   POST   /api/empresa/servicos   → cria/atualiza serviço
//   DELETE /api/empresa/servicos/:id → exclui serviço

window.API_ROUTES = window.API_ROUTES || {};
window.API_ROUTES.empresa = {
  get: '/api/empresa',
  salvar: '/api/empresa',
  servicos: '/api/empresa/servicos',
};

window.MegusEmpresa = {
  async getEmpresa() {
    return window.MegusApi.get(window.API_ROUTES.empresa.get);
  },
  async listServicos() {
    return window.MegusApi.get(window.API_ROUTES.empresa.servicos);
  },
  async salvarEmpresa(payload) {
    return window.MegusApi.put(window.API_ROUTES.empresa.salvar, payload);
  },
  async salvarServico(svc) {
    return window.MegusApi.post(window.API_ROUTES.empresa.servicos, svc);
  },
  async excluirServico(id) {
    return window.MegusApi.del(window.API_ROUTES.empresa.servicos + '/' + encodeURIComponent(id));
  },
};