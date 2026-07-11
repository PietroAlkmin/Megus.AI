import { describe, expect, it, vi } from "vitest";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

// Molde igual ao ConversationStateMachine.identity.test.ts — mesmo CPF válido de
// fixture (529.982.247-25 ↔ "João da Silva") pra reusar o mesmo provider setup.
function baseDeps(repos: InMemoryRepositories): StateMachineDeps {
  return {
    brain: { decide: vi.fn() },
    cpf: { lookupName: vi.fn() },
    comprovante: { analyze: vi.fn() },
    fiscal: { emitNfse: vi.fn(), upsertCustomer: vi.fn(async () => ({ customerId: "cust1", created: true })) },
    messaging: { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(), sendMedia: vi.fn(), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations,
    emissions: repos.emissions, services: repos.services, companyProfiles: repos.companyProfiles,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  };
}

const integration = {
  id: "int1", displayName: "Consultório X", whatsappNumber: "5511999990000",
  fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA",
  fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date(),
};
const agentConfig: any = { id: "ag1", integrationId: "int1", name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "", capabilities: { chat: true, agenda: true, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"] }, knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date() };

function inbound(text: string): InboundMessage {
  return { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text, media: null, timestamp: new Date() };
}

describe("ConversationStateMachine — identidade em conversa livre (cadastro, não-fiscal)", () => {
  it("provide_identity com CPF válido: salva contato verificado, upsertCustomer chamado, estado final = New, NÃO arma comprovante, envia a resposta do modelo", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration], services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Consulta", price: 300, issCode: "0107" }] });
    const deps = baseDeps(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Perfeito, já confirmo seu horário!"],
      action: { type: "provide_identity" },
      extracted: { fullName: "João da Silva", cpf: "529.982.247-25" },
    });
    (deps.cpf.lookupName as any).mockResolvedValue({ found: true, name: "João da Silva" });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    // conv nasce em New (default do getOrCreate) — não é fluxo fiscal, ninguém pediu nota.
    await sm.advance(conv, agentConfig, integration, inbound("Sou João da Silva, CPF 529.982.247-25, pode marcar amanhã 15h?"));

    expect(deps.fiscal.upsertCustomer).toHaveBeenCalledOnce();
    const contato = await repos.contacts.findByCpf("int1", "52998224725");
    expect(contato?.cpfNameVerified).toBe(true);
    expect(contato?.fullName).toBe("João da Silva");
    expect(conv.contactId).toBe(contato!.id);
    expect(conv.state).toBe(ConversationState.New); // NÃO foi para AwaitingComprovante

    expect(deps.messaging.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: "Perfeito, já confirmo seu horário!" }));
    const bubbles = (deps.messaging.sendText as any).mock.calls.map((c: any) => c[0].text as string);
    for (const text of bubbles) expect(text).not.toContain("comprovante");
  });

  it("intent_emit com CPF válido: comportamento fiscal ATUAL intocado (AwaitingComprovante + msg de comprovante)", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration], services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Consulta", price: 300, issCode: "0107" }] });
    const deps = baseDeps(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Show!"],
      action: { type: "intent_emit" },
      extracted: { fullName: "João da Silva", cpf: "529.982.247-25" },
    });
    (deps.cpf.lookupName as any).mockResolvedValue({ found: true, name: "João da Silva" });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    await sm.advance(conv, agentConfig, integration, inbound("Sou João da Silva, CPF 529.982.247-25, quero a nota"));

    expect(deps.fiscal.upsertCustomer).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.AwaitingComprovante);
    expect(deps.messaging.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Perfeito! Agora me envia o comprovante de pagamento (foto ou PDF) que eu emito sua nota." }),
    );
  });

  it("cadastro com CPF inválido: msg de erro, estado permanece New, SEM handoff mesmo repetindo 3x (attempts é regra do fluxo fiscal)", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration] });
    const deps = baseDeps(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["oi"],
      action: { type: "provide_identity" },
      extracted: { fullName: "João da Silva", cpf: "111.111.111-11" }, // dígitos repetidos → inválido
    });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");

    for (let i = 0; i < 3; i += 1) {
      await sm.advance(conv, agentConfig, integration, inbound("CPF 111.111.111-11"));
      expect(conv.state).toBe(ConversationState.New);
      expect(conv.humanHandoff).toBe(false);
    }
    expect(deps.messaging.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Esse CPF não parece válido. Pode conferir e mandar de novo?" }),
    );
    expect(deps.fiscal.upsertCustomer).not.toHaveBeenCalled();
  });

  it("cadastro com nome que não bate: msg de erro específica, repetindo 3x sem contar tentativa nem handoff", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration] });
    const deps = baseDeps(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["oi"],
      action: { type: "provide_identity" },
      extracted: { fullName: "Fulano Errado", cpf: "529.982.247-25" },
    });
    (deps.cpf.lookupName as any).mockResolvedValue({ found: true, name: "João da Silva" });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    // cpfMaxAttempts=2 no fiscal — repetir 3x aqui prova que cadastro não conta tentativa.
    await sm.advance(conv, agentConfig, integration, inbound("Fulano Errado 529.982.247-25"));
    await sm.advance(conv, agentConfig, integration, inbound("Fulano Errado 529.982.247-25"));
    await sm.advance(conv, agentConfig, integration, inbound("Fulano Errado 529.982.247-25"));

    expect(conv.state).toBe(ConversationState.New);
    expect(conv.humanHandoff).toBe(false);
    expect(deps.messaging.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "O nome não bateu com o CPF informado. Pode conferir e mandar de novo?" }),
    );
  });

  it("cadastro com reply vazio do modelo: não inventa mensagem (nenhum envio de texto)", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration] });
    const deps = baseDeps(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: [],
      action: { type: "provide_identity" },
      extracted: { fullName: "João da Silva", cpf: "529.982.247-25" },
    });
    (deps.cpf.lookupName as any).mockResolvedValue({ found: true, name: "João da Silva" });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    await sm.advance(conv, agentConfig, integration, inbound("Sou João da Silva, CPF 529.982.247-25"));

    expect(deps.fiscal.upsertCustomer).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.New);
    expect(deps.messaging.sendText).not.toHaveBeenCalled();
  });

  it("cadastro reaproveita o contato existente por WhatsApp (dedup) e marca cpfNameVerified", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({
      integrations: [integration],
      contacts: [{ id: "ct-existing", integrationId: "int1", whatsappNumber: "5511988887777", fullName: null, cpf: null, cpfNameVerified: false, createdAt: new Date(), updatedAt: new Date() }],
    });
    const deps = baseDeps(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["beleza!"],
      action: { type: "provide_identity" },
      extracted: { fullName: "João da Silva", cpf: "529.982.247-25" },
    });
    (deps.cpf.lookupName as any).mockResolvedValue({ found: true, name: "João da Silva" });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct-existing", "5511988887777");
    await sm.advance(conv, agentConfig, integration, inbound("Sou João da Silva, CPF 529.982.247-25"));

    const contato = await repos.contacts.findByWhatsapp("int1", "5511988887777");
    expect(contato?.id).toBe("ct-existing"); // reaproveitou, não duplicou
    expect(contato?.cpfNameVerified).toBe(true);
    expect(conv.state).toBe(ConversationState.New);
  });
});
