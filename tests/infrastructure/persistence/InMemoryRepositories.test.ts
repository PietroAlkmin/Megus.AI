import { describe, expect, it } from "vitest";
import { InMemoryRepositories } from "../../../src/infrastructure/persistence/memory/InMemoryRepositories";

describe("InMemoryRepositories", () => {
  it("resolve integração por número e dedup de contato por CPF", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({
      integrations: [{
        id: "int1", displayName: "Consultório X", whatsappNumber: "5511999990000",
        fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA",
        fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date(),
      }],
    });
    const found = await repos.integrations.getByWhatsappNumber("5511999990000");
    expect(found?.id).toBe("int1");

    const now = new Date();
    await repos.contacts.save({
      id: "c1", integrationId: "int1", whatsappNumber: "5511988887777",
      fullName: "João Silva", cpf: "52998224725", cpfNameVerified: true,
      createdAt: now, updatedAt: now,
    });
    const dup = await repos.contacts.findByCpf("int1", "52998224725");
    expect(dup?.id).toBe("c1");
  });

  it("updateConnection grava evolutionInstance + whatsappNumber na integração (provisionamento)", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({
      integrations: [{
        id: "int1", displayName: "Consultório X", whatsappNumber: "",
        fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA",
        fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date(),
      }],
    });

    await repos.integrations.updateConnection("int1", "megus-int1", "5511988887777");

    const updated = await repos.integrations.getById("int1");
    expect(updated?.evolutionInstance).toBe("megus-int1");
    expect(updated?.whatsappNumber).toBe("5511988887777");
  });

  it("updateConnection em id inexistente é no-op (não lança)", async () => {
    const repos = new InMemoryRepositories();
    await expect(repos.integrations.updateConnection("nao-existe", "x", "y")).resolves.toBeUndefined();
  });
});
