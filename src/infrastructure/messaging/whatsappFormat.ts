/**
 * Formatação de saída pro WhatsApp. O modelo escreve Markdown por hábito
 * (**negrito**, __itálico__), mas o WhatsApp usa UM marcador (*negrito*,
 * _itálico_) — o par extra aparece literal na conversa (visto em prod 11/07:
 * "**16:54**" → "*16:54*" na tela). O prompt orienta; ESTA função garante no
 * fio, independente do modelo. Só converte pares fechados; asterisco solto
 * (matemática, "4*5") fica intocado.
 */
export function toWhatsAppFormatting(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "*$1*") // **negrito** MD → *negrito* WA
    .replace(/__([^_]+)__/g, "_$1_"); // __itálico__ MD → _itálico_ WA
}
