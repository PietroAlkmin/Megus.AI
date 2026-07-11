import { randomUUID } from "node:crypto";
import { prisma } from "./client";
import type { IConversationRepository } from "../../../domain/ports/repositories";
import type { Conversation } from "../../../domain/entities/Conversation";
import type { Message } from "../../../domain/entities/Message";
import { ConversationState } from "../../../domain/entities/ConversationState";

function convToDomain(r: { id: string; integrationId: string; contactId: string; whatsappNumber: string; state: string; humanHandoff: boolean; lastInboundAt: Date; createdAt: Date; updatedAt: Date }): Conversation {
  return { id: r.id, integrationId: r.integrationId, contactId: r.contactId, whatsappNumber: r.whatsappNumber, state: r.state as ConversationState, humanHandoff: r.humanHandoff, lastInboundAt: r.lastInboundAt, createdAt: r.createdAt, updatedAt: r.updatedAt };
}
function msgToDomain(r: { id: string; conversationId: string; direction: string; author: string; kind: string; body: string; mediaUrl: string | null; createdAt: Date }): Message {
  return { id: r.id, conversationId: r.conversationId, direction: r.direction as Message["direction"], author: r.author as Message["author"], kind: r.kind as Message["kind"], body: r.body, mediaUrl: r.mediaUrl, createdAt: r.createdAt };
}

export class PrismaConversationRepository implements IConversationRepository {
  async getOrCreate(integrationId: string, contactId: string, number: string): Promise<Conversation> {
    const existing = await prisma.conversation.findFirst({ where: { integrationId, contactId } });
    if (existing) return convToDomain(existing);
    const now = new Date();
    const created = await prisma.conversation.create({
      data: { id: randomUUID(), integrationId, contactId, whatsappNumber: number, state: ConversationState.New, humanHandoff: false, lastInboundAt: now, createdAt: now, updatedAt: now },
    });
    return convToDomain(created);
  }
  async getById(conversationId: string): Promise<Conversation | null> {
    const r = await prisma.conversation.findUnique({ where: { id: conversationId } });
    return r ? convToDomain(r) : null;
  }
  async findByWhatsappNumber(integrationId: string, number: string): Promise<Conversation | null> {
    const r = await prisma.conversation.findFirst({ where: { integrationId, whatsappNumber: number } });
    return r ? convToDomain(r) : null;
  }

  async listByIntegrationId(integrationId: string): Promise<Conversation[]> {
    const rows = await prisma.conversation.findMany({
      where: { integrationId },
      orderBy: { lastInboundAt: "desc" },
    });
    return rows.map(convToDomain);
  }
  
  async save(conv: Conversation): Promise<void> {
    await prisma.conversation.upsert({
      where: { id: conv.id },
      update: { state: conv.state, humanHandoff: conv.humanHandoff, contactId: conv.contactId, lastInboundAt: conv.lastInboundAt, updatedAt: new Date() },
      create: { id: conv.id, integrationId: conv.integrationId, contactId: conv.contactId, whatsappNumber: conv.whatsappNumber, state: conv.state, humanHandoff: conv.humanHandoff, lastInboundAt: conv.lastInboundAt, createdAt: conv.createdAt, updatedAt: conv.updatedAt },
    });
  }
  async appendMessage(m: Message): Promise<void> {
    await prisma.message.create({ data: { id: m.id, conversationId: m.conversationId, direction: m.direction, author: m.author, kind: m.kind, body: m.body, mediaUrl: m.mediaUrl, createdAt: m.createdAt } });
  }
  async getHistory(conversationId: string, limit: number): Promise<Message[]> {
    const rows = await prisma.message.findMany({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
    return rows.reverse().map(msgToDomain);
  }
  async getLastMessage(conversationId: string): Promise<Message | null> {
    const r = await prisma.message.findFirst({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return r ? msgToDomain(r) : null;
  }
  async countMessagesSince(integrationIds: string[], since: Date): Promise<number> {
    if (integrationIds.length === 0) return 0;
    return prisma.message.count({
      where: { createdAt: { gte: since }, Conversation: { integrationId: { in: integrationIds } } },
    });
  }
  async deleteMessages(conversationId: string): Promise<void> {
    await prisma.message.deleteMany({ where: { conversationId } });
  }
}
