import { apiFetch } from "@/lib/api";

/**
 * Ficha do paciente — os dados que a clínica recadastra no sistema dela.
 *
 * Existe porque o Megus não substitui o prontuário: a clínica usa Amplimed (ou
 * similar) e precisa digitar o paciente novo lá. O agente já coletou esses dados
 * na conversa — retê-los aqui obrigaria a reler o histórico à mão.
 *
 * ⚠️ **Endpoint A IMPLEMENTAR** — `GET /api/conversas/:id/ficha`. Deve devolver o
 * que o agente extraiu da conversa, com os campos que ele NÃO perguntou ausentes
 * (não em branco): a distinção é a informação principal da tela, porque campo
 * vazio significa "o agente não pergunta isso" e é o que leva a clínica a ligar a
 * pergunta em Agentes → Cadastro na primeira conversa.
 *
 * Enquanto não existe, `getFicha` devolve `null` e o bloco mostra tudo como não
 * perguntado — honesto, e não quebra a tela.
 */
export interface FichaPaciente {
  nome?: string;
  sobrenome?: string;
  cpf?: string;
  /** ISO `YYYY-MM-DD` — a UI formata para `DD/MM/AAAA`. */
  nascimento?: string;
  sexo?: "F" | "M" | string;
  email?: string;
  cep?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  convenio?: string;
  /** Primeira conversa deste número com a clínica — muda o rótulo do bloco. */
  novo?: boolean;
}

/** GET /api/conversas/:convId/ficha — dados extraídos pelo agente. */
export async function getFicha(convId: string): Promise<FichaPaciente | null> {
  try {
    return await apiFetch<FichaPaciente>("GET", `/api/conversas/${encodeURIComponent(convId)}/ficha`);
  } catch {
    // Rota ainda não existe: a ficha aparece vazia em vez de derrubar a tela.
    return null;
  }
}
