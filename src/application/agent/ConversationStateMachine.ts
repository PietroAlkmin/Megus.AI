import type { Conversation } from "../../domain/entities/Conversation";
import type { InboundMessage } from "../../domain/ports/IMessagingProvider";

/**
 * ⚠️ STUB — o CORAÇÃO do Kaua. É a Seção 2 do design (a desenhar/aprovar).
 *
 * Responsabilidade: dado o estado atual da conversa + a mensagem que chegou,
 * decidir a transição (saudar → coletar nome+CPF → validar via ICpfProvider →
 * criar/dedup contato via IFiscalProvider → pedir/conferir comprovante via
 * IComprovanteAnalyzer → montar EmissionIntent → disparar emissão determinística),
 * acionando handoff humano quando a confiança for baixa.
 *
 * NÃO implementar as regras aqui antes da Seção 2 ser aprovada.
 */
export class ConversationStateMachine {
  async advance(
    _conversation: Conversation,
    _inbound: InboundMessage,
  ): Promise<void> {
    throw new Error(
      "ConversationStateMachine.advance: pendente da Seção 2 (loop do Kaua).",
    );
  }
}
