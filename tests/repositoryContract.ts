import { expect } from "vitest";
import { randomUUID } from "node:crypto";
import type {
  IContactRepository, IConversationRepository, IEmissionIntentRepository, IServiceRepository,
} from "../src/domain/ports/repositories";
import { ConversationState } from "../src/domain/entities/ConversationState";

export interface ReposBundle {
  contacts: IContactRepository;
  conversations: IConversationRepository;
  emissions: IEmissionIntentRepository;
  services: IServiceRepository;
}

// Reusável: recebe uma função que devolve um bundle LIMPO por chamada.
export async function assertRepositoryContract(repos: ReposBundle): Promise<void> {
  const A = "intA_" + randomUUID().slice(0, 6);
  const B = "intB_" + randomUUID().slice(0, 6);
  const now = new Date();

  // Contact round-trip + IDOR
  const cA = { id: randomUUID(), integrationId: A, whatsappNumber: "551111", fullName: "Ana", cpf: "11111111111", cpfNameVerified: true, createdAt: now, updatedAt: now };
  await repos.contacts.save(cA);
  expect((await repos.contacts.findByCpf(A, "11111111111"))?.fullName).toBe("Ana");
  // tenant B NÃO enxerga o contato de A (IDOR)
  expect(await repos.contacts.findByCpf(B, "11111111111")).toBeNull();
  expect(await repos.contacts.findByWhatsapp(B, "551111")).toBeNull();

  // Conversation + Message round-trip + IDOR
  const conv = await repos.conversations.getOrCreate(A, cA.id, "551111");
  expect(conv.state).toBe(ConversationState.New);
  await repos.conversations.appendMessage({ id: randomUUID(), conversationId: conv.id, direction: "inbound", author: "contact", kind: "text", body: "oi", mediaUrl: null, createdAt: new Date() });
  await repos.conversations.appendMessage({ id: randomUUID(), conversationId: conv.id, direction: "outbound", author: "agent", kind: "text", body: "olá!", mediaUrl: null, createdAt: new Date(Date.now() + 1) });
  const hist = await repos.conversations.getHistory(conv.id, 20);
  expect(hist.map((m) => m.body)).toEqual(["oi", "olá!"]); // ordem cronológica
  expect(await repos.conversations.findByWhatsappNumber(B, "551111")).toBeNull(); // IDOR

  // EmissionIntent round-trip
  const intentId = randomUUID();
  await repos.emissions.save({ id: intentId, conversationId: conv.id, contactId: cA.id, integrationId: A, status: "ready", tomadorName: "Ana", tomadorCpf: "11111111111", serviceId: null, description: "Massagem", amount: 180, paymentVerified: true, paymentConfidence: 1, fiscalKey: null, pdfUrl: null, createdAt: now, updatedAt: now });
  expect((await repos.emissions.getById(intentId))?.status).toBe("ready");
}
