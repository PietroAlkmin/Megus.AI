import type { IChargeRepository } from "../../domain/ports/repositories";
import { CobrancaDesligadaError, type ChargeSender } from "./ChargeSender";

/** De quanto em quanto tempo o laço procura cobrança vencida. */
const INTERVALO_PADRAO_MS = 60_000;

/**
 * Quanto adiar quando o envio falha. O motivo mais provável é o WhatsApp da
 * clínica fora do ar (aconteceu: 3 dias desconectado) — sem adiar, a mesma
 * cobrança seria tentada a cada minuto, enchendo o log e escondendo o resto.
 * Com o adiamento ela continua tentando até o número voltar, mas de hora em
 * hora ao invés de 60 vezes.
 */
const ADIAMENTO_NA_FALHA_MS = 15 * 60_000;

export interface ChargeSchedulerDeps {
  charges: IChargeRepository;
  sender: ChargeSender;
  /** Intervalo entre varreduras. Nos testes vem curto. */
  intervalMs?: number;
}

/**
 * Dispara as cobranças que a clínica agendou para uma data/hora.
 *
 * Laço simples no próprio processo: um `setInterval` que pergunta ao banco o
 * que já venceu. Não há fila nem cron externo porque não há um segundo
 * processo — se um dia a API rodar em mais de um container, DUAS varreduras
 * pegariam a mesma cobrança e o paciente receberia a mensagem repetida; aí a
 * marcação de "cobrada" precisa virar UPDATE condicional (claim), como já é
 * feito na idempotência do webhook.
 *
 * Atraso é aceitável (até um minuto), envio duplicado não: por isso o filtro é
 * `status = "pendente"` — cobrança já disparada na mão não sai de novo.
 */
export function startChargeScheduler(deps: ChargeSchedulerDeps): { stop: () => void } {
  const intervalMs = deps.intervalMs ?? INTERVALO_PADRAO_MS;

  const tick = async () => {
    let vencidas;
    try {
      vencidas = await deps.charges.listDueScheduled(new Date());
    } catch (err) {
      // Banco fora do ar (Azure despausando) não pode derrubar o laço: a
      // próxima volta tenta de novo.
      console.warn("[cobranca-agendada] falha ao buscar vencidas:", err instanceof Error ? err.message : err);
      return;
    }

    for (const charge of vencidas) {
      try {
        await deps.sender.send(charge);
        console.log(`[cobranca-agendada] enviada ${charge.id} (agendada para ${charge.scheduledFor?.toISOString()})`);
      } catch (err) {
        // Permissão desligada não é falha transitória: adiar seria tentar de
        // novo para sempre. O agendamento é DESFEITO e a cobrança volta a ser
        // trabalho da clínica (segue "pendente", visível no painel).
        if (err instanceof CobrancaDesligadaError) {
          console.warn(`[cobranca-agendada] ${charge.id} desmarcada: cobrança desligada na configuração`);
          await deps.charges.save({ ...charge, scheduledFor: null, updatedAt: new Date() }).catch(() => undefined);
          continue;
        }
        console.warn(`[cobranca-agendada] falha ao enviar ${charge.id}, adiando:`, err instanceof Error ? err.message : err);
        const proxima = new Date(Date.now() + ADIAMENTO_NA_FALHA_MS);
        await deps.charges
          .save({ ...charge, scheduledFor: proxima, updatedAt: new Date() })
          .catch(() => undefined);
      }
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  // Não segura o processo vivo por causa do laço (encerramento limpo em teste/CI).
  if (typeof timer.unref === "function") timer.unref();
  return { stop: () => clearInterval(timer) };
}
