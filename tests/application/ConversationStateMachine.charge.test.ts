import { describe, expect, it, vi } from "vitest";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { BOOKING_TOOL_NAME } from "../../src/domain/ports/IAgentToolsProvider";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

// Molde igual aos outros arquivos ConversationStateMachine.*.test.ts — único acréscimo
// é `charges: repos.charges` (Task 3, Plano 7).
function depsWith(repos: InMemoryRepositories): StateMachineDeps {
  return {
    brain: { decide: vi.fn() },
    cpf: { lookupName: vi.fn() },
    comprovante: { analyze: vi.fn() },
    fiscal: { upsertCustomer: vi.fn(), emitNfse: vi.fn() },
    messaging: { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(), sendMedia: vi.fn(), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services, companyProfiles: repos.companyProfiles,
    charges: repos.charges,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  };
}

const integration = {
  id: "int1", displayName: "Consultório X", whatsappNumber: "5511999990000",
  fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA",
  fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date(),
};
const agentConfig: any = {
  id: "ag1", integrationId: "int1", name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt",
  instructions: "", capabilities: { chat: true, agenda: true, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"] },
  knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date(),
};

function inbound(text: string): InboundMessage {
  return { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text, media: null, timestamp: new Date() };
}

/** Conversa com contato JÁ verificado (cpfNameVerified=true) — pré-condição real
 *  pra o gate de identidade (Brain) ter liberado a tool de verdade nesse turno. */
async function verifiedConversation(repos: InMemoryRepositories) {
  repos.seed({
    integrations: [integration],
    services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Massagem", price: 180, issCode: "0107" }],
    contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true, createdAt: new Date(), updatedAt: new Date() }],
  });
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  await repos.conversations.save(conv);
  return conv;
}

