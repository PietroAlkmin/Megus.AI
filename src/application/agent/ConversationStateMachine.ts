import type { AgentConfig } from "../../domain/entities/AgentConfig";
import type { Conversation } from "../../domain/entities/Conversation";
import { ConversationState } from "../../domain/entities/ConversationState";
import type { Integration } from "../../domain/entities/Integration";
import { Cpf } from "../../domain/value-objects/Cpf";
import { nameMatch } from "../../domain/services/nameMatch";
import type { IAgentBrain } from "../../domain/ports/IAgentBrain";
import type { ICpfProvider } from "../../domain/ports/ICpfProvider";
import type { IComprovanteAnalyzer } from "../../domain/ports/IComprovanteAnalyzer";
import type { IFiscalProvider } from "../../domain/ports/IFiscalProvider";
import type { IMessagingProvider, InboundMessage } from "../../domain/ports/IMessagingProvider";
import type {
  IContactRepository, IConversationRepository,
  IEmissionIntentRepository, IServiceRepository,
} from "../../domain/ports/repositories";
import { randomUUID } from "node:crypto";
import { sanitizeFiscalText } from "../../domain/services/sanitizeFiscalText";

export interface StateMachineDeps {
  brain: IAgentBrain;
  cpf: ICpfProvider;
  comprovante: IComprovanteAnalyzer;
  fiscal: IFiscalProvider;
  messaging: IMessagingProvider;
  contacts: IContactRepository;
  conversations: IConversationRepository;
  emissions: IEmissionIntentRepository;
  services: IServiceRepository;
  config: { cpfMaxAttempts: number; comprovanteMinConfidence: number };
}

export class ConversationStateMachine {
  private readonly attempts = new Map<string, number>();
  constructor(private readonly d: StateMachineDeps) {}

  async advance(
    conversation: Conversation,
    agentConfig: AgentConfig,
    integration: Integration,
    inbound: InboundMessage,
  ): Promise<void> {
    if (conversation.humanHandoff) return; // bot calado

    switch (conversation.state) {
      case ConversationState.New:
        return this.handleChatting(conversation, agentConfig, inbound);
      case ConversationState.CollectingIdentity:
      case ConversationState.ValidatingCpf:
        return this.handleIdentity(conversation, agentConfig, integration, inbound);
      case ConversationState.AwaitingComprovante:
      case ConversationState.VerifyingComprovante:
        return this.handleComprovante(conversation, agentConfig, integration, inbound);
      default:
        return this.send(conversation, ["Um momento, já te respondo."]);
    }
  }

  /** New/Chatting: o cérebro responde e sinaliza intenção de emitir nota. */
  private async handleChatting(conv: Conversation, cfg: AgentConfig, inbound: InboundMessage): Promise<void> {
    const decision = await this.d.brain.decide(await this.context(conv, cfg));
    await this.send(conv, decision.reply);
    if (decision.action.type === "request_identity") {
      conv.state = ConversationState.CollectingIdentity;
      await this.d.conversations.save(conv);
    }
  }

  /** Coleta nome+CPF, valida dígito + CPF↔nome, cria cliente. */
  private async handleIdentity(conv: Conversation, cfg: AgentConfig, integration: Integration, inbound: InboundMessage): Promise<void> {
    const decision = await this.d.brain.decide(await this.context(conv, cfg));
    const fullName = (decision.extracted?.fullName ?? "").trim();
    const cpfRaw = (decision.extracted?.cpf ?? "").trim();

    // Identidade ainda não fornecida: strings vazias → pede de novo sem contar tentativa.
    if (!fullName || !cpfRaw) {
      await this.send(conv, ["Preciso do seu nome completo e CPF para emitir a nota. Pode mandar?"]);
      conv.state = ConversationState.CollectingIdentity;
      await this.d.conversations.save(conv);
      return;
    }

    // Nome e CPF foram fornecidos: valida CPF e cruzamento nome↔CPF.
    const cpf = Cpf.tryCreate(cpfRaw);
    const lookup = cpf ? await this.d.cpf.lookupName(cpf.digits) : { found: false, name: null };
    const ok = !!cpf && lookup.found && lookup.name != null && nameMatch(fullName, lookup.name);
    if (!ok) {
      const n = (this.attempts.get(conv.id) ?? 0) + 1;
      this.attempts.set(conv.id, n);
      if (n >= this.d.config.cpfMaxAttempts) {
        await this.handoff(conv, "CPF↔nome não confere após tentativas");
        return;
      }
      const msg = cpf
        ? "O nome não bateu com o CPF informado. Pode conferir e mandar de novo?"
        : "Esse CPF não parece válido. Pode conferir e mandar de novo?";
      await this.send(conv, [msg]);
      conv.state = ConversationState.CollectingIdentity;
      await this.d.conversations.save(conv);
      return;
    }

    // OK: cria/dedup o contato e o cliente no backend fiscal.
    this.attempts.delete(conv.id);
    let contact = await this.d.contacts.findByCpf(integration.id, cpf.digits);
    const now = new Date();
    if (!contact) {
      contact = {
        id: randomUUID(), integrationId: integration.id, whatsappNumber: conv.whatsappNumber,
        fullName, cpf: cpf.digits, cpfNameVerified: true, createdAt: now, updatedAt: now,
      };
    } else {
      contact = { ...contact, fullName, cpfNameVerified: true, updatedAt: now };
    }
    await this.d.contacts.save(contact);
    await this.d.fiscal.upsertCustomer({
      integrationRef: integration.fiscalProviderRef, name: fullName, cpf: cpf.digits, whatsapp: conv.whatsappNumber,
    });

    conv.contactId = contact.id;
    conv.state = ConversationState.AwaitingComprovante;
    await this.d.conversations.save(conv);
    await this.send(conv, ["Perfeito! Agora me envia o comprovante de pagamento (foto ou PDF) que eu emito sua nota."]);
  }

