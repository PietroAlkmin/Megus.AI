import { describe, expect, it } from "vitest";
import { AdminCommandHandler } from "../../src/application/admin/AdminCommandHandler";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { LogMessagingProvider } from "../../src/infrastructure/messaging/LogMessagingProvider";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

const integration = { id: "int1", companyId: "co1", displayName: "X", whatsappNumber: "5511999990000", fiscalDoc: "1", fiscalName: "X", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
const command = (from: string, text = "/admin"): InboundMessage => ({ providerMessageId: "m1", from, to: integration.whatsappNumber, kind: "text", text, media: null, timestamp: new Date() });

describe("AdminCommandHandler", () => {
  it("responde somente ao número administrativo da própria empresa", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ adminWhatsappAccesses: [{ companyId: "co1", whatsappNumber: "5511991111111" }] });
    const messaging = new LogMessagingProvider();
    const handler = new AdminCommandHandler({ access: repos.adminWhatsappAccess, messaging });

    await expect(handler.tryHandle(integration, command("5511991111111"))).resolves.toBe(true);
    expect(messaging.sent).toHaveLength(1);
    await expect(handler.tryHandle(integration, command("5511992222222"))).resolves.toBe(false);
    expect(messaging.sent).toHaveLength(1);
  });

  it("ignora texto comum e não abre modo administrativo", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ adminWhatsappAccesses: [{ companyId: "co1", whatsappNumber: "5511991111111" }] });
    const handler = new AdminCommandHandler({ access: repos.adminWhatsappAccess, messaging: new LogMessagingProvider() });
    await expect(handler.tryHandle(integration, command("5511991111111", "olá"))).resolves.toBe(false);
  });
});
