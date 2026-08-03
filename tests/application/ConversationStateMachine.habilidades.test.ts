import { describe, expect, it, vi } from "vitest";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import type { AgentConfig, AgentCapabilities } from "../../src/domain/entities/AgentConfig";
import type { Charge } from "../../src/domain/entities/Charge";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

/**
 * As habilidades do painel viraram chave de verdade.
 *
 * Antes só `agenda` e `fiscal` existiam: "Cobrar", "Confirmar pagamento" e
 * "Tirar dúvidas" eram switches que o clique ignorava — e "Confirmar pagamento"
 * ainda mostrava DESLIGADO (amarrada ao `fiscal`) enquanto o gate confirmava
 * pagamento em produção.
 *
 * Regra das duas pontas: ausente = LIGADO (agente que já roda não muda de
 * comportamento), e o que se desliga vira trabalho de HUMANO — nunca silêncio.
 */
const integration = {
  id: "int1", companyId: "c1", displayName: "X", whatsappNumber: "5511999990000",
  fiscalDoc: "28756515000135", fiscalName: "Clínica Ltda", fiscalProviderRef: null,
  active: true, createdAt: new Date(), updatedAt: new Date(),
};

function config(caps: Partial<AgentCapabilities>): AgentConfig {
  return {
    id: "ag1", integrationId: "int1", name: "Nina", segment: "saude", tone: "equilibrado", emojis: false, lang: "pt",
    instructions: "",
    capabilities: { agenda: false, agendaLink: null, fiscal: false, fiscalDocType: null, linkedServiceIds: [], ...caps },
    knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date(),
  };
}

function depsWith(repos: InMemoryRepositories): StateMachineDeps {
  return {
    brain: { decide: vi.fn(async () => ({ reply: ["resposta do cérebro"], action: { type: "reply" as const } })) },
    cpf: { lookupName: vi.fn() },
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
function foto(): InboundMessage {
  return { providerMessageId: "m2", from: "5511988887777", to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "print" }, timestamp: new Date() };
}

async function conversa(repos: InMemoryRepositories, estado = ConversationState.New) {
  repos.seed({
    integrations: [integration],
    contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "Pietro", cpf: null, cpfNameVerified: false, ficha: {}, createdAt: new Date(), updatedAt: new Date() }],
  });
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = estado;
  await repos.conversations.save(conv);
  return conv;
}

const ditas = (deps: StateMachineDeps) =>
  (deps.messaging.sendText as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].text).join(" | ");

describe("habilidades do agente — ligadas por padrão, desligáveis de verdade", () => {
  it("ausente = LIGADO: agente salvo antes destes campos segue respondendo", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversa(repos);

    await new ConversationStateMachine(deps).advance(conv, config({}), integration, texto("qual o endereço?"));

    expect(deps.brain.decide).toHaveBeenCalled();
    expect((await repos.conversations.getById(conv.id))?.humanHandoff).toBe(false);
  });

  it("`chat: false` → dúvida geral vira handoff, com aviso ao paciente", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversa(repos);

    await new ConversationStateMachine(deps).advance(conv, config({ chat: false }), integration, texto("qual o endereço?"));

    expect(deps.brain.decide).not.toHaveBeenCalled();
    expect(ditas(deps)).toContain("chamar alguém da equipe");
    expect((await repos.conversations.getById(conv.id))?.humanHandoff).toBe(true);
  });

  it("`comprovante: false` → comprovante NÃO é conferido pela visão; vai pra fila humana", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversa(repos, ConversationState.AwaitingComprovante);
    await repos.charges.save({
      id: "ch1", integrationId: "int1", contactId: "ct1", serviceId: null, description: "Consulta",
      amount: 100, status: "cobrada", calendarEventId: null, chargedAt: new Date(), paidAt: null,
      scheduledFor: null, paymentRef: null, paidBy: null, receiptHash: null, notaSolicitada: null,
      notaEmitidaEm: null, createdAt: new Date(), updatedAt: new Date(),
    } as Charge);

    await new ConversationStateMachine(deps).advance(conv, config({ comprovante: false }), integration, foto());

    expect(deps.comprovante.analyze).not.toHaveBeenCalled();
    expect(ditas(deps)).toContain("Recebi seu comprovante");
    expect((await repos.conversations.getById(conv.id))?.humanHandoff).toBe(true);
    // Não pode dar por pago o que ninguém conferiu.
    expect((await repos.charges.getById("ch1"))?.status).toBe("cobrada");
  });

  it("`comprovante` ausente → conferência roda como sempre", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.comprovante.analyze as ReturnType<typeof vi.fn>).mockResolvedValue({
      amount: 100, payerName: null, recipientDoc: "28756515000135", recipientMatches: true,
      recipientPixKey: null, pixKeyMatches: false, transactionId: null, confidence: 0.9, raw: "{}",
    });
    const conv = await conversa(repos, ConversationState.AwaitingComprovante);

    await new ConversationStateMachine(deps).advance(conv, config({}), integration, foto());

    expect(deps.comprovante.analyze).toHaveBeenCalled();
  });
});
