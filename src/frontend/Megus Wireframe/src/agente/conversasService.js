/* global */
// Camada de dados das Conversas de um agente — mock no envelope ResultResponse.
// Migrar = trocar o corpo por `apiGet(/api/agentes/:id/conversas)` etc.
//   listConversas(agentId) → [{ id, nome, telefone, ultima, hora, status, naoLidas }]
//   getMensagens(convId)   → [{ id, autor:'cliente'|'bot'|'humano', texto, hora, attach? }]
// status da conversa: 'BOT' (Kaua conduzindo) · 'AGUARDANDO' (precisa de humano) · 'HUMANO' (assumida)

window.API_ROUTES = window.API_ROUTES || {};
window.API_ROUTES.conversas = {
  list: (agentId) => `/api/agentes/${agentId}/conversas`,
  mensagens: (convId) => `/api/conversas/${convId}/mensagens`,
  assumir: (convId) => `/api/conversas/${convId}/assumir`,
};

const _okCv = (data) => ({ success: true, data, message: null, errors: null, correlationId: null, statusCode: 200 });
const _delayCv = (ms) => new Promise((r) => setTimeout(r, ms));

const _CONVERSAS = {
  // agente Alphaville (id 'ag-alpha') — conversas ativas
  'ag-alpha': [
    { id: 'c1', nome: 'Marina Lopes', telefone: '+55 11 96622-1180', ultima: 'Prontinho! Sua nota está emitida ✅', hora: '14:32', status: 'BOT', naoLidas: 0 },
    { id: 'c2', nome: 'Carlos Aguiar', telefone: '+55 11 98890-4471', ultima: 'Já fiz o pagamento, e a nota?', hora: '14:28', status: 'BOT', naoLidas: 2 },
    { id: 'c3', nome: 'Helena Prado', telefone: '+55 11 97001-3322', ultima: 'O nome não bateu com o CPF…', hora: '14:11', status: 'AGUARDANDO', naoLidas: 1 },
    { id: 'c4', nome: 'Rafael Dias', telefone: '+55 11 99654-8120', ultima: 'Bom dia! Queria remarcar minha consulta.', hora: '13:40', status: 'HUMANO', naoLidas: 0 },
  ],
};

const _MENSAGENS = {
  c1: [
    { id: 'm1', autor: 'cliente', texto: 'Oi! Fiz uma consulta hoje e já paguei. Consigo a nota fiscal?', hora: '14:21' },
    { id: 'm2', autor: 'bot', texto: 'Oi, Marina! 😊 Claro, eu emito sua NFS-e. Antes, me confirma seu nome completo e CPF, por favor?', hora: '14:21' },
    { id: 'm3', autor: 'cliente', texto: 'Marina Lopes de Souza — 546.252.558-30', hora: '14:23' },
    { id: 'm4', autor: 'bot', texto: 'Perfeito, conferi seus dados ✅ Agora me envia o comprovante de pagamento (foto ou PDF) que eu emito a nota.', hora: '14:23' },
    { id: 'm5', autor: 'cliente', texto: '', hora: '14:29', attach: { type: 'image', name: 'comprovante-pix.jpg' } },
    { id: 'm6', autor: 'bot', texto: 'Recebi! Confirmei o pagamento de R$ 250,00 para a Clínica Sorriso. Emitindo sua nota fiscal…', hora: '14:30' },
    { id: 'm7', autor: 'bot', texto: 'Prontinho! Sua NFS-e está emitida ✅ Segue o PDF. Qualquer coisa, é só chamar 😉', hora: '14:32', attach: { type: 'file', name: 'NFS-e-2026-00481.pdf' } },
  ],
  c2: [
    { id: 'n1', autor: 'cliente', texto: 'Boa tarde', hora: '14:26' },
    { id: 'n2', autor: 'cliente', texto: 'Já fiz o pagamento, e a nota?', hora: '14:28' },
    { id: 'n3', autor: 'bot', texto: 'Boa tarde! Claro, posso emitir 😊 Me confirma seu nome completo e CPF, por favor?', hora: '14:28' },
  ],
  c3: [
    { id: 'o1', autor: 'cliente', texto: 'quero a nota da consulta', hora: '14:05' },
    { id: 'o2', autor: 'bot', texto: 'Claro! Me confirma seu nome completo e CPF, por favor?', hora: '14:05' },
    { id: 'o3', autor: 'cliente', texto: 'Helena Prado, 111.222.333-44', hora: '14:09' },
    { id: 'o4', autor: 'bot', texto: 'O nome não bateu com o CPF informado. Pode conferir e mandar de novo?', hora: '14:10' },
    { id: 'o5', autor: 'cliente', texto: 'é esse mesmo, confere aí', hora: '14:11' },
    { id: 'o6', autor: 'bot', texto: 'Vou te transferir para um atendente humano para finalizar, tá? Já já alguém te responde.', hora: '14:11' },
  ],
  c4: [
    { id: 'p1', autor: 'cliente', texto: 'Bom dia! Queria remarcar minha consulta.', hora: '13:38' },
    { id: 'p2', autor: 'bot', texto: 'Bom dia! Posso te ajudar com a nota fiscal. Para remarcar, vou chamar a recepção, um instante 🙂', hora: '13:39' },
    { id: 'p3', autor: 'humano', texto: 'Oi Rafael, aqui é a Paula da recepção. Tenho quinta às 15h ou sexta às 10h, qual prefere?', hora: '13:40' },
  ],
};

window.MegusConversas = {
  async listConversas(agentId) {
    await _delayCv(420);
    return _okCv(_CONVERSAS[agentId] || _CONVERSAS['ag-alpha']);
  },
  async getMensagens(convId) {
    await _delayCv(320);
    return _okCv(_MENSAGENS[convId] || []);
  },
};
