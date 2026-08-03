import { describe, expect, it, vi } from "vitest";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import type { AgentConfig } from "../../src/domain/entities/AgentConfig";
import type { AgentDecision } from "../../src/domain/ports/IAgentBrain";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

/**
 * Ficha do paciente — o cadastro que a clínica REDIGITA no sistema dela.
 *
 * A clínica no ar usa Amplimed como prontuário e digita o paciente novo lá na
 * mão. As instruções da agente já mandam pedir nome, endereço, CPF, nascimento e
 * e-mail no primeiro contato, mas nada era guardado: ficava no histórico e ela
 * relia mensagem por mensagem.
 */
const integration = {
  id: "int1", companyId: "c1", displayName: "X", whatsappNumber: "5511999990000",
  fiscalDoc: "28756515000135", fiscalName: "Clínica Ltda", fiscalProviderRef: null,
  active: true, createdAt: new Date(), updatedAt: new Date(),
};

const agentConfig: AgentConfig = {
  id: "ag1", integrationId: "int1", name: "Nina", segment: "saude", tone: "equilibrado", emojis: false, lang: "pt",
  instructions: "", capabilities: { agenda: false, agendaLink: null, fiscal: false, fiscalDocType: null, linkedServiceIds: [] },
  knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date(),
};

function depsWith(repos: InMemoryRepositories, extracted?: AgentDecision["extracted"]): StateMachineDeps {
  return {
    brain: { decide: vi.fn(async () => ({ reply: ["ok"], action: { type: "reply" as const }, ...(extracted ? { extracted } : {}) })) },
    cpf: { lookupName: vi.fn(async () => ({ found: false, name: null })) },
    comprovante: { analyze: vi.fn() },
    fiscal: { upsertCustomer: vi.fn(), emitNfse: vi.fn() },
    messaging: { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(async () => {}), sendMedia: vi.fn(), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions,
    services: repos.services, companyProfiles: repos.companyProfiles, charges: repos.charges,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  };
}

function texto(t: string): InboundMessage {
  return { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text: t, media: null, timestamp: new Date() };
}

async function conversa(repos: InMemoryRepositories, ficha: Record<string, string> = {}) {
  repos.seed({
    integrations: [integration],
    contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "Pietro", cpf: null, cpfNameVerified: false, ficha, createdAt: new Date(), updatedAt: new Date() }],
  });
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = ConversationState.New;
  await repos.conversations.save(conv);
  return conv;
}

describe("ficha do paciente — coletada na conversa, guardada no contato", () => {
  it("grava o que o paciente informou", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, { endereco: "Rua das Flores, 100", cep: "06573000", nascimento: "1990-04-12" });
    const conv = await conversa(repos);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, texto("moro na Rua das Flores, 100, CEP 06573-000, nasci em 12/04/1990"));

    expect((await repos.contacts.getById("ct1"))?.ficha).toEqual({
      endereco: "Rua das Flores, 100", cep: "06573000", nascimento: "1990-04-12",
    });
  });

  it("ACRESCENTA sem sobrescrever: a 1ª leitura vence a repetição do modelo", async () => {
    // O modelo repete dado do histórico, e a 2ª leitura pode vir pior que a 1ª —
    // foi assim que o ID do comprovante saiu com um caractere a menos.
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, { endereco: "Rua das Flores 100", email: "pietro@teste.com" });
    const conv = await conversa(repos, { endereco: "Rua das Flores, 100 — apto 42" });

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, texto("meu email é pietro@teste.com"));

    const ficha = (await repos.contacts.getById("ct1"))?.ficha;
    expect(ficha?.endereco).toBe("Rua das Flores, 100 — apto 42"); // o gravado venceu
    expect(ficha?.email).toBe("pietro@teste.com"); // o novo entrou
  });

  it("campo em branco não entra (ausente ≠ vazio — é a diferença que a tela mostra)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, { endereco: "  ", email: "pietro@teste.com" });
    const conv = await conversa(repos);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, texto("oi"));

    const ficha = (await repos.contacts.getById("ct1"))?.ficha;
    expect(ficha).toEqual({ email: "pietro@teste.com" });
    expect("endereco" in (ficha ?? {})).toBe(false);
  });

  it("sem nada extraído, não escreve no contato", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversa(repos);
    const antes = (await repos.contacts.getById("ct1"))!.updatedAt;

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, texto("bom dia"));

    expect((await repos.contacts.getById("ct1"))?.updatedAt).toEqual(antes);
  });
});
