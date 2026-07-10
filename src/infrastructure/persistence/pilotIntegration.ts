/**
 * Patch de UPDATE da integração do piloto (`int-piloto`) no seed de boot.
 *
 * REGRA (bug jul/2026): SEM número fake. Se `whatsappNumber` não veio — env
 * `PILOT_WHATSAPP_NUMBER` ausente/vazia naquele boot — NÃO incluímos o campo no
 * update, preservando o que já está no banco. O antigo `?? "5511999999999"`
 * gravava um número inventado por cima do número real do chip e derrubava o
 * atendimento em silêncio (inbound não batia com nenhuma integração ativa).
 * Com número → aponta o piloto pro chip. Função PURA (sem I/O) → testável.
 */
export function pilotIntegrationUpdate(
  whatsappNumber: string | undefined,
  now: Date,
): Record<string, unknown> {
  const update: Record<string, unknown> = { evolutionInstance: "Megus", updatedAt: now };
  if (whatsappNumber) update.whatsappNumber = whatsappNumber;
  return update;
}
