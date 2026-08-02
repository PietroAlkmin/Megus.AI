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

  // Falha REAL do 1º dia: o paciente que já tinha conversado virava um SEGUNDO
  // cadastro (o contato criado pela mensagem recebida não tem nome, então o
  // matcher por nome nunca casava). A cobrança ia pro cadastro novo e o
  // comprovante chegava no antigo — o gate B nunca rodava.
  it("paciente que JÁ conversou (contato só com telefone, sem nome) é reconhecido pelo telefone", async () => {
    const repos = new InMemoryRepositories();
    const agora = new Date();
    await repos.contacts.save({
      id: "ct-existente", integrationId: "int", whatsappNumber: "5512996526854",
      fullName: null, cpf: null, cpfNameVerified: false, createdAt: agora, updatedAt: agora,
    });
    const planner = new CalendarImportPlanner({ contacts: repos.contacts, charges: repos.charges });

    const result = await planner.plan("int", [
      { id: "1", summary: "Consulta Pietro Alkmin", description: "Nome completo: Pietro Alkmin\nTelefone: 12 99652-6854\nValor: 2", start: { dateTime: "2026-07-28T10:00:00-03:00" } },
    ]);

    expect(result[0]).toMatchObject({ kind: "ready", createContact: false, existingContactId: "ct-existente" });
  });

  it("telefone diferente + nome igual → cadastros separados (homônimos não se fundem)", async () => {
    const repos = new InMemoryRepositories();
    const agora = new Date();
    await repos.contacts.save({
      id: "ct-1", integrationId: "int", whatsappNumber: "5511911111111",
      fullName: "Maria Silva", cpf: null, cpfNameVerified: false, createdAt: agora, updatedAt: agora,
    });
    const planner = new CalendarImportPlanner({ contacts: repos.contacts, charges: repos.charges });

    const result = await planner.plan("int", [
      { id: "1", summary: "Consulta Maria Silva 2222", description: "Telefone: 5522992222222\nValor: 100", start: { dateTime: "2026-07-28T10:00:00-03:00" } },
    ]);

    expect(result[0]).toMatchObject({ kind: "ready", createContact: true });
  });
});
