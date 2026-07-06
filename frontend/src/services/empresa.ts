import { apiFetch } from "@/lib/api";

/** Opções de chave Pix aceitas pelo campo `pixType` — mesmas do wireframe (`EmpresaPage`). */
export const PIX_TYPES = [
  { id: "cnpj", label: "CNPJ" },
  { id: "cpf", label: "CPF" },
  { id: "email", label: "E-mail" },
  { id: "telefone", label: "Telefone" },
  { id: "aleatoria", label: "Aleatória" },
] as const;

export interface EmpresaProfile {
  companyId: string;
  name: string;
  fiscalName: string;
  fiscalDoc: string;
  municipalRegistration: string;
  email: string;
  phone: string;
  zip: string;
  address: string;
  city: string;
  state: string;
  pixType: string;
  pixKey: string;
  paymentInstructions: string;
  updatedAt: string;
}

/** Espelha `empresaSchema` do backend (`empresa.routes.ts`) — todos os campos opcionais. */
export type EmpresaPayload = Partial<Omit<EmpresaProfile, "companyId" | "updatedAt">>;

export interface Servico {
  id: string;
  code: string;
  description: string;
  issCode: string;
  price: number;
}

/** Espelha `servicoSchema` — `id` só vai preenchido em edição (novo serviço não manda `id`). */
export interface ServicoPayload {
  id?: string;
  code?: string;
  description: string;
  issCode?: string;
  price?: number;
}

/** GET /api/empresa — dados cadastrais + cobrança da empresa logada. */
export async function getEmpresa(): Promise<EmpresaProfile> {
  return apiFetch<EmpresaProfile>("GET", "/api/empresa");
}

/** PUT /api/empresa — salva os dados cadastrais. */
export async function saveEmpresa(payload: EmpresaPayload): Promise<EmpresaProfile> {
  return apiFetch<EmpresaProfile>("PUT", "/api/empresa", payload);
}

/** GET /api/empresa/servicos — catálogo de serviços usado na emissão das NFS-e. */
export async function listServicos(): Promise<Servico[]> {
  return apiFetch<Servico[]>("GET", "/api/empresa/servicos");
}

/** POST /api/empresa/servicos — cria (sem `id`) ou atualiza (com `id`) um serviço. */
export async function saveServico(payload: ServicoPayload): Promise<Servico> {
  return apiFetch<Servico>("POST", "/api/empresa/servicos", payload);
}

/** DELETE /api/empresa/servicos/:id — exclui um serviço. */
export async function deleteServico(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("DELETE", `/api/empresa/servicos/${encodeURIComponent(id)}`);
}
