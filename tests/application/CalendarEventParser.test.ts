import { describe, expect, it } from "vitest";
import { parseCalendarAppointment } from "../../src/application/admin/CalendarEventParser";

describe("parseCalendarAppointment", () => {
  it("lê o evento real de consulta e normaliza telefone, CPF e valor", () => {
    const result = parseCalendarAppointment({ id: "evt-1", summary: "[TESTE MEGUS] Consulta Renato", description: "Nome completo: Renato Alves\nTelefone: +55 11 99999-1111\nCPF: 529.982.247-25\nEndere?o: Rua de Teste, 100\nValor: R$ 180,00", start: { dateTime: "2026-07-25T10:00:00-03:00" } });
    // patientKey vem do "Nome completo" (dado explícito), não do apelido do título:
    // casa melhor com o contato salvo e reduz ambiguidade entre homônimos.
    expect(result).toMatchObject({ patientKey: "Renato Alves", phone: "5511999991111", cpf: "52998224725", address: "Rua de Teste, 100", amount: 180, errors: [] });
  });

  it("separa discriminante numérico do nome", () => {
    expect(parseCalendarAppointment({ id: "evt-2", summary: "Consulta Renato 2222", description: "Valor: 150" })).toMatchObject({ patientKey: "Renato", discriminator: "2222", amount: 150, errors: [] });
  });

  it("sem valor → rejeitado (o valor é o que marca o evento como cobrável)", () => {
    const r = parseCalendarAppointment({ id: "evt-3", summary: "Retorno", description: "Telefone: 5511999991111" });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("Valor");
  });

  // A clínica escreve na ordem dela. Casos REAIS da agenda da cliente (jul/2026 e
  // o histórico de janeiro) — exigir "Consulta NOME" reprovava evento correto.
  it.each([
    ["Bê consulta", "Bê"],
    ["Consulta Maria Silva", "Maria Silva"],
    ["ANTONIO VIOLA-CONSULTA 60MIN", "ANTONIO VIOLA"],
    ["DETE-CONSULTA 60MIN", "DETE"],
    ["LARISSA VANNUCCI-CONSULTA", "LARISSA VANNUCCI"],
    ["TATJANA IZABELLA RAMISCH STEINHART-CONSULTA", "TATJANA IZABELLA RAMISCH STEINHART"],
    ["consulta joão 45 minutos", "joão"],
  ])("aceita %j → paciente %j", (summary, esperado) => {
    const r = parseCalendarAppointment({ id: "e", summary, description: "Telefone: 11999990000\nValor: 180" });
    expect(r.patientKey).toBe(esperado);
    expect(r.errors).toEqual([]);
  });

  it("discriminante numérico continua separado do nome, com a palavra em qualquer ordem", () => {
    expect(parseCalendarAppointment({ id: "e", summary: "Maria consulta 2271", description: "Valor: 180\nTelefone: 11999990000" }))
      .toMatchObject({ patientKey: "Maria", discriminator: "2271" });
  });

  it("título é SÓ o nome (sem a palavra consulta) → aceita", () => {
    // Caso real: depois de 3 tentativas a clínica escreveu só o nome no título.
    // Quem marca o evento como cobrável é o Valor na descrição, não o título.
    const r = parseCalendarAppointment({
      id: "e", summary: "Leandro Precaro Barankiewicz Filho",
      description: "Nome completo: Leandro Precaro Barankiewicz Filho\nTelefone: 11 94284-2271\nValor: 200\nCPF: 525.849.738-04",
    });
    expect(r.errors).toEqual([]);
    expect(r.patientKey).toBe("Leandro Precaro Barankiewicz Filho");
    expect(r.phone).toBe("5511942842271"); // DDI acrescentado — sem ele o envio falha
    expect(r.amount).toBe(200);
  });

  it("'Nome completo' da descrição VENCE o título (dado explícito manda)", () => {
    const r = parseCalendarAppointment({
      id: "e", summary: "Bê consulta",
      description: "Nome completo: Beatriz Souza\nTelefone: 11999990000\nValor: 150",
    });
    expect(r.patientKey).toBe("Beatriz Souza");
  });

  it("evento SEM valor não é atendimento cobrável (reunião/pessoal seguem fora)", () => {
    const r = parseCalendarAppointment({ id: "e", summary: "marta | reunião equipe médica", description: "" });
    expect(r.errors.join(" ")).toContain("Valor");
  });

  // Falha REAL do 1º dia: cobrança criada, botão Cobrar deu 502 porque o número
  // ficou sem DDI (a clínica anota "11 94284-2271", como se fala).
  it.each([
    ["11 94284-2271", "5511942842271"],   // celular nacional escrito como se fala
    ["(12) 99999-1111", "5512999991111"], // com parênteses
    ["1142842271", "551142842271"],       // fixo, 10 dígitos
    ["+55 11 99999-1111", "5511999991111"], // já tem DDI → não duplica
    ["5511942842271", "5511942842271"],   // já normalizado
  ])("telefone %j → %j (WhatsApp exige DDI)", (escrito, esperado) => {
    const r = parseCalendarAppointment({ id: "e", summary: "Consulta X", description: `Telefone: ${escrito}\nValor: 100` });
    expect(r.phone).toBe(esperado);
  });

  // Caso REAL do 1º dia: descrição colada no Google Calendar vira HTML e as
  // "linhas" viram <br> — sem desmontar, nenhum campo era lido e o evento
  // reprovava por "valor obrigatório" com o valor logo ali.
  it("descrição em HTML (texto colado no Google) é lida igual a texto puro", () => {
    const r = parseCalendarAppointment({
      id: "e", summary: "Consulta Pietro Alkmin",
      description: "<span>Nome completo: Pietro Alkmin<br>Telefone: 12 99652-6854<br>Valor: 2<br>CPF: 546.252.558-30</span>",
    });
    expect(r.errors).toEqual([]);
    expect(r.fullName).toBe("Pietro Alkmin");
    expect(r.phone).toBe("5512996526854");
    expect(r.amount).toBe(2);
    expect(r.cpf).toBe("54625255830");
  });

  it("HTML com <div>, entidades e espaço rígido também é lido", () => {
    const r = parseCalendarAppointment({
      id: "e", summary: "Consulta Ana",
      description: "<div>Nome completo: Ana &amp; Cia</div><div>Telefone:&nbsp;11 98888-7777</div><div>Valor: R$&nbsp;180,00</div>",
    });
    expect(r.errors).toEqual([]);
    expect(r.fullName).toBe("Ana & Cia");
    expect(r.phone).toBe("5511988887777");
    expect(r.amount).toBe(180);
  });

  it("evento sem nenhum nome → erro claro", () => {
    const r = parseCalendarAppointment({ id: "e", summary: "consulta", description: "Valor: 100\nTelefone: 11999990000" });
    expect(r.patientKey).toBe("");
    expect(r.errors.join(" ")).toContain("Sem nome do paciente");
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
