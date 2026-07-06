import EmpresaForm from "@/components/empresa/EmpresaForm";

export default function Empresa() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6">
        <h1 className="font-brand text-2xl font-extrabold tracking-tight text-foreground">Empresa</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Dados da empresa, formas de cobrança e serviços usados nas notas.</p>
      </header>
      <EmpresaForm />
    </div>
  );
}
