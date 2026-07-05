import type { AgentConfig } from "../../domain/entities/AgentConfig";
import type { Contact } from "../../domain/entities/Contact";
import type { Conversation } from "../../domain/entities/Conversation";
import type { Integration } from "../../domain/entities/Integration";
import type { Message } from "../../domain/entities/Message";
import type { Service } from "../../domain/entities/Service";
import type { AgentContext } from "../../domain/ports/IAgentBrain";

/**
 * ContextAssembler — monta o AgentContext (rico) a partir dos dados já
 * carregados pela Application (conversa, config do agente, integração,
 * serviços, contato). Função PURA: só mapeia/mascara, sem I/O.
 */
export interface AssembleContextInput {
  conversation: Pick<Conversation, "state">;
  agentConfig: AgentConfig;
  integration: Integration;
  services: Service[];
  contact: Contact | null;
  history: Message[];
  today: string; // já formatada pelo caller (determinístico)
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

export function assembleContext(input: AssembleContextInput): AgentContext {
  const { conversation, agentConfig, integration, services, contact, history, today } = input;

  return {
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
  };
}
