/* global */
// Camada de dados de Empresa (ajustes) — mock no envelope ResultResponse.
// Migrar = trocar o corpo por apiGet/apiPut.
//   getEmpresa()   → dados cadastrais + cobrança
//   listServicos() → catálogo de serviços (NFS-e)
//   salvar*(...)   → persiste (mock: ecoa de volta)

window.API_ROUTES = window.API_ROUTES || {};
window.API_ROUTES.empresa = {
  get: '/api/empresa',
  salvar: '/api/empresa',
  servicos: '/api/empresa/servicos',
};

const _okEp = (data) => ({ success: true, data, message: null, errors: null, correlationId: null, statusCode: 200 });
const _delayEp = (ms) => new Promise((r) => setTimeout(r, ms));

const _EMPRESA = {
  razaoSocial: 'Clínica Sorriso Ltda',
  nomeFantasia: 'Clínica Sorriso',
  cnpj: '66.008.326/0001-73',
  inscricaoMunicipal: '1.234.567-8',
  email: 'contato@clinicasorriso.com.br',
  telefone: '+55 11 3322-1100',
  cep: '06454-000',
  endereco: 'Al. Rio Negro, 1200 · Alphaville',
  cidade: 'Barueri',
  uf: 'SP',
  // cobrança
  pixTipo: 'cnpj',
  pixChave: '66.008.326/0001-73',
  instrucoesPagamento: 'Pague via Pix usando a chave acima. Assim que o pagamento for confirmado, o Kaua emite e envia sua NFS-e automaticamente.',
};

const _SERVICOS = [
  { id: 's1', code: '0001', nome: 'Consulta clínica',      iss: '4.01', preco: 250 },
  { id: 's2', code: '0002', nome: 'Retorno / reavaliação', iss: '4.01', preco: 120 },
  { id: 's3', code: '0003', nome: 'Avaliação inicial',     iss: '4.01', preco: 180 },
  { id: 's4', code: '0004', nome: 'Procedimento estético', iss: '4.02', preco: 400 },
];

window.MegusEmpresa = {
  async getEmpresa() { await _delayEp(420); return _okEp({ ..._EMPRESA }); },
  async listServicos() { await _delayEp(420); return _okEp(_SERVICOS.map((s) => ({ ...s }))); },
  async salvarEmpresa(payload) { await _delayEp(500); return _okEp({ ...payload }); },
  async salvarServico(svc) { await _delayEp(300); return _okEp({ ...svc, id: svc.id || 'svc_' + Math.random().toString(36).slice(2, 8) }); },
  async excluirServico(id) { await _delayEp(250); return _okEp({ id }); },
};
