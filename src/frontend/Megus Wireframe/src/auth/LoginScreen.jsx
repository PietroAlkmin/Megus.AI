/* global React */
// MegusLogin · tela de login full-screen (card centralizado sobre backdrop da
// marca). Mesma estrutura das telas de auth do Kapty (Login.tsx): logo no topo,
// card translúcido, social (desabilitado), divisor "OU", e-mail + senha, CTA,
// link para cadastro, rodapé de termos.
//
// PROD: trocar handleSubmit por `const r = await login({email,password})` do
// AuthContext e navegar com react-router (`navigate(from)`).

const LG_T = window.MegusTokens;
const { useState: useStLogin } = React;

function GoogleG({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

function MegusLogin({ onGoCadastro, onSuccess }) {
  // Wireframe: campos já vêm preenchidos com credenciais de demonstração para
  // navegar o fluxo com um clique. Em produção começam vazios.
  const [email, setEmail] = useStLogin('pietro@clinica.com.br');
  const [senha, setSenha] = useStLogin('megus123');
  const [showPw, setShowPw] = useStLogin(false);
  const [isBusy, setIsBusy] = useStLogin(false);
  const [erro, setErro] = useStLogin(null);
  const [ok, setOk] = useStLogin(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null); setOk(null); setIsBusy(true);
    try {
      const r = await window.MegusAuth.login({ email, password: senha });
      if (!r.success) { setErro(window.getFriendlyError(r, 'Falha ao autenticar.')); return; }
      setOk('Login efetuado! Redirecionando para o painel…'); // PROD: navigate(from)
      if (onSuccess) setTimeout(onSuccess, 600);
    } catch (err) {
      setErro({ message: err instanceof Error ? err.message : 'Erro inesperado.', correlationId: null });
    } finally { setIsBusy(false); }
  }

  return (
    <div style={lg.page}>
      <window.AuthBackdrop />
      <header style={lg.header}><window.MegusBrand size="md" /></header>

      <main style={lg.main}>
        <form onSubmit={handleSubmit} style={lg.card}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={lg.title}>Bem-vindo de volta</h1>
            <p style={lg.subtitle}>Acesse o painel do seu atendente virtual.</p>
          </div>

          {/* Social (placeholder — habilitar quando o backend suportar OAuth) */}
          <button type="button" disabled title="Em breve" style={lg.social}>
            <GoogleG /> Continuar com o Google
          </button>

          <div style={lg.divider}>
            <span style={lg.line} /><span style={lg.orText}>ou</span><span style={lg.line} />
          </div>

          <window.InlineError error={erro} />
          <window.InlineSuccess message={ok} />

          <window.AuthField id="email" label="E-mail" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="voce@clinica.com.br"
            icon={<window.IC.mail size={17} />} autoComplete="email" required />

          <window.AuthField id="senha" label="Senha" type={showPw ? 'text' : 'password'} value={senha}
            onChange={(e) => setSenha(e.target.value)} placeholder="••••••••"
            icon={<window.IC.lock size={17} />} autoComplete="current-password" required
            right={
              <button type="button" onClick={() => setShowPw((v) => !v)} title={showPw ? 'Ocultar' : 'Mostrar'} style={lg.eyeBtn}>
                {showPw ? <window.IC.eyeOff size={17} stroke={LG_T.text.muted} /> : <window.IC.eye size={17} stroke={LG_T.text.muted} />}
              </button>
            } />

          <div style={lg.row}>
            <label style={lg.check}>
              <input type="checkbox" style={{ width: 15, height: 15, accentColor: LG_T.brand.primary }} />
              Manter conectado
            </label>
            <a href="#" style={lg.link} onClick={(e) => e.preventDefault()}>Esqueci a senha</a>
          </div>

          <button type="submit" disabled={isBusy} style={{ ...lg.cta, opacity: isBusy ? 0.65 : 1 }}>
            {isBusy ? 'Entrando…' : 'Entrar'}
            {!isBusy && <window.IC.arrow size={17} stroke="#fff" />}
          </button>

          <p style={lg.footerLink}>
            Ainda não tem conta?{' '}
            <button type="button" onClick={onGoCadastro} style={lg.linkBtn}>Criar conta</button>
          </p>
        </form>
      </main>

      <footer style={lg.terms}>
        Ao continuar você aceita os <a href="#" style={lg.termsA} onClick={(e) => e.preventDefault()}>Termos de uso</a> e a{' '}
        <a href="#" style={lg.termsA} onClick={(e) => e.preventDefault()}>Política de privacidade</a> da Megus AI.
      </footer>
    </div>
  );
}
window.MegusLogin = MegusLogin;

const lg = {
  page: { position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: LG_T.surface.card, fontFamily: LG_T.font.sans, color: LG_T.text.primary, overflow: 'hidden' },
  header: { position: 'relative', zIndex: 10, padding: '26px 32px' },
  main: { position: 'relative', zIndex: 10, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 20px 24px' },
  card: { width: '100%', maxWidth: 432, display: 'flex', flexDirection: 'column', gap: 18, padding: 36, borderRadius: LG_T.radius.xl, background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(18px)', border: `1px solid ${LG_T.surface.border}`, boxShadow: LG_T.shadow.lg },
  title: { fontFamily: LG_T.font.brand, fontSize: 27, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: LG_T.text.primary },
  subtitle: { fontSize: 14.5, color: LG_T.text.muted, margin: '7px 0 0' },
  social: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 48, borderRadius: LG_T.radius.md, border: `1px solid ${LG_T.surface.border}`, background: '#fff', fontSize: 14, fontWeight: 600, color: LG_T.text.secondary, cursor: 'not-allowed', opacity: 0.7, fontFamily: LG_T.font.sans },
  divider: { display: 'flex', alignItems: 'center', gap: 14 },
  line: { height: 1, flex: 1, background: LG_T.surface.border },
  orText: { fontSize: 12, color: LG_T.text.subtle, textTransform: 'uppercase', letterSpacing: '.08em' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 },
  check: { display: 'inline-flex', alignItems: 'center', gap: 8, color: LG_T.text.muted, fontWeight: 500, cursor: 'pointer' },
  link: { color: LG_T.brand.accent, textDecoration: 'none', fontWeight: 600 },
  eyeBtn: { width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  cta: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 50, marginTop: 2, border: 'none', borderRadius: LG_T.radius.md, background: `linear-gradient(140deg, ${LG_T.brand.primaryLight}, ${LG_T.brand.primaryDark})`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: LG_T.font.sans, boxShadow: '0 8px 20px rgba(27,35,48,.20)' },
  footerLink: { textAlign: 'center', fontSize: 14, color: LG_T.text.muted, margin: '4px 0 0' },
  linkBtn: { background: 'none', border: 'none', padding: 0, color: LG_T.brand.accent, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: LG_T.font.sans },
  terms: { position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 20px 28px', fontSize: 12.5, color: LG_T.text.subtle, lineHeight: 1.6, maxWidth: 460, margin: '0 auto' },
  termsA: { color: LG_T.text.muted, textDecoration: 'underline', textUnderlineOffset: 2 },
};
