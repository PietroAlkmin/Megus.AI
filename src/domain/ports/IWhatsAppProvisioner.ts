/**
 * Porta de PROVISIONAMENTO de instância WhatsApp (multi-tenant).
 *
 * Abstrai a API administrativa do Evolution (create/webhook/QR/connectionState) —
 * uma instância por empresa, nome derivado do integrationId (ver EvolutionProvisioner).
 * Trocar de provedor de provisionamento = nova implementação desta porta, ZERO
 * mudança em Application/rotas.
 */
export interface WhatsAppProvisionResult {
  /** QR em data-url base64 para pareamento. null se a instância já está conectada. */
  qrBase64: string | null;
}

export interface WhatsAppConnectionStatus {
  connected: boolean;
  /** Número (só dígitos) do ownerJid real reportado pelo provider. null se não conectado. */
  number: string | null;
}

export interface IWhatsAppProvisioner {
  /** Cria (idempotente) a instância + configura o webhook + devolve o QR pra parear. */
  provision(instanceName: string): Promise<WhatsAppProvisionResult>;
  /** Estado atual da instância + número real (do ownerJid) quando conectada. */
  status(instanceName: string): Promise<WhatsAppConnectionStatus>;
}
