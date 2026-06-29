/* global React */
// Primitivos compartilhados do wireframe Megus — mesma filosofia do Kapty:
// pequenos, presentacionais, prontos para virar componentes shadcn na produção.
//   window.IC.<nome>   → ícones (SVG via dangerouslySetInnerHTML)
//   window.AuthField   → label + input padrão das telas de auth
//   window.InlineError → alerta de erro amigável (espelha InlineErrorAlert.tsx)
//   window.MegusBrand  → marca (mark + wordmark)

const T = window.MegusTokens;
const { useState } = React;

// ── Ícones ────────────────────────────────────────────────
const ICON_SVG = {
  mail:    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  lock:    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye:     '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:  '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>',
  key:     '<circle cx="7.5" cy="15.5" r="3.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  wallet:  '<path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/><path d="M16 14h6v-4h-6a2 2 0 0 0 0 4z"/>',
  phone:   '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  check:   '<path d="M20 6 9 17l-5-5"/>',
  x:       '<path d="M18 6 6 18M6 6l12 12"/>',
  alert:   '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  arrow:   '<path d="M5 12h14M12 5l7 7-7 7"/>',
  robot:   '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M12 9V5M12 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><circle cx="9" cy="14" r="1.1"/><circle cx="15" cy="14" r="1.1"/><path d="M2 13v3M22 13v3"/>',
  info:    '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  chevronR:'<path d="m9 6 6 6-6 6"/>',
  bell:    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>',
  calendar:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  zap:     '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  edit:    '<path d="M11 4H4v16h16v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  trash:   '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  clock:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 4v4h-4M21 12a9 9 0 0 1-15 6.7L3 16M3 20v-4h4"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M20 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM4 15a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2z"/><path d="M20 17v1a3 3 0 0 1-3 3h-3"/>',
  megaphone:'<path d="m3 11 16-6v14L3 13v-2z"/><path d="M11.6 17.5a3 3 0 0 1-5.5-.5"/><path d="M19 9a3 3 0 0 1 0 6"/>',
  chat:    '<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"/>',
  smile:   '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
  ai:      '<path d="M12 3v18"/><path d="M5.5 7.5a6.5 6.5 0 0 1 13 0c0 4.5-6.5 4.5-6.5 9"/><circle cx="12" cy="20" r="1.5"/>',
  search:  '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  upload:  '<path d="M12 16V4M6 9l6-6 6 6"/><path d="M5 21h14"/>',
  fileText:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>',
  layout:  '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  building:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M10 21v-3.5h4V21"/>',
  pix:     '<path d="M12 2.5 21.5 12 12 21.5 2.5 12 12 2.5z"/><path d="M7.5 12 12 7.5l4.5 4.5L12 16.5 7.5 12z"/>',
  users:   '<circle cx="9" cy="9" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="8" r="2.5"/><path d="M14 14.2a4.5 4.5 0 0 1 7 3.8"/>',
  doc:     '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M12 9V5M12 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><circle cx="9" cy="14" r="1.1"/><circle cx="15" cy="14" r="1.1"/><path d="M2 13v3M22 13v3"/>',
  google:  '', // tratado à parte (multicolor) no botão
};

function makeIcon(name) {
  return function IconCmp({ size = 16, stroke = 'currentColor', sw = 1.75, style }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke}
        strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
        style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
        dangerouslySetInnerHTML={{ __html: ICON_SVG[name] || '' }} />
    );
  };
}
window.IC = Object.fromEntries(Object.keys(ICON_SVG).map((k) => [k, makeIcon(k)]));

// ── Marca Megus ───────────────────────────────────────────
function MegusBrand({ size = 'md', centered }) {
  const mark = size === 'lg' ? 40 : 32;
  const word = size === 'lg' ? 22 : 17;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, justifyContent: centered ? 'center' : 'flex-start' }}>
      <span style={{
        width: mark, height: mark, borderRadius: 10, flexShrink: 0,
        background: `linear-gradient(150deg, ${T.brand.primaryLight}, ${T.brand.primaryDarker})`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(27,35,48,.22)',
      }}>
        <window.IC.robot size={mark * 0.56} stroke="#fff" sw={1.9} />
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, fontFamily: T.font.brand }}>
        <span style={{ fontSize: word, fontWeight: 800, color: T.text.primary, letterSpacing: '-0.02em' }}>Megus</span>
        <span style={{ fontSize: word, fontWeight: 800, color: T.brand.accent, letterSpacing: '-0.02em' }}>AI</span>
      </span>
    </div>
  );
}
window.MegusBrand = MegusBrand;

// ── Campo de formulário (label + input com ícone à esquerda) ──
// Espelha o par <Label/> + <Input/> do shadcn. `right` permite injetar um
// botão (ex.: mostrar/ocultar senha).
function AuthField({ id, label, type = 'text', value, onChange, placeholder, icon, right, autoComplete, inputMode, required }) {
  const [focus, setFocus] = useState(false);
  return (
    <label htmlFor={id} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: T.text.secondary }}>{label}</span>
      <span style={{
        position: 'relative', display: 'flex', alignItems: 'center',
        height: 50, borderRadius: T.radius.md, background: '#fff',
        border: `1px solid ${focus ? T.brand.accent : T.surface.border}`,
        boxShadow: focus ? T.shadow.ring : 'none', transition: 'border-color .15s, box-shadow .15s',
      }}>
        {icon && <span style={{ position: 'absolute', left: 14, color: focus ? T.brand.accent : T.text.subtle }}>{icon}</span>}
        <input
          id={id} type={type} value={value} onChange={onChange} placeholder={placeholder}
          autoComplete={autoComplete} inputMode={inputMode} required={required}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{
            flex: 1, height: '100%', border: 'none', outline: 'none', background: 'transparent',
            padding: icon ? '0 14px 0 42px' : '0 14px', fontSize: 14.5, color: T.text.primary,
            fontFamily: T.font.sans, borderRadius: T.radius.md,
            paddingRight: right ? 44 : undefined,
          }}
        />
        {right && <span style={{ position: 'absolute', right: 6 }}>{right}</span>}
      </span>
    </label>
  );
}
window.AuthField = AuthField;

// ── Alerta de erro inline (espelha InlineErrorAlert.tsx) ──
function InlineError({ error }) {
  if (!error) return null;
  return (
    <div style={{
      display: 'flex', gap: 9, alignItems: 'flex-start',
      borderRadius: T.radius.sm, padding: '10px 12px', fontSize: 13,
      color: T.status.danger, background: T.status.dangerBg, border: `1px solid ${T.status.dangerBorder}`,
    }}>
      <window.IC.alert size={15} stroke={T.status.danger} style={{ marginTop: 1 }} />
      <div>
        <div>{error.message}</div>
        {error.correlationId && (
          <div style={{ marginTop: 3, fontSize: 11, color: T.text.muted, fontFamily: T.font.mono }}>Código: {error.correlationId}</div>
        )}
      </div>
    </div>
  );
}
window.InlineError = InlineError;

// ── Sucesso inline ────────────────────────────────────────
function InlineSuccess({ message }) {
  if (!message) return null;
  return (
    <div style={{
      borderRadius: T.radius.sm, padding: '10px 12px', fontSize: 13,
      color: T.status.success, background: T.status.successBg, border: `1px solid ${T.status.success}33`,
    }}>{message}</div>
  );
}
window.InlineSuccess = InlineSuccess;
