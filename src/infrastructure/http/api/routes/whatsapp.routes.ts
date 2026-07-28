import { Router, type Request, type Response } from "express";
import { ok, fail } from "../result";
import type { AuthContext } from "../authMiddleware";
import type { IIntegrationRepository } from "../../../../domain/ports/repositories";
import type { IWhatsAppProvisioner } from "../../../../domain/ports/IWhatsAppProvisioner";

export interface WhatsAppRoutesDeps {
  integrations: IIntegrationRepository;
  provisioner: IWhatsAppProvisioner;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

/**
 * Conexão WhatsApp por empresa (multi-tenant). A instância é SEMPRE derivada da
 * integração da empresa do JWT — nunca de input do usuário — e reusada se já
 * existir (criar instância é caro; 1 por empresa).
 */
export function whatsappRoutes(deps: WhatsAppRoutesDeps): Router {
  const r = Router();

  // Toda rota de conexão exige login — tenant sempre do JWT.
  r.use(deps.authMiddleware);

  // POST /api/agente/whatsapp/connect — cria (ou reusa) a instância da empresa logada e devolve o QR
  r.post("/connect", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const integration = await deps.integrations.ensureDefaultForCompany(companyId);
    const instanceName = integration.evolutionInstance || `megus-${integration.id}`;

    const { qrBase64 } = await deps.provisioner.provision(instanceName);
    await deps.integrations.updateConnection(integration.id, instanceName, integration.whatsappNumber || "");

    ok(res, { qr: qrBase64, instance: instanceName });
  });

  // GET /api/agente/whatsapp/status — estado da conexão da empresa logada
  r.get("/status", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const integration = await deps.integrations.getFirstByCompanyId(companyId);
    const instanceName = integration?.evolutionInstance;

    if (!integration || !instanceName) {
      ok(res, { connected: false, number: null });
      return;
    }

    const { connected, number } = await deps.provisioner.status(instanceName);
    if (connected) {
      // número só vem do ownerJid real (nunca de input); se esta checagem não
      // devolveu um (edge case), preserva o já gravado em vez de apagar.
      await deps.integrations.updateConnection(integration.id, instanceName, number ?? integration.whatsappNumber);
    }
    ok(res, { connected, number });
  });

  // DELETE /api/agente/whatsapp/conexao — desfaz o pareamento da empresa logada.
  // A instância SEMPRE vem da integração do JWT (nunca de input), igual ao connect.
  // Limpa `whatsappNumber` no banco junto: um número que não atende mais não pode
  // continuar resolvendo inbound (dois tenants com o mesmo número gravado fazem o
  // roteador entregar a conversa pro errado — visto em prod 28/07).
  r.delete("/conexao", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const integration = await deps.integrations.getFirstByCompanyId(companyId);
    if (!integration) {
      ok(res, { desconectado: true });
      return;
    }
    const instanceName = integration.evolutionInstance;
    if (instanceName) {
      try {
        await deps.provisioner.disconnect(instanceName);
      } catch (err) {
        console.warn(`[whatsapp] desconectar falhou p/ ${instanceName}:`, err instanceof Error ? err.message : err);
        fail(res, "Não foi possível desconectar agora. Tente de novo.", 502, "WHATSAPP_DISCONNECT_FAILED");
        return;
      }
    }
    await deps.integrations.updateConnection(integration.id, "", "");
    ok(res, { desconectado: true }, "WhatsApp desconectado.");
  });

  return r;
}
