import type { AgentTool } from "../../../domain/ports/IAgentEngine";

/**
 * Tool de TESTE da Fase A: prova que o loop de tools funciona ponta-a-ponta (o modelo
 * chama, o motor executa, o resultado volta e o modelo conclui). Some quando entrar a
 * agenda (Fase B). Runtime real → usa new Date() (fuso São Paulo).
 */
export const currentDateTimeTool: AgentTool = {
  name: "get_current_datetime",
  description: "Retorna a data e a hora atuais no fuso de São Paulo. Use quando precisar saber que dia ou hora é agora.",
  parameters: { type: "object", properties: {} },
  execute: async () => ({
    datetime: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  }),
};
