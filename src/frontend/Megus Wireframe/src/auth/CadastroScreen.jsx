/* global React */
// MegusCadastro · tela de cadastro full-screen. Mesma moldura do login (backdrop
// + card centralizado). Coleta os dados de conta do produto Megus: e-mail, senha,
// chave Pix de recebimento (tipo + valor) e número do WhatsApp do bot.
//
// PROD: handleSubmit → `await register(payload)` (AuthContext), depois
// navigate('/login') ou direto para o onboarding/conexão do número.

const CD_T = window.MegusTokens;
const { useState: useStCad } = React;

const PIX_TIPOS = [
  { id: 'cpf', label: 'CPF' },
  { id: 'cnpj', label: 'CNPJ' },
  { id: 'telefone', label: 'Telefone' },
  { id: 'email', label: 'E-mail' },
  { id: 'aleatoria', label: 'Aleatória' },
];

const soDigitos = (s) => (s || '').replace(/\D/g, '');

function MegusCadastro({ onGoLogin }) {
  const [form, setForm] = useStCad({ email: '', senha: '', tipoPix: 'cpf', chavePix: '', numeroBot: '' });
  const [showPw, setShowPw] = useStCad(false);
  const [isBusy, setIsBusy] = useStCad(false);
  const [erro, setErro] = useStCad(null);
  const [ok, setOk] = useStCad(null);
  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  function validar() {
    if (!form.email || !form.senha) return 'Preencha e-mail e senha.';
    if (form.senha.length < 6) return 'A senha precisa ter ao menos 6 caracteres.';
    if (!form.chavePix) return 'Informe a chave Pix de recebimento.';
    if (!form.numeroBot) return 'Informe o número do WhatsApp do bot.';
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const msg = validar();
    if (msg) { setErro({ message: msg, correlationId: null }); return; }
    setErro(null); setOk(null); setIsBusy(true);
    try {
      // PROD: normaliza antes de enviar — chave/numero só dígitos quando aplicável.
      const payload = {
        email: form.email, password: form.senha, pixKeyType: form.tipoPix,
        pixKey: form.tipoPix === 'email' ? form.chavePix : soDigitos(form.chavePix),
        botWhatsapp: soDigitos(form.numeroBot),
      };
      const r = await window.MegusAuth.register(payload);
      if (!r.success) { setErro(window.getFriendlyError(r, 'Falha ao criar a conta.')); return; }
      setOk('Conta criada com sucesso! Redirecionando para o login…');
    } catch (err) {
      setErro({ message: err instanceof Error ? err.message : 'Erro inesperado.', correlationId: null });
    } finally { setIsBusy(false); }
  }

  return (
    <div style={cd.page}>
      <window.AuthBackdrop />
      <header style={cd.header}><window.MegusBrand size="md" /></header>

      <main style={cd.main}>
        <form onSubmit={handleSubmit} style={cd.card}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={cd.title}>Criar conta</h1>
            <p style={cd.subtitle}>Configure os dados da sua clínica para começar.</p>
          </div>

          <window.InlineError error={erro} />
          <window.InlineSuccess message={ok} />

          <window.AuthField id="email" label="E-mail" type="email" value={form.email}
            onChange={(e) => set('email', e.target.value)} placeholder="voce@clinica.com.br"
            icon={<window.IC.mail size={17} />} autoComplete="email" required />

          <window.AuthField id="senha" label="Senha" type={showPw ? 'text' : 'password'} value={form.senha}
            onChange={(e) => set('senha', e.target.value)} placeholder="Mínimo 6 caracteres"
            icon={<window.IC.lock size={17} />} autoComplete="new-password" required
            right={
              <button type="button" onClick={() => setShowPw((v) => !v)} title={showPw ? 'Ocultar' : 'Mostrar'} style={cd.eyeBtn}>
                {showPw ? <window.IC.eyeOff size={17} stroke={CD_T.text.muted} /> : <window.IC.eye size={17} stroke={CD_T.text.muted} />}
              </button>
            } />

          {/* Chave Pix — tipo (select) + valor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={cd.label}>Chave Pix (recebimento)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={form.tipoPix} onChange={(e) => set('tipoPix', e.target.value)} style={cd.select}>
                {PIX_TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <span style={cd.pixWrap}>
                <span style={cd.pixIcon}><window.IC.wallet size={17} stroke={CD_T.text.subtle} /></span>
                <input value={form.chavePix} onChange={(e) => set('chavePix', e.target.value)}
                  placeholder="Chave que recebe os pagamentos" style={cd.pixInput} />
              </span>
            </div>
            <span style={cd.hint}>É a chave para onde os pagamentos das consultas serão enviados.</span>
          </div>

          <div>
            <window.AuthField id="numeroBot" label="WhatsApp do bot" type="tel" value={form.numeroBot}
              onChange={(e) => set('numeroBot', e.target.value)} placeholder="+55 11 98123-4477"
              icon={<window.IC.phone size={17} />} inputMode="tel" required />
            <span style={{ ...cd.hint, display: 'block', marginTop: 7 }}>
              Número que o atendente virtual vai usar. Prefira um exclusivo (WhatsApp Business).
            </span>
          </div>

          <button type="submit" disabled={isBusy} style={{ ...cd.cta, opacity: isBusy ? 0.65 : 1 }}>
            {isBusy ? 'Criando conta…' : 'Criar conta'}
            {!isBusy && <window.IC.arrow size={17} stroke="#fff" />}
          </button>

          <p style={cd.footerLink}>
            Já tem conta?{' '}
            <button type="button" onClick={onGoLogin} style={cd.linkBtn}>Entrar</button>
          </p>
        </form>
      </main>

      <footer style={cd.terms}>
        Ao continuar você aceita os <a href="#" style={cd.termsA} onClick={(e) => e.preventDefault()}>Termos de uso</a> e a{' '}
        <a href="#" style={cd.termsA} onClick={(e) => e.preventDefault()}>Política de privacidade</a> da Megus AI.
      </footer>
    </div>
  );
}
window.MegusCadastro = MegusCadastro;

const cd = {
  page: { position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: CD_T.surface.card, fontFamily: CD_T.font.sans, color: CD_T.text.primary, overflow: 'hidden' },
  header: { position: 'relative', zIndex: 10, padding: '26px 32px' },
  main: { position: 'relative', zIndex: 10, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 20px 24px' },
  card: { width: '100%', maxWidth: 452, display: 'flex', flexDirection: 'column', gap: 16, padding: 36, borderRadius: CD_T.radius.xl, background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(18px)', border: `1px solid ${CD_T.surface.border}`, boxShadow: CD_T.shadow.lg },
  title: { fontFamily: CD_T.font.brand, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: CD_T.text.primary },
  subtitle: { fontSize: 14.5, color: CD_T.text.muted, margin: '7px 0 0' },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: CD_T.text.secondary },
  select: { height: 50, padding: '0 10px', fontSize: 14, border: `1px solid ${CD_T.surface.border}`, borderRadius: CD_T.radius.md, background: '#fff', color: CD_T.text.primary, outline: 'none', fontFamily: CD_T.font.sans, cursor: 'pointer', flexShrink: 0 },
  pixWrap: { position: 'relative', display: 'flex', alignItems: 'center', flex: 1, height: 50, borderRadius: CD_T.radius.md, background: '#fff', border: `1px solid ${CD_T.surface.border}` },
  pixIcon: { position: 'absolute', left: 14, display: 'inline-flex' },
  pixInput: { flex: 1, height: '100%', border: 'none', outline: 'none', background: 'transparent', padding: '0 14px 0 42px', fontSize: 14.5, color: CD_T.text.primary, fontFamily: CD_T.font.sans, borderRadius: CD_T.radius.md },
  hint: { fontSize: 12, color: CD_T.text.subtle, lineHeight: 1.45 },
  eyeBtn: { width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  cta: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 50, marginTop: 4, border: 'none', borderRadius: CD_T.radius.md, background: `linear-gradient(140deg, ${CD_T.brand.primaryLight}, ${CD_T.brand.primaryDark})`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: CD_T.font.sans, boxShadow: '0 8px 20px rgba(27,35,48,.20)' },
  footerLink: { textAlign: 'center', fontSize: 14, color: CD_T.text.muted, margin: '2px 0 0' },
  linkBtn: { background: 'none', border: 'none', padding: 0, color: CD_T.brand.accent, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: CD_T.font.sans },
  terms: { position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 20px 28px', fontSize: 12.5, color: CD_T.text.subtle, lineHeight: 1.6, maxWidth: 460, margin: '0 auto' },
  termsA: { color: CD_T.text.muted, textDecoration: 'underline', textUnderlineOffset: 2 },
};
