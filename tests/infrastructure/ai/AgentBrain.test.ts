import { describe, expect, it, vi } from "vitest";
import { AgentBrain } from "../../../src/infrastructure/ai/AgentBrain";
import type { AgentEngineOptions, AgentEngineResult, IAgentEngine } from "../../../src/domain/ports/IAgentEngine";
import type { AgentContext } from "../../../src/domain/ports/IAgentBrain";
import type { IAgentToolsProvider } from "../../../src/domain/ports/IAgentToolsProvider";

const EMPTY_CONTEXT: AgentContext = {
  companyId: "c1",
  persona: { name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "", fewShotDialogs: [] },
  business: { companyName: "Clínica X", profile: null, services: [] },
  state: "new",
  history: [],
  collected: { cpfNameVerified: false, fullNameMasked: null, cpfMasked: null, emissionStatus: null },
  today: "sábado, 5 de julho de 2026",
};

function fakeEngine(result: Partial<AgentEngineResult>, spy?: (o: AgentEngineOptions) => void): IAgentEngine {
  return {
    run: vi.fn(async (o: AgentEngineOptions) => {
      spy?.(o);
      return { answer: {}, text: "", toolCalls: [], toolResults: [], ...result };
    }),
  };
}

describe("AgentBrain", () => {
  it("repassa reply e action vindos do motor", async () => {
    const engine = fakeEngine({ answer: { reply: ["Me manda nome e CPF"], action: { type: "intent_emit" } } });
    const brain = new AgentBrain(engine, "gpt-4o");

    const decision = await brain.decide(EMPTY_CONTEXT);

    expect(decision.reply).toEqual(["Me manda nome e CPF"]);
    expect(decision.action).toEqual({ type: "intent_emit" });
    expect(decision.extracted).toBeUndefined();
  });

  it("repassa extracted quando o motor devolve dados coletados", async () => {
    const engine = fakeEngine({ answer: { reply: ["Obrigado, João!"], action: { type: "reply" }, extracted: { fullName: "João", cpf: "529.982.247-25" } } });
    const brain = new AgentBrain(engine, "gpt-4o");

    const decision = await brain.decide(EMPTY_CONTEXT);

    expect(decision.extracted?.fullName).toBe("João");
    expect(decision.extracted?.cpf).toBe("529.982.247-25");
  });

  it("usa fallbacks seguros quando o motor devolve answer vazio", async () => {
    const engine = fakeEngine({ answer: {}, text: "" });
    const brain = new AgentBrain(engine, "gpt-4o");

    const decision = await brain.decide(EMPTY_CONTEXT);

    expect(decision.reply).toEqual([]);
    expect(decision.action).toEqual({ type: "reply" });
  });

  it("sem answer estruturado, usa o texto do motor como bolha única", async () => {
    const engine = fakeEngine({ answer: {}, text: "Claro, posso ajudar!" });
    const brain = new AgentBrain(engine, "gpt-4o");

    const decision = await brain.decide(EMPTY_CONTEXT);

    expect(decision.reply).toEqual(["Claro, posso ajudar!"]);
    expect(decision.action).toEqual({ type: "reply" });
  });

  it("answer.reply vazio ([]) com texto → cai no texto (não retorna [])", async () => {
    // trava o guard `.length > 0`: reply=[] mas o modelo emitiu texto → usa o texto.
    // Um refactor pra `a.reply ?? [texto]` mudaria isso silenciosamente.
    const engine = fakeEngine({ answer: { reply: [], action: { type: "reply" } }, text: "Posso ajudar!" });
    const brain = new AgentBrain(engine, "gpt-4o");

    const decision = await brain.decide(EMPTY_CONTEXT);

    expect(decision.reply).toEqual(["Posso ajudar!"]);
  });

  it("passa model, answerTool, tools e maxSteps para o motor", async () => {
    let seen: AgentEngineOptions | undefined;
    const engine = fakeEngine({ answer: { reply: [], action: { type: "reply" } } }, (o) => { seen = o; });
    const tool = { name: "get_current_datetime", description: "x", parameters: { type: "object", properties: {} }, execute: async () => ({}) };
    const brain = new AgentBrain(engine, "gpt-4o-mini", [tool], 6);

    await brain.decide(EMPTY_CONTEXT);

    expect(seen?.model).toBe("gpt-4o-mini");
    expect(seen?.answerTool.name).toBe("propose_next");
    expect(seen?.tools.map((t) => t.name)).toEqual(["get_current_datetime"]);
    expect(seen?.maxSteps).toBe(6);
  });

  it("as tools do brain entram no system como lista declarativa (nome+descrição)", async () => {
    let seen: AgentEngineOptions | undefined;
    const engine = fakeEngine({ answer: { reply: [], action: { type: "reply" } } }, (o) => { seen = o; });
    const tool = {
      name: "get_current_datetime",
      description: "Data e hora atuais no fuso de São Paulo.",
      parameters: { type: "object", properties: {} },
      execute: async () => ({}),
    };
    const brain = new AgentBrain(engine, "gpt-4o", [tool], 4);

    await brain.decide(EMPTY_CONTEXT);

    const sys = seen?.messages[0];
    expect(sys?.role).toBe("system");
    expect(sys?.content as string).toContain("- get_current_datetime: Data e hora atuais no fuso de São Paulo.");
  });

  it("compõe o prompt: system + histórico como user/assistant", async () => {
    let seen: AgentEngineOptions | undefined;
    const engine = fakeEngine({ answer: { reply: [], action: { type: "reply" } } }, (o) => { seen = o; });
    const brain = new AgentBrain(engine, "gpt-4o");

    await brain.decide({
      ...EMPTY_CONTEXT,
      state: "collecting_identity",
      history: [
        { id: "m1", conversationId: "c1", direction: "inbound" as const, author: "contact", body: "Oi", kind: "text", createdAt: new Date(), mediaUrl: null },
        { id: "m2", conversationId: "c1", direction: "outbound" as const, author: "agent", body: "Olá!", kind: "text", createdAt: new Date(), mediaUrl: null },
      ],
    });

    // system + few-shot(0) + 2 do histórico
    expect(seen?.messages).toHaveLength(3);
    expect(seen?.messages[1]?.role).toBe("user");
    expect(seen?.messages[2]?.role).toBe("assistant");
  });

  it("sem toolsProvider (Fase B desligada), nativeTools vai vazio pro motor", async () => {
    let seen: AgentEngineOptions | undefined;
    const engine = fakeEngine({ answer: { reply: [], action: { type: "reply" } } }, (o) => { seen = o; });
    const brain = new AgentBrain(engine, "gpt-4o");

    await brain.decide(EMPTY_CONTEXT);

    expect(seen?.nativeTools).toEqual({});
  });

  it("com toolsProvider: nativeTools dinâmicas chegam ao motor e a info dinâmica entra no prompt", async () => {
    let seen: AgentEngineOptions | undefined;
    const engine = fakeEngine({ answer: { reply: [], action: { type: "reply" } } }, (o) => { seen = o; });
    const nativeStub = { fake: "composio-tool" }; // stand-in por uma tool nativa já no formato do SDK (Vercel)
    const toolsProvider: IAgentToolsProvider = {
      forCompany: vi.fn(async () => ({
        nativeTools: { GOOGLECALENDAR_CREATE_EVENT: nativeStub },
        infos: [{ name: "GOOGLECALENDAR_CREATE_EVENT", description: "Cria evento no Google Calendar" }],
      })),
    };
    const brain = new AgentBrain(engine, "gpt-4o", [], 4, toolsProvider);

    // cpfNameVerified:true — este teste é sobre passthrough de nativeTools/infos
    // em geral, concern ortogonal ao gate de identidade (Task 3, testado à parte
    // abaixo); sem isto, o gate substituiria o execute por ser a MESMA tool
    // (GOOGLECALENDAR_CREATE_EVENT) que o gate mira.
    await brain.decide({ ...EMPTY_CONTEXT, collected: { ...EMPTY_CONTEXT.collected, cpfNameVerified: true } });

    expect(toolsProvider.forCompany).toHaveBeenCalledWith("c1"); // companyId do EMPTY_CONTEXT
    expect(seen?.nativeTools).toEqual({ GOOGLECALENDAR_CREATE_EVENT: nativeStub });
    expect(seen?.messages[0]?.content as string).toContain("- GOOGLECALENDAR_CREATE_EVENT: Cria evento no Google Calendar");
  });

  it("fail-safe: toolsProvider que rejeita NÃO quebra decide() — segue com toolset vazio", async () => {
    let seen: AgentEngineOptions | undefined;
    const engine = fakeEngine({ answer: { reply: ["oi"], action: { type: "reply" } } }, (o) => { seen = o; });
    const toolsProvider: IAgentToolsProvider = {
      forCompany: vi.fn(async () => {
        throw new Error("composio fora do ar");
      }),
    };
    const brain = new AgentBrain(engine, "gpt-4o", [], 4, toolsProvider);

    const decision = await brain.decide(EMPTY_CONTEXT);

    expect(decision.reply).toEqual(["oi"]); // decide() completou normalmente, sem propagar o erro
    expect(seen?.nativeTools).toEqual({});
  });

  it("gate de identidade (CÓDIGO, não modelo): cpfNameVerified=false + nativeTools tem GOOGLECALENDAR_CREATE_EVENT → execute é SUBSTITUÍDO (original nunca roda) e demais nativeTools intocadas", async () => {
    let seen: AgentEngineOptions | undefined;
    const engine = fakeEngine({ answer: { reply: [], action: { type: "reply" } } }, (o) => { seen = o; });
    const originalExecute = vi.fn(async () => ({ data: { response_data: { id: "evt-real" } } }));
    const originalBookingTool = { description: "Cria evento no Google Calendar", inputSchema: {}, execute: originalExecute };
    const otherTool = { description: "Lista horários livres", inputSchema: {}, execute: vi.fn() };
    const toolsProvider: IAgentToolsProvider = {
      forCompany: vi.fn(async () => ({
        nativeTools: { GOOGLECALENDAR_CREATE_EVENT: originalBookingTool, GOOGLECALENDAR_FIND_FREE_SLOTS: otherTool },
        infos: [],
      })),
    };
    const brain = new AgentBrain(engine, "gpt-4o", [], 4, toolsProvider);

    await brain.decide({ ...EMPTY_CONTEXT, collected: { ...EMPTY_CONTEXT.collected, cpfNameVerified: false } });

    const wrapped = seen?.nativeTools?.GOOGLECALENDAR_CREATE_EVENT as { execute: (args: unknown) => Promise<unknown> };
    expect(wrapped).not.toBe(originalBookingTool); // objeto substituído, não o mesmo
    const result = await wrapped.execute({});
    expect(result).toEqual({
      error: "IDENTIDADE_PENDENTE",
      instrucao: "Antes de marcar, peça o nome completo e o CPF do cliente e aguarde a validação do cadastro.",
    });
    expect(originalExecute).not.toHaveBeenCalled(); // a tool REAL nunca executou
    expect(seen?.nativeTools?.GOOGLECALENDAR_FIND_FREE_SLOTS).toBe(otherTool); // outra tool intocada (mesma referência)
  });

  it("gate de identidade: cpfNameVerified=true → a tool original passa intocada (mesma referência, não uma cópia)", async () => {
    let seen: AgentEngineOptions | undefined;
    const engine = fakeEngine({ answer: { reply: [], action: { type: "reply" } } }, (o) => { seen = o; });
    const originalBookingTool = { description: "Cria evento no Google Calendar", inputSchema: {}, execute: vi.fn() };
    const toolsProvider: IAgentToolsProvider = {
      forCompany: vi.fn(async () => ({ nativeTools: { GOOGLECALENDAR_CREATE_EVENT: originalBookingTool }, infos: [] })),
    };
    const brain = new AgentBrain(engine, "gpt-4o", [], 4, toolsProvider);

    await brain.decide({ ...EMPTY_CONTEXT, collected: { ...EMPTY_CONTEXT.collected, cpfNameVerified: true } });

    expect(seen?.nativeTools?.GOOGLECALENDAR_CREATE_EVENT).toBe(originalBookingTool);
  });

  it("repassa toolResults do motor para a decisão (a SM usa isso pra criar a Charge)", async () => {
    const toolResults = [{ name: "GOOGLECALENDAR_CREATE_EVENT", output: { data: { response_data: { id: "evt-1" } } } }];
    const engine = fakeEngine({ answer: { reply: ["Marcado!"], action: { type: "reply" } }, toolResults });
    const brain = new AgentBrain(engine, "gpt-4o");

    const decision = await brain.decide(EMPTY_CONTEXT);

    expect(decision.toolResults).toEqual(toolResults);
  });
});
