export type MessageDirection = "inbound" | "outbound";
export type MessageAuthor = "contact" | "agent" | "human";
export type MessageKind = "text" | "image" | "audio" | "document";

/** Uma mensagem da conversa (persistida no banco PRÓPRIO do Megus). */
export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  author: MessageAuthor;
  kind: MessageKind;
  body: string; // texto, ou transcrição (áudio) / extração (mídia)
  mediaUrl: string | null;
  createdAt: Date;
}
