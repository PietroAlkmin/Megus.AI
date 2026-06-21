/** Contato = paciente/lead que conversa pelo WhatsApp. Criado/dedup por CPF dentro da integração. */
export interface Contact {
  id: string;
  integrationId: string; // a qual cliente (consultório) pertence
  whatsappNumber: string; // E.164
  fullName: string | null;
  cpf: string | null; // 11 dígitos, dígito verificador OK
  cpfNameVerified: boolean; // bateu CPF↔nome via ICpfProvider
  createdAt: Date;
  updatedAt: Date;
}
