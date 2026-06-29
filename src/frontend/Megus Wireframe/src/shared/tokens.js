// Megus AI — brand tokens (fonte única de verdade).
// Espelha o que vira `src/index.css` (CSS vars HSL) + `tailwind.config.ts` na
// produção. Mantém o wireframe portável: estes valores mapeiam 1:1 para os
// tokens do codebase shadcn quando a tela for promovida.
//
// Convenção idêntica à do Kapty (window.KaptyTokens): primitivos e telas leem
// daqui via `const T = window.MegusTokens`.

window.MegusTokens = {
  // ── Marca ──────────────────────────────────────────────
  brand: {
    primary:      '#2B3A4F', // ink ardósia — título, CTA, logo  (≈ hsl(214 30% 24%))
    primaryDark:  '#1B2736', // fim do gradiente do CTA
    primaryDarker:'#101A26', // início do gradiente / backdrop
    primaryLight: '#3B4A5E', // estado hover/realce (herda o tom que o sócio já usava)
    accent:       '#3E6CA8', // foco/links — azul ardósia mais claro
  },
  // ── Superfícies ────────────────────────────────────────
  surface: {
    page:        '#F4F6F8',
    card:        '#FFFFFF',
    cardMuted:   '#FBFCFD',
    border:      '#E1E6ED',
    borderStrong:'#CBD3DD',
    divider:     '#EEF1F5',
  },
  // ── Texto ──────────────────────────────────────────────
  text: {
    primary:   '#1B2330',
    secondary: '#3A4453',
    muted:     '#6B7686',
    subtle:    '#9AA3B0',
    inverse:   '#FFFFFF',
  },
  // ── Status ─────────────────────────────────────────────
  status: {
    success:   '#0F6E56', successBg: '#E1F5EE',
    warning:   '#92400E', warningBg: '#FEF6E7',
    danger:    '#B42318', dangerBg:  '#FEF3F2', dangerBorder: '#FECDC9',
    info:      '#2563EB', infoBg:    '#EFF6FF',
    whatsapp:  '#1FA855',
  },
  // ── Tipografia ─────────────────────────────────────────
  font: {
    sans:  '"Inter", system-ui, -apple-system, sans-serif',
    brand: '"Sora", "Inter", system-ui, sans-serif',
    mono:  '"JetBrains Mono", ui-monospace, monospace',
  },
  // ── Escalas ────────────────────────────────────────────
  radius: { sm: 8, md: 10, lg: 14, xl: 18, full: 999 },
  shadow: {
    sm:  '0 1px 2px rgba(27,35,48,.06)',
    md:  '0 4px 14px rgba(27,35,48,.07), 0 1px 2px rgba(27,35,48,.04)',
    lg:  '0 18px 48px rgba(27,35,48,.14), 0 2px 8px rgba(27,35,48,.06)',
    ring:'0 0 0 3px rgba(62,108,168,.22)',
  },
};
