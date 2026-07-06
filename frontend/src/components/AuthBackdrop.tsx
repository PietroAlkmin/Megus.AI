/**
 * Formas decorativas da marca no fundo das telas de auth (Login/Cadastro).
 * Mesmo papel do `AuthBackdrop.jsx` do wireframe: fica atrás do conteúdo, não
 * captura clique, escondido abaixo de `lg` (no mobile o fundo fica limpo).
 */
export default function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden lg:block">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 620px at 16% 108%, hsl(var(--primary-light) / 0.08), transparent 60%), " +
            "radial-gradient(880px 520px at 92% -8%, hsl(var(--accent) / 0.07), transparent 58%)",
        }}
      />
      <svg
        className="absolute -left-[110px] top-[40%] h-[500px] w-[420px]"
        viewBox="0 0 420 500"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M300 96L-60 0L96 220L150 500L300 96Z" fill="hsl(var(--primary-darker))" opacity="0.9" />
      </svg>
      <svg
        className="absolute -right-[30px] top-[12%] h-[500px] w-[320px]"
        viewBox="0 0 320 500"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M320 500L86 300L0 0L234 200L320 500Z" fill="hsl(var(--primary-light))" opacity="0.85" />
      </svg>
    </div>
  );
}