describe("ConversationStateMachine — cobrança pendente nasce com o evento (Task 3, Plano 7)", () => {
  it("toolResults com CREATE_EVENT → cria Charge pendente com preço/descrição do serviço vinculado + calendarEventId extraído + contactId certo", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Marcado!"],
      action: { type: "reply" },
      toolResults: [{ name: BOOKING_TOOL_NAME, output: { data: { response_data: { id: "evt-123" } } } }],
    });
    const conv = await verifiedConversation(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, inbound("pode marcar amanhã 15h?"));

    const charge = await repos.charges.findLatestChargeableByContact("int1", "ct1");
    expect(charge).not.toBeNull();
    expect(charge?.status).toBe("pendente");
    expect(charge?.amount).toBe(180);
    expect(charge?.description).toBe("Massagem");
    expect(charge?.serviceId).toBe("svc1");
    expect(charge?.contactId).toBe("ct1");
    expect(charge?.integrationId).toBe("int1");
    expect(charge?.calendarEventId).toBe("evt-123");
    expect(charge?.chargedAt).toBeNull();
    expect(charge?.paidAt).toBeNull();
  });

  it("sem toolResults → nenhuma Charge criada", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({ reply: ["oi, tudo bem?"], action: { type: "reply" } }); // sem toolResults
    const conv = await verifiedConversation(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, inbound("oi"));

    const charge = await repos.charges.findLatestChargeableByContact("int1", "ct1");
    expect(charge).toBeNull();
  });

  it("toolResults de OUTRA tool (não é o booking) → nenhuma Charge criada", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Você tem horário livre às 15h e às 16h."],
      action: { type: "reply" },
      toolResults: [{ name: "GOOGLECALENDAR_FIND_FREE_SLOTS", output: { data: { slots: ["15:00", "16:00"] } } }],
    });
    const conv = await verifiedConversation(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, inbound("tem horário livre?"));

    const charge = await repos.charges.findLatestChargeableByContact("int1", "ct1");
    expect(charge).toBeNull();
  });

  it("soft-error do Composio (successful:false) NÃO cria Charge — resolve-sem-lançar não é marcação", async () => {
    // Composio costuma RESOLVER com envelope {successful:false, error} em vez de
    // lançar — o ai@7 lista isso em toolResults como se fosse sucesso. Num turno
    // VERIFICADO o filtro do gate não se aplica; quem barra é este guard.
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Não consegui marcar agora."],
      action: { type: "reply" },
      toolResults: [{ name: BOOKING_TOOL_NAME, output: { successful: false, data: null, error: "insufficient permissions" } }],
    });
    const conv = await verifiedConversation(repos);
    const sm = new ConversationStateMachine(deps);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await sm.advance(conv, agentConfig, integration, inbound("marca aí"));

    expect(await repos.charges.findLatestChargeableByContact("int1", "ct1")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("output com chave error truthy também NÃO cria Charge", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Falhou."],
      action: { type: "reply" },
      toolResults: [{ name: BOOKING_TOOL_NAME, output: { error: "quota exceeded" } }],
    });
    const conv = await verifiedConversation(repos);
    const sm = new ConversationStateMachine(deps);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await sm.advance(conv, agentConfig, integration, inbound("marca aí"));

    expect(await repos.charges.findLatestChargeableByContact("int1", "ct1")).toBeNull();
    warnSpy.mockRestore();
  });

  it("output de sucesso com error:null/successful:true passa normal (não confunde com falha)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Marcado!"],
      action: { type: "reply" },
      toolResults: [{ name: BOOKING_TOOL_NAME, output: { successful: true, error: null, data: { response_data: { id: "evt-ok" } } } }],
    });
    const conv = await verifiedConversation(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, inbound("marca aí"));

    const charge = await repos.charges.findLatestChargeableByContact("int1", "ct1");
    expect(charge?.calendarEventId).toBe("evt-ok");
  });

  it("sem serviço vinculado (empty services) → não cria Charge nem lança (só warn)", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({
      integrations: [integration],
      // SEM services: linkedServiceIds aponta pra um serviço que não existe.
      contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true, createdAt: new Date(), updatedAt: new Date() }],
    });
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    conv.contactId = "ct1";
    await repos.conversations.save(conv);

    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Marcado!"],
      action: { type: "reply" },
      toolResults: [{ name: BOOKING_TOOL_NAME, output: { data: { id: "evt-1" } } }],
    });
    const sm = new ConversationStateMachine(deps);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(sm.advance(conv, agentConfig, integration, inbound("marca aí"))).resolves.not.toThrow();

    const charge = await repos.charges.findLatestChargeableByContact("int1", "ct1");
    expect(charge).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("sem contato (findByWhatsapp não acha ninguém) → não cria Charge nem lança (só warn) — defesa extra além do exigido", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({
      integrations: [integration],
      services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Massagem", price: 180, issCode: "0107" }],
      // SEM contacts.
    });
    const conv = await repos.conversations.getOrCreate("int1", "ct-fantasma", "5511988887777");

    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Marcado!"],
      action: { type: "reply" },
      toolResults: [{ name: BOOKING_TOOL_NAME, output: { data: { id: "evt-1" } } }],
    });
    const sm = new ConversationStateMachine(deps);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(sm.advance(conv, agentConfig, integration, inbound("marca aí"))).resolves.not.toThrow();

    expect(await repos.charges.findLatestChargeableByContact("int1", "ct-fantasma")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("dois toolResults de CREATE_EVENT na mesma decisão → duas Charges (uma por resultado)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const saveSpy = vi.spyOn(repos.charges, "save");
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Marquei os dois horários!"],
      action: { type: "reply" },
      toolResults: [
        { name: BOOKING_TOOL_NAME, output: { data: { id: "evt-1" } } },
        { name: BOOKING_TOOL_NAME, output: { data: { id: "evt-2" } } },
      ],
    });
    const conv = await verifiedConversation(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, inbound("marca os dois horários"));

    expect(saveSpy).toHaveBeenCalledTimes(2);
    const savedEventIds = saveSpy.mock.calls.map((c) => c[0]!.calendarEventId).sort();
    expect(savedEventIds).toEqual(["evt-1", "evt-2"]);
    expect(saveSpy.mock.calls.every((c) => c[0]!.status === "pendente" && c[0]!.amount === 180)).toBe(true);
  });

  // CONTRATO EM CAMADAS (concern da Task 3, RESOLVIDO no brain): a SM confia no
  // que recebe — toolResult de marcar presente ⇒ evento REAL criado ⇒ Charge.
  // Quem garante essa premissa é o AgentBrain: quando o gate de identidade foi
  // aplicado, ele FILTRA os resultados da tool de marcar antes de devolver a
  // decision (o stub bloqueado nunca chega aqui — testado em AgentBrain.test:
  // "gate aplicado → toolResults ... FILTRADOS"). Este teste documenta o lado
  // da SM: ela NÃO re-inspeciona o output; um decision adulterado (só possível
  // por bypass do brain) criaria Charge mesmo — por design, a defesa mora numa
  // camada só.
  it("SM confia no contrato do brain: qualquer toolResult de marcar presente na decision cria Charge (o filtro do stub é responsabilidade do brain)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Antes de marcar, preciso do seu nome completo e CPF."],
      action: { type: "reply" },
      toolResults: [{ name: BOOKING_TOOL_NAME, output: { error: "IDENTIDADE_PENDENTE", instrucao: "..." } }],
    });
    const conv = await verifiedConversation(repos); // contato JÁ verificado — mesmo assim, o resultado é do stub (simula o modelo tentando antes da validação valer)
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, inbound("marca aí"));

    const charge = await repos.charges.findLatestChargeableByContact("int1", "ct1");
    expect(charge).not.toBeNull(); // comportamento ATUAL — ver Concerns do report
    expect(charge?.calendarEventId).toBeNull(); // sem .data no output do stub, extractEventId não acha nada
  });
});
