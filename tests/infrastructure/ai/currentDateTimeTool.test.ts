import { describe, expect, it } from "vitest";
import { currentDateTimeTool } from "../../../src/infrastructure/ai/tools/currentDateTimeTool";

describe("currentDateTimeTool", () => {
  it("tem o contrato de AgentTool", () => {
    expect(currentDateTimeTool.name).toBe("get_current_datetime");
    expect(typeof currentDateTimeTool.description).toBe("string");
    expect(currentDateTimeTool.parameters).toEqual({ type: "object", properties: {} });
  });

  it("execute devolve um datetime string não-vazio", async () => {
    const out = (await currentDateTimeTool.execute({})) as { datetime: string };
    expect(typeof out.datetime).toBe("string");
    expect(out.datetime.length).toBeGreaterThan(0);
  });
});
