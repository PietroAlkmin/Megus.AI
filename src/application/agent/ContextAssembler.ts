import type { AgentConfig } from "../../domain/entities/AgentConfig";
import type { CompanyProfile } from "../../domain/entities/CompanyProfile";
import type { Contact } from "../../domain/entities/Contact";
import type { Conversation } from "../../domain/entities/Conversation";
import type { Integration } from "../../domain/entities/Integration";
import type { Message } from "../../domain/entities/Message";
import type { Service } from "../../domain/entities/Service";
import type { AgentBusinessProfile, AgentContext } from "../../domain/ports/IAgentBrain";

/**
 * ContextAssembler — monta o AgentContext (rico) a partir dos dados já
 * carregados pela Application (conversa, config do agente, integração,
 * serviços, contato, cadastro da empresa). Função PURA: só mapeia/mascara, sem I/O.
 */
export interface AssembleContextInput {
  conversation: Pick<Conversation, "state">;
  agentConfig: AgentConfig;
  integration: Integration;
  /** Cadastro da aba Empresa (null quando a empresa não tem perfil salvo). */
  companyProfile: CompanyProfile | null;
  services: Service[];
  contact: Contact | null;
  history: Message[];
  today: string; // já formatada pelo caller (determinístico)
  /** Avisos transientes do sistema pra ESTE turno (ver AgentContext.notices). */
  notices?: string[];
}

/** Mascara um CPF (11 dígitos) mantendo só as bordas: "529.***.**7-25". */
export function maskCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 3)}.***.**${digits[8]}-${digits.slice(9)}`;
}

/** Mascara um nome completo: 1º nome + inicial do último sobrenome. */
export function maskName(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0]!;
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1]!;
  return `${first} ${last[0]!.toUpperCase()}.`;
}

/** "" e espaços viram null — campo vazio do cadastro NÃO vira linha de prompt. */
function cheio(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Perfil pro prompt: só campos preenchidos; se nada sobrar, null (bloco omitido). */
function toBusinessProfile(p: CompanyProfile | null): AgentBusinessProfile | null {
  if (!p) return null;
  const profile: AgentBusinessProfile = {
    fantasyName: cheio(p.name),
    address: cheio(p.address),
    city: cheio(p.city),
    state: cheio(p.state),
    phone: cheio(p.phone),
    email: cheio(p.email),
    pixType: cheio(p.pixType),
    pixKey: cheio(p.pixKey),
    paymentInstructions: cheio(p.paymentInstructions),
  };
  // pixType sozinho (default "cnpj" do cadastro) não informa nada — exige a chave.
  if (!profile.pixKey) profile.pixType = null;
  const temAlgo = Object.values(profile).some((v) => v !== null);
  return temAlgo ? profile : null;
}

export function assembleContext(input: AssembleContextInput): AgentContext {
  const { conversation, agentConfig, integration, companyProfile, services, contact, history, today, notices } = input;

  return {
    // integration.companyId é opcional (fixtures antigas); o caminho Prisma SEMPRE
    // preenche. "" (nunca undefined) quando ausente — AgentContext.companyId é string.
    companyId: integration.companyId ?? "",
    persona: {
      name: agentConfig.name,
      segment: agentConfig.segment,
      tone: agentConfig.tone,
      emojis: agentConfig.emojis,
      lang: agentConfig.lang,
      instructions: agentConfig.instructions,
      fewShotDialogs: agentConfig.fewShotDialogs,
    },
    business: {
      companyName: integration.fiscalName,
      profile: toBusinessProfile(companyProfile),
      services: services.map((s) => ({
        description: s.description,
        price: s.price,
        emissivel: agentConfig.capabilities.linkedServiceIds.includes(s.id),
      })),
    },
    state: conversation.state,
    history,
    collected: {
      cpfNameVerified: contact?.cpfNameVerified ?? false,
      fullNameMasked: maskName(contact?.fullName),
      cpfMasked: maskCpf(contact?.cpf),
      emissionStatus: null, // sem lookup do intent nesta task (YAGNI) — o estado da conversa já informa
    },
    today,
    // Só entra quando há aviso real — nada de array vazio virando bloco no prompt.
    ...(notices && notices.length > 0 ? { notices } : {}),
  };
}
