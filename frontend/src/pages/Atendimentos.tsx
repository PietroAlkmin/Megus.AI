import AtendimentosView from "@/components/atendimentos/AtendimentosView";

export default function Atendimentos() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6">
        <h1 className="font-brand text-2xl font-extrabold tracking-tight text-foreground">Atendimentos</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Seus agentes por número, com status de operação e alertas que precisam de atenção.
        </p>
      </header>
      <AtendimentosView />
    </div>
  );
}