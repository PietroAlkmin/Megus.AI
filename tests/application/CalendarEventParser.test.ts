import { describe, expect, it } from "vitest";
import { parseCalendarAppointment } from "../../src/application/admin/CalendarEventParser";

describe("parseCalendarAppointment", () => {
  it("lê o evento real de consulta e normaliza telefone, CPF e valor", () => {
    const result = parseCalendarAppointment({ id: "evt-1", summary: "[TESTE MEGUS] Consulta Renato", description: "Nome completo: Renato Alves\nTelefone: +55 11 99999-1111\nCPF: 529.982.247-25\nEndere?o: Rua de Teste, 100\nValor: R$ 180,00", start: { dateTime: "2026-07-25T10:00:00-03:00" } });
    expect(result).toMatchObject({ patientKey: "Renato", phone: "5511999991111", cpf: "52998224725", address: "Rua de Teste, 100", amount: 180, errors: [] });
  });

  it("separa discriminante numérico do nome", () => {
    expect(parseCalendarAppointment({ id: "evt-2", summary: "Consulta Renato 2222", description: "Valor: 150" })).toMatchObject({ patientKey: "Renato", discriminator: "2222", amount: 150, errors: [] });
  });

  it("rejeita título fora do contrato e valor ausente", () => {
    expect(parseCalendarAppointment({ id: "evt-3", summary: "Retorno", description: "Telefone: 5511999991111" }).errors).toHaveLength(2);
  });

  it("CPF com dígito verificador errado é DESCARTADO e avisado — não entra no banco como válido", () => {
    // 529.982.247-24 (dígito final trocado): typo plausível da secretária.
    const r = parseCalendarAppointment({ id: "evt-4", summary: "Consulta Renato", description: "Telefone: 5511999991111\nCPF: 529.982.247-24\nValor: 180" });
    expect(r.cpf).toBeNull();
    expect(r.warnings.join(" ")).toContain("CPF inválido");
    expect(r.errors).toEqual([]); // não bloqueia a cobrança — o CPF nem é usado sem fiscal
  });

  it("evento sem CPF não gera aviso (campo é opcional)", () => {
    const r = parseCalendarAppointment({ id: "evt-5", summary: "Consulta Ana", description: "Telefone: 5511999992222\nValor: 200" });
    expect(r.cpf).toBeNull();
    expect(r.warnings).toEqual([]);
  });
});
