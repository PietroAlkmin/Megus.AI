import { describe, expect, it, vi } from "vitest";
import { startChargeScheduler } from "../../src/application/charges/ChargeScheduler";
import type { ChargeSender } from "../../src/application/charges/ChargeSender";
import type { Charge } from "../../src/domain/entities/Charge";
import type { IChargeRepository } from "../../src/domain/ports/repositories";

const AGORA = new Date("2026-08-01T12:00:00.000Z");

function charge(over: Partial<Charge> = {}): Charge {
  return {
    id: "ch1", integrationId: "int1", contactId: "ct1", serviceId: null,
    description: "Consulta", amount: 200, status: "pendente", calendarEventId: null,
    chargedAt: null, paidAt: null, scheduledFor: AGORA, paymentRef: null, paidBy: null, receiptHash: null, notaSolicitada: null, notaEmitidaEm: null,
    createdAt: AGORA, updatedAt: AGORA, ...over,
  };
}

/** Repositório mínimo: só o que o laço usa (buscar vencidas e salvar o adiamento). */
function repoFake(vencidas: Charge[]) {
  const salvos: Charge[] = [];
  const charges = {
    listDueScheduled: vi.fn(async () => vencidas),
    save: vi.fn(async (c: Charge) => { salvos.push(c); }),
  } as unknown as IChargeRepository;
  return { charges, salvos };
}

/** Espera o laço rodar: intervalo curtíssimo + cede a fila de microtasks. */
async function deixaRodar(ms = 12) {
  await new Promise((r) => setTimeout(r, ms));
}

describe("ChargeScheduler — envio agendado da cobrança", () => {
  it("envia as cobranças que já venceram", async () => {
    const vencida = charge();
    const { charges } = repoFake([vencida]);
    const sender = { send: vi.fn(async () => {}) } as unknown as ChargeSender;

    const laco = startChargeScheduler({ charges, sender, intervalMs: 5 });
    await deixaRodar();
    laco.stop();

    expect(sender.send).toHaveBeenCalled();
    const enviada = (sender.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Charge;
    expect(enviada.id).toBe("ch1");
  });

  it("falha no envio ADIA a cobrança em vez de tentar a cada minuto", async () => {
    // Caso real: WhatsApp da clínica desconectado. Sem adiar, a mesma cobrança
    // seria tentada 60x por hora e o log viraria ruído.
    const { charges, salvos } = repoFake([charge()]);
    const sender = { send: vi.fn(async () => { throw new Error("evolution fora do ar"); }) } as unknown as ChargeSender;

    const laco = startChargeScheduler({ charges, sender, intervalMs: 5 });
    await deixaRodar();
    laco.stop();

    const adiada = salvos.at(-1)!;
    expect(adiada.scheduledFor!.getTime()).toBeGreaterThan(Date.now());
    // Continua pendente: cobrança que não chegou não pode sumir da fila da clínica.
    expect(adiada.status).toBe("pendente");
  });

  it("banco fora do ar não derruba o laço — a volta seguinte tenta de novo", async () => {
    const charges = {
      listDueScheduled: vi.fn()
        .mockRejectedValueOnce(new Error("Can't reach database server"))
        .mockResolvedValue([charge()]),
      save: vi.fn(async () => {}),
    } as unknown as IChargeRepository;
    const sender = { send: vi.fn(async () => {}) } as unknown as ChargeSender;

    const laco = startChargeScheduler({ charges, sender, intervalMs: 5 });
    await deixaRodar(30);
    laco.stop();

    expect((charges.listDueScheduled as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
    expect(sender.send).toHaveBeenCalled();
  });

  it("stop() encerra o laço", async () => {
    const { charges } = repoFake([]);
    const sender = { send: vi.fn(async () => {}) } as unknown as ChargeSender;

    const laco = startChargeScheduler({ charges, sender, intervalMs: 5 });
    await deixaRodar();
    laco.stop();
    const depoisDoStop = (charges.listDueScheduled as ReturnType<typeof vi.fn>).mock.calls.length;
    await deixaRodar(20);

    expect((charges.listDueScheduled as ReturnType<typeof vi.fn>).mock.calls.length).toBe(depoisDoStop);
  });
});
