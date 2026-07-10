/**
 * Início do dia corrente em America/Sao_Paulo, expresso em UTC.
 * O Brasil não tem horário de verão desde 2019 → offset fixo -03:00.
 * Usado pelas métricas "hoje" do painel (notas/mensagens do dia).
 */
export function startOfTodaySaoPaulo(now: Date = new Date()): Date {
  const sp = new Date(now.getTime() - 3 * 3600_000); // relógio de SP
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3, 0, 0));
}
