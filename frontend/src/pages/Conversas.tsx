import ConversasView from "@/components/conversas/ConversasView";

export default function Conversas() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6">
        <h1 className="font-brand text-2xl font-extrabold tracking-tight text-foreground">Conversas</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Acompanhe as conversas do agente com os pacientes e assuma quando precisar.
        </p>
      </header>
      <ConversasView />
    </div>
  );
}