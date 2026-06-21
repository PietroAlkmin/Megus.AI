import type { ConversationState } from "./ConversationState";

/** Conversa entre um contato e o Kaua, com seu estado atual. */
export interface Conversation {
  id: string;
  integrationId: string;
  contactId: string;
  whatsappNumber: string; // E.164
  state: ConversationState;
  humanHandoff: boolean; // bot calado, humano assumiu
  lastInboundAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