  private async handleComprovante(conv: Conversation, cfg: AgentConfig, integration: Integration, inbound: InboundMessage): Promise<void> {
    if (inbound.kind === "text" || !inbound.media) {
      await this.send(conv, ["Me envia o comprovante de pagamento como foto ou PDF, por favor."]);
      return;
    }
    conv.state = ConversationState.VerifyingComprovante;
    await this.d.conversations.save(conv);

    const services = await this.d.services.listByIntegration(integration.id);
    const service = services.find((s) => cfg.capabilities.linkedServiceIds.includes(s.id)) ?? services[0];
    if (!service) { await this.handoff(conv, "sem serviço vinculado"); return; }

    const analysis = await this.d.comprovante.analyze({
      media: { mimetype: inbound.media.mimetype, base64: inbound.media.base64, url: inbound.media.url },
      expectedRecipientDoc: integration.fiscalDoc, expectedRecipientName: integration.fiscalName,
    });

    const amountOk = analysis.amount != null && Math.abs(analysis.amount - service.price) < 0.01;
    const ok = analysis.recipientMatches && amountOk && analysis.confidence >= this.d.config.comprovanteMinConfidence;
    if (!ok) { await this.handoff(conv, `comprovante não confere (conf=${analysis.confidence})`); return; }

    const contact = await this.d.contacts.findByWhatsapp(integration.id, conv.whatsappNumber);
    const now = new Date();
    const intent = {
      id: randomUUID(), conversationId: conv.id, contactId: conv.contactId, integrationId: integration.id,
      status: "ready" as const,
      tomadorName: sanitizeFiscalText(contact?.fullName ?? ""), tomadorCpf: contact?.cpf ?? "",
      serviceId: service.id, description: sanitizeFiscalText(service.description), amount: service.price,
      paymentVerified: true, paymentConfidence: analysis.confidence,
      fiscalKey: null, pdfUrl: null, createdAt: now, updatedAt: now,
    };
    await this.d.emissions.save(intent);

    conv.state = ConversationState.Emitting;
    await this.d.conversations.save(conv);

    const result = await this.d.fiscal.emitNfse(intent);
    if (!result.success || !result.pdfUrl) { await this.handoff(conv, result.message ?? "falha na emissão"); return; }

    await this.d.emissions.save({ ...intent, status: "emitted", fiscalKey: result.fiscalKey, pdfUrl: result.pdfUrl, updatedAt: new Date() });
    await this.d.messaging.sendMedia({ to: conv.whatsappNumber, mimetype: "application/pdf", url: result.pdfUrl, filename: "nota-fiscal.pdf", caption: "Sua nota fiscal está pronta! ✅" });

    conv.state = ConversationState.Done;
    await this.d.conversations.save(conv);
  }

  private async context(conv: Conversation, cfg: AgentConfig) {
    const history = await this.d.conversations.getHistory(conv.id, 20);
    return { systemInstructions: cfg.instructions, state: conv.state, history, collected: {} };
  }

  private async send(conv: Conversation, bubbles: string[]): Promise<void> {
    for (const text of bubbles) {
      await this.d.messaging.sendText({ to: conv.whatsappNumber, text });
    }
  }

  private async handoff(conv: Conversation, reason: string): Promise<void> {
    conv.humanHandoff = true;
    conv.state = ConversationState.HumanHandoff;
    await this.d.conversations.save(conv);
    await this.send(conv, ["Vou te transferir para um atendente humano para finalizar, tá? Já já alguém te responde."]);
    void reason;
  }
}
