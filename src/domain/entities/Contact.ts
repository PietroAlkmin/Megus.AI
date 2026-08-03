/**
 * Ficha do paciente — o que a clínica RECADASTRA no sistema dela (Amplimed, no
 * caso da clínica no ar).
 *
 * O Megus não é prontuário: a clínica digita o paciente novo no sistema dela. As
 * instruções do agente já pedem esses dados no primeiro contato, mas eles
 * morriam no histórico da conversa — ela relia mensagem por mensagem.
 *
 * Campo AUSENTE ≠ campo vazio: ausente quer dizer "o agente não perguntou/o
 * paciente não respondeu", e é essa diferença que a tela precisa mostrar. Por
 * isso tudo é opcional e nada nasce com string vazia.
 */
export interface FichaPaciente {
  nascimento?: string; // ISO YYYY-MM-DD (a tela formata)
  sexo?: string;
  email?: string;
  cep?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  convenio?: string;
}

/** Contato = paciente/lead que conversa pelo WhatsApp. Criado/dedup por CPF dentro da integração. */
export interface Contact {
  id: string;
  integrationId: string; // a qual cliente (consultório) pertence
  whatsappNumber: string; // E.164
  fullName: string | null;
  cpf: string | null; // 11 dígitos, dígito verificador OK
  cpfNameVerified: boolean; // bateu CPF↔nome via ICpfProvider
  /** O que o agente coletou além de nome/CPF. `{}` = nada coletado ainda. */
  ficha: FichaPaciente;
  createdAt: Date;
  updatedAt: Date;
}
