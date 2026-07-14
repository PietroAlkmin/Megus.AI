import { describe, expect, it, vi } from "vitest";
import { HandleInboundMessage } from "../../src/application/use-cases/HandleInboundMessage";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { MockAudioTranscriber } from "../../src/infrastructure/ai/MockAudioTranscriber";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";
import type { IAudioTranscriber } from "../../src/domain/ports/IAudioTranscriber";

const integration = { id: "int1", displayName: "X", whatsappNumber: "5511999990000", fiscalDoc: "1", fiscalName: "X", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
const inbound: InboundMessage = { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text: "oi", media: null, timestamp: new Date() };
const audioInbound: InboundMessage = { providerMessageId: "a1", from: "5511988887777", to: "5511999990000", kind: "audio", text: null, media: { mimetype: "audio/ogg; codecs=opus", base64: "T2dnUwABAA" }, timestamp: new Date() };

const agentConfig = { id: "ag1", integrationId: "int1", name: "Kaua", instructions: "", capabilities: { chat: true, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: [], agenda: false, agendaLink: null }, knowledgeFiles: [], fewShotDialogs: [], segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", createdAt: new Date(), updatedAt: new Date() } as any;

function seeded(): InMemoryRepositories {
  const repos = new InMemoryRepositories();
  repos.seed({ integrations: [integration], agentConfigs: [agentConfig] });
  return repos;
}

describe("HandleInboundMessage", () => {
  it("número desconhecido → não faz nada", async () => {
    const repos = new InMemoryRepositories();
    const sm = { advance: vi.fn() } as any;
    const uc = new HandleInboundMessage({ integrations: repos.integrations, agentConfigs: repos.agentConfigs, conversations: repos.conversations, contacts: repos.contacts, stateMachine: sm, transcriber: new MockAudioTranscriber() });
    await uc.execute({ ...inbound, to: "0000" });
    expect(sm.advance).not.toHaveBeenCalled();
  });

  it("número conhecido → cria contato/conversa e chama o state machine", async () => {
    const repos = seeded();
    const sm = { advance: vi.fn() } as any;
    const uc = new HandleInboundMessage({ integrations: repos.integrations, agentConfigs: repos.agentConfigs, conversations: repos.conversations, contacts: repos.contacts, stateMachine: sm, transcriber: new MockAudioTranscriber() });
    await uc.execute(inbound);
    expect(sm.advance).toHaveBeenCalledOnce();
    const contact = await repos.contacts.findByWhatsapp("int1", "5511988887777");
    expect(contact).not.toBeNull();
  });

  it("áudio com base64 → transcreve, grava a transcrição no histórico e marca transcribed", async () => {
    const repos = seeded();
    const sm = { advance: vi.fn() } as any;
    const transcriber: IAudioTranscriber = { transcribe: vi.fn(async () => "meu nome é Pietro Alkmin") };
    const appendSpy = vi.spyOn(repos.conversations, "appendMessage");
    const uc = new HandleInboundMessage({ integrations: repos.integrations, agentConfigs: repos.agentConfigs, conversations: repos.conversations, contacts: repos.contacts, stateMachine: sm, transcriber });

    const msg = { ...audioInbound };
    await uc.execute(msg);

    expect(transcriber.transcribe).toHaveBeenCalledWith({ mimetype: "audio/ogg; codecs=opus", base64: "T2dnUwABAA" });
    // histórico guarda a fala transcrita (não "[audio]")
    expect(appendSpy.mock.calls[0]![0].body).toBe("meu nome é Pietro Alkmin");
    expect(appendSpy.mock.calls[0]![0].kind).toBe("audio");
    // o state machine recebe a mensagem já como texto + flag de transcrição
    const passed = sm.advance.mock.calls[0]![3] as InboundMessage;
    expect(passed.text).toBe("meu nome é Pietro Alkmin");
    expect(passed.transcribed).toBe(true);
  });

  it("falha ao transcrever → não quebra; áudio segue SEM texto ('[audio]') e sem flag", async () => {
    const repos = seeded();
    const sm = { advance: vi.fn() } as any;
    const transcriber: IAudioTranscriber = { transcribe: vi.fn(async () => { throw new Error("api down"); }) };
    const appendSpy = vi.spyOn(repos.conversations, "appendMessage");
    const uc = new HandleInboundMessage({ integrations: repos.integrations, agentConfigs: repos.agentConfigs, conversations: repos.conversations, contacts: repos.contacts, stateMachine: sm, transcriber });

    await uc.execute({ ...audioInbound });

    expect(appendSpy.mock.calls[0]![0].body).toBe("[audio]");
    const passed = sm.advance.mock.calls[0]![3] as InboundMessage;
    expect(passed.text).toBeNull();
    expect(passed.transcribed).toBeFalsy();
    expect(sm.advance).toHaveBeenCalledOnce(); // fluxo segue
  });

  it("áudio SEM base64 → nem tenta transcrever", async () => {
    const repos = seeded();
    const sm = { advance: vi.fn() } as any;
    const transcriber: IAudioTranscriber = { transcribe: vi.fn(async () => "x") };
    const uc = new HandleInboundMessage({ integrations: repos.integrations, agentConfigs: repos.agentConfigs, conversations: repos.conversations, contacts: repos.contacts, stateMachine: sm, transcriber });

    await uc.execute({ ...audioInbound, media: { mimetype: "audio/ogg", base64: undefined } });

    expect(transcriber.transcribe).not.toHaveBeenCalled();
  });
});
