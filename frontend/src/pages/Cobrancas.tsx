import CobrancasView from "@/components/cobrancas/CobrancasView";

export default function Cobrancas() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6">
        <h1 className="font-brand text-2xl font-extrabold tracking-tight text-foreground">Cobranças</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Acompanhe agendamentos, pagamentos, notas emitidas e quem ainda falta cobrar.
        </p>
      </header>
      <CobrancasView />
    </div>
  );
}