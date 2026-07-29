import type { Integration } from "../../domain/entities/Integration";
import type { IMessagingProvider, InboundMessage } from "../../domain/ports/IMessagingProvider";
import type { IAdminWhatsappAccessRepository } from "../../domain/ports/repositories";
import type { CalendarImportService } from "./CalendarImportService";
import type { AdminChargeService, AdminChargeRow } from "./AdminChargeService";

/** Início do dia corrente em -03:00 — fallback do `confirmar` sem data guardada. */
function hojeTimeMin(): string {
  const agora = new Date(Date.now() - 3 * 3600 * 1000); // desloca pro fuso de SP
  return `${agora.toISOString().slice(0, 10)}T00:00:00-03:00`;
}

/**
 * Comandos operacionais não passam pelo LLM: são autenticados pelo número do
 * remetente e têm respostas/ações determinísticas. Novas ações entram aqui.
 */
export class AdminCommandHandler {
  /**
   * Data do último `processar` por (integração, admin). Guardamos só a DATA, não
   * o plano: o `confirmar` REPLANEJA na hora. Um deploy/restart no meio do fluxo
   * apagava o plano em memória e o `confirmar` respondia "não há prévia pendente"
   * (aconteceu ao vivo no 1º dia da cliente). Replanejar é seguro — o executor já
   * é idempotente (não recria cobrança de evento já importado) e só aplica itens
   * `ready`; e ainda pega correção feita na agenda entre a prévia e a confirmação.
   */
  private readonly ultimaData = new Map<string, { integrationId: string; timeMin: string }>();
  private readonly chargeLists = new Map<string, AdminChargeRow[]>();
  constructor(private readonly d: { access: IAdminWhatsappAccessRepository; messaging: IMessagingProvider; calendar?: CalendarImportService; charges?: AdminChargeService }) {}

  async tryHandle(integration: Integration, inbound: InboundMessage): Promise<boolean> {
    if (inbound.kind !== "text" || !inbound.text?.trim().toLowerCase().startsWith("/admin")) return false;
    if (!integration.companyId || !(await this.d.access.isAdmin(integration.companyId, inbound.from))) return false;
    const text = inbound.text.trim().toLowerCase();
    const key = `${integration.id}:${inbound.from}`;
    if (text === "/admin cobranças" || text === "/admin cobrancas") {
      if (!this.d.charges) { await this.reply(integration, inbound, "Cobranças indisponíveis."); return true; }
      const rows = await this.d.charges.list(integration.companyId);
      this.chargeLists.set(key, rows);
      const body = rows.length === 0 ? "Nenhuma cobrança em aberto." : rows.slice(0, 10).map((c, i) => `${i + 1}. ${c.name} — R$ ${c.amount.toFixed(2).replace(".", ",")} — ${c.status}`).join("\n");
      await this.reply(integration, inbound, `💳 Cobranças\n${body}\n\nPara cobrar: /admin cobrar N`);
      return true;
    }
    const chargeMatch = /^\/admin cobrar\s+(\d+)$/u.exec(text);
    if (chargeMatch) {
      const selected = this.chargeLists.get(key)?.[Number(chargeMatch[1]) - 1];
      if (!selected || !this.d.charges) { await this.reply(integration, inbound, "Lista expirada. Use /admin cobranças."); return true; }
      const sent = await this.d.charges.send(integration.companyId, selected.id);
      await this.reply(integration, inbound, sent ? `✅ Cobrança enviada para ${selected.name}.` : "Não foi possível enviar essa cobrança.");
      return true;
    }
    if (text === "/admin agenda confirmar") {
      const ultima = this.ultimaData.get(key);
      if (!this.d.calendar) {
        await this.reply(integration, inbound, "Agenda indisponível.");
        return true;
      }
      // Sem data guardada (restart entre os dois comandos): assume HOJE, que é o
      // uso real — melhor concluir do que obrigar a repetir tudo.
      const timeMin = ultima?.integrationId === integration.id ? ultima.timeMin : hojeTimeMin();
      const plan = await this.d.calendar.preview(integration.companyId, integration.id, timeMin);
      const created = await this.d.calendar.confirm(integration.id, plan);
      this.ultimaData.delete(key);
      const nada = created === 0 ? " Nada novo para criar (já importadas ou inválidas — rode /admin agenda processar para ver)." : "";
      await this.reply(integration, inbound, `✅ Processamento confirmado: ${created} cobrança(s) criada(s).${nada}`);
      return true;
    }
    const match = /^\/admin agenda processar\s+(\d{2}\/\d{2}\/\d{4})$/u.exec(text);
    if (match && this.d.calendar) {
      const [day, month, year] = match[1]!.split("/");
      const timeMin = `${year}-${month}-${day}T00:00:00-03:00`;
      const plan = await this.d.calendar.preview(integration.companyId, integration.id, timeMin);
      this.ultimaData.set(key, { integrationId: integration.id, timeMin });
      const ready = plan.filter((x) => x.kind === "ready").length;
      const invalid = plan.filter((x) => x.kind === "invalid").length;
      const duplicate = plan.filter((x) => x.kind === "duplicate").length;
      // Ressalvas (ex.: CPF com dígito inválido) não bloqueiam, mas a clínica
      // precisa VER — senão o dado sai silenciosamente diferente do que ela digitou.
      const avisos = plan.flatMap((x) => (x.kind === "ready" ? x.warnings : []));
      const bloco = avisos.length ? `\n⚠️ ${avisos.join("\n⚠️ ")}` : "";
      await this.reply(integration, inbound, `Prévia: ${ready} para criar, ${duplicate} duplicado(s), ${invalid} inválido(s).${bloco}\n\nResponda /admin agenda confirmar para aplicar.`);
      return true;
    }
    if (text.startsWith("/admin agenda processar")) {
      await this.reply(integration, inbound, "Informe a data inicial: /admin agenda processar DD/MM/AAAA");
      return true;
    }

    await this.reply(integration, inbound, "🔐 Admin\n💳 /admin cobranças\n📅 /admin agenda processar DD/MM/AAAA");
    return true;
  }

  private async reply(integration: Integration, inbound: InboundMessage, text: string): Promise<void> {
    await this.d.messaging.sendText({ to: inbound.from, instance: integration.evolutionInstance || undefined, text });
  }
}
