import { describe, expect, it, vi } from "vitest";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import type { AgentConfig } from "../../src/domain/entities/AgentConfig";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

/**
 * "O nome não bateu com o CPF informado" era MENTIRA em produção.
 *
 * O provedor oficial de CPF não está integrado: em prod roda o
 * `UnavailableCpfProvider`, que devolve `found:false` SEMPRE. O código lia isso
 * como divergência e acusava o paciente de errar um dado que ninguém conferiu.
 * Visto ao vivo (02/08): a frase saiu 3× seguidas para dados corretos e depois
 * uma 4ª vez respondendo a uma FOTO de comprovante.
 *
 * Regra que ficou: sem fonte de CPF, o CADASTRO segue com o dado NÃO verificado
 * (o dígito verificador continua barrando typo); o FISCAL segue fail-closed.
 */
const integration = {
  id: "int1", companyId: "c1", displayName: "X", whatsappNumber: "5511999990000",
  fiscalDoc: "11222333000181", fiscalName: "Clínica Ltda", fiscalProviderRef: null,
  active: true, createdAt: new Date(), updatedAt: new Date(),
};

function config(fiscal: boolean): AgentConfig {
  return {
    id: "ag1", integrationId: "int1", name: "Nina", segment: "saude", tone: "equilibrado", emojis: false, lang: "pt",
    instructions: "",
    capabilities: { chat: true, agenda: false, agendaLink: null, fiscal, fiscalDocType: fiscal ? "nfse" : null, linkedServiceIds: [] },
    knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date(),
  } as AgentConfig;
}

/** Igual à produção: nenhum CPF é encontrado, porque não há provedor. */
const semProvedorDeCpf = { lookupName: vi.fn(async () => ({ found: false, name: null })) };

function depsWith(repos: InMemoryRepositories, extracted?: { fullName: string; cpf: string }, acao: "reply" | "intent_emit" = "reply"): StateMachineDeps {
  return {
    brain: {
      decide: vi.fn(async () => ({
        reply: ["ok"],
        action: { type: acao } as never,
        ...(extracted ? { extracted } : {}),
      })),
    },
    cpf: semProvedorDeCpf,
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
  return { providerMessageId: "m2", from: "5511988887777", to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "x" }, timestamp: new Date() };
}

async function conversa(repos: InMemoryRepositories) {
  repos.seed({
    integrations: [integration],
    contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: null, cpf: null, cpfNameVerified: false, createdAt: new Date(), updatedAt: new Date() }],
  });
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = ConversationState.New;
  await repos.conversations.save(conv);
  return conv;
}

const ditas = (deps: StateMachineDeps) =>
  (deps.messaging.sendText as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].text).join(" | ");

describe("identidade quando NÃO existe provedor de CPF", () => {
  it("cadastro: aceita e GUARDA o dado, sem acusar o paciente de errar", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, { fullName: "Pietro Augusto Mota Alkmin", cpf: "546.252.558-30" });
    const conv = await conversa(repos);

    await new ConversationStateMachine(deps).advance(conv, config(false), integration, texto("Pietro Augusto Mota Alkmin, CPF 546.252.558-30"));

    expect(ditas(deps)).not.toContain("não bateu");
    const ct = await repos.contacts.getById("ct1");
    expect(ct?.fullName).toBe("Pietro Augusto Mota Alkmin");
    expect(ct?.cpf).toBe("54625255830");
    // Guardado, mas honesto: ninguém conferiu contra fonte nenhuma.
    expect(ct?.cpfNameVerified).toBe(false);
  });

  it("cadastro: CPF com dígito inválido AINDA é recusado (conferência real, offline)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, { fullName: "Maria Silva", cpf: "111.111.111-11" });
    const conv = await conversa(repos);

    await new ConversationStateMachine(deps).advance(conv, config(false), integration, texto("Maria Silva, CPF 111.111.111-11"));

    expect(ditas(deps)).toContain("não parece válido");
    expect((await repos.contacts.getById("ct1"))?.cpf).toBeNull();
  });

  it("fiscal: segue fail-closed — sem fonte de CPF não valida identidade", async () => {
    // `intent_emit` é o que arma o funil fiscal; a capacidade sozinha não basta.
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, { fullName: "Pietro Augusto Mota Alkmin", cpf: "546.252.558-30" }, "intent_emit");
    const conv = await conversa(repos);

    await new ConversationStateMachine(deps).advance(conv, config(true), integration, texto("Pietro Augusto Mota Alkmin, CPF 546.252.558-30"));

    expect(ditas(deps)).toContain("não bateu");
    expect((await repos.contacts.getById("ct1"))?.cpfNameVerified).toBe(false);
  });

  it("FOTO sem legenda não dispara validação de identidade (o nome viria do histórico)", async () => {
    // O caso exato do teste ao vivo: comprovante reenviado, sem cobrança em
    // aberto, e a resposta foi "o nome não bateu com o CPF" — para uma imagem.
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, { fullName: "Pietro Augusto Mota Alkmin", cpf: "546.252.558-30" });
    const conv = await conversa(repos);

    await new ConversationStateMachine(deps).advance(conv, config(false), integration, foto());

    expect(ditas(deps)).not.toContain("não bateu");
    expect(ditas(deps)).not.toContain("CPF");
  });
});
