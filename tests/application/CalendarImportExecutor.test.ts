import { describe, expect, it } from "vitest";
import { CalendarImportExecutor } from "../../src/application/admin/CalendarImportExecutor";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";

describe("CalendarImportExecutor", () => {
  it("cria uma cobrança por evento e não duplica na segunda execução", async () => {
    const repos = new InMemoryRepositories();
    const executor = new CalendarImportExecutor({ contacts: repos.contacts, charges: repos.charges });
    const plan: any = [{ kind: "ready", eventId: "evt-1", patientKey: "Renato", amount: 180, existingContactId: null, createContact: true, phone: "5511999991111", fullName: "Renato Alves", cpf: "52998224725" }];
    await expect(executor.execute("int", plan)).resolves.toBe(1);
    await expect(executor.execute("int", plan)).resolves.toBe(0);
    expect(await repos.charges.findByCalendarEventId("int", "evt-1")).toMatchObject({ amount: 180, status: "pendente" });
    expect(await repos.contacts.findByWhatsapp("int", "5511999991111")).toMatchObject({ cpfNameVerified: true });
  });

  it("reaproveita o contato real para a remarcação do mesmo paciente no lote", async () => {
    const repos = new InMemoryRepositories();
    const executor = new CalendarImportExecutor({ contacts: repos.contacts, charges: repos.charges });
    const plan: any = [
      { kind: "ready", eventId: "evt-1", patientKey: "Renato", amount: 180, existingContactId: null, createContact: true, phone: "5511999991111", fullName: "Renato Alves", cpf: "52998224725" },
      { kind: "ready", eventId: "evt-2", patientKey: "Renato", amount: 200, existingContactId: "planned:evt-1", createContact: false, phone: null, fullName: null, cpf: null },
    ];

    await expect(executor.execute("int", plan)).resolves.toBe(2);
    const first = await repos.charges.findByCalendarEventId("int", "evt-1");
    const second = await repos.charges.findByCalendarEventId("int", "evt-2");
    expect(second?.contactId).toBe(first?.contactId);
  });
});
