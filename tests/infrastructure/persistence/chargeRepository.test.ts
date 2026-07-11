import { describe, expect, it } from "vitest";
import { InMemoryRepositories } from "../../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { Charge } from "../../../src/domain/entities/Charge";
import type { Integration } from "../../../src/domain/entities/Integration";

function makeIntegration(id: string, companyId: string): Integration {
  const now = new Date();
  return {
    id, companyId, displayName: "Integração " + id, whatsappNumber: "", evolutionInstance: "",
    fiscalDoc: "", fiscalName: "", fiscalProviderRef: null, active: true, createdAt: now, updatedAt: now,
  };
}

function makeCharge(
  overrides: Partial<Charge> & Pick<Charge, "id" | "integrationId" | "contactId" | "createdAt">,
): Charge {
  return {
    serviceId: null,
    description: "Consulta",
    amount: 100,
    status: "pendente",
    calendarEventId: null,
    chargedAt: null,
    paidAt: null,
    updatedAt: overrides.createdAt,
    ...overrides,
  };
}

describe("InMemoryRepositories.charges — contrato", () => {
  it("save + getById faz o round-trip", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [makeIntegration("int1", "co1")] });
    const c = makeCharge({ id: "ch1", integrationId: "int1", contactId: "ct1", createdAt: new Date(2026, 0, 1) });

    await repos.charges.save(c);
    const found = await repos.charges.getById("ch1");

    expect(found).toEqual(c);
  });

  it("getById devolve null quando a cobrança não existe", async () => {
    const repos = new InMemoryRepositories();
    expect(await repos.charges.getById("nao-existe")).toBeNull();
  });

  it("save atualiza a cobrança existente em vez de duplicar (upsert por id)", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [makeIntegration("int1", "co1")] });
    const original = makeCharge({ id: "ch1", integrationId: "int1", contactId: "ct1", status: "pendente", createdAt: new Date(2026, 0, 1) });
    await repos.charges.save(original);

    const cobrada: Charge = { ...original, status: "cobrada", chargedAt: new Date(2026, 0, 2), updatedAt: new Date(2026, 0, 2) };
    await repos.charges.save(cobrada);

    const found = await repos.charges.getById("ch1");
    expect(found?.status).toBe("cobrada");
    expect(found?.chargedAt).toEqual(new Date(2026, 0, 2));

    const all = await repos.charges.listByCompanyId("co1");
    expect(all).toHaveLength(1);
  });

  it("listByCompanyId devolve só as cobranças das integrações da empresa, mais novas primeiro", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({
      integrations: [makeIntegration("int-a", "co-a"), makeIntegration("int-b", "co-b")],
    });

    const chA1 = makeCharge({ id: "chA1", integrationId: "int-a", contactId: "ct1", createdAt: new Date(2026, 0, 1) });
    const chA2 = makeCharge({ id: "chA2", integrationId: "int-a", contactId: "ct2", createdAt: new Date(2026, 0, 3) });
    const chB1 = makeCharge({ id: "chB1", integrationId: "int-b", contactId: "ct3", createdAt: new Date(2026, 0, 2) });

    await repos.charges.save(chA1);
    await repos.charges.save(chA2);
    await repos.charges.save(chB1);

    const listA = await repos.charges.listByCompanyId("co-a");
    expect(listA.map((c) => c.id)).toEqual(["chA2", "chA1"]);

    const listB = await repos.charges.listByCompanyId("co-b");
    expect(listB.map((c) => c.id)).toEqual(["chB1"]);
  });

  it("findLatestChargeableByContact ignora paga e pega a mais recente cobrável", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [makeIntegration("int1", "co1")] });

    const paga = makeCharge({ id: "ch-paga", integrationId: "int1", contactId: "ct1", status: "paga", createdAt: new Date(2026, 0, 5) });
    const pendenteVelha = makeCharge({ id: "ch-pendente-velha", integrationId: "int1", contactId: "ct1", status: "pendente", createdAt: new Date(2026, 0, 1) });
    const cobradaNova = makeCharge({ id: "ch-cobrada-nova", integrationId: "int1", contactId: "ct1", status: "cobrada", createdAt: new Date(2026, 0, 3) });

    await repos.charges.save(paga);
    await repos.charges.save(pendenteVelha);
    await repos.charges.save(cobradaNova);

    const found = await repos.charges.findLatestChargeableByContact("int1", "ct1");
    expect(found?.id).toBe("ch-cobrada-nova");
  });

  it("findLatestChargeableByContact devolve null quando todas as cobranças do contato estão pagas", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [makeIntegration("int1", "co1")] });
    await repos.charges.save(
      makeCharge({ id: "ch1", integrationId: "int1", contactId: "ct1", status: "paga", createdAt: new Date(2026, 0, 1) }),
    );

    const found = await repos.charges.findLatestChargeableByContact("int1", "ct1");
    expect(found).toBeNull();
  });

  it("findLatestChargeableByContact devolve null quando o contato não tem cobrança nenhuma", async () => {
    const repos = new InMemoryRepositories();
    const found = await repos.charges.findLatestChargeableByContact("int1", "ct-sem-cobranca");
    expect(found).toBeNull();
  });

  it("findLatestChargeableByContact não mistura cobranças de outro contato ou outra integração", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [makeIntegration("int1", "co1"), makeIntegration("int2", "co1")] });
    await repos.charges.save(
      makeCharge({ id: "ch-outro-contato", integrationId: "int1", contactId: "ct2", status: "pendente", createdAt: new Date(2026, 0, 9) }),
    );
    await repos.charges.save(
      makeCharge({ id: "ch-outra-integracao", integrationId: "int2", contactId: "ct1", status: "pendente", createdAt: new Date(2026, 0, 9) }),
    );

    const found = await repos.charges.findLatestChargeableByContact("int1", "ct1");
    expect(found).toBeNull();
  });
});
