/* global React */
// MegusMinhaContaModal · modal "Minha conta"
// Três blocos: dados da conta (nome/email), editar nome, trocar senha.
// Fala com o backend via window.MegusAuth (atualizarPerfil, trocarSenha).

const MC = window.MegusTokens;
const MCIC = window.IC;

function MegusMinhaContaModal({ user, onClose, onPerfilAtualizado }) {
  const [nome, setNome] = React.useState(user?.displayName || user?.name || '');
  const [salvandoNome, setSalvandoNome] = React.useState(false);
  const [msgNome, setMsgNome] = React.useState(null);

  const [senhaAtual, setSenhaAtual] = React.useState('');
  const [senhaNova, setSenhaNova] = React.useState('');
  const [senhaNova2, setSenhaNova2] = React.useState('');
  const [salvandoSenha, setSalvandoSenha] = React.useState(false);
  const [msgSenha, setMsgSenha] = React.useState(null);

  async function salvarNome() {
    setMsgNome(null);
    if (!nome.trim()) { setMsgNome({ erro: true, txt: 'Informe o nome.' }); return; }
    setSalvandoNome(true);
    const r = await window.MegusAuth.atualizarPerfil(nome.trim());
    setSalvandoNome(false);
    if (r.success) {
      setMsgNome({ erro: false, txt: 'Nome atualizado!' });
      onPerfilAtualizado && onPerfilAtualizado(r.data);
    } else {
      setMsgNome({ erro: true, txt: r.message || 'Não foi possível salvar.' });
    }
  }

  async function salvarSenha() {
    setMsgSenha(null);
    if (!senhaAtual || !senhaNova) { setMsgSenha({ erro: true, txt: 'Preencha as senhas.' }); return; }
    if (senhaNova.length < 6) { setMsgSenha({ erro: true, txt: 'A nova senha precisa ter ao menos 6 caracteres.' }); return; }
    if (senhaNova !== senhaNova2) { setMsgSenha({ erro: true, txt: 'A confirmação não bate com a nova senha.' }); return; }
    setSalvandoSenha(true);
    const r = await window.MegusAuth.trocarSenha(senhaAtual, senhaNova);
    setSalvandoSenha(false);
    if (r.success) {
      setMsgSenha({ erro: false, txt: 'Senha alterada com sucesso!' });
      setSenhaAtual(''); setSenhaNova(''); setSenhaNova2('');
    } else {
      setMsgSenha({ erro: true, txt: r.message || 'Não foi possível trocar a senha.' });
    }
  }

  return (
    <React.Fragment>
      <div style={mc.scrim} onClick={onClose} />
      <div style={mc.modal} role="dialog" aria-label="Minha conta">
        <div style={mc.head}>
          <div style={mc.headL}>
            <span style={mc.avatar}>{(nome || 'U').charAt(0).toUpperCase()}</span>
            <div>
              <div style={mc.title}>Minha conta</div>
              <div style={mc.sub}>{user?.email}</div>
            </div>
          </div>
          <button style={mc.closeBtn} className="ms-hoverable" onClick={onClose} title="Fechar">
            <MCIC.x size={18} stroke={MC.text.secondary} />
          </button>
        </div>

        <div style={mc.body}>
          {/* Editar perfil */}
          <section style={mc.section}>
            <div style={mc.secTitle}>Perfil</div>
            <label style={mc.label}>Nome</label>
            <input style={mc.input} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
            <label style={mc.label}>E-mail</label>
            <input style={{ ...mc.input, ...mc.inputRO }} value={user?.email || ''} disabled title="O e-mail não pode ser alterado" />
            {msgNome && <div style={{ ...mc.msg, ...(msgNome.erro ? mc.msgErr : mc.msgOk) }}>{msgNome.txt}</div>}
            <button style={mc.btnPrim} className="ms-hoverable" onClick={salvarNome} disabled={salvandoNome}>
              {salvandoNome ? 'Salvando…' : 'Salvar nome'}
            </button>
          </section>

          <span style={mc.sep} />

          {/* Trocar senha */}
          <section style={mc.section}>
            <div style={mc.secTitle}>Trocar senha</div>
            <label style={mc.label}>Senha atual</label>
            <input style={mc.input} type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} placeholder="••••••" />
            <label style={mc.label}>Nova senha</label>
            <input style={mc.input} type="password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} placeholder="mínimo 6 caracteres" />
            <label style={mc.label}>Confirmar nova senha</label>
            <input style={mc.input} type="password" value={senhaNova2} onChange={(e) => setSenhaNova2(e.target.value)} placeholder="repita a nova senha" />
            {msgSenha && <div style={{ ...mc.msg, ...(msgSenha.erro ? mc.msgErr : mc.msgOk) }}>{msgSenha.txt}</div>}
            <button style={mc.btnPrim} className="ms-hoverable" onClick={salvarSenha} disabled={salvandoSenha}>
              {salvandoSenha ? 'Alterando…' : 'Alterar senha'}
            </button>
          </section>
        </div>
      </div>
    </React.Fragment>
  );
}

const mc = {
  scrim: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 60 },
  modal: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 61,
    width: 'min(460px, 92vw)', maxHeight: '88vh', overflow: 'auto', background: '#fff',
    border: `1px solid ${MC.surface.border}`, borderRadius: 16, boxShadow: MC.shadow.lg },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: `1px solid ${MC.surface.border}` },
  headL: { display: 'flex', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 10, background: MC.brand.primary, color: '#fff',
    display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 17 },
  title: { fontWeight: 700, fontSize: 16, color: MC.text.primary },
  sub: { fontSize: 12.5, color: MC.text.muted },
  closeBtn: { border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, borderRadius: 8 },
  body: { padding: '16px 20px 20px' },
  section: { display: 'flex', flexDirection: 'column' },
  secTitle: { fontWeight: 700, fontSize: 13.5, color: MC.text.primary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: .3 },
  label: { fontSize: 12.5, color: MC.text.muted, marginBottom: 5, marginTop: 8 },
  input: { padding: '10px 12px', borderRadius: 9, border: `1px solid ${MC.surface.borderStrong}`,
    fontSize: 14, color: MC.text.primary, outline: 'none' },
  inputRO: { background: MC.surface.subtle || '#f3f4f6', color: MC.text.muted, cursor: 'not-allowed' },
  sep: { display: 'block', height: 1, background: MC.surface.border, margin: '18px 0' },
  btnPrim: { marginTop: 14, padding: '10px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
    background: MC.brand.primary, color: '#fff', fontWeight: 600, fontSize: 14 },
  msg: { marginTop: 10, fontSize: 13, padding: '8px 10px', borderRadius: 8 },
  msgErr: { background: '#fef2f2', color: MC.status.danger },
  msgOk: { background: '#f0fdf4', color: MC.status.success || '#16a34a' },
};

window.MegusMinhaContaModal = MegusMinhaContaModal;