/* global React */
// AuthBackdrop · formas decorativas da marca no FUNDO das telas de auth.
// Mesmo papel de um AuthBackdrop.tsx de referência interna: fica atrás do conteúdo, não captura
// clique, o container recorta o que sangra. Escondido abaixo de lg (1024px) —
// no mobile o fundo fica branco limpo. Tons da marca Megus (ardósia).

const AB_T = window.MegusTokens;

function AuthBackdrop() {
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0,
    }} className="megus-backdrop">
      {/* glow suave de base */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(1100px 620px at 16% 108%, ${AB_T.brand.primaryLight}14, transparent 60%), radial-gradient(880px 520px at 92% -8%, ${AB_T.brand.accent}12, transparent 58%)`,
      }} />
      {/* Shard inferior-esquerdo (ink escuro), sangrando para fora */}
      <svg style={{ position: 'absolute', left: -110, top: '40%', width: 420, height: 500 }}
        viewBox="0 0 420 500" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M300 96L-60 0L96 220L150 500L300 96Z" fill={AB_T.brand.primaryDarker} opacity="0.9" />
      </svg>
      {/* Shard superior-direito (ardósia claro) */}
      <svg style={{ position: 'absolute', right: -30, top: '12%', width: 320, height: 500 }}
        viewBox="0 0 320 500" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M320 500L86 300L0 0L234 200L320 500Z" fill={AB_T.brand.primaryLight} opacity="0.85" />
      </svg>
    </div>
  );
}
window.AuthBackdrop = AuthBackdrop;

// Esconde o backdrop abaixo de lg (mesmo padrão de referência interna) — injeta a media query uma vez.
if (typeof document !== 'undefined' && !document.getElementById('megus-backdrop-css')) {
  const s = document.createElement('style');
  s.id = 'megus-backdrop-css';
  s.textContent = '@media (max-width:1023px){.megus-backdrop{display:none}}';
  document.head.appendChild(s);
}
