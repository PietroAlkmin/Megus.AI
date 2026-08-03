/**
 * Telefone brasileiro para WhatsApp — normalizar, VALIDAR e casar variantes.
 *
 * Existe porque o número é o único elo entre a cobrança e o paciente: a Charge
 * não guarda telefone, ela aponta para um Contact, e o Contact é achado por
 * comparação EXATA do número. Duas consequências que já mordeu ou morde:
 *
 *  1. Número torto entra no banco e a cobrança nasce MORTA — não dá para
 *     enviar (o provedor recusa) e nunca será quitada, porque mensagem nenhuma
 *     vai bater com ele. Daí `ehValido`, usado para reprovar o evento na prévia
 *     em vez de criar a cobrança zumbi.
 *
 *  2. O mesmo celular escrito nos dois formatos ("11 4284-2271" antigo e
 *     "11 94284-2271" atual) vira DOIS cadastros: a cobrança fica num e a
 *     conversa no outro. Daí `variantes`, para a busca aceitar as duas formas.
 */

/** Formato E.164 sem "+": 55 + DDD(2) + local(8 ou 9). */
const DDD_MIN = 11;
const DDD_MAX = 99;

/** Só dígitos, com DDI 55 acrescentado quando o número veio "como se fala". */
export function normalizar(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  // 10 (fixo com DDD) ou 11 (celular com DDD) = número nacional sem DDI.
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

/**
 * O número tem cara de telefone brasileiro discável?
 *
 * Conferência de FORMA, não de existência (não há como saber se a linha existe
 * sem tentar entregar). Pega o erro real: dígito a mais, a menos ou DDD
 * impossível — que é como um typo na agenda chega aqui.
 *
 * Fixo de 8 dígitos NÃO é reprovado: WhatsApp Business em linha fixa existe.
 */
export function ehValido(numero: string | null | undefined): boolean {
  const d = (numero ?? "").replace(/\D/g, "");
  if (d.length !== 12 && d.length !== 13) return false;
  if (!d.startsWith("55")) return false;
  const ddd = Number(d.slice(2, 4));
  if (!Number.isFinite(ddd) || ddd < DDD_MIN || ddd > DDD_MAX) return false;
  const local = d.slice(4);
  // 9 dígitos = celular: sempre começa com 9. 8 dígitos = fixo ou celular no
  // formato antigo — aceita (é `variantes` que reconcilia com a forma nova).
  if (local.length === 9 && !local.startsWith("9")) return false;
  return true;
}

/**
 * Para LER na tela: "(12) 99652-6854".
 *
 * O painel cai no telefone quando o paciente não tem nome cadastrado. Um bloco
 * de 13 dígitos colado (`5512996526854`) não é reconhecível nem pesquisável por
 * quem atende — formatado, pelo menos identifica a pessoa. Número que não é
 * brasileiro sai como está: melhor cru do que fatiado errado.
 */
export function formatar(numero: string | null | undefined): string {
  const d = (numero ?? "").replace(/\D/g, "");
  if (!ehValido(d)) return numero ?? "";
  const ddd = d.slice(2, 4);
  const local = d.slice(4);
  const corte = local.length - 4;
  return `(${ddd}) ${local.slice(0, corte)}-${local.slice(corte)}`;
}

/**
 * As formas equivalentes do MESMO celular, para busca tolerante.
 *
 * Devolve o número como veio primeiro (a forma gravada vence em empate) e,
 * quando for celular, a variante com/sem o nono dígito. Fixo (local de 8
 * dígitos começando em 2-5) não ganha variante: acrescentar o 9 ali inventaria
 * um celular que não existe.
 */
export function variantes(numero: string | null | undefined): string[] {
  const d = (numero ?? "").replace(/\D/g, "");
  if (!d.startsWith("55") || (d.length !== 12 && d.length !== 13)) return d ? [d] : [];

  const ddd = d.slice(2, 4);
  const local = d.slice(4);

  // Só existe forma antiga para a linha que EXISTIA antes do nono dígito: o 9 foi
  // prefixado a celulares cujo número já começava com 6-9. Um celular novo como
  // 94284-2271 tem "4284-2271" embaixo do 9 — que é cara de FIXO, número que
  // nunca foi o celular dele. Gerar essa variante procuraria um cadastro que não
  // pode existir e, pior, poderia casar com o fixo real da clínica.
  if (local.length === 9 && local.startsWith("9")) {
    const antigo = local.slice(1);
    return /^[6-9]/.test(antigo) ? [d, `55${ddd}${antigo}`] : [d];
  }
  if (local.length === 8 && /^[6-9]/.test(local)) {
    return [d, `55${ddd}9${local}`]; // põe o 9 → forma atual
  }
  return [d]; // fixo, ou forma que não reconhecemos: não inventa variante
}
