import type { Integration } from "../../domain/entities/Integration";
import type { IMessagingProvider, InboundMessage } from "../../domain/ports/IMessagingProvider";
import type { IAdminWhatsappAccessRepository } from "../../domain/ports/repositories";
import type { CalendarImportService } from "./CalendarImportService";
import type { AdminChargeService, AdminChargeRow } from "./AdminChargeService";

/**
 * Comandos operacionais não passam pelo LLM: são autenticados pelo número do
 * remetente e têm respostas/ações determinísticas. Novas ações entram aqui.
 */
export class AdminCommandHandler {
  private readonly pending = new Map<string, { integrationId: string; plan: Awaited<ReturnType<CalendarImportService["preview"]>> }>();
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
      const pending = this.pending.get(key);
      if (!pending || pending.integrationId !== integration.id || !this.d.calendar) {
        await this.reply(integration, inbound, "Não há prévia pendente. Use /admin agenda processar DD/MM/AAAA.");
        return true;
      }
      const created = await this.d.calendar.confirm(integration.id, pending.plan);
      this.pending.delete(key);
      await this.reply(integration, inbound, `✅ Processamento confirmado: ${created} cobrança(s) criada(s).`);
      return true;
    }
    const match = /^\/admin agenda processar\s+(\d{2}\/\d{2}\/\d{4})$/u.exec(text);
    if (match && this.d.calendar) {
      const [day, month, year] = match[1]!.split("/");
      const plan = await this.d.calendar.preview(integration.companyId, integration.id, `${year}-${month}-${day}T00:00:00-03:00`);
      this.pending.set(key, { integrationId: integration.id, plan });
      const ready = plan.filter((x) => x.kind === "ready").length;
      const invalid = plan.filter((x) => x.kind === "invalid").length;
      const duplicate = plan.filter((x) => x.kind === "duplicate").length;
      await this.reply(integration, inbound, `Prévia: ${ready} para criar, ${duplicate} duplicado(s), ${invalid} inválido(s). Responda /admin agenda confirmar para aplicar.`);
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
