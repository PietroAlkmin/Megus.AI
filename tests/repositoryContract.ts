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

// Ganchos OPCIONAIS pra bancos com FK de verdade (ex.: Prisma/Azure SQL): precisam
// de um tenant (Company + Integration) existente antes de salvar, e de limpeza
// depois pra não sujar o banco real. O contrato in-memory não usa (sem FK).
export interface ContractHooks {
  seedTenant?: (integrationId: string) => Promise<void>;
  cleanup?: () => Promise<void>;
}

// Reusável: recebe uma função que devolve um bundle LIMPO por chamada.
export async function assertRepositoryContract(repos: ReposBundle, hooks?: ContractHooks): Promise<void> {
  const A = "intA_" + randomUUID().slice(0, 6);
  const B = "intB_" + randomUUID().slice(0, 6);
  const now = new Date();

  await hooks?.seedTenant?.(A);
  await hooks?.seedTenant?.(B);

  try {
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

    // Conversation.getById + getLastMessage (preview do painel)
    expect((await repos.conversations.getById(conv.id))?.id).toBe(conv.id);
    expect(await repos.conversations.getById("conv-inexistente")).toBeNull();
    expect((await repos.conversations.getLastMessage(conv.id))?.body).toBe("olá!");
    expect(await repos.conversations.getLastMessage("conv-inexistente")).toBeNull();

    // countMessagesSince: escopado às integrações passadas (métrica "mensagens hoje")
    const ontem = new Date(Date.now() - 24 * 3600_000);
    expect(await repos.conversations.countMessagesSince([A], ontem)).toBe(2);
    expect(await repos.conversations.countMessagesSince([B], ontem)).toBe(0); // não conta o que é de A
    expect(await repos.conversations.countMessagesSince([], ontem)).toBe(0);

    // EmissionIntent round-trip
    const intentId = randomUUID();
    await repos.emissions.save({ id: intentId, conversationId: conv.id, contactId: cA.id, integrationId: A, status: "ready", tomadorName: "Ana", tomadorCpf: "11111111111", serviceId: null, description: "Massagem", amount: 180, paymentVerified: true, paymentConfidence: 1, fiscalKey: null, pdfUrl: null, createdAt: now, updatedAt: now });
    expect((await repos.emissions.getById(intentId))?.status).toBe("ready");

    // Emissões por integração (métrica "notas hoje") + IDOR
    expect((await repos.emissions.listByIntegrationId(A)).map((v) => v.id)).toContain(intentId);
    expect((await repos.emissions.listByIntegrationId(B)).map((v) => v.id)).not.toContain(intentId);

    // markCharged registra o chargeSentAt (painel de cobranças)
    const quando = new Date();
    expect(await repos.emissions.markCharged(intentId, quando)).toBe(true);
    expect(await repos.emissions.markCharged("emissao-inexistente", quando)).toBe(false);
    const cobrada = (await repos.emissions.listByIntegrationId(A)).find((v) => v.id === intentId);
    expect(cobrada?.chargeSentAt?.getTime()).toBe(quando.getTime());

    // /reset: apaga os rascunhos da conversa mas PRESERVA o registro fiscal (emitted)
    const emittedId = randomUUID();
    await repos.emissions.save({ id: emittedId, conversationId: conv.id, contactId: cA.id, integrationId: A, status: "emitted", tomadorName: "Ana", tomadorCpf: "11111111111", serviceId: null, description: "Massagem", amount: 180, paymentVerified: true, paymentConfidence: 1, fiscalKey: "K1", pdfUrl: "http://x/n.pdf", createdAt: now, updatedAt: now });
    await repos.emissions.deleteUnemittedByConversationId(conv.id);
    expect(await repos.emissions.getById(intentId)).toBeNull(); // ready apagado
    expect((await repos.emissions.getById(emittedId))?.status).toBe("emitted"); // registro vive

    // /reset: o histórico some por inteiro
    await repos.conversations.deleteMessages(conv.id);
    expect(await repos.conversations.getHistory(conv.id, 20)).toEqual([]);
    expect(await repos.conversations.getLastMessage(conv.id)).toBeNull();
  } finally {
    await hooks?.cleanup?.();
  }
}
