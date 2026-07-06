import type {
  IWhatsAppProvisioner,
  WhatsAppConnectionStatus,
  WhatsAppProvisionResult,
} from "../../../domain/ports/IWhatsAppProvisioner";

export interface EvolutionProvisionerConfig {
  baseUrl: string;
  apiKey: string;
  /** URL pública do nosso webhook (ex.: http://megus-app:3000/webhook/evolution) — igual pra toda instância. */
  webhookUrl: string;
}

/** Erro HTTP do Evolution com o status code anexado, pra permitir tratamento idempotente. */
class EvolutionHttpError extends Error {
  constructor(
    method: string,
    path: string,
    public readonly status: number,
    body: string,
  ) {
    super(`Evolution ${method} ${path} → ${status}: ${body}`);
  }
}

/**
 * Implementa IWhatsAppProvisioner via a API administrativa do Evolution (2.3.7):
 * create instance + set webhook + QR + connectionState/fetchInstances.
 *
 * Segurança: 1 instância por empresa (o nome vem do integrationId, nunca de
 * input do usuário — quem decide o nome é a rota, ver whatsapp.routes.ts).
 */
export class EvolutionProvisioner implements IWhatsAppProvisioner {
  constructor(private readonly cfg: EvolutionProvisionerConfig) {}

  async provision(instanceName: string): Promise<WhatsAppProvisionResult> {
    let qrFromCreate: string | null = null;
    try {
      const created = await this.req("/instance/create", "POST", {
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      });
      qrFromCreate = this.extractBase64(created);
    } catch (err) {
      // Idempotente: instância já existe → Evolution responde 403/409. Segue o
      // fluxo (webhook + QR) em vez de propagar erro — provisionar 2x não pode falhar.
      if (!(err instanceof EvolutionHttpError) || (err.status !== 403 && err.status !== 409)) {
        throw err;
      }
    }

    // Sempre reconfigura o webhook — barato e garante que aponta pro app certo
    // mesmo se a instância já existia com um webhook antigo/errado.
    await this.req(`/webhook/set/${instanceName}`, "POST", {
      webhook: {
        enabled: true,
        url: this.cfg.webhookUrl,
        byEvents: false,
        base64: true,
        events: ["MESSAGES_UPSERT"],
      },
    });

    if (qrFromCreate) return { qrBase64: qrFromCreate };

    // Instância já existia (sem QR na resposta do create): busca o QR via connect.
    const connect = await this.req(`/instance/connect/${instanceName}`, "GET");
    return { qrBase64: this.extractBase64(connect) };
  }

  async status(instanceName: string): Promise<WhatsAppConnectionStatus> {
    const stateRes = await this.req(`/instance/connectionState/${instanceName}`, "GET");
    const state = this.extractState(stateRes);
    if (state !== "open") return { connected: false, number: null };

    const instances = await this.req("/instance/fetchInstances", "GET");
    const ownerJid = this.findOwnerJid(instances, instanceName);
    const number = ownerJid ? ownerJid.replace(/\D/g, "") : null;
    return { connected: true, number };
  }

  /** QR base64 — cobre tanto `{base64}` (connect) quanto `{qrcode:{base64}}` (create). */
  private extractBase64(res: unknown): string | null {
    const r = res as Record<string, unknown> | null;
    return (
      (r?.["base64"] as string | undefined) ??
      ((r?.["qrcode"] as Record<string, unknown> | undefined)?.["base64"] as string | undefined) ??
      null
    );
  }

  /** `state` — cobre tanto `{state}` quanto `{instance:{state}}` (versões do Evolution variam). */
  private extractState(res: unknown): string {
    const r = res as Record<string, unknown> | null;
    return (
      (r?.["state"] as string | undefined) ??
      ((r?.["instance"] as Record<string, unknown> | undefined)?.["state"] as string | undefined) ??
      "close"
    );
  }

  /** Acha a instância pelo nome em fetchInstances e devolve o ownerJid — cobre formato flat e aninhado. */
  private findOwnerJid(res: unknown, instanceName: string): string | null {
    const list = Array.isArray(res) ? res : [];
    for (const item of list) {
      const rec = item as Record<string, unknown>;
      const nested = rec["instance"] as Record<string, unknown> | undefined;
      const name = (rec["name"] as string | undefined) ?? (nested?.["instanceName"] as string | undefined);
      if (name !== instanceName) continue;
      return (rec["ownerJid"] as string | undefined) ?? (nested?.["ownerJid"] as string | undefined) ?? null;
    }
    return null;
  }

  private async req(path: string, method: "GET" | "POST", body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: this.cfg.apiKey },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new EvolutionHttpError(method, path, res.status, await res.text().catch(() => ""));
    }
    return res.json().catch(() => ({}));
  }
}
