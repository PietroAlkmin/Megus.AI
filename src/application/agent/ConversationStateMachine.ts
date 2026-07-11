import type { AgentConfig } from "../../domain/entities/AgentConfig";
import type { Conversation } from "../../domain/entities/Conversation";
import { ConversationState } from "../../domain/entities/ConversationState";
import type { Integration } from "../../domain/entities/Integration";
import { Cpf } from "../../domain/value-objects/Cpf";
import { nameMatch } from "../../domain/services/nameMatch";
import type { AgentContext, AgentDecision, IAgentBrain } from "../../domain/ports/IAgentBrain";
import { BOOKING_TOOL_NAME } from "../../domain/ports/IAgentToolsProvider";
import type { ICpfProvider } from "../../domain/ports/ICpfProvider";
import type { IComprovanteAnalyzer } from "../../domain/ports/IComprovanteAnalyzer";
import type { IFiscalProvider } from "../../domain/ports/IFiscalProvider";
import type { IMessagingProvider, InboundMessage } from "../../domain/ports/IMessagingProvider";
import type {
  IChargeRepository, IContactRepository, IConversationRepository,
  IEmissionIntentRepository, IServiceRepository, ICompanyProfileRepository,
} from "../../domain/ports/repositories";
import { randomUUID } from "node:crypto";
import { sanitizeFiscalText } from "../../domain/services/sanitizeFiscalText";
import { assembleContext } from "./ContextAssembler";

/**
 * ID do evento criado no Google Calendar — best-effort a partir do output cru
 * da tool CREATE_EVENT (Composio/Vercel). Shape real ainda não confirmado por
 * smoke ao vivo do CREATE_EVENT (Task 3, Plano 7); tenta os formatos mais
 * prováveis (resposta crua da API do Google via Composio, ou já achatada) e
 * NUNCA lança — `Charge.calendarEventId` já documenta que é best-effort.
 */
function extractEventId(output: unknown): string | null {
  try {
    const data = (output as { data?: { response_data?: { id?: unknown }; id?: unknown } } | null | undefined)?.data;
    const id = data?.response_data?.id ?? data?.id ?? null;
    return id == null ? null : String(id);
  } catch {
    return null;
  }
}

/**
 * Falha "soft" do Composio: a tool RESOLVE com envelope {successful:false, error}
 * em vez de lançar — o ai@7 lista isso em toolResults como se fosse sucesso
 * (achado do review da Task 3). Marcação que falhou não vira cobrança. Só marca
 * falha EXPLÍCITA (successful===false ou error truthy) — shape desconhecido sem
 * esses sinais passa (o smoke da Task 5 confirma o envelope real).
 */
function isSoftFailure(output: unknown): boolean {
  const o = output as { successful?: unknown; error?: unknown } | null | undefined;
  return o?.successful === false || Boolean(o?.error);
}

