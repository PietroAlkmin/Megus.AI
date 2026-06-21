/** Serviço NFS-e vinculado ao agente. price = valor esperado da emissão. */
export interface Service {
  id: string;
  integrationId: string;
  code: string;
  description: string;
  price: number; // BRL
  issCode: string;
}
