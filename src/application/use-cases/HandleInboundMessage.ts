import type { ConversationStateMachine } from "../agent/ConversationStateMachine";
import type { InboundMessage } from "../../domain/ports/IMessagingProvider";
import type { IAudioTranscriber } from "../../domain/ports/IAudioTranscriber";
import type {
  IAgentConfigRepository, IContactRepository, IConversationRepository, IIntegrationRepository, IInboundMessageDeduplicator,
} from "../../domain/ports/repositories";
import { randomUUID } from "node:crypto";
import type { AdminCommandHandler } from "../admin/AdminCommandHandler";

export interface HandleInboundDeps {
  integrations: IIntegrationRepository;
  agentConfigs: IAgentConfigRepository;
  conversations: IConversationRepository;
  contacts: IContactRepository;
  stateMachine: ConversationStateMachine;
  transcriber: IAudioTranscriber;
  adminCommands?: AdminCommandHandler;
  inboundDeduplicator?: IInboundMessageDeduplicator;
}

export class HandleInboundMessage {
  constructor(private readonly d: HandleInboundDeps) {}

  async execute(inbound: InboundMessage): Promise<void> {
    const integration = await this.d.integrations.getByWhatsappNumber(inbound.to);
    if (!integration || !integration.active) {
      console.warn(`[inbound] nenhuma integração ativa para to=${inbound.to} (from=${inbound.from}) — mensagem ignorada`);
      return;
    }

    // A Evolution pode entregar o mesmo messages.upsert mais de uma vez. A
    // reivindicação acontece antes de comandos, estado e IA para que nenhum
    // efeito colateral seja repetido. IDs ausentes não são deduplicados para
    // não bloquear mensagens distintas de provedores incompletos.
    if (inbound.providerMessageId && this.d.inboundDeduplicator) {
      const claimed = await this.d.inboundDeduplicator.claim(integration.id, inbound.providerMessageId);
      if (!claimed) {
        console.info(`[inbound] duplicata ignorada integrationId=${integration.id} providerMessageId=${inbound.providerMessageId}`);
        return;
      }
    }

    const agentConfig = await this.d.agentConfigs.getByIntegrationId(integration.id);
    if (!agentConfig) {
      console.warn(`[inbound] agentConfig ausente para integrationId=${integration.id} (from=${inbound.from}) — mensagem ignorada`);
      return;
    }

    // Admin vem ANTES de criar Contact/Conversation ou chamar a Nina. Um comando
    // administrativo não pode contaminar a conversa de um paciente.
    if (this.d.adminCommands && await this.d.adminCommands.tryHandle(integration, inbound)) return;

    let contact = await this.d.contacts.findByWhatsapp(integration.id, inbound.from);
    const now = new Date();
    if (!contact) {
      contact = {
        id: randomUUID(), integrationId: integration.id, whatsappNumber: inbound.from,
        fullName: null, cpf: null, cpfNameVerified: false, ficha: {}, createdAt: now, updatedAt: now,
      };
      await this.d.contacts.save(contact);
    }

    const conv = await this.d.conversations.getOrCreate(integration.id, contact.id, inbound.from);
    conv.lastInboundAt = now;

    // Voz → texto ANTES de persistir/rotear: o resto do pipeline (histórico + cérebro)
    // trata o áudio como mensagem digitada. Falhar aqui NÃO quebra o fluxo — o áudio
    // segue sem texto e o state machine responde de forma honesta ("não consegui ouvir"),
    // nunca alimentando "[audio]" cru ao cérebro (causa-raiz do loop mudo de 13/07).
    if (inbound.kind === "audio" && inbound.media?.base64) {
      try {
        const text = await this.d.transcriber.transcribe({ mimetype: inbound.media.mimetype, base64: inbound.media.base64 });
        if (text) {
          inbound.text = text;
          inbound.transcribed = true;
        }
      } catch (e) {
        console.warn(`[inbound] falha ao transcrever áudio de ${inbound.from}:`, e instanceof Error ? e.message : e);
      }
    }

    // CRÍTICO: appendMessage ANTES de advance — o brain lê o histórico para contexto.
    await this.d.conversations.appendMessage({
      id: randomUUID(), conversationId: conv.id, direction: "inbound", author: "contact",
      kind: inbound.kind, body: inbound.text ?? `[${inbound.kind}]`, mediaUrl: inbound.media?.url ?? null, createdAt: now,
    });
    await this.d.conversations.save(conv);

    await this.d.stateMachine.advance(conv, agentConfig, integration, inbound);
  }
}