/** Data corrente PT-BR (America/Sao_Paulo) para o AgentContext. Runtime real — usa new Date(). */
function formatToday(): string {
  return new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

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
  /** Cadastro da aba Empresa — entra no contexto do cérebro (bloco "Sobre a empresa"). */
  companyProfiles: ICompanyProfileRepository;
  /** Cobranças (Task 3, Plano 7) — handleChatting cria a "pendente" quando o evento de agenda é marcado. */
  charges: IChargeRepository;
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
    // Comando de TESTE "/reset": zera a memória DESTA conversa (histórico, estado,
    // identidade e rascunhos de emissão) — destrava conversa presa em estado fiscal
    // ou em handoff durante testes no WhatsApp real. Vem ANTES do "bot calado" de
    // propósito; só texto puro (mídia com legenda "/reset" segue pro gate fiscal).
    // Notas emitidas/em emissão são registro fiscal: nunca se apagam.
    if (inbound.kind === "text" && inbound.text?.trim().toLowerCase() === "/reset") {
      return this.resetConversation(conversation, integration);
    }

    if (conversation.humanHandoff) return; // bot calado

    // Regra dura: mídia em estado de comprovante → gate B (handleComprovante) ANTES
    // de qualquer roteamento ao cérebro. O ato fiscal NUNCA passa pela IA.
    if (
      inbound.media &&
      (conversation.state === ConversationState.AwaitingComprovante ||
        conversation.state === ConversationState.VerifyingComprovante)
    ) {
      return this.handleComprovante(conversation, agentConfig, integration, inbound);
    }

    switch (conversation.state) {
      case ConversationState.CollectingIdentity:
      case ConversationState.ValidatingCpf:
        return this.handleIdentity(conversation, agentConfig, integration, inbound);
      case ConversationState.AwaitingComprovante:
      case ConversationState.VerifyingComprovante:
        return this.handleComprovante(conversation, agentConfig, integration, inbound);
      default:
        // New, ReadyToEmit, Done e qualquer outro estado não-fiscal → conversa livre.
        // O default deixa de ser o "Um momento" morto: o cérebro responde em todo estado.
        return this.handleChatting(conversation, agentConfig, integration, inbound);
    }
  }

  /**
   * Reset de teste (/reset): a conversa volta ao zero absoluto — histórico apagado,
   * estado New, handoff desligado, identidade do contato esquecida (o fluxo volta a
   * coletar nome+CPF) e rascunhos de emissão descartados. Não chama o cérebro nem
   * qualquer provedor fiscal; emitted/emitting ficam intactos.
   */
  private async resetConversation(conv: Conversation, integration: Integration): Promise<void> {
    const instance = integration.evolutionInstance || undefined;

    await this.d.conversations.deleteMessages(conv.id);
    await this.d.emissions.deleteUnemittedByConversationId(conv.id);
    this.attempts.delete(conv.id);

    const contact = await this.d.contacts.findByWhatsapp(integration.id, conv.whatsappNumber);
    if (contact) {
      await this.d.contacts.save({
        ...contact,
        fullName: null,
        cpf: null,
        cpfNameVerified: false,
        updatedAt: new Date(),
      });
    }

    conv.state = ConversationState.New;
    conv.humanHandoff = false;
    conv.updatedAt = new Date();
    await this.d.conversations.save(conv);

    await this.send(
      conv,
      ["🔄 Pronto! Conversa resetada (comando de teste): histórico, identidade e estado zerados. Pode começar do zero."],
      instance,
    );
  }

  /** New/Chatting: o cérebro responde e sinaliza intenção de emitir nota. */
  private async handleChatting(conv: Conversation, cfg: AgentConfig, integration: Integration, inbound: InboundMessage): Promise<void> {
    const decision = await this.d.brain.decide(await this.context(conv, cfg, integration));

    // Cobrança pendente nasce JUNTO com o evento (Task 3, Plano 7) — roda em TODA
    // decide() deste método, ANTES do ramo de identidade: no MESMO turno em que o
    // cliente manda nome+CPF, o gate de identidade do Brain já leu o ctx (e o
    // cpfNameVerified=false) ANTES desta validação rodar — logo o CREATE_EVENT
    // real só passa numa decide() de um turno POSTERIOR (cpfNameVerified já true
    // no ctx). Checar aqui, sempre, cobre esse turno posterior sem depender de
    // qual sub-caminho (fiscal/cadastro/resposta simples) a decisão segue depois.
    await this.createChargesFromBooking(conv, cfg, integration, decision);

    const instance = integration.evolutionInstance || undefined;

    // Se o cliente já mandou nome+CPF (mesmo "no meio da conversa"), valida JÁ —
    // não deixa a identidade fornecida sem ação esperando o próximo turno.
    // Modo depende do MOTIVO: intent_emit é o funil fiscal de sempre (arma o
    // comprovante no sucesso); qualquer outra ação com identidade junto (ex.:
    // agendamento) é "cadastro" — valida e salva igual, mas NÃO sequestra a
    // conversa pro fluxo de nota; quem responde é o cérebro.
    const fullName = (decision.extracted?.fullName ?? "").trim();
    const cpfRaw = (decision.extracted?.cpf ?? "").trim();
    if (fullName && cpfRaw) {
      const mode = decision.action.type === "intent_emit" ? "fiscal" : "cadastro";
      if (mode === "fiscal") {
        conv.state = ConversationState.CollectingIdentity;
        await this.d.conversations.save(conv);
      }
      return this.processIdentity(conv, integration, decision, mode);
    }

    await this.send(conv, decision.reply, instance);
    // Roteamento por action (nenhuma alcança o ato fiscal — quem emite é o gate C):
    // - intent_emit substitui o antigo request_identity: só ACIONA a coleta de
    //   identidade (move p/ CollectingIdentity). NUNCA pula portão.
    // - handoff: transfere pro humano.
    // - reply/answer_question/quote_price/smalltalk/provide_identity/request_comprovante:
    //   só a resposta (já enviada); sem transição fiscal.
    if (decision.action.type === "intent_emit") {
      conv.state = ConversationState.CollectingIdentity;
      await this.d.conversations.save(conv);
    } else if (decision.action.type === "handoff") {
      await this.handoff(conv, decision.action.reason, instance);
    }
  }

  /**
   * Cria uma Charge "pendente" por resultado de CREATE_EVENT na decisão (Task 3,
   * Plano 7) — nunca cobra na hora; a clínica decide quando cobrar (botão no
   * painel, fora desta task). MESMA seleção de serviço do gate B
   * (`handleComprovante`): `cfg.capabilities.linkedServiceIds` → primeiro serviço
   * da integração como fallback. Sem serviço OU sem contato → só warn e sai
   * (nunca inventa valor — regra dura). Um loop por resultado: duas marcações no
   * mesmo turno viram duas cobranças.
   */
  private async createChargesFromBooking(
    conv: Conversation,
    cfg: AgentConfig,
    integration: Integration,
    decision: AgentDecision,
  ): Promise<void> {
    const results = decision.toolResults?.filter((r) => r.name === BOOKING_TOOL_NAME) ?? [];
    const bookings = results.filter((r) => {
      if (!isSoftFailure(r.output)) return true;
      console.warn(`[cobranca] marcacao com soft-error do provedor ignorada (conv=${conv.id}) — sem cobranca`);
      return false;
    });
    if (bookings.length === 0) return;

    const contact = await this.d.contacts.findByWhatsapp(integration.id, conv.whatsappNumber);
    const services = await this.d.services.listByIntegration(integration.id);
    const service = services.find((s) => cfg.capabilities.linkedServiceIds.includes(s.id)) ?? services[0];

    if (!service || !contact) {
      console.warn(
        `[cobranca] evento de agenda marcado sem cobranca (conv=${conv.id}): ${!contact ? "contato" : "servico"} ausente`,
      );
      return;
    }

    const now = new Date();
    for (const booking of bookings) {
      await this.d.charges.save({
        id: randomUUID(),
        integrationId: integration.id,
        contactId: contact.id,
        serviceId: service.id,
        description: service.description,
        amount: service.price,
        status: "pendente",
        calendarEventId: extractEventId(booking.output),
        chargedAt: null,
        paidAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  /** Coleta nome+CPF: chama o cérebro e delega a validação. */
  private async handleIdentity(conv: Conversation, cfg: AgentConfig, integration: Integration, inbound: InboundMessage): Promise<void> {
    const decision = await this.d.brain.decide(await this.context(conv, cfg, integration));
    return this.processIdentity(conv, integration, decision);
  }

  /**
   * Valida dígito + CPF↔nome a partir da decisão já obtida, cria cliente e avança.
   *
   * `mode` (default "fiscal") separa o DESTINO pós-validação sem duplicar a
   * validação em si:
   * - "fiscal": o funil de emissão de sempre — `handleIdentity` chama SEM
   *   informar `mode` (states CollectingIdentity/ValidatingCpf só são
   *   alcançáveis por esse funil), e `handleChatting` também usa fiscal quando
   *   a ação é `intent_emit`. Byte-idêntico ao comportamento pré-existente.
   * - "cadastro": identidade dada em conversa livre por outro motivo (ex.:
   *   agendamento). Valida e salva o contato do MESMO jeito (mesmo bloco), mas
   *   NÃO arma o comprovante — o estado da conversa não é tocado aqui (fica
   *   como estava, ex. New) e quem fala é o cérebro (`decision.reply`), nunca
   *   o "me manda o comprovante" fiscal. Falhas em cadastro não contam
   *   tentativa nem levam a handoff — esse contador é regra do funil fiscal.
   */
  private async processIdentity(
    conv: Conversation,
    integration: Integration,
    decision: AgentDecision,
    mode: "fiscal" | "cadastro" = "fiscal",
  ): Promise<void> {
    const instance = integration.evolutionInstance || undefined;
    const fullName = (decision.extracted?.fullName ?? "").trim();
    const cpfRaw = (decision.extracted?.cpf ?? "").trim();

    // Identidade ainda não fornecida: strings vazias → pede de novo sem contar tentativa.
    // (Em modo cadastro isto não deveria ocorrer — handleChatting só chama com os
    // dois campos preenchidos — mas a guarda fica sã: re-pede sem mexer no estado.)
    if (!fullName || !cpfRaw) {
      await this.send(conv, ["Preciso do seu nome completo e CPF para emitir a nota. Pode mandar?"], instance);
      if (mode === "fiscal") {
        conv.state = ConversationState.CollectingIdentity;
        await this.d.conversations.save(conv);
      }
      return;
    }

    // Nome e CPF foram fornecidos: valida CPF e cruzamento nome↔CPF.
    const cpf = Cpf.tryCreate(cpfRaw);
    const lookup = cpf ? await this.d.cpf.lookupName(cpf.digits) : { found: false, name: null };
    const ok = !!cpf && lookup.found && lookup.name != null && nameMatch(fullName, lookup.name);
    if (!ok) {
      const msg = cpf
        ? "O nome não bateu com o CPF informado. Pode conferir e mandar de novo?"
        : "Esse CPF não parece válido. Pode conferir e mandar de novo?";
      if (mode === "cadastro") {
        // Cadastro (identidade em conversa livre): repete o erro sem contar
        // tentativa nem acionar handoff — attempts/handoff é regra do funil fiscal.
        await this.send(conv, [msg], instance);
        return;
      }
      const n = (this.attempts.get(conv.id) ?? 0) + 1;
      this.attempts.set(conv.id, n);
      if (n >= this.d.config.cpfMaxAttempts) {
        await this.handoff(conv, "CPF↔nome não confere após tentativas", instance);
        return;
      }
      await this.send(conv, [msg], instance);
      conv.state = ConversationState.CollectingIdentity;
      await this.d.conversations.save(conv);
      return;
    }

    // OK: cria/dedup o contato e o cliente no backend fiscal — MESMO bloco nos 2 modos.
    this.attempts.delete(conv.id);
    let contact = await this.d.contacts.findByCpf(integration.id, cpf.digits);
    const now = new Date();
    if (!contact) {
      // Não existe contato com esse CPF: reutiliza o contato existente por WhatsApp
      // (criado quando a conversa chegou) ou cria um novo se não houver nenhum.
      const byWhatsapp = await this.d.contacts.findByWhatsapp(integration.id, conv.whatsappNumber);
      if (byWhatsapp) {
        contact = { ...byWhatsapp, fullName, cpf: cpf.digits, cpfNameVerified: true, updatedAt: now };
      } else {
        contact = {
          id: randomUUID(), integrationId: integration.id, whatsappNumber: conv.whatsappNumber,
          fullName, cpf: cpf.digits, cpfNameVerified: true, createdAt: now, updatedAt: now,
        };
      }
    } else {
      contact = { ...contact, fullName, cpfNameVerified: true, updatedAt: now };
    }
    await this.d.contacts.save(contact);
    await this.d.fiscal.upsertCustomer({
      integrationRef: integration.fiscalProviderRef, name: fullName, cpf: cpf.digits, whatsapp: conv.whatsappNumber,
    });
    conv.contactId = contact.id;

    if (mode === "cadastro") {
      // NÃO arma o comprovante: a conversa segue (estado atual — ex. New) e quem
      // fala é o cérebro (a resposta natural já decidida, ex. "vou confirmar seu
      // horário"), nunca o "me manda o comprovante" — isso é fiscal, não cadastro.
      await this.d.conversations.save(conv);
      if (decision.reply.length > 0) await this.send(conv, decision.reply, instance);
      return;
    }

    conv.state = ConversationState.AwaitingComprovante;
    await this.d.conversations.save(conv);
    await this.send(conv, ["Perfeito! Agora me envia o comprovante de pagamento (foto ou PDF) que eu emito sua nota."], instance);
  }

  private async handleComprovante(conv: Conversation, cfg: AgentConfig, integration: Integration, inbound: InboundMessage): Promise<void> {
    const instance = integration.evolutionInstance || undefined;
    if (inbound.kind === "text" || !inbound.media) {
      await this.send(conv, ["Me envia o comprovante de pagamento como foto ou PDF, por favor."], instance);
      return;
    }
    conv.state = ConversationState.VerifyingComprovante;
    await this.d.conversations.save(conv);

    const services = await this.d.services.listByIntegration(integration.id);
    const service = services.find((s) => cfg.capabilities.linkedServiceIds.includes(s.id)) ?? services[0];
    if (!service) { await this.handoff(conv, "sem serviço vinculado", instance); return; }

    const analysis = await this.d.comprovante.analyze({
      media: { mimetype: inbound.media.mimetype, base64: inbound.media.base64, url: inbound.media.url },
      expectedRecipientDoc: integration.fiscalDoc, expectedRecipientName: integration.fiscalName,
    });

    const amountOk = analysis.amount != null && Math.abs(analysis.amount - service.price) < 0.01;
    const ok = analysis.recipientMatches && amountOk && analysis.confidence >= this.d.config.comprovanteMinConfidence;
    if (!ok) { await this.handoff(conv, `comprovante não confere (conf=${analysis.confidence})`, instance); return; }

    const contact = await this.d.contacts.findByWhatsapp(integration.id, conv.whatsappNumber);
    if (!contact || !contact.cpf || !contact.fullName) {
      await this.handoff(conv, "dados do tomador ausentes", instance);
      return;
    }
    const now = new Date();
    const intent = {
      id: randomUUID(), conversationId: conv.id, contactId: conv.contactId, integrationId: integration.id,
      status: "ready" as const,
      tomadorName: sanitizeFiscalText(contact.fullName), tomadorCpf: contact.cpf,
      serviceId: service.id, description: sanitizeFiscalText(service.description), amount: service.price,
      paymentVerified: true, paymentConfidence: analysis.confidence,
      fiscalKey: null, pdfUrl: null, createdAt: now, updatedAt: now,
    };
    await this.d.emissions.save(intent);

    conv.state = ConversationState.Emitting;
    await this.d.conversations.save(conv);

    const result = await this.d.fiscal.emitNfse(intent);
    if (!result.success || !result.pdfUrl) { await this.handoff(conv, result.message ?? "falha na emissão", instance); return; }

    await this.d.emissions.save({ ...intent, status: "emitted", fiscalKey: result.fiscalKey, pdfUrl: result.pdfUrl, updatedAt: new Date() });
    await this.d.messaging.sendMedia({ to: conv.whatsappNumber, mimetype: "application/pdf", url: result.pdfUrl, filename: "nota-fiscal.pdf", caption: "Sua nota fiscal está pronta! ✅", instance });

    conv.state = ConversationState.Done;
    await this.d.conversations.save(conv);
  }

  private async context(conv: Conversation, cfg: AgentConfig, integration: Integration): Promise<AgentContext> {
    const services = await this.d.services.listByIntegration(integration.id);
    const history = await this.d.conversations.getHistory(conv.id, 20);
    const contact = await this.d.contacts.findByWhatsapp(integration.id, conv.whatsappNumber);
    // Cadastro rico da empresa (aba Empresa) — o companyId é opcional na entidade
    // (fixtures antigas); sem ele, o contexto segue sem o bloco da empresa.
    const companyProfile = integration.companyId
      ? await this.d.companyProfiles.getByCompanyId(integration.companyId)
      : null;
    return assembleContext({ conversation: conv, agentConfig: cfg, integration, companyProfile, services, contact, history, today: formatToday() });
  }

  private async send(conv: Conversation, bubbles: string[], instance?: string): Promise<void> {
    for (const text of bubbles) {
      await this.d.messaging.sendText({ to: conv.whatsappNumber, text, instance });
      // Grava a fala do Kaua no histórico — sem isso o cérebro vê só mensagens do
      // cliente e não reconhece a resposta de identidade para extrair nome+CPF.
      await this.d.conversations.appendMessage({
        id: randomUUID(),
        conversationId: conv.id,
        direction: "outbound",
        author: "agent",
        kind: "text",
        body: text,
        mediaUrl: null,
        createdAt: new Date(),
      });
    }
  }

  private async handoff(conv: Conversation, reason: string, instance?: string): Promise<void> {
    conv.humanHandoff = true;
    conv.state = ConversationState.HumanHandoff;
    await this.d.conversations.save(conv);
    await this.send(conv, ["Vou te transferir para um atendente humano para finalizar, tá? Já já alguém te responde."], instance);
    void reason;
  }
}
