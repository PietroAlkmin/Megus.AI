import { describe, expect, it } from "vitest";
import { CalendarImportPlanner } from "../../src/application/admin/CalendarImportPlanner";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";

describe("CalendarImportPlanner", () => {
  it("reaproveita o paciente criado no primeiro evento do mesmo lote e bloqueia ambiguidade", async () => {
    const repos = new InMemoryRepositories();
    const planner = new CalendarImportPlanner({ contacts: repos.contacts, charges: repos.charges });
    const result = await planner.plan("int", [
      { id: "1", summary: "Consulta Renato", description: "Nome: Renato Alves\nTelefone: 5511999991111\nValor: 180", start: { dateTime: "2026-07-25T10:00:00-03:00" } },
      { id: "2", summary: "Consulta Renato", description: "Valor: 200", start: { dateTime: "2026-07-25T11:00:00-03:00" } },
      { id: "3", summary: "Consulta Renato 2222", description: "Nome: Renato Costa\nTelefone: 5511999992222\nValor: 150", start: { dateTime: "2026-07-25T12:00:00-03:00" } },
      { id: "4", summary: "Consulta Renato", description: "Valor: 190", start: { dateTime: "2026-07-25T13:00:00-03:00" } },
    ]);
    expect(result.map((x) => x.kind)).toEqual(["ready", "ready", "ready", "invalid"]);
    expect(result[1]).toMatchObject({ createContact: false });
    expect(result[3]).toMatchObject({ reason: expect.stringMatching(/ambíguo/) });
  });
});
