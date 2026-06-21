import type { InboundKind, InboundMessage } from "../../../domain/ports/IMessagingProvider";

const jidToNumber = (jid: string | undefined): string =>
  (jid ?? "").split("@")[0]?.replace(/\D/g, "") ?? "";

const KIND: Record<string, InboundKind> = {
  conversation: "text",
  extendedTextMessage: "text",
  imageMessage: "image",
  audioMessage: "audio",
  documentMessage: "document",
};

export function mapEvolutionWebhook(body: unknown): InboundMessage | null {
  const b = body as Record<string, unknown>;
  if (!b || b["event"] !== "messages.upsert" || !b["data"]) return null;

  const data = b["data"] as Record<string, unknown>;
  const key = data["key"] as Record<string, unknown> | undefined;
  if (key?.["fromMe"]) return null;

  const type = data["messageType"] as string | undefined;
  const kind = (type !== undefined ? KIND[type] : undefined) ?? "text";
  const msg = (data["message"] ?? {}) as Record<string, unknown>;
  const text: string | null =
    (msg["conversation"] as string | undefined) ??
    ((msg["extendedTextMessage"] as Record<string, unknown> | undefined)?.["text"] as string | undefined) ??
    ((msg["imageMessage"] as Record<string, unknown> | undefined)?.["caption"] as string | undefined) ??
    ((msg["documentMessage"] as Record<string, unknown> | undefined)?.["caption"] as string | undefined) ??
    null;

  const mediaB64: string | undefined =
    (msg["base64"] as string | undefined) ?? (data["base64"] as string | undefined);
  const mimetype: string | undefined =
    ((msg["imageMessage"] as Record<string, unknown> | undefined)?.["mimetype"] as string | undefined) ??
    ((msg["audioMessage"] as Record<string, unknown> | undefined)?.["mimetype"] as string | undefined) ??
    ((msg["documentMessage"] as Record<string, unknown> | undefined)?.["mimetype"] as string | undefined);

  const sender = b["sender"] as string | undefined;
  const instanceNumber = b["instanceNumber"] as string | undefined;

  return {
    providerMessageId: String(key?.["id"] ?? ""),
    from: jidToNumber(key?.["remoteJid"] as string | undefined),
    to: jidToNumber(sender ?? instanceNumber),
    kind,
    text: kind === "text" ? text : text,
    media: kind === "text" ? null : { mimetype: mimetype ?? "application/octet-stream", base64: mediaB64 },
    timestamp: new Date(),
  };
}
