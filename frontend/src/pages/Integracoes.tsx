import WhatsAppConnectPanel from "@/components/whatsapp/WhatsAppConnectPanel";
import AgendaConnectCard from "@/components/integracoes/AgendaConnectCard";

/**
 * Integrações da empresa logada: o canal de atendimento (WhatsApp) e as
 * ferramentas que o agente pode usar na conversa (hoje: agenda/Google Calendar).
 * Cada card cuida do próprio estado — esta página só organiza a seção.
 */
export default function Integracoes() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6">
        <h1 className="font-brand text-2xl font-extrabold tracking-tight text-foreground">Integrações</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Conecte o canal de atendimento e as ferramentas que o agente usa durante a conversa.
        </p>
      </header>
      <div className="flex flex-col gap-6">
        <WhatsAppConnectPanel />
        <AgendaConnectCard />
      </div>
    </div>
  );
}
