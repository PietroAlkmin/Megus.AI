import AgenteForm from "@/components/agente/AgenteForm";

export default function Agente() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6">
        <h1 className="font-brand text-2xl font-extrabold tracking-tight text-foreground">Agente</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Identidade, personalidade e exemplos de conversa do atendente virtual.
        </p>
      </header>
      <AgenteForm />
    </div>
  );
}
