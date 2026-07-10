import { describe, it, expect } from "vitest";
import { integrationToDomain, agentConfigToDomain } from "../src/infrastructure/persistence/prisma/mappers";

describe("integrationToDomain", () => {
  it("reconstrói fiscalDoc/fiscalName/fiscalProviderRef a partir da Company (drift)", () => {
    const integ = { id: "int1", companyId: "co1", displayName: "Consultório", whatsappNumber: "5512997843384", evolutionInstance: "int_int1", active: true, createdAt: new Date(0), updatedAt: new Date(0) };
    const company = { fiscalDoc: "66008326000173", fiscalName: "Clinica X", fiscalProviderRef: null };
    const out = integrationToDomain(integ, company);
    expect(out).toEqual({
      id: "int1", companyId: "co1", displayName: "Consultório", whatsappNumber: "5512997843384", evolutionInstance: "int_int1",
      fiscalDoc: "66008326000173", fiscalName: "Clinica X", fiscalProviderRef: null,
      active: true, createdAt: new Date(0), updatedAt: new Date(0),
    });
  });
});

describe("agentConfigToDomain", () => {
  it("desserializa os campos *Json em objetos", () => {
    const row = {
      id: "ag1", integrationId: "int1", name: "Kaua", segment: "saude",
      tone: "equilibrado", emojis: true, lang: "pt", instructions: "Seja cordial.",
      capabilitiesJson: JSON.stringify({ chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"] }),
      knowledgeFilesJson: JSON.stringify([]),
      fewShotDialogsJson: JSON.stringify([{ q: "oi", a: "olá!" }]),
      createdAt: new Date(0), updatedAt: new Date(0),
    };
    const out = agentConfigToDomain(row);
    expect(out.capabilities.linkedServiceIds).toEqual(["svc1"]);
    expect(out.fewShotDialogs).toEqual([{ q: "oi", a: "olá!" }]);
    expect(out.knowledgeFiles).toEqual([]);
    expect(out.name).toBe("Kaua");
  });
});
